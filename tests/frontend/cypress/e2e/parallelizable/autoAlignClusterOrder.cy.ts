import { doWithTestController, openNewGraph } from '../helpers';

// Simple axis-aligned bounding box overlap check, mirroring the box
// deOverlap()/autoAlignNodes() work with (node.x/y is the top-left corner,
// nodeWidth/nodeHeight the box size).
const boxesOverlap = (
  a: { x: number; y: number; nodeWidth: number; nodeHeight: number },
  b: { x: number; y: number; nodeWidth: number; nodeHeight: number },
) =>
  a.x < b.x + b.nodeWidth &&
  a.x + a.nodeWidth > b.x &&
  a.y < b.y + b.nodeHeight &&
  a.y + a.nodeHeight > b.y;

// Two disconnected clusters, each identical to the other (same node types,
// same socketArray shapes, same internal link), so every node in cluster A
// has the same topology-derived order score as its counterpart in cluster
// B. With tied order scores, autoAlignNodes used to seed the next cluster
// via cp[cp.length - 1] (input-array order), which for these tied scores
// degenerates to picking a node from cluster B first - stacking the
// originally-lower cluster B above the originally-higher cluster A and
// swapping their vertical order. This spec pins cluster A above cluster B.
const GRAPH = JSON.stringify({
  version: 3,
  graphSettings: {
    viewportCenterPosition: { x: 0, y: 1000 },
    viewportScale: 0.5,
  },
  nodes: [
    {
      id: 'source-a',
      type: 'widgetslider',
      x: 0,
      y: 0,
      width: 200,
      height: 104,
      socketArray: [
        {
          socketType: 'in',
          name: 'Initial Value',
          dataType: '{"class":"NumberType"}',
          data: 0,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Min',
          dataType: '{"class":"NumberType"}',
          data: 0,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Max',
          dataType: '{"class":"NumberType"}',
          data: 0,
        },
        {
          socketType: 'in',
          name: 'Round',
          dataType: '{"class":"BooleanType"}',
          data: false,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Label',
          dataType: '{"class":"StringType"}',
          data: 'Slider',
          visible: false,
        },
        { socketType: 'out', name: 'Out', dataType: '{"class":"NumberType"}' },
        {
          socketType: 'out',
          name: 'ReactUI',
          dataType: '{"class":"DeferredReactType"}',
          visible: false,
        },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'sink-a',
      type: 'arrayset',
      x: 400,
      y: 0,
      width: 160,
      height: 136,
      socketArray: [
        {
          socketType: 'in',
          name: 'Array',
          dataType: '{"class":"ArrayType"}',
          data: [],
        },
        {
          socketType: 'in',
          name: 'Index',
          dataType:
            '{"class":"NumberType","type":{"round":true,"minValue":0,"maxValue":100,"stepSize":0.01,"showDetails":false,"presetValues":[]}}',
        },
        { socketType: 'in', name: 'Value', dataType: '{"class":"JSONType"}' },
        { socketType: 'out', name: 'Array', dataType: '{"class":"ArrayType"}' },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'source-b',
      type: 'widgetslider',
      x: 0,
      y: 800,
      width: 200,
      height: 104,
      socketArray: [
        {
          socketType: 'in',
          name: 'Initial Value',
          dataType: '{"class":"NumberType"}',
          data: 0,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Min',
          dataType: '{"class":"NumberType"}',
          data: 0,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Max',
          dataType: '{"class":"NumberType"}',
          data: 0,
        },
        {
          socketType: 'in',
          name: 'Round',
          dataType: '{"class":"BooleanType"}',
          data: false,
          visible: false,
        },
        {
          socketType: 'in',
          name: 'Label',
          dataType: '{"class":"StringType"}',
          data: 'Slider',
          visible: false,
        },
        { socketType: 'out', name: 'Out', dataType: '{"class":"NumberType"}' },
        {
          socketType: 'out',
          name: 'ReactUI',
          dataType: '{"class":"DeferredReactType"}',
          visible: false,
        },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'sink-b',
      type: 'arrayset',
      x: 400,
      y: 800,
      width: 160,
      height: 136,
      socketArray: [
        {
          socketType: 'in',
          name: 'Array',
          dataType: '{"class":"ArrayType"}',
          data: [],
        },
        {
          socketType: 'in',
          name: 'Index',
          dataType:
            '{"class":"NumberType","type":{"round":true,"minValue":0,"maxValue":100,"stepSize":0.01,"showDetails":false,"presetValues":[]}}',
        },
        { socketType: 'in', name: 'Value', dataType: '{"class":"JSONType"}' },
        { socketType: 'out', name: 'Array', dataType: '{"class":"ArrayType"}' },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
  ],
  links: [
    {
      sourceNodeId: 'source-a',
      sourceSocketName: 'Out',
      targetNodeId: 'sink-a',
      targetSocketName: 'Index',
    },
    {
      sourceNodeId: 'source-b',
      sourceSocketName: 'Out',
      targetNodeId: 'sink-b',
      targetSocketName: 'Index',
    },
  ],
});

describe('autoAlignNodes keeps disconnected clusters in their original vertical order', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('keeps the originally-higher cluster above the originally-lower cluster', () => {
    // order matters: this reproduces the tied-order-score degenerate case
    const ids = ['source-a', 'sink-a', 'source-b', 'sink-b'];
    // loadStringifiedGraph awaits configure() end-to-end (nodes created with
    // their configured dimensions, links added, seed nodes executed), so no
    // settle wait is needed before reading geometry for the layout.
    doWithTestController(async (tc) => {
      await tc.loadStringifiedGraph(GRAPH);
    });
    doWithTestController(async (tc) => {
      const nodes = ids.map((id) => tc.getNodeByID(id));

      const graph = (tc as any).getGraph();
      await graph.selection.autoAlignNodes(nodes);

      const sourceA = tc.getNodeByID('source-a');
      const sinkA = tc.getNodeByID('sink-a');
      const sourceB = tc.getNodeByID('source-b');
      const sinkB = tc.getNodeByID('sink-b');

      // cluster A was originally above cluster B - it must stay above
      const clusterABottom = Math.max(
        sourceA.y + sourceA.nodeHeight,
        sinkA.y + sinkA.nodeHeight,
      );
      const clusterBTop = Math.min(sourceB.y, sinkB.y);
      expect(
        clusterABottom,
        'cluster A stays entirely above cluster B',
      ).to.be.at.most(clusterBTop);

      // none of the four boxes overlap
      const boxes = [sourceA, sinkA, sourceB, sinkB];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(
            boxesOverlap(boxes[i], boxes[j]),
            `node ${boxes[i].id} overlaps node ${boxes[j].id}`,
          ).to.eq(false);
        }
      }
    });
  });
});
