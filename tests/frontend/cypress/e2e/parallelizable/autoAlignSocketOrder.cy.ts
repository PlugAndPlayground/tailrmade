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

// widgetslider.Out -> arrayset.Index (upper input socket)
// codeeditor.output -> arrayset.Value (lower input socket)
const GRAPH = JSON.stringify({
  version: 3,
  graphSettings: {
    viewportCenterPosition: { x: 0, y: 1000 },
    viewportScale: 0.5,
  },
  nodes: [
    {
      id: 'nasty-skunk-69',
      type: 'arrayset',
      x: 178,
      y: 859,
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
      id: 'grumpy-dolphin-21',
      type: 'widgetslider',
      x: -122,
      y: 1219,
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
      id: 'yellow-walrus-47',
      type: 'codeeditor',
      x: -322,
      y: 859,
      width: 400,
      height: 300,
      socketArray: [
        {
          socketType: 'in',
          name: 'input',
          dataType: '{"class":"CodeType"}',
          data: '{"Index":"1"}',
        },
        { socketType: 'out', name: 'output', dataType: '{"class":"CodeType"}' },
        {
          socketType: 'out',
          name: 'ReactUI',
          dataType: '{"class":"DeferredReactType"}',
          visible: false,
        },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
  ],
  links: [
    {
      sourceNodeId: 'grumpy-dolphin-21',
      sourceSocketName: 'Out',
      targetNodeId: 'nasty-skunk-69',
      targetSocketName: 'Index',
    },
    {
      sourceNodeId: 'yellow-walrus-47',
      sourceSocketName: 'output',
      targetNodeId: 'nasty-skunk-69',
      targetSocketName: 'Value',
    },
  ],
});

// autoAlignNodes' main placement pass is flow-aware and correctly places a
// source feeding a higher input socket above a source feeding a lower one.
// A later column-flattening post pass can then collapse x-overlapping nodes
// (boxes of different widths landing in different 100px columns) onto the
// same y, and a final indiscriminate deOverlap() sweep used to resolve that
// collision in the caller's arbitrary array order, randomly swapping the
// vertical order the main pass established and crossing wires. This spec
// pins that vertical order down.
describe('autoAlignNodes keeps socket-order-correct vertical placement', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('keeps the source feeding the higher input socket above the other source', () => {
    const ids = ['nasty-skunk-69', 'grumpy-dolphin-21', 'yellow-walrus-47'];
    // loadStringifiedGraph awaits configure() end-to-end (nodes created with
    // their configured dimensions, links added, seed nodes executed), so no
    // settle wait is needed before reading geometry for the layout.
    doWithTestController(async (tc) => {
      await tc.loadStringifiedGraph(GRAPH);
    });
    doWithTestController(async (tc) => {
      const nodes = ids.map((id) => tc.getNodeByID(id));

      // scramble so before==after can't hide the algorithm's real output
      tc.getNodeByID('nasty-skunk-69').setPosition(0, 0);
      tc.getNodeByID('grumpy-dolphin-21').setPosition(600, 300);
      tc.getNodeByID('yellow-walrus-47').setPosition(1200, 600);

      const graph = (tc as any).getGraph();
      await graph.selection.autoAlignNodes(nodes);

      const arrayset = tc.getNodeByID('nasty-skunk-69');
      const slider = tc.getNodeByID('grumpy-dolphin-21');
      const codeeditor = tc.getNodeByID('yellow-walrus-47');

      // slider feeds the higher "Index" socket, so it must end up strictly
      // above the codeeditor, which feeds the lower "Value" socket
      expect(
        slider.y + slider.nodeHeight,
        'slider bottom edge is above codeeditor top edge',
      ).to.be.at.most(codeeditor.y);

      // both sources sit left of the target they feed
      expect(
        slider.x + slider.nodeWidth,
        'slider right edge is left of arrayset x',
      ).to.be.lessThan(arrayset.x);
      expect(
        codeeditor.x + codeeditor.nodeWidth,
        'codeeditor right edge is left of arrayset x',
      ).to.be.lessThan(arrayset.x);

      // none of the three boxes overlap
      const boxes = [arrayset, slider, codeeditor];
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
