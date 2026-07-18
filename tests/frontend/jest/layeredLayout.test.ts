import {
  computeLayeredLayout,
  LayoutEdge,
  LayoutNodeInput,
} from '../../../src/classes/selection/layeredLayout';

const n = (
  id: string,
  y: number,
  width = 200,
  height = 100,
): LayoutNodeInput => ({ id, width, height, y });

const boxesOverlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const box = (
  nodes: LayoutNodeInput[],
  positions: Map<string, { x: number; y: number }>,
  id: string,
) => {
  const p = positions.get(id)!;
  const node = nodes.find((x) => x.id === id)!;
  return { x: p.x, y: p.y, w: node.width, h: node.height };
};

describe('computeLayeredLayout', () => {
  it('places a source strictly left of its target', () => {
    const nodes = [n('a', 0), n('b', 0)];
    const edges: LayoutEdge[] = [
      { from: 'a', to: 'b', fromOut: 0, toIn: 0 },
    ];
    const { positions } = computeLayeredLayout(nodes, edges);
    const a = box(nodes, positions, 'a');
    const b = box(nodes, positions, 'b');
    expect(a.x + a.w).toBeLessThanOrEqual(b.x);
  });

  it('orders sibling sources by the target input-socket order', () => {
    // 'z-top' feeds the higher socket (toIn 0), 'a-bottom' the lower (toIn 1).
    // Ids and seed y both oppose the expected order, so only a correct
    // input-socket tie-break can put z-top above a-bottom.
    const nodes = [n('sink', 0), n('z-top', 0), n('a-bottom', 500)];
    const edges: LayoutEdge[] = [
      { from: 'z-top', to: 'sink', fromOut: 0, toIn: 0 },
      { from: 'a-bottom', to: 'sink', fromOut: 0, toIn: 1 },
    ];
    const { positions } = computeLayeredLayout(nodes, edges);
    expect(positions.get('z-top')!.y).toBeLessThan(
      positions.get('a-bottom')!.y,
    );
  });

  it('orders sibling targets by the source output-socket order', () => {
    // 'z-top' is fed by the source's higher output (fromOut 0), 'a-bottom' by
    // the lower (fromOut 1); ids and seed y oppose the expected order.
    const nodes = [n('src', 0), n('z-top', 500), n('a-bottom', 0)];
    const edges: LayoutEdge[] = [
      { from: 'src', to: 'z-top', fromOut: 0, toIn: 0 },
      { from: 'src', to: 'a-bottom', fromOut: 1, toIn: 0 },
    ];
    const { positions } = computeLayeredLayout(nodes, edges);
    expect(positions.get('z-top')!.y).toBeLessThan(
      positions.get('a-bottom')!.y,
    );
  });

  it('centres a fan-in target vertically on its sources', () => {
    const nodes = [
      n('sink', 0),
      n('s1', 0),
      n('s2', 0),
      n('s3', 0),
      n('s4', 0),
      n('s5', 0),
    ];
    const edges: LayoutEdge[] = [1, 2, 3, 4, 5].map((i) => ({
      from: `s${i}`,
      to: 'sink',
      fromOut: 0,
      toIn: i - 1,
    }));
    const { positions } = computeLayeredLayout(nodes, edges);
    const sinkCenter = positions.get('sink')!.y + 50;
    const sourceCenters = [1, 2, 3, 4, 5].map(
      (i) => positions.get(`s${i}`)!.y + 50,
    );
    const avg = sourceCenters.reduce((a, b) => a + b, 0) / sourceCenters.length;
    // sink should sit near the middle of its fan, not at an extreme
    expect(Math.abs(sinkCenter - avg)).toBeLessThan(30);
    const minC = Math.min(...sourceCenters);
    const maxC = Math.max(...sourceCenters);
    expect(sinkCenter).toBeGreaterThan(minC + 0.25 * (maxC - minC));
    expect(sinkCenter).toBeLessThan(maxC - 0.25 * (maxC - minC));
  });

  it('widens the layer gap for a tall fan so wire angles stay gentle', () => {
    const tall = [
      n('sink', 0),
      ...[1, 2, 3, 4, 5, 6].map((i) => n(`s${i}`, 0)),
    ];
    const tallEdges: LayoutEdge[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      from: `s${i}`,
      to: 'sink',
      fromOut: 0,
      toIn: i - 1,
    }));
    const tallLayout = computeLayeredLayout(tall, tallEdges);

    const small = [n('sink', 0), n('s1', 0)];
    const smallEdges: LayoutEdge[] = [
      { from: 's1', to: 'sink', fromOut: 0, toIn: 0 },
    ];
    const smallLayout = computeLayeredLayout(small, smallEdges);

    const tallGap = tallLayout.positions.get('sink')!.x;
    const smallGap = smallLayout.positions.get('sink')!.x;
    expect(tallGap).toBeGreaterThan(smallGap);

    // steepest wire angle into the sink should stay under ~45 degrees
    const sinkX = tallLayout.positions.get('sink')!.x;
    const sinkCenter = tallLayout.positions.get('sink')!.y + 50;
    let maxAngle = 0;
    [1, 2, 3, 4, 5, 6].forEach((i) => {
      const p = tallLayout.positions.get(`s${i}`)!;
      const dx = sinkX - (p.x + 200);
      const dy = Math.abs(p.y + 50 - sinkCenter);
      maxAngle = Math.max(maxAngle, Math.atan2(dy, dx));
    });
    // gentle: comfortably shy of vertical (old greedy layout was ~59 deg)
    expect(maxAngle).toBeLessThan((55 * Math.PI) / 180);
  });

  it('produces no overlaps in a diamond graph', () => {
    const nodes = [n('a', 0), n('b', 0), n('c', 200), n('d', 0)];
    const edges: LayoutEdge[] = [
      { from: 'a', to: 'b', fromOut: 0, toIn: 0 },
      { from: 'a', to: 'c', fromOut: 1, toIn: 0 },
      { from: 'b', to: 'd', fromOut: 0, toIn: 0 },
      { from: 'c', to: 'd', fromOut: 0, toIn: 1 },
    ];
    const { positions } = computeLayeredLayout(nodes, edges);
    const ids = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(
          boxesOverlap(
            box(nodes, positions, ids[i]),
            box(nodes, positions, ids[j]),
          ),
        ).toBe(false);
      }
    }
    // flow direction: a left of b/c, b/c left of d
    expect(positions.get('a')!.x).toBeLessThan(positions.get('b')!.x);
    expect(positions.get('b')!.x).toBeLessThan(positions.get('d')!.x);
    expect(positions.get('c')!.x).toBeLessThan(positions.get('d')!.x);
  });

  it('stacks disconnected components in their original vertical order', () => {
    // component B seeded above A; order must be preserved, gap must be small
    const nodes = [
      n('a1', 1000),
      n('a2', 1000),
      n('b1', 0),
      n('b2', 0),
    ];
    const edges: LayoutEdge[] = [
      { from: 'a1', to: 'a2', fromOut: 0, toIn: 0 },
      { from: 'b1', to: 'b2', fromOut: 0, toIn: 0 },
    ];
    // pin the gap explicitly so the test is independent of the DEFAULTS value
    const componentGap = 200;
    const { positions } = computeLayeredLayout(nodes, edges, { componentGap });
    const aTop = Math.min(positions.get('a1')!.y, positions.get('a2')!.y);
    const bBottom = Math.max(
      positions.get('b1')!.y + 100,
      positions.get('b2')!.y + 100,
    );
    // B (originally higher) stays entirely above A
    expect(bBottom).toBeLessThanOrEqual(aTop);
    // and the gap between them is exactly the requested component gap
    expect(aTop - bBottom).toBeCloseTo(componentGap);
  });

  it('reserves outer chrome margin so wrapped components keep the component gap', () => {
    // Both components are wrapped by a container that draws 100px of chrome
    // around their content (like a macro). Without reserving it, the two
    // wrapped boxes would touch/overlap; the chrome-padded boxes must stay a
    // full component gap apart.
    const margin = 100;
    const withMargin = (id: string, y: number): LayoutNodeInput => ({
      ...n(id, y),
      marginTop: margin,
      marginBottom: margin,
    });
    const nodes = [
      withMargin('a1', 0),
      withMargin('a2', 0),
      withMargin('b1', 1000),
      withMargin('b2', 1000),
    ];
    const edges: LayoutEdge[] = [
      { from: 'a1', to: 'a2', fromOut: 0, toIn: 0 },
      { from: 'b1', to: 'b2', fromOut: 0, toIn: 0 },
    ];
    const componentGap = 200;
    const { positions } = computeLayeredLayout(nodes, edges, { componentGap });
    // chrome-padded box of the top component (A) vs the bottom one (B)
    const aChromeBottom =
      Math.max(positions.get('a1')!.y + 100, positions.get('a2')!.y + 100) +
      margin;
    const bChromeTop =
      Math.min(positions.get('b1')!.y, positions.get('b2')!.y) - margin;
    const gap = bChromeTop - aChromeBottom;
    // the surviving gap between the padded boxes is exactly the component gap:
    // the chrome no longer eats into it (would be 0 without the margin reserve).
    expect(gap).toBeCloseTo(componentGap);
  });

  it('is deterministic regardless of input order', () => {
    const nodes = [n('sink', 0), n('s1', 0), n('s2', 0), n('s3', 0)];
    const edges: LayoutEdge[] = [1, 2, 3].map((i) => ({
      from: `s${i}`,
      to: 'sink',
      fromOut: 0,
      toIn: i - 1,
    }));
    const a = computeLayeredLayout(nodes, edges).positions;
    const b = computeLayeredLayout(
      [...nodes].reverse(),
      [...edges].reverse(),
    ).positions;
    ['sink', 's1', 's2', 's3'].forEach((id) => {
      expect(a.get(id)).toEqual(b.get(id));
    });
  });

  it('routes a long edge so it does not split a fan (Day Tracker case)', () => {
    // day + name feed "make"; func feeds the surface directly (a long edge
    // skipping make's column); make also feeds the surface. func must not be
    // slotted between the two make-feeders, which would cross its long edge
    // over name's edge into make.
    const nodes: LayoutNodeInput[] = [
      { id: 'make', width: 160, height: 184, y: 3284 },
      { id: 'func', width: 160, height: 64, y: 3344 },
      { id: 'day', width: 320, height: 180, y: 3124 },
      { id: 'name', width: 320, height: 180, y: 3448 },
      { id: 'surf', width: 1116, height: 1356, y: 2698 },
    ];
    const edges: LayoutEdge[] = [
      { from: 'day', to: 'make', fromOut: 0, toIn: 0 },
      { from: 'name', to: 'make', fromOut: 0, toIn: 2 },
      { from: 'func', to: 'surf', fromOut: 0, toIn: 1 },
      { from: 'make', to: 'surf', fromOut: 0, toIn: 4 },
    ];
    const { positions } = computeLayeredLayout(nodes, edges);
    const y = (id: string) => positions.get(id)!.y;
    // day and name are the make fan; func must sit outside their vertical band
    const bandTop = Math.min(y('day'), y('name'));
    const bandBottom = Math.max(y('day'), y('name'));
    expect(y('func') < bandTop || y('func') > bandBottom).toBe(true);
    // socket order within the fan: day (socket 0) above name (socket 2)
    expect(y('day')).toBeLessThan(y('name'));
    // make sits to the right of its feeders, surface to the right of make
    expect(positions.get('day')!.x).toBeLessThan(positions.get('make')!.x);
    expect(positions.get('make')!.x).toBeLessThan(positions.get('surf')!.x);
  });
});
