import { doWithTestController, openNewGraph } from '../helpers';

// End-to-end check of the layered autoAlignNodes rewrite for the fan-in case
// (many sources into one target). The old greedy placer collapsed the sources
// into a single tight column one narrow gap left of the target, producing
// steep, dense wires. The rewrite centres the target on its fan and widens the
// horizontal gap proportionally so wire angles stay gentle.
const boxesOverlap = (
  a: { x: number; y: number; nodeWidth: number; nodeHeight: number },
  b: { x: number; y: number; nodeWidth: number; nodeHeight: number },
) =>
  a.x < b.x + b.nodeWidth &&
  a.x + a.nodeWidth > b.x &&
  a.y < b.y + b.nodeHeight &&
  a.y + a.nodeHeight > b.y;

// widgetslider: Min / Max / Initial Value are all NumberType, so slider.Out ->
// slider.{Min,Max,Initial Value} are valid links (a clean 3-way fan-in).
const slider = (id: string, x: number, y: number) => ({
  id,
  type: 'widgetslider',
  x,
  y,
  width: 200,
  height: 104,
  socketArray: [
    { socketType: 'in', name: 'Initial Value', dataType: '{"class":"NumberType"}', data: 0, visible: false },
    { socketType: 'in', name: 'Min', dataType: '{"class":"NumberType"}', data: 0, visible: false },
    { socketType: 'in', name: 'Max', dataType: '{"class":"NumberType"}', data: 100 },
    { socketType: 'in', name: 'Round', dataType: '{"class":"BooleanType"}', data: false, visible: false },
    { socketType: 'in', name: 'Label', dataType: '{"class":"StringType"}', data: 'S', visible: false },
    { socketType: 'out', name: 'Out', dataType: '{"class":"NumberType"}' },
    { socketType: 'out', name: 'ReactUI', dataType: '{"class":"DeferredReactType"}', visible: false },
  ],
  updateBehaviour: { load: true, update: true, interval: false },
});

const GRAPH = JSON.stringify({
  version: 3,
  graphSettings: { viewportCenterPosition: { x: 0, y: 400 }, viewportScale: 0.4 },
  nodes: [
    slider('sink', 800, 0),
    slider('s1', 0, 0),
    slider('s2', 0, 300),
    slider('s3', 0, 600),
  ],
  links: [
    { sourceNodeId: 's1', sourceSocketName: 'Out', targetNodeId: 'sink', targetSocketName: 'Min' },
    { sourceNodeId: 's2', sourceSocketName: 'Out', targetNodeId: 'sink', targetSocketName: 'Max' },
    { sourceNodeId: 's3', sourceSocketName: 'Out', targetNodeId: 'sink', targetSocketName: 'Initial Value' },
  ],
});

describe('autoAlignNodes fan-in layout', () => {
  beforeEach(() => openNewGraph());

  it('centres the target on its sources with gentle wire angles', () => {
    const ids = ['sink', 's1', 's2', 's3'];
    // loadStringifiedGraph awaits configure() end-to-end (nodes created with
    // their configured dimensions, links added, seed nodes executed), so no
    // settle wait is needed before reading geometry for the layout.
    doWithTestController(async (tc) => {
      await tc.loadStringifiedGraph(GRAPH);
    });
    doWithTestController(async (tc) => {
      const nodes = ids.map((id) => tc.getNodeByID(id));
      await (tc as any).getGraph().selection.autoAlignNodes(nodes);

      const sink = tc.getNodeByID('sink');
      const sources = ['s1', 's2', 's3'].map((id) => tc.getNodeByID(id));

      // 1. flow direction: every source sits fully left of the sink
      sources.forEach((s) => {
        expect(s.x + s.nodeWidth, `${s.id} is left of sink`).to.be.lessThan(
          sink.x,
        );
      });

      // 2. no overlaps
      const all = [sink, ...sources];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          expect(
            boxesOverlap(all[i], all[j]),
            `${all[i].id} overlaps ${all[j].id}`,
          ).to.eq(false);
        }
      }

      // 3. sink is centred on its fan (not pinned to the top/bottom source)
      const sinkCenter = sink.y + sink.nodeHeight / 2;
      const centers = sources.map((s) => s.y + s.nodeHeight / 2);
      const minC = Math.min(...centers);
      const maxC = Math.max(...centers);
      expect(sinkCenter, 'sink center is within the fan span').to.be.greaterThan(
        minC + 0.2 * (maxC - minC),
      );
      expect(sinkCenter).to.be.lessThan(maxC - 0.2 * (maxC - minC));

      // 4. wires are not near-vertical: steepest source->sink angle < 50 degrees
      let maxAngle = 0;
      sources.forEach((s) => {
        const dx = sink.x - (s.x + s.nodeWidth);
        const dy = Math.abs(s.y + s.nodeHeight / 2 - sinkCenter);
        maxAngle = Math.max(maxAngle, (Math.atan2(dy, dx) * 180) / Math.PI);
      });
      expect(maxAngle, 'steepest wire angle stays gentle').to.be.lessThan(55);
    });
  });
});
