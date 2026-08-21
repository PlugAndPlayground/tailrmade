import * as PIXI from 'pixi.js';
import { TRgba } from '../utils/color';
import { Viewport } from 'pixi-viewport';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import PPStorage, { checkForUnsavedChanges } from '../PPStorage';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  CANVAS_BACKGROUND_ALPHA,
  CANVAS_BACKGROUND_TEXTURE,
  COMMENT_TEXTSTYLE,
  GRID_SHADER,
  MAIN_COLOR,
} from '../utils/constants';
import {
  cutOrCopyClipboard,
  getCurrentCursorPosition,
  getDashboardWidth,
  loadGraph,
  pasteClipboard,
  roundNumber,
} from '../utils/utils';
import { InputParser } from '../utils/inputParser';
import { SerializedNode } from '../utils/interfaces';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
} from '../classes/Action';

export const getTextWithLineBreaks = (node: any): string => {
  // we only deal with TextNodes
  if (!node || !node.parentNode || node.nodeType !== 3) return '';
  // our Range object form which we'll get the characters positions
  const range = document.createRange();
  // here we'll store all our lines
  const lines = [];
  // begin at the first char
  range.setStart(node, 0);
  // initial position
  let prevBottom = range.getBoundingClientRect().bottom;
  const str = node.textContent;
  let current = 1; // we already got index 0
  let lastFound = 0;
  let bottom = 0;
  // iterate over all characters
  while (current <= str.length) {
    // move our cursor
    range.setStart(node, current);
    if (current < str.length - 1) range.setEnd(node, current + 1);
    bottom = range.getBoundingClientRect().bottom;
    if (bottom > prevBottom) {
      // line break
      lines.push(
        str.substr(lastFound, current - lastFound), // text content
      );
      prevBottom = bottom;
      lastFound = current;
    }
    current++;
  }
  // push the last line
  lines.push(str.substr(lastFound));

  return lines.join('\n');
};

export const getObjectsInsideBounds = (
  nodes: PPNode[],
  selectionRect: PIXI.Rectangle,
): PPNode[] => {
  return nodes.filter((node) =>
    doRectsIntersect(selectionRect, node.getSelectionBounds()),
  );
};

export const doRectsIntersect = (
  firstRect: PIXI.Rectangle,
  nodeRects: PIXI.Rectangle[],
): boolean => {
  const overlapAxis = (member: string, size: string) => {
    return (
      nodeRects.find(
        (nodeRect) =>
          Math.max(firstRect[member], nodeRect[member]) <
          Math.min(
            firstRect[member] + firstRect[size],
            nodeRect[member] + nodeRect[size],
          ),
      ) !== undefined
    );
  };
  const overlap = overlapAxis('x', 'width') && overlapAxis('y', 'height');
  return overlap;
};

export function drawDottedLine(
  graphics: PIXI.Graphics,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  interval: number,
) {
  const deltaX: number = endX - startX;
  const deltaY: number = endY - startY;
  const totalDist = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2));
  const segments = totalDist / interval;
  const segmentLengthX = deltaX / segments;
  const segmentLengthY = deltaY / segments;
  for (let i = 0; i < segments - 1; i += 2) {
    graphics.moveTo(startX + i * segmentLengthX, startY + i * segmentLengthY);
    graphics.lineTo(
      startX + (i + 1) * segmentLengthX,
      startY + (i + 1) * segmentLengthY,
    );
  }
}

export const getNodesUpperLeftCorner = (
  nodes: PPNode[] | SerializedNode[],
): PIXI.Point => {
  const x = nodes.reduce(
    (prevX, newNode) => Math.min(prevX, newNode.x),
    Infinity,
  );
  const y = nodes.reduce(
    (prevX, newNode) => Math.min(prevX, newNode.y),
    Infinity,
  );
  return new PIXI.Point(x, y);
};

