import {
  MAX_CAPTURE_DIMENSION,
  computeDomCaptureScale,
  computeDomPlacement,
  computeOutputSize,
  intersectRects,
  rectContains,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
} from '../../../src/services/captureGeometry';

const SCREEN = { width: 1600, height: 900 };

describe('capture geometry', () => {
  describe('screen <-> world', () => {
    it('round trips through both directions', () => {
      const viewport = { x: -320, y: 140, scale: 0.75 };
      const world = { x: 1234.5, y: -678.25 };
      const back = screenToWorld(worldToScreen(world, viewport), viewport);
      expect(back.x).toBeCloseTo(world.x, 10);
      expect(back.y).toBeCloseTo(world.y, 10);
    });

    it('places the window origin at the visible world rect origin', () => {
      const viewport = { x: -320, y: 140, scale: 0.75 };
      const visible = visibleWorldRect(viewport, SCREEN.width, SCREEN.height);
      const origin = screenToWorld({ x: 0, y: 0 }, viewport);
      expect(visible.x).toBeCloseTo(origin.x);
      expect(visible.y).toBeCloseTo(origin.y);
      expect(visible.width).toBeCloseTo(SCREEN.width / viewport.scale);
    });
  });

  describe('computeOutputSize', () => {
    it('is world units times the scale', () => {
      const size = computeOutputSize(
        { x: 10, y: 20, width: 400, height: 300 },
        2,
      );
      expect(size).toMatchObject({
        width: 800,
        height: 600,
        appliedScale: 2,
        downscaledBy: 0,
      });
    });

    it('is zoom independent - scale 1 gives a node its world size', () => {
      const bounds = { x: 0, y: 0, width: 400, height: 300 };
      expect(computeOutputSize(bounds, 1).width).toBe(400);
    });

    it('clamps the long side to the maximum and reports the downscale', () => {
      const bounds = { x: 0, y: 0, width: 20000, height: 5000 };
      const size = computeOutputSize(bounds, 2);
      expect(size.width).toBe(MAX_CAPTURE_DIMENSION);
      expect(size.height).toBe(
        Math.floor(MAX_CAPTURE_DIMENSION * (5000 / 20000)),
      );
      expect(size.appliedScale).toBeLessThan(2);
      expect(size.downscaledBy).toBeCloseTo(1 - MAX_CAPTURE_DIMENSION / 40000);
    });

    it('never returns a zero sized canvas', () => {
      const size = computeOutputSize(
        { x: 0, y: 0, width: 0.1, height: 0.1 },
        1,
      );
      expect(size.width).toBe(1);
      expect(size.height).toBe(1);
    });

    it('falls back to scale 1 for a nonsense scale', () => {
      expect(
        computeOutputSize({ x: 0, y: 0, width: 100, height: 100 }, 0)
          .appliedScale,
      ).toBe(1);
    });
  });

  describe('compositing the html layer onto the pixi layer', () => {
    it('covers the output exactly when capturing the whole window', () => {
      const viewport = { x: -320, y: 140, scale: 0.75 };
      const bounds = visibleWorldRect(viewport, SCREEN.width, SCREEN.height);
      const size = computeOutputSize(bounds, 1);
      const placement = computeDomPlacement(
        bounds,
        viewport,
        SCREEN.width,
        SCREEN.height,
        size.appliedScale,
      );

      expect(placement.dx).toBeCloseTo(0);
      expect(placement.dy).toBeCloseTo(0);
      // the output canvas is floored to whole pixels, so the html layer covers
      // it with up to a pixel to spare rather than falling short of an edge
      expect(placement.dWidth).toBeGreaterThanOrEqual(size.width);
      expect(placement.dWidth).toBeLessThan(size.width + 1);
      expect(placement.dHeight).toBeGreaterThanOrEqual(size.height);
      expect(placement.dHeight).toBeLessThan(size.height + 1);
    });

    it('offsets the html layer when capturing a sub region', () => {
      const viewport = { x: 0, y: 0, scale: 1 };
      // a selection 100 world units right and 50 down from the window origin
      const bounds = { x: 100, y: 50, width: 400, height: 300 };
      const placement = computeDomPlacement(
        bounds,
        viewport,
        SCREEN.width,
        SCREEN.height,
        1,
      );

      // the html layer starts at world (0, 0), so it hangs off the top left
      expect(placement.dx).toBeCloseTo(-100);
      expect(placement.dy).toBeCloseTo(-50);
    });

    it('lands a widget at the same output pixel as its pixi bounds', () => {
      const viewport = { x: -320, y: 140, scale: 0.75 };
      const bounds = { x: 500, y: 200, width: 400, height: 300 };
      const appliedScale = computeOutputSize(bounds, 2).appliedScale;
      const placement = computeDomPlacement(
        bounds,
        viewport,
        SCREEN.width,
        SCREEN.height,
        appliedScale,
      );

      // a hybrid container sits at this css pixel, which is the top left of the
      // captured region in screen space
      const widgetScreen = worldToScreen(
        { x: bounds.x, y: bounds.y },
        viewport,
      );
      // where that css pixel ends up once the html canvas is blitted
      const onOutputX =
        placement.dx + (widgetScreen.x / SCREEN.width) * placement.dWidth;
      const onOutputY =
        placement.dy + (widgetScreen.y / SCREEN.height) * placement.dHeight;

      // the same place the pixi layer draws the node: the output's origin
      expect(onOutputX).toBeCloseTo(0);
      expect(onOutputY).toBeCloseTo(0);
    });

    it('blits the html canvas 1:1 when rasterised at the matching density', () => {
      const viewport = { x: 60, y: -25, scale: 0.4 };
      const bounds = visibleWorldRect(viewport, SCREEN.width, SCREEN.height);
      const appliedScale = computeOutputSize(bounds, 1.5).appliedScale;

      const domScale = computeDomCaptureScale(appliedScale, viewport.scale);
      const domCanvasWidth = SCREEN.width * domScale;
      const domCanvasHeight = SCREEN.height * domScale;

      const placement = computeDomPlacement(
        bounds,
        viewport,
        SCREEN.width,
        SCREEN.height,
        appliedScale,
      );

      // no resampling: the destination rect is the source canvas' own size
      expect(placement.dWidth).toBeCloseTo(domCanvasWidth);
      expect(placement.dHeight).toBeCloseTo(domCanvasHeight);
    });

    it('asks for a denser html raster the further out the graph is zoomed', () => {
      expect(computeDomCaptureScale(1, 0.5)).toBe(2);
      expect(computeDomCaptureScale(1, 2)).toBe(0.5);
      expect(computeDomCaptureScale(1, 1)).toBe(1);
    });
  });

  describe('clipping to what is on screen', () => {
    const onScreen = { x: 0, y: 0, width: 1000, height: 800 };

    it('clips a partly visible region', () => {
      expect(
        intersectRects({ x: 900, y: 700, width: 400, height: 400 }, onScreen),
      ).toEqual({ x: 900, y: 700, width: 100, height: 100 });
    });

    it('returns null for a region that is entirely off screen', () => {
      expect(
        intersectRects({ x: 1200, y: 0, width: 100, height: 100 }, onScreen),
      ).toBeNull();
    });

    it('returns null for a region that only touches the edge', () => {
      expect(
        intersectRects({ x: 1000, y: 0, width: 100, height: 100 }, onScreen),
      ).toBeNull();
    });

    it('knows when nothing had to be clipped', () => {
      expect(
        rectContains(onScreen, { x: 10, y: 10, width: 100, height: 100 }),
      ).toBe(true);
      expect(
        rectContains(onScreen, { x: 950, y: 10, width: 100, height: 100 }),
      ).toBe(false);
    });
  });
});
