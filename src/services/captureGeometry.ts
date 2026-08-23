/**
 * Pure geometry for the capture pipeline, kept free of pixi and dom imports so
 * it can be unit tested in the jest node environment.
 *
 * A graph capture composites two layers that live in different spaces:
 *
 * - world space   what pixi containers are positioned in, zoom independent.
 *                 `renderer.extract` renders a world space frame straight into
 *                 a texture, so this is the space the output is defined in.
 * - screen space  css pixels of the window. HybridNode2 positions its html
 *                 containers here, and pixi screen space and #container css
 *                 pixels are the same space (the identity mapping the socket
 *                 name overlay relies on too).
 * - output space  pixels of the produced png, `appliedScale` of them per world
 *                 unit. Scale 1 means a 400 world unit wide node comes out
 *                 400px wide, whatever the current zoom is.
 */

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The bits of the pixi viewport the mapping needs: world -> screen is `world * scale + offset`. */
export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface OutputSize {
  width: number;
  height: number;
  /** output pixels per world unit, `requestedScale` unless it had to be clamped */
  appliedScale: number;
  /** 0 when nothing was clamped, otherwise the fraction of the request that was dropped */
  downscaledBy: number;
}

export interface DomPlacement {
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

// webgl and canvas2d both start failing around here
export const MAX_CAPTURE_DIMENSION = 16384;

export const screenToWorld = (
  screen: { x: number; y: number },
  viewport: ViewportTransform,
): { x: number; y: number } => ({
  x: (screen.x - viewport.x) / viewport.scale,
  y: (screen.y - viewport.y) / viewport.scale,
});

export const worldToScreen = (
  world: { x: number; y: number },
  viewport: ViewportTransform,
): { x: number; y: number } => ({
  x: world.x * viewport.scale + viewport.x,
  y: world.y * viewport.scale + viewport.y,
});

/** Returns null when the rects do not overlap at all. */
export const intersectRects = (
  a: CaptureRect,
  b: CaptureRect,
): CaptureRect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) {
    return null;
  }
  return { x, y, width: right - x, height: bottom - y };
};

export const rectContains = (outer: CaptureRect, inner: CaptureRect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/**
 * Output pixel size for a world space region, clamped so neither side exceeds
 * `maxDimension`. Mirrors what the Draw nodes do when an extract gets too big.
 */
export const computeOutputSize = (
  bounds: CaptureRect,
  requestedScale: number,
  maxDimension: number = MAX_CAPTURE_DIMENSION,
): OutputSize => {
  const scale = requestedScale > 0 ? requestedScale : 1;
  const width = bounds.width * scale;
  const height = bounds.height * scale;

  let appliedScale = scale;
  if (width > maxDimension || height > maxDimension) {
    const fit = Math.min(maxDimension / width, maxDimension / height);
    appliedScale = scale * fit;
  }

  return {
    width: Math.max(1, Math.floor(bounds.width * appliedScale)),
    height: Math.max(1, Math.floor(bounds.height * appliedScale)),
    appliedScale,
    downscaledBy: 1 - appliedScale / scale,
  };
};

/**
 * The `scale` to hand html2canvas so the html layer is rasterised at exactly
 * the density the output needs. html2canvas works in css pixels while the
 * output is in world units, so the zoom has to be divided back out: at 50% zoom
 * a widget covers half as many css pixels as world units and must be rendered
 * at twice the density to come out sharp instead of upscaled.
 */
export const computeDomCaptureScale = (
  appliedScale: number,
  viewportScale: number,
): number => appliedScale / viewportScale;

/**
 * Where to blit the html layer canvas onto the output canvas. The html layer
 * always covers the whole window starting at screen (0, 0), so only its origin
 * has to be walked through screen -> world -> output.
 *
 * With `domCaptureScale` from `computeDomCaptureScale` the result is a 1:1
 * pixel blit (dWidth equals the source canvas width), no resampling involved.
 */
export const computeDomPlacement = (
  bounds: CaptureRect,
  viewport: ViewportTransform,
  domCssWidth: number,
  domCssHeight: number,
  appliedScale: number,
): DomPlacement => {
  const origin = screenToWorld({ x: 0, y: 0 }, viewport);
  return {
    dx: (origin.x - bounds.x) * appliedScale,
    dy: (origin.y - bounds.y) * appliedScale,
    dWidth: (domCssWidth / viewport.scale) * appliedScale,
    dHeight: (domCssHeight / viewport.scale) * appliedScale,
  };
};

/** World space rect currently covered by the window, in the same terms as the viewport transform. */
export const visibleWorldRect = (
  viewport: ViewportTransform,
  screenWidth: number,
  screenHeight: number,
): CaptureRect => {
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: screenWidth / viewport.scale,
    height: screenHeight / viewport.scale,
  };
};
