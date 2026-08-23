import * as PIXI from 'pixi.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type html2canvasType from 'html2canvas-pro';
import type { Options as Html2CanvasOptions } from 'html2canvas-pro';
import PPGraph from '../classes/GraphClass';
import InterfaceController from '../InterfaceController';
import {
  CaptureRect,
  computeDomCaptureScale,
  computeDomPlacement,
  computeOutputSize,
  intersectRects,
  rectContains,
  visibleWorldRect,
  ViewportTransform,
} from './captureGeometry';

/**
 * One capture pipeline for the whole app. The editor canvas is pixi/webgl with
 * html widget overlays on top of it, so no single library can see both: dom
 * rasterisers get a blank webgl canvas (the renderer has no preserved drawing
 * buffer) and `renderer.extract` never sees the dom. Each source below picks
 * the backend that can actually see its pixels, and the graph source runs both
 * and composites them.
 *
 * Everything is produced through `capture()`; `captureUserInterface()`,
 * `captureGraph()` and `captureScreen()` are the thin blob shaped entry points.
 */

export const CAPTURE_SOURCES = [
  'User interface',
  'Graph',
  'Node selection',
  'Screen sharing',
  'ReactUI',
] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export interface CaptureOptions {
  /** output pixels per world unit (graph) or per css pixel (user interface, widget). Screen ignores it. */
  scale?: number;
  /** graph and selection only, world space. Defaults to what the window shows. */
  bounds?: PIXI.Rectangle;
  /** ReactUI only: a render function and the size to render it at */
  render?: () => React.ReactNode;
  renderWidth?: number;
  renderHeight?: number;
}

export interface CaptureResult {
  blob: Blob;
  dataURL: string;
  width: number;
  height: number;
  source: CaptureSource;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// html2canvas-pro, loaded on first use
// ---------------------------------------------------------------------------

// html2canvas-pro rather than html2canvas: the original is unmaintained and
// throws on the modern colour functions (oklch, color-mix) that MUI emits
// through its css variables.
let html2canvasPromise: Promise<typeof html2canvasType> | undefined;

const loadHtml2Canvas = async (): Promise<typeof html2canvasType> => {
  if (html2canvasPromise === undefined) {
    html2canvasPromise = import(
      /* webpackChunkName: "html2canvas-pro" */ 'html2canvas-pro'
    ).then((module) => module.default);
  }
  return html2canvasPromise;
};

const renderDom = async (
  element: HTMLElement,
  options: Partial<Html2CanvasOptions>,
): Promise<HTMLCanvasElement> => {
  const html2canvas = await loadHtml2Canvas();
  return html2canvas(element, {
    useCORS: true,
    logging: false,
    ...options,
  });
};

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('The captured canvas could not be encoded as a PNG.'));
      }
    }, 'image/png');
  });

export const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(blob);
  });

/** Two frames is what the hybrid node containers need to catch up with the canvas. */
const nextFrames = (count = 2): Promise<void> =>
  new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });

/**
 * Resolves once the video element holds a frame that was produced after the
 * call. Waiting on animation frames instead would hand back whatever the
 * element already had, which on a reused low frame rate stream can predate the
 * thing being captured.
 */
const nextVideoFrame = (video: HTMLVideoElement): Promise<void> => {
  const withFrameCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number;
  };
  if (typeof withFrameCallback.requestVideoFrameCallback !== 'function') {
    return nextFrames();
  }
  return new Promise((resolve) => {
    // a stream that stalls must not hang the capture
    const timeout = window.setTimeout(resolve, 1000);
    withFrameCallback.requestVideoFrameCallback!(() => {
      window.clearTimeout(timeout);
      resolve();
    });
  });
};

const toCaptureRect = (rectangle: PIXI.Rectangle): CaptureRect => ({
  x: rectangle.x,
  y: rectangle.y,
  width: rectangle.width,
  height: rectangle.height,
});

const getViewportTransform = (viewport: {
  x: number;
  y: number;
  scale: { x: number };
}): ViewportTransform => ({
  x: viewport.x,
  y: viewport.y,
  scale: viewport.scale.x,
});

const warnIfDownscaled = (
  downscaledBy: number,
  width: number,
  height: number,
) => {
  if (downscaledBy > 0.001) {
    InterfaceController.showSnackBar(
      `The capture had to be downscaled by ${Math.round(downscaledBy * 100)}%. ` +
        `Requested size: ${Math.round(width)}x${Math.round(height)}px.`,
      { variant: 'warning' },
    );
  }
};

// ---------------------------------------------------------------------------
// transient editor chrome
// ---------------------------------------------------------------------------

const HYBRID_CONTAINER_ID_PREFIX = 'Container-';

