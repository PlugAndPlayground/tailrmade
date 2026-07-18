import { doWithTestController, openNewGraph } from '../helpers';

// The user's Day Tracker graph: two html renderers feed a "make" node; a custom
// function feeds the surface directly (a long edge that skips make's column);
// make also feeds the surface. Auto-align used to slot the custom function
// between the two make-feeders, crossing its long edge over their wires. Long
// edges now route through dummy nodes, so the fan stays intact.
const GRAPH = JSON.stringify({
  version: 2,
  graphSettings: { viewportCenterPosition: { x: 300, y: 3300 }, viewportScale: 0.3 },
  nodes: [
    {
      id: 'brave-turkey-93',
      type: 'make',
      x: 298,
      y: 3284,
      width: 160,
      height: 184,
      socketArray: [
        { socketType: 'in', name: 'Parsed Html', dataType: '{"class":"JSONType"}' },
        { socketType: 'in', name: 'Parsed Html - Override Name', dataType: '{"class":"StringType"}', data: 'day-cell', dependentSocketName: 'Parsed Html' },
        { socketType: 'in', name: 'Parsed Html 2', dataType: '{"class":"JSONType"}' },
        { socketType: 'in', name: 'Parsed Html 2 - Override Name', dataType: '{"class":"StringType"}', data: 'month-grid', dependentSocketName: 'Parsed Html 2' },
        { socketType: 'out', name: 'JSON', dataType: '{"class":"JSONType"}' },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'tidy-snail-59',
      type: 'customfunction',
      x: -160,
      y: 3344,
      width: 160,
      height: 64,
      socketArray: [
        { socketType: 'in', name: 'Code', dataType: '{"class":"CodeType"}', data: '() => ({ year: 2025 })', visible: false },
        { socketType: 'in', name: 'Main Thread', dataType: '{"class":"BooleanType"}', data: false, visible: false },
        { socketType: 'out', name: 'OutData', dataType: '{"class":"JSONType"}' },
        { socketType: 'out', name: 'Code', dataType: '{"class":"CodeType"}', visible: false },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
      version: 3,
    },
    {
      id: 'old-shrimp-9',
      type: 'htmlrenderer',
      x: -160,
      y: 3124,
      width: 320,
      height: 180,
      socketArray: [
        { socketType: 'in', name: 'Html', dataType: '{"class":"HtmlType"}', data: '<div>{{day}}</div>', visible: false },
        { socketType: 'in', name: 'Data', dataType: '{"class":"AnyType"}', data: {} },
        { socketType: 'in', name: 'Sanitize input', dataType: '{"class":"BooleanType"}', data: false, visible: false },
        { socketType: 'in', name: 'Template Passthrough', dataType: '{"class":"BooleanType"}', data: true, visible: false },
        { socketType: 'in', name: 'Templates', dataType: '{"class":"JSONType"}', data: {}, visible: false },
        { socketType: 'in', name: 'Background color', dataType: '{"class":"ColorType"}', data: { r: 245, g: 245, b: 245, a: 1 }, visible: false },
        { socketType: 'out', name: 'Parsed Html', dataType: '{"class":"HtmlType"}' },
        { socketType: 'out', name: 'ReactUI', dataType: '{"class":"DeferredReactType"}', visible: false },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'shy-crab-26',
      type: 'htmlrenderer',
      x: -160,
      y: 3448,
      width: 320,
      height: 180,
      socketArray: [
        { socketType: 'in', name: 'Html', dataType: '{"class":"HtmlType"}', data: '<div>{{name}}</div>', visible: false },
        { socketType: 'in', name: 'Data', dataType: '{"class":"AnyType"}', data: {} },
        { socketType: 'in', name: 'Sanitize input', dataType: '{"class":"BooleanType"}', data: true, visible: false },
        { socketType: 'in', name: 'Template Passthrough', dataType: '{"class":"BooleanType"}', data: true, visible: false },
        { socketType: 'in', name: 'Templates', dataType: '{"class":"JSONType"}', data: {}, visible: false },
        { socketType: 'in', name: 'Background color', dataType: '{"class":"ColorType"}', data: { r: 245, g: 245, b: 245, a: 1 }, visible: false },
        { socketType: 'out', name: 'Parsed Html', dataType: '{"class":"HtmlType"}' },
        { socketType: 'out', name: 'ReactUI', dataType: '{"class":"DeferredReactType"}', visible: false },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
    {
      id: 'tricky-badger-46',
      type: 'htmlrenderer',
      x: 578,
      y: 2698,
      width: 1116,
      height: 1356,
      socketArray: [
        { socketType: 'in', name: 'Html', dataType: '{"class":"HtmlType"}', data: '<div></div>', visible: false },
        { socketType: 'in', name: 'Data', dataType: '{"class":"AnyType"}' },
        { socketType: 'in', name: 'Sanitize input', dataType: '{"class":"BooleanType"}', data: false, visible: false },
        { socketType: 'in', name: 'Template Passthrough', dataType: '{"class":"BooleanType"}', data: false, visible: false },
        { socketType: 'in', name: 'Templates', dataType: '{"class":"JSONType"}' },
        { socketType: 'in', name: 'Background color', dataType: '{"class":"ColorType"}', data: { r: 245, g: 245, b: 245, a: 1 }, visible: false },
        { socketType: 'out', name: 'Parsed Html', dataType: '{"class":"HtmlType"}' },
        { socketType: 'out', name: 'ReactUI', dataType: '{"class":"DeferredReactType"}', visible: false },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    },
  ],
  links: [
    { sourceNodeId: 'old-shrimp-9', sourceSocketName: 'Parsed Html', targetNodeId: 'brave-turkey-93', targetSocketName: 'Parsed Html' },
    { sourceNodeId: 'shy-crab-26', sourceSocketName: 'Parsed Html', targetNodeId: 'brave-turkey-93', targetSocketName: 'Parsed Html 2' },
    { sourceNodeId: 'tidy-snail-59', sourceSocketName: 'OutData', targetNodeId: 'tricky-badger-46', targetSocketName: 'Data' },
    { sourceNodeId: 'brave-turkey-93', sourceSocketName: 'JSON', targetNodeId: 'tricky-badger-46', targetSocketName: 'Templates' },
  ],
});

describe('autoAlignNodes long-edge routing', () => {
  beforeEach(() => openNewGraph());

  it('keeps the make fan intact when a sibling has a long edge to the surface', () => {
    const ids = [
      'brave-turkey-93',
      'tidy-snail-59',
      'old-shrimp-9',
      'shy-crab-26',
      'tricky-badger-46',
    ];
    // loadStringifiedGraph awaits configure() end-to-end (nodes created with
    // their configured dimensions, links added, seed nodes executed), so no
    // settle wait is needed before reading geometry for the layout.
    doWithTestController(async (tc) => {
      await tc.loadStringifiedGraph(GRAPH);
    });
    doWithTestController(async (tc) => {
      const nodes = ids.map((id) => tc.getNodeByID(id));
      await (tc as any).getGraph().selection.autoAlignNodes(nodes);

      const day = tc.getNodeByID('old-shrimp-9');
      const name = tc.getNodeByID('shy-crab-26');
      const func = tc.getNodeByID('tidy-snail-59');
      const make = tc.getNodeByID('brave-turkey-93');
      const surf = tc.getNodeByID('tricky-badger-46');

      const cy_ = (nd: any) => nd.y + nd.nodeHeight / 2;
      // the custom function (long edge to surface) must not sit between the two
      // make-feeders, which is what caused the crossover
      const bandTop = Math.min(cy_(day), cy_(name));
      const bandBottom = Math.max(cy_(day), cy_(name));
      expect(
        cy_(func) < bandTop || cy_(func) > bandBottom,
        'custom function is outside the make fan band',
      ).to.eq(true);
      // socket order preserved: day (Parsed Html) above name (Parsed Html 2)
      expect(cy_(day), 'day above name').to.be.lessThan(cy_(name));
      // flow left-to-right
      expect(day.x + day.nodeWidth).to.be.lessThan(make.x);
      expect(make.x + make.nodeWidth).to.be.lessThan(surf.x);
    });
  });
});
