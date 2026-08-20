// Pure geometry/compatibility helpers behind magnetic socket snapping.
// Kept free of PIXI and PPGraph so the rules can be unit tested directly;
// GraphClass supplies the screen space coordinates and owns the PIXI objects.

export type SocketSnapDirection = 'input' | 'output' | 'ghost';

export type SnapPoint = {
  x: number;
  y: number;
};

export type SnapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapSocketInfo = {
  nodeId: string;
  direction: SocketSnapDirection;
};

export type SnapCandidate<T> = SnapSocketInfo & {
  ref: T;
  center: SnapPoint;
};

// mirrors the connect rules in PPGraph.socketMouseUp, with one addition:
// sockets on the source node are excluded so the wire does not constantly
// snap to the neighbors of the socket being dragged from (a direct hit on
// them still connects as before)
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

// Snapping stands down when the dragged wire is already committed elsewhere.
// Keeping the precedence in one predicate makes the ordering explicit: a
// socket under the pointer always beats a merely nearby one, and while the
// node search is open the wire stays pinned to the stored cursor position.
export type SnapSuppressionState = {
  // overrideNodeCursorPosition is set - the node search pinned the wire
  hasPinnedCursorPosition: boolean;
  // the pointer is directly over a socket other than the dragged one
  hoversOtherSocket: boolean;
};

export function isSnappingSuppressed(state: SnapSuppressionState): boolean {
  return state.hasPinnedCursorPosition || state.hoversOtherSocket;
}

// cheap prune so only nodes that can possibly hold a snappable socket
// iterate their sockets - bounds and radius are both in screen pixels
export function isPointerNearNodeBounds(
  pointer: SnapPoint,
  bounds: SnapBounds,
  snapRadius: number,
): boolean {
  return (
    pointer.x >= bounds.x - snapRadius &&
    pointer.y >= bounds.y - snapRadius &&
    pointer.x <= bounds.x + bounds.width + snapRadius &&
    pointer.y <= bounds.y + bounds.height + snapRadius
  );
}

// nearest compatible candidate strictly inside snapRadius, or undefined.
// all coordinates are screen pixels, which is what makes the snap distance
// feel identical at every zoom level
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
