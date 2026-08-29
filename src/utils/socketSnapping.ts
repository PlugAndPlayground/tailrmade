// Pure geometry/compatibility helpers behind magnetic socket snapping.

export type SocketSnapDirection = 'input' | 'output' | 'ghost';

export type SnapPoint = { x: number; y: number };

export type SnapSocketInfo = {
  nodeId: string;
  direction: SocketSnapDirection;
};

export type SnapCandidate<T> = SnapSocketInfo & {
  ref: T;
  center: SnapPoint;
};

export function canSnapToSocket(
  source: SnapSocketInfo,
  candidate: SnapSocketInfo,
): boolean {
  if (candidate.nodeId === source.nodeId) {
    return false;
  }
  if (candidate.direction === 'ghost') {
    return true;
  }
  if (source.direction === 'ghost') {
    return false;
  }
  return source.direction !== candidate.direction;
}

// cheap prune so a pointer nowhere near a node never enumerates its sockets
export function isPointerNearNodeBounds(
  pointer: SnapPoint,
  bounds: { x: number; y: number; width: number; height: number },
  snapRadius: number,
): boolean {
  return (
    pointer.x >= bounds.x - snapRadius &&
    pointer.y >= bounds.y - snapRadius &&
    pointer.x <= bounds.x + bounds.width + snapRadius &&
    pointer.y <= bounds.y + bounds.height + snapRadius
  );
}

export function findNearestSnapCandidate<T>(
  pointer: SnapPoint,
  source: SnapSocketInfo,
  candidates: SnapCandidate<T>[],
  snapRadius: number,
): T | undefined {
  let best: T | undefined = undefined;
  let bestDistSquared = snapRadius * snapRadius;

  candidates.forEach((candidate) => {
    if (!canSnapToSocket(source, candidate)) {
      return;
    }
    const dx = pointer.x - candidate.center.x;
    const dy = pointer.y - candidate.center.y;
    const distSquared = dx * dx + dy * dy;
    if (distSquared < bestDistSquared) {
      bestDistSquared = distSquared;
      best = candidate.ref;
    }
  });

  return best;
}