export const getNodesBounds = (nodes: PPNode[]): PIXI.Rectangle => {
  let bounds = new PIXI.Rectangle();
  nodes.forEach((node: PIXI.Container, index: number) => {
    const tempRect = node.getLocalBounds().rectangle;
    // move rect to get bounds local to nodeContainer
    tempRect.x += node.position.x;
    tempRect.y += node.position.y;
    if (index === 0) {
      bounds = tempRect;
    }
    bounds.enlarge(tempRect);
  });
  return bounds;
};

export const calculateOverlayOffsets = (scale?: number): number => {
  const currentGraph = PPGraph.currentGraph;
  const overlayState = InterfaceController.getOverlayState();
  const leftDrawerWidth = overlayState.leftSide.visible
    ? overlayState.leftSide.width
    : 0;
  const rightDrawerWidth = overlayState.rightSide.visible
    ? overlayState.rightSide.width
    : 0;

  // the dashboard's stored percentage is of the shell's available space, not
  // of the window, so ask for the resolved (and clamped) pixel width rather
  // than recomputing it from the percentage here
  const dashboardWidth = overlayState.dashboard.visible
    ? getDashboardWidth(overlayState)
    : 0;
  const dashboardDrawerOffset = dashboardWidth / 2;

  const leftDrawerOffset = leftDrawerWidth / 2;
  const rightDrawerOffset = rightDrawerWidth / 2;

  // Use provided scale or current scale
  const viewportScale = scale || currentGraph.viewportScaleX;

  // Calculate the combined offset
  return (
    (leftDrawerOffset + dashboardDrawerOffset - rightDrawerOffset) /
    viewportScale
  );
};

export const zoomToFitNodes = (
  nodes?: PPNode[],
  initZoomOutFactor = undefined,
): void => {
  const currentGraph = PPGraph.currentGraph;
  let boundsToZoomTo: PIXI.Rectangle;
  let zoomOutFactor: number;

  if (nodes === undefined || nodes.length < 1) {
    boundsToZoomTo = currentGraph.nodeContainer.getLocalBounds().rectangle; // get bounds of the whole nodeContainer
    zoomOutFactor = -0.2;
  } else {
    boundsToZoomTo = getNodesBounds(nodes);
    zoomOutFactor = -0.3;
  }

  // First fit to calculate the scale without moving
  currentGraph.viewport.fit(false, boundsToZoomTo.width, boundsToZoomTo.height);

  // Apply additional zoom factor
  const finalScale =
    currentGraph.viewportScaleX * (1 + (initZoomOutFactor || zoomOutFactor));

  // Now calculate offsets with the new scale
  const combinedOffset = calculateOverlayOffsets(finalScale);

  // Move center with the correct scale and offset
  currentGraph.viewport.moveCenter(
    boundsToZoomTo.x + boundsToZoomTo.width / 2 - combinedOffset,
    boundsToZoomTo.y + boundsToZoomTo.height / 2,
  );

  // Apply the zoom percent now that we're in the right position
  currentGraph.viewport.zoomPercent(initZoomOutFactor || zoomOutFactor, true);

  currentGraph.selection.drawRectanglesFromSelection();
  emitMoved();
};

export function smoothMoveViewport(
  point: PIXI.Point,
  scale: number | undefined,
) {
  PPGraph.currentGraph.viewport.animate({
    position: point,
    scale: scale,
    ease: 'easeOutExpo',
    time: 750,
  });
  emitMoved();
}

export function zoomInOutViewport(zoomIn) {
  PPGraph.currentGraph.viewport.zoomPercent(zoomIn ? 0.2 : -0.2, true);
  emitMoved();
}

export function emitMoved() {
  PPGraph.currentGraph.viewport.emit('moved', {
    viewport: PPGraph.currentGraph.viewport,
    type: 'pinch',
  });
}

