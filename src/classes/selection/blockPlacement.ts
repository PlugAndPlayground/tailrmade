// Pure, framework-free helpers that keep a block of nodes the AI builds out of
// the way of nodes already on the canvas. Unit-tested in
// tests/frontend/jest/blockPlacement.test.ts without a browser.

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Offset {
  dx: number;
  dy: number;
}

export const boundsOverlap = (a: Bounds, b: Bounds, clearance = 0): boolean =>
  a.minX < b.maxX + clearance &&
  a.maxX + clearance > b.minX &&
  a.minY < b.maxY + clearance &&
  a.maxY + clearance > b.minY;

export const overlapsAny = (
  block: Bounds,
  obstacles: Bounds[],
  clearance = 0,
): boolean =>
  obstacles.some((obstacle) => boundsOverlap(block, obstacle, clearance));

export const unionBounds = (list: Bounds[]): Bounds | undefined =>
  list.length === 0
    ? undefined
    : list.reduce((union, bounds) => ({
        minX: Math.min(union.minX, bounds.minX),
        minY: Math.min(union.minY, bounds.minY),
        maxX: Math.max(union.maxX, bounds.maxX),
        maxY: Math.max(union.maxY, bounds.maxY),
      }));

const shift = (bounds: Bounds, { dx, dy }: Offset): Bounds => ({
  minX: bounds.minX + dx,
  minY: bounds.minY + dy,
  maxX: bounds.maxX + dx,
  maxY: bounds.maxY + dy,
});

/**
 * Where a new block should start. It stays where it is when that spot keeps
 * `clearance` to every obstacle; otherwise it starts below everything, left
 * aligned with the existing content, so it never lands between the user's
 * nodes. Returns the offset to apply to the block.
 */
export function findFreeStart(
  block: Bounds,
  obstacles: Bounds[],
  clearance: number,
  gapBelow: number,
): Offset {
  const all = unionBounds(obstacles);
  if (!all || !overlapsAny(block, obstacles, clearance)) {
    return { dx: 0, dy: 0 };
  }
  return { dx: all.minX - block.minX, dy: all.maxY + gapBelow - block.minY };
}

/**
 * The smallest downward shift that clears every obstacle by `clearance`. Each
 * step jumps the block just below the obstacles it still touches, so it only
 * ever moves down and stops after at most one step per obstacle.
 */
export function pushDownUntilFree(
  block: Bounds,
  obstacles: Bounds[],
  clearance: number,
): Offset {
  let dy = 0;
  for (let step = 0; step <= obstacles.length; step++) {
    const current = shift(block, { dx: 0, dy });
    const hits = obstacles.filter((obstacle) =>
      boundsOverlap(current, obstacle, clearance),
    );
    if (hits.length === 0) {
      break;
    }
    const lowest = Math.max(...hits.map((obstacle) => obstacle.maxY));
    dy = lowest + clearance - block.minY;
  }
  return { dx: 0, dy };
}
