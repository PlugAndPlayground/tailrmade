import {
  Bounds,
  boundsOverlap,
  findFreeStart,
  overlapsAny,
  pushDownUntilFree,
} from '../../../src/classes/selection/blockPlacement';

const rect = (x: number, y: number, w: number, h: number): Bounds => ({
  minX: x,
  minY: y,
  maxX: x + w,
  maxY: y + h,
});

const shifted = (b: Bounds, dx: number, dy: number): Bounds =>
  rect(b.minX + dx, b.minY + dy, b.maxX - b.minX, b.maxY - b.minY);

// The weather app from the bug report: HTTP, two Breaks, two Texts and a UI
// page spread across x 394-1993, y 238-649.
const weatherApp: Bounds[] = [
  rect(394, 278, 160, 160),
  rect(729, 238, 160, 304),
  rect(1057, 360, 160, 184),
  rect(1340, 345, 240, 80),
  rect(1340, 477, 240, 80),
  rect(1693, 349, 300, 300),
];

describe('boundsOverlap', () => {
  it('treats touching edges as free and respects clearance', () => {
    const a = rect(0, 0, 100, 100);
    expect(boundsOverlap(a, rect(100, 0, 50, 50))).toBe(false);
    expect(boundsOverlap(a, rect(99, 0, 50, 50))).toBe(true);
    expect(boundsOverlap(a, rect(150, 0, 50, 50), 40)).toBe(false);
    expect(boundsOverlap(a, rect(150, 0, 50, 50), 60)).toBe(true);
  });
});

describe('findFreeStart', () => {
  it('keeps a block that already sits in free space', () => {
    const block = rect(0, 2000, 600, 400);
    expect(findFreeStart(block, weatherApp, 80, 240)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('keeps a block where it is on an empty canvas', () => {
    expect(findFreeStart(rect(5, 5, 10, 10), [], 80, 240)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('moves a block spawned in the middle of an app below all of it', () => {
    // viewport centre of the weather app, where the AI used to build
    const block = rect(1100, 400, 900, 500);
    const { dx, dy } = findFreeStart(block, weatherApp, 80, 240);
    const placed = shifted(block, dx, dy);
    expect(placed.minX).toBe(394);
    expect(placed.minY).toBe(649 + 240);
    expect(overlapsAny(placed, weatherApp, 80)).toBe(false);
  });
});

describe('pushDownUntilFree', () => {
  it('does not move a block that is already clear', () => {
    expect(pushDownUntilFree(rect(0, 1000, 100, 100), weatherApp, 80)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('only moves down, just far enough to clear every obstacle', () => {
    // a section placed to the right of a previous one, running into the app
    const block = rect(1300, 300, 400, 200);
    const { dx, dy } = pushDownUntilFree(block, weatherApp, 80);
    expect(dx).toBe(0);
    expect(dy).toBeGreaterThan(0);
    const placed = shifted(block, dx, dy);
    expect(overlapsAny(placed, weatherApp, 80)).toBe(false);
    // the lowest obstacle it collided with is the UI page ending at y 649
    expect(placed.minY).toBe(649 + 80);
  });

  it('steps past obstacles it reaches while moving down', () => {
    // the gap between the two is too small for the block plus clearance
    const column = [rect(0, 0, 100, 100), rect(0, 120, 100, 100)];
    const block = rect(0, 50, 100, 20);
    const { dy } = pushDownUntilFree(block, column, 10);
    const placed = shifted(block, 0, dy);
    expect(overlapsAny(placed, column, 10)).toBe(false);
    expect(placed.minY).toBe(230);
  });
});