const isHybridContainer = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.id.startsWith(HYBRID_CONTAINER_ID_PREFIX);

const hybridNodeIdOf = (element: HTMLElement): string =>
  element.id.slice(HYBRID_CONTAINER_ID_PREFIX.length);

/**
 * Hides the selection rectangle, the in progress connection and the hover
 * decorations so a capture comes out clean, and returns the undo. The hover
 * decorations are css `:hover` rules, which html2canvas resolves from the live
 * element rather than from its clone, so they have to be overridden inline.
 */
const hideTransientUI = (): (() => void) => {
  const graph = PPGraph.currentGraph;
  const restore: (() => void)[] = [];

  const hide = (container?: PIXI.Container) => {
    if (container === undefined) {
      return;
    }
    const wasVisible = container.visible;
    container.visible = false;
    restore.push(() => {
      container.visible = wasVisible;
    });
  };

  hide(graph?.selection);
  hide(graph?.backgroundTempContainer);

  Object.values(graph?.nodes ?? {}).forEach((node) => {
    if (node.isHovering) {
      node.isHovering = false;
      restore.push(() => {
        node.isHovering = true;
      });
    }
  });

  const containerElement = document.getElementById('container');
  Array.from(containerElement?.children ?? [])
    .filter(isHybridContainer)
    .forEach((element) => {
      const { boxShadow, background } = element.style;
      element.style.boxShadow = 'none';
      element.style.background = 'none';
      restore.push(() => {
        element.style.boxShadow = boxShadow;
        element.style.background = background;
      });
    });

  return () => restore.forEach((undo) => undo());
};

// ---------------------------------------------------------------------------
// user interface
// ---------------------------------------------------------------------------

/**
 * The user interface as it looks in app view: the live surface only, without
 * the editor chrome around it (header, toolbox, inspector, layers panel).
 *
 * The craftjs root is the target rather than the frame around it: the root is
 * what carries the surface background and padding and sizes itself to the
 * content, while the frame is transparent and merely stretches to fill the
 * column, which would trail empty space below the surface. The surface renderer
 * is not the target either - it only ever draws non-live previews (canvas
 * thumbnails and embedded surfaces). The root stays mounted while the panel is
 * closed, so being laid out is what decides whether there is anything to
 * capture.
 *
 * Known limitations of the dom backend: iframes come out blank, and
 * cross origin images without CORS headers are skipped.
 */
const captureUserInterfaceCanvas = async (
  scale = 1,
): Promise<HTMLCanvasElement> => {
  const surface =
    document.querySelector<HTMLElement>('[data-cy="dashboard"] #ROOT') ??
    document.querySelector<HTMLElement>('[data-cy="device-preview-frame"]');
  if (surface == null || surface.offsetParent === null) {
    throw new Error(
      'The user interface is not on screen. Open it before capturing it.',
    );
  }

  // the root lays out to its content rather than to the scroll box around it,
  // so this is the whole surface even when most of it is below the fold
  const width = Math.max(surface.scrollWidth, surface.offsetWidth);
  const height = Math.max(surface.scrollHeight, surface.offsetHeight);

  const size = computeOutputSize({ x: 0, y: 0, width, height }, scale);
  warnIfDownscaled(size.downscaledBy, width * scale, height * scale);

  return renderDom(surface, {
    scale: size.appliedScale,
    backgroundColor: null,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    // any scroll box on the clone would clip it back to the visible part
    onclone: (_doc: Document, clone: HTMLElement) => {
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
    },
  });
};

// ---------------------------------------------------------------------------
// graph
// ---------------------------------------------------------------------------

/**
 * The pixi layer and the html widget layer of the editor canvas, composited.
 *
 * The html containers only exist where the window is, so a region that reaches
 * outside the window is clipped to what is on screen rather than coming out
 * half drawn. Scroll or zoom to the region first to capture all of it.
 */
