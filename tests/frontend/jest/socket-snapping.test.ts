import {
  SnapCandidate,
  SnapSocketInfo,
  canSnapToSocket,
  findNearestSnapCandidate,
  isPointerNearNodeBounds,
} from '../../../src/utils/socketSnapping';

const socket = (
  nodeId: string,
  direction: SnapSocketInfo['direction'],
): SnapSocketInfo => ({ nodeId, direction });

const candidate = (
  name: string,
  nodeId: string,
  direction: SnapSocketInfo['direction'],
  x: number,
  y: number,
): SnapCandidate<string> => ({
  ref: name,
  nodeId,
  direction,
  center: { x, y },
});

describe('canSnapToSocket', () => {
  it('connects an output being dragged to an input on another node', () => {
    expect(canSnapToSocket(socket('a', 'output'), socket('b', 'input'))).toBe(
      true,
    );
    expect(canSnapToSocket(socket('a', 'input'), socket('b', 'output'))).toBe(
      true,
    );
  });

  it('rejects same direction pairs, which cannot be connected', () => {
    expect(canSnapToSocket(socket('a', 'output'), socket('b', 'output'))).toBe(
      false,
    );
    expect(canSnapToSocket(socket('a', 'input'), socket('b', 'input'))).toBe(
      false,
    );
  });

  it('excludes every socket on the node being dragged from', () => {
    // otherwise the wire constantly snaps back to the source node's own
    // neighboring sockets while the pointer is still leaving it
    expect(canSnapToSocket(socket('a', 'output'), socket('a', 'input'))).toBe(
      false,
    );
    expect(canSnapToSocket(socket('a', 'output'), socket('a', 'ghost'))).toBe(
      false,
    );
  });

  it('accepts a ghost socket from either drag direction', () => {
    expect(canSnapToSocket(socket('a', 'input'), socket('b', 'ghost'))).toBe(
      true,
    );
    expect(canSnapToSocket(socket('a', 'output'), socket('b', 'ghost'))).toBe(
      true,
    );
  });

  it('never snaps away from a ghost socket to a normal one', () => {
    // mirrors socketMouseUp: a ghost source is neither input nor output
    expect(canSnapToSocket(socket('a', 'ghost'), socket('b', 'input'))).toBe(
      false,
    );
    expect(canSnapToSocket(socket('a', 'ghost'), socket('b', 'output'))).toBe(
      false,
    );
  });
});

describe('isPointerNearNodeBounds', () => {
  const bounds = { x: 100, y: 100, width: 50, height: 40 };

  it('accepts a pointer inside the node', () => {
    expect(isPointerNearNodeBounds({ x: 120, y: 120 }, bounds, 48)).toBe(true);
  });

  it('accepts a pointer within the snap radius of any edge', () => {
    expect(isPointerNearNodeBounds({ x: 60, y: 120 }, bounds, 48)).toBe(true);
    expect(isPointerNearNodeBounds({ x: 190, y: 120 }, bounds, 48)).toBe(true);
    expect(isPointerNearNodeBounds({ x: 120, y: 55 }, bounds, 48)).toBe(true);
    expect(isPointerNearNodeBounds({ x: 120, y: 185 }, bounds, 48)).toBe(true);
  });

  it('prunes a node further away than the snap radius', () => {
    expect(isPointerNearNodeBounds({ x: 51, y: 120 }, bounds, 48)).toBe(false);
    expect(isPointerNearNodeBounds({ x: 120, y: 189 }, bounds, 48)).toBe(false);
  });
});

describe('findNearestSnapCandidate', () => {
  const source = socket('source', 'output');

  it('picks the closest compatible socket', () => {
    const near = candidate('near', 'b', 'input', 110, 100);
    const far = candidate('far', 'c', 'input', 130, 100);
    expect(
      findNearestSnapCandidate({ x: 100, y: 100 }, source, [far, near], 48),
    ).toBe('near');
  });

  it('skips closer incompatible sockets in favour of a compatible one', () => {
    const closerButWrongDirection = candidate('out', 'b', 'output', 102, 100);
    const closerButSameNode = candidate('own', 'source', 'input', 101, 100);
    const compatible = candidate('in', 'c', 'input', 120, 100);
    expect(
      findNearestSnapCandidate(
        { x: 100, y: 100 },
        source,
        [closerButWrongDirection, closerButSameNode, compatible],
        48,
      ),
    ).toBe('in');
  });

  it('ignores anything outside the snap radius, measured as a circle', () => {
    const pointer = { x: 100, y: 100 };
    // 40/40 is inside a 48px square but outside a 48px circle (~56.6 away)
    const outside = [
      candidate('outside', 'b', 'input', 149, 100),
      candidate('diagonal', 'b', 'input', 140, 140),
      candidate('onRadius', 'b', 'input', 148, 100),
    ];
    outside.forEach((only) => {
      expect(
        findNearestSnapCandidate(pointer, source, [only], 48),
      ).toBeUndefined();
    });
    expect(findNearestSnapCandidate(pointer, source, [], 48)).toBeUndefined();
  });
});