export const ensureVisible = async (
  nodes: PPNode[],
  undoable = false,
): Promise<void> => {
  const currentGraph = PPGraph.currentGraph;

  const action = async () => {
    let boundsToZoomTo: PIXI.Rectangle;

    if (nodes.length < 1) {
      boundsToZoomTo = currentGraph.nodeContainer.getLocalBounds().rectangle;
    } else {
      boundsToZoomTo = getNodesBounds(nodes);
    }

    const fitScale = currentGraph.viewport.findFit(
      boundsToZoomTo.width,
      boundsToZoomTo.height,
    );
    const fitScaleWithViewport = fitScale / 1;
    const scale = fitScaleWithViewport < 1 ? fitScale / 2 : undefined;

    const combinedOffset = calculateOverlayOffsets();

    const position = new PIXI.Point(
      boundsToZoomTo.x + boundsToZoomTo.width / 2 - combinedOffset,
      boundsToZoomTo.y + boundsToZoomTo.height / 2,
    );
    smoothMoveViewport(position, scale);
  };

  if (undoable) {
    const positionPre = getCurrentCursorPosition();
    const scalePre = currentGraph.viewportScaleX;
    const undoAction = async () => smoothMoveViewport(positionPre, scalePre);
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Move Viewport'),
      ),
    );
  } else {
    await action();
  }
};

export const removeAndDestroyChild = (that, newContainer): void => {
  that.removeChild(newContainer);
  newContainer?.destroy({});
};

export const setDebugText = (
  viewport: React.MutableRefObject<Viewport>,
  mousePosition: { x: number; y: number },
  pixiDebugRef: PIXI.Text,
) => {
  const { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize } = (
    window.performance as any
  ).memory;
  const mouseWorld = viewport.current.toWorld(mousePosition);
  const mouseX = Math.round(mousePosition.x);
  const mouseY = Math.round(mousePosition.y);
  const mouseWorldX = Math.round(mouseWorld.x);
  const mouseWorldY = Math.round(mouseWorld.y);
  const viewportScreenX = Math.round(viewport.current.x);
  const viewportScreenY = Math.round(viewport.current.y);
  const viewportScale = roundNumber(viewport.current.scale.x);
  const average =
    lastDeltas.reduce((delta, total) => delta + total, 0) / lastDeltas.length;
  const fps = (1 / average) * 1000;
  pixiDebugRef.text = `Mouse position: ${mousePosition.x}, ${mousePosition.y}
Mouse position world: ${mouseWorldX}, ${mouseWorldY}
Viewport position (scale): ${viewportScreenX}, ${Math.round(
    viewportScreenY,
  )} (${viewportScale})
Memory (heap, total, used in MB): ${(jsHeapSizeLimit / 1048576).toFixed(2)}, ${(totalJSHeapSize / 1048576).toFixed(2)}, ${(usedJSHeapSize / 1048576).toFixed(2)}
Frame rate: ${fps}`;
};

let lastDeltas = [];
// set mouse position and update debug text
export const setMousePosition = (mouseMoveEvent, mousePosition) => {
  mousePosition.x = mouseMoveEvent?.pageX ?? 0;
  mousePosition.y = mouseMoveEvent?.pageY ?? 0;
};