const captureGraphCanvas = async (
  requestedBounds?: PIXI.Rectangle,
  scale = 1,
  onlyNodeIds?: Set<string>,
): Promise<HTMLCanvasElement> => {
  const graph = PPGraph.currentGraph;
  if (!graph?.app?.renderer) {
    throw new Error('There is no graph to capture.');
  }

  const viewport = getViewportTransform(graph.viewport);
  const onScreen = visibleWorldRect(
    viewport,
    window.innerWidth,
    window.innerHeight,
  );

  const wanted =
    requestedBounds === undefined ? onScreen : toCaptureRect(requestedBounds);
  const bounds = intersectRects(wanted, onScreen);
  if (bounds === null) {
    throw new Error(
      'Nothing to capture: the requested region is entirely off screen.',
    );
  }
  if (!rectContains(onScreen, wanted)) {
    InterfaceController.showSnackBar(
      'Only the part of the capture region that is on screen was captured.',
      { variant: 'warning' },
    );
  }

  const size = computeOutputSize(bounds, scale);
  warnIfDownscaled(
    size.downscaledBy,
    bounds.width * scale,
    bounds.height * scale,
  );

  const restoreUI = hideTransientUI();
  try {
    // let the hidden chrome and the inline style overrides reach the screen
    await nextFrames();

    // the pixi layer, rendered straight into a texture from the world space
    // frame, which sidesteps preserveDrawingBuffer entirely
    // the canvas colour lives on the renderer, not in the viewport, so an
    // extract of the viewport alone would come out on transparent
    const pixiCanvas = graph.app.renderer.extract.canvas({
      target: graph.viewport,
      frame: new PIXI.Rectangle(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
      ),
      resolution: size.appliedScale,
      clearColor: graph.app.renderer.background.colorRgba,
    }) as HTMLCanvasElement;

    // the html layer. #container is the react root, so everything except the
    // hybrid node containers is skipped: they are the only children of it that
    // are not part of the app's own react tree.
    const containerElement = document.getElementById('container');
    if (containerElement === null) {
      throw new Error('Container element not found');
    }
    const domCanvas = await renderDom(containerElement, {
      backgroundColor: null,
      scale: computeDomCaptureScale(size.appliedScale, viewport.scale),
      ignoreElements: (element: Element) => {
        if (element.parentElement !== containerElement) {
          return false;
        }
        if (!isHybridContainer(element)) {
          return true;
        }
        return (
          onlyNodeIds !== undefined && !onlyNodeIds.has(hybridNodeIdOf(element))
        );
      },
    });

    const output = document.createElement('canvas');
    output.width = size.width;
    output.height = size.height;
    const context = output.getContext('2d');
    if (context === null) {
      throw new Error('Could not get a 2d context for the composite canvas.');
    }

    context.drawImage(pixiCanvas, 0, 0, size.width, size.height);
    const placement = computeDomPlacement(
      bounds,
      viewport,
      window.innerWidth,
      window.innerHeight,
      size.appliedScale,
    );
    context.drawImage(
      domCanvas,
      placement.dx,
      placement.dy,
      placement.dWidth,
      placement.dHeight,
    );

    return output;
  } finally {
    restoreUI();
  }
};

const captureSelectionCanvas = async (
  scale = 1,
): Promise<HTMLCanvasElement> => {
  const selection = PPGraph.currentGraph?.selection;
  const selectedNodes = selection?.selectedNodes ?? [];
  if (selectedNodes.length === 0) {
    throw new Error('Nothing is selected. Select nodes before capturing them.');
  }

  const bounds = selection.getBoundsFromNodes(selectedNodes);
  if (!bounds) {
    throw new Error('The selected nodes have no bounds to capture.');
  }

  return captureGraphCanvas(
    bounds,
    scale,
    new Set(selectedNodes.map((node) => node.id)),
  );
};

// ---------------------------------------------------------------------------
// screen
// ---------------------------------------------------------------------------

/**
 * The permission prompt is per stream, not per frame, so the stream is kept
 * alive and every later capture reuses it silently. The browser keeps showing
 * its sharing indicator for as long as it is held; ending the share from that
 * indicator, or calling `stopScreenCapture`, drops it and the next capture
 * prompts again.
 */
let screenStream: MediaStream | undefined;

const SCREEN_CAPTURE_FPS = 5;

const screenStreamIsLive = (): boolean =>
  screenStream?.getVideoTracks()[0]?.readyState === 'live';

/** Ends the shared screen stream. The next screen capture will prompt again. */
export const stopScreenCapture = (): void => {
  screenStream?.getTracks().forEach((track) => track.stop());
  screenStream = undefined;
};

export const isScreenCaptureActive = (): boolean => screenStreamIsLive();

const getScreenStream = async (): Promise<MediaStream> => {
  if (screenStream !== undefined && screenStreamIsLive()) {
    return screenStream;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('This browser cannot capture the screen.');
  }
  // only opening a new stream needs the gesture, reusing one does not
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    throw new Error(
      'Sharing the screen needs a click. Trigger the Screenshot node yourself once to grant it, after which a flow can keep capturing.',
    );
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    // stills only, so cap the frame rate: a held stream keeps the compositor
    // capturing and encoding whether or not anything reads it, and that cost
    // scales with the rate. Low enough to be cheap, high enough that waiting
    // for a fresh frame stays quick.
    video: {
      preferCurrentTab: true,
      frameRate: { max: SCREEN_CAPTURE_FPS },
    } as MediaTrackConstraints,
    audio: false,
  });
  // the browser's own stop sharing button ends the track behind our back
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (screenStream === stream) {
      screenStream = undefined;
    }
  });
  screenStream = stream;

  // only on a new stream: the whole point of holding it is that the reuses are
  // silent, so this must not fire again on every capture
  InterfaceController.showSnackBar(
    'Screen sharing started. Further captures will not ask again. ' +
      'To end it, trigger "Stop screen sharing" on the Screenshot node, ' +
      "or use your browser's own stop sharing control.",
    { variant: 'info', autoHideDuration: 10000 },
  );

  return stream;
};