export const createPixiApp = (
  pixiContext: React.MutableRefObject<HTMLDivElement>,
  pixiApp: React.MutableRefObject<PIXI.Application<PIXI.Renderer>>,
  viewport: React.MutableRefObject<Viewport>,
  overlayCommentContainer: React.MutableRefObject<
    PIXI.Container<PIXI.ContainerChild>
  >,
  mousePosition: any,
  lastTimeTicked: number,
) => {
  console.log('CREATING PIXI');
  pixiApp.current = new PIXI.Application();

  const randomMainColorLightHex = new PIXI.Color(
    TRgba.fromString(MAIN_COLOR).mix(TRgba.white(), 0.9).hex(),
  ).toNumber();

  void (async () => {
    await pixiApp.current.init({
      backgroundColor: randomMainColorLightHex,
      backgroundAlpha: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      antialias: false,
      autoDensity: true,
      resolution: 2,
      //preference: 'webgpu',
    });

    pixiApp.current.stage.eventMode = 'static';
    pixiApp.current.stage.cursor = 'pointer';
    globalThis.__PIXI_APP__ = pixiApp.current;

    // disable default context menu for pixi only
    pixiApp.current.canvas.addEventListener(
      'contextmenu',
      (e: Event) => {
        e.preventDefault();
      },
      { passive: false },
    );

    // disable wheel to prevent scrolling the parent when embedded in iframe
    pixiApp.current.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        return false;
      },
      { passive: false },
    );

    // create viewport
    viewport.current = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: window.innerWidth,
      worldHeight: window.innerHeight,
      events: pixiApp.current.renderer.events,
    });
    viewport.current.label = 'pixiViewport';

    globalThis.__VIEWPORT__ = viewport.current;

    // add the viewport to the stage
    pixiApp.current.stage.addChild(viewport.current);

    // add global listen events to zoom
    viewport.current.addEventListener('zoomed', () =>
      InterfaceController.notifyListeners(ListenEvent.ViewportZoom, true),
    );
    viewport.current.addEventListener('zoomed-end', () =>
      InterfaceController.notifyListeners(ListenEvent.ViewportZoom, false),
    );

    const pointerUpEvent = (event: PIXI.FederatedPointerEvent) => {
      InterfaceController.notifyListeners(ListenEvent.GlobalPointerUp, event);
      PPGraph.currentGraph.onPointerUpAndUpOutside(event);
    };
    viewport.current.addEventListener('pointerupoutside', pointerUpEvent);
    viewport.current.addEventListener('pointerup', pointerUpEvent);

    const disarmMouseEdges = () =>
      PPGraph.currentGraph?.viewport?.plugins?.pause('mouse-edges');
    window.addEventListener('pointerup', disarmMouseEdges, true);
    window.addEventListener('pointercancel', disarmMouseEdges, true);

    // configure viewport
    viewport.current
      .drag({
        clampWheel: false,
        mouseButtons: 'middle-right',
      })
      .pinch()
      .wheel({ smooth: 3, trackpadPinch: true, wheelZoom: false })
      .decelerate({
        friction: 0.8,
      })
      .clampZoom({
        minScale: 0.05,
        maxScale: 4,
      })
      .mouseEdges({
        distance: 24,
        speed: 10,
        allowButtons: true,
      });

    viewport.current.plugins.pause('mouse-edges');

    // add overlayCommentContainer to the stage
    overlayCommentContainer.current = new PIXI.Container();
    overlayCommentContainer.current.name = 'OverlayContainer';
    overlayCommentContainer.current.visible = false;

    pixiApp.current.stage.addChild(overlayCommentContainer.current);

    const pixiDebugRef = new PIXI.Text({
      text: '',
      style: COMMENT_TEXTSTYLE,
    });
    pixiDebugRef.resolution = 1;
    pixiDebugRef.x = 4;
    overlayCommentContainer.current.addChild(pixiDebugRef);

    // add pixiApp to canvas
    pixiContext.current.appendChild(pixiApp.current.canvas as any);

    // add background tiles
    await PIXI.Assets.load(CANVAS_BACKGROUND_TEXTURE);
    const texture = PIXI.Texture.from(CANVAS_BACKGROUND_TEXTURE);
    const background = new PIXI.TilingSprite({
      texture,
      width: pixiApp.current.screen.width,
      height: pixiApp.current.screen.height,
    });
    background.tileScale.x = 0.5;
    background.tileScale.y = 0.5;
    viewport.current.addChild(background);
    viewport.current.addEventListener('moved', (event) => {
      background.tilePosition.y = -viewport.current.top;
      background.tilePosition.x = -viewport.current.left;
      background.y = viewport.current.top;
      background.x = viewport.current.left;

      background.width = innerWidth / viewport.current.scale.x;
      background.height = innerHeight / viewport.current.scale.y;

      setMousePosition(event, mousePosition);
    });
    viewport.current.addEventListener('moved-end', () => {
      InterfaceController.notifyListeners(ListenEvent.ViewportMoveEnded, true);
    });

    background.alpha = CANVAS_BACKGROUND_ALPHA;

    // add graph to pixiApp
    viewport.current.label = 'Viewport';
    PPGraph.currentGraph = new PPGraph(pixiApp.current, viewport.current);

    pixiApp.current.ticker.add(async () => {
      const currentTime: number = new Date().getTime();
      const delta = currentTime - lastTimeTicked;
      lastTimeTicked = currentTime;
      if (overlayCommentContainer.current.visible) {
        lastDeltas.push(delta);
        if (lastDeltas.length > 100) {
          lastDeltas = lastDeltas.slice(1);
        }
        lastTimeTicked = currentTime;

        setDebugText(viewport, mousePosition, pixiDebugRef);
      }
    });

    // addEventListeners

    // disable browser window zoom on trackpad pinch
    document.addEventListener(
      'wheel',
      (event) => {
        const { ctrlKey } = event;
        if (ctrlKey) {
          event.preventDefault();
          return;
        }
      },
      { passive: false },
    );

    document.addEventListener('cut', cutOrCopyClipboard);
    document.addEventListener('copy', cutOrCopyClipboard);
    document.addEventListener('paste', pasteClipboard);

    window.addEventListener(
      'pointermove',
      (event: PIXI.FederatedPointerEvent) => {
        InterfaceController.notifyListeners(
          ListenEvent.GlobalPointerMove,
          event,
        );
        setMousePosition(event, mousePosition);
      },
    );

    window.addEventListener('popstate', () => {
      if (!checkForUnsavedChanges()) {
        window.history.pushState(null, '', window.location.href);
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      void loadGraph(urlParams);
    });

    // register key events
    window.addEventListener('keydown', InterfaceController.keysDown);

    window.addEventListener('keydown', (e: KeyboardEvent) =>
      InputParser.parseKeyDown(e, PPGraph.currentGraph),
    );

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      InputParser.parseKeyUp(e);
    });

    // very hacky, but if we finish loading the graph while the window is hidden the nodes wont have information, so refresh when we tab in, this is only a problem for hybrid nodes
    window.addEventListener('visibilitychange', () => {
      setTimeout(() => {
        const isVisible = document.visibilityState === 'visible';
        if (isVisible && PPGraph.currentGraph) {
          Object.values(PPGraph.currentGraph.nodes).forEach((node) =>
            node.onViewportMoveHandler(),
          );
        }
      }, 100);
    });

    window.dispatchEvent(new Event('pointermove')); // to initialise event values

    // load tailrmade settings
    PPStorage.getInstance().applyGestureMode(viewport.current);
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.CLOSE);

    const urlParams = new URLSearchParams(window.location.search);
    void loadGraph(urlParams);

    console.log('PPGraph.currentGraph:', PPGraph.currentGraph);

    console.timeEnd('main_app_mount');
    InterfaceController.spamToast('startup_complete');
  })();
  return lastTimeTicked;
};

export function addEllipsisToText(
  text: PIXI.Text,
  maxWidth: number,
  ellipsis: string = '...',
): void {
  const originalText = text.text;
  text.style.wordWrap = false;

  // If text fits, we're done
  if (text.width <= maxWidth) {
    return;
  }

  // Binary search for the right length
  let start = 0;
  let end = originalText.length;
  let bestFit = '';

  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const truncated = originalText.slice(0, mid) + ellipsis;
    text.text = truncated;

    if (text.width <= maxWidth) {
      bestFit = truncated;
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }

  text.text = bestFit;
}