/**
 * Pixel perfect, iframes and video included, because the compositor rather than
 * a rasteriser produces the frame.
 *
 * preferCurrentTab is honoured by Chrome and Edge; Firefox and Safari show the
 * generic picker instead.
 */
const captureScreenCanvas = async (): Promise<HTMLCanvasElement> => {
  const stream = await getScreenStream();

  const video = document.createElement('video');
  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    // a stream that never delivers a frame would leave play() pending forever,
    // and this runs inside the node's execution, so it must not hang there
    await Promise.race([
      video.play(),
      new Promise<never>((_, reject) =>
        window.setTimeout(
          () => reject(new Error('The shared screen delivered no video.')),
          5000,
        ),
      ),
    ]);
    await nextVideoFrame(video);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Could not get a 2d context for the screen capture.');
    }
    context.drawImage(video, 0, 0);
    return canvas;
  } finally {
    // let go of the video element, but leave the stream running for next time
    video.pause();
    video.srcObject = null;
  }
};

// ---------------------------------------------------------------------------
// widget (a ReactUI render function)
// ---------------------------------------------------------------------------

/** Renders a ReactUI element off screen at a fixed size and rasterises it. */
const captureWidgetCanvas = async (
  render: () => React.ReactNode,
  width: number,
  height: number,
  scale = 1,
): Promise<HTMLCanvasElement> => {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '-100000px';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.overflow = 'hidden';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(render() as React.ReactElement);
    // react commits and the browser lays out and loads fonts
    await nextFrames(3);

    const size = computeOutputSize({ x: 0, y: 0, width, height }, scale);
    warnIfDownscaled(size.downscaledBy, width * scale, height * scale);

    return await renderDom(host, {
      scale: size.appliedScale,
      backgroundColor: null,
      width,
      height,
    });
  } finally {
    root.unmount();
    host.remove();
  }
};

// ---------------------------------------------------------------------------
// public api
// ---------------------------------------------------------------------------

export const captureUserInterface = async (scale = 1): Promise<Blob> =>
  canvasToBlob(await captureUserInterfaceCanvas(scale));

export const captureGraph = async (
  bounds?: PIXI.Rectangle,
  scale = 1,
): Promise<Blob> => canvasToBlob(await captureGraphCanvas(bounds, scale));

export const captureSelection = async (scale = 1): Promise<Blob> =>
  canvasToBlob(await captureSelectionCanvas(scale));

export const captureScreen = async (): Promise<Blob> =>
  canvasToBlob(await captureScreenCanvas());

const canvasForSource = (
  source: CaptureSource,
  options: CaptureOptions,
): Promise<HTMLCanvasElement> => {
  const scale = options.scale ?? 1;
  switch (source) {
    case 'User interface':
      return captureUserInterfaceCanvas(scale);
    case 'Graph':
      return captureGraphCanvas(options.bounds, scale);
    case 'Node selection':
      return captureSelectionCanvas(scale);
    case 'Screen sharing':
      return captureScreenCanvas();
    case 'ReactUI':
      if (options.render === undefined) {
        return Promise.reject(
          new Error('Connect a ReactUI output to capture a widget.'),
        );
      }
      return captureWidgetCanvas(
        options.render,
        options.renderWidth ?? 800,
        options.renderHeight ?? 600,
        scale,
      );
    default:
      return Promise.reject(new Error(`Unknown capture source: ${source}`));
  }
};

/**
 * The entry point everything else goes through. Returns the png alongside the
 * data url and the pixel size, so callers do not have to decode the blob again
 * just to learn how big it is.
 */
export const capture = async (
  source: CaptureSource,
  options: CaptureOptions = {},
): Promise<CaptureResult> => {
  const canvas = await canvasForSource(source, options);
  const blob = await canvasToBlob(canvas);
  return {
    blob,
    dataURL: await blobToDataURL(blob),
    width: canvas.width,
    height: canvas.height,
    source,
    timestamp: new Date().toISOString(),
  };
};

export default {
  capture,
  captureUserInterface,
  captureGraph,
  captureSelection,
  captureScreen,
  stopScreenCapture,
  isScreenCaptureActive,
  blobToDataURL,
};
