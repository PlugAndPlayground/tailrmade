import { doWithTestController, openNewGraph } from '../helpers';

// Verifies the MCP connect_sockets behaviour for UI surfaces: a widget can only
// drive a surface through its ReactUI output, so a connection aimed at any other
// output is transparently redirected to ReactUI instead of failing.
describe('AI connect_sockets to UI surface', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('redirects a non-ReactUI output (Button "Out") to ReactUI', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'ai-surface-1', 0, 0);
      await tc.addNode('WidgetButton', 'ai-node-1', 300, 0);

      // aim at the value output ("Out"), the mistake the AI kept making
      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-node-1',
        from_socket: 'Out',
        to_node: 'ai-surface-1',
        to_socket: 'Button',
      });

      expect(
        result.is_error,
        `connect should succeed, got: ${result.content}`,
      ).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('connected');
      expect(parsed.from.socket, 'redirected to ReactUI').to.equal('ReactUI');

      // and the button is actually a connected widget on the surface
      const surf = await tc.callAITool('inspect_surface', {
        node_id: 'ai-surface-1',
      });
      const widgetIds = JSON.parse(surf.content).connected_widgets.map(
        (w: { node_id: string }) => w.node_id,
      );
      expect(widgetIds, 'button connected to surface').to.include('ai-node-1');
    });
  });

  it('still connects when the caller already uses the ReactUI output', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'ai-surface-1', 0, 0);
      await tc.addNode('WidgetButton', 'ai-node-1', 300, 0);

      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-node-1',
        from_socket: 'ReactUI',
        to_node: 'ai-surface-1',
        to_socket: 'Button',
      });

      expect(result.is_error).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('connected');
      expect(parsed.from.socket).to.equal('ReactUI');
    });
  });

  it('errors when the source node has no ReactUI output', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'ai-surface-1', 0, 0);
      await tc.addNode('Constant', 'ai-node-2', 300, 0);

      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-node-2',
        from_socket: 'Out',
        to_node: 'ai-surface-1',
        to_socket: 'Constant',
      });

      expect(result.is_error, 'should error').to.equal(true);
      expect(result.content).to.match(/cannot be placed on a surface/);
    });
  });
});

// A Modal is a surface AND a node with real declared input sockets. The AI must
// be able to wire a Button into the Modal's "Open Dialog" trigger to open it;
// previously every connection to the modal was hijacked into widget placement
// (the button got dropped onto the modal as content, the trigger never wired).
// These cover the fix: an explicitly-named real input/trigger socket routes as
// a normal link, while an arbitrary label still means "place as a widget".
describe('AI connect_sockets to a Modal (surface + real sockets)', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('wires Button "Out" into the Modal "Open Dialog" trigger, not as a widget', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UIModalNode', 'ai-modal-1', 0, 0);
      await tc.addNode('WidgetButton', 'ai-btn-1', 300, 0);

      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-btn-1',
        from_socket: 'Out',
        to_node: 'ai-modal-1',
        to_socket: 'Open Dialog', // a TRIGGER socket — getInputSocketByName misses these
      });

      expect(
        result.is_error,
        `connect should succeed, got: ${result.content}`,
      ).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('connected');
      // routed to the named trigger, NOT redirected to ReactUI / an element socket
      expect(parsed.from.socket, 'source stays Out').to.equal('Out');
      expect(parsed.to.socket, 'target is the trigger').to.equal('Open Dialog');

      // the button must NOT have been placed on the modal as a widget
      const surf = await tc.callAITool('inspect_surface', {
        node_id: 'ai-modal-1',
      });
      const widgetIds = JSON.parse(surf.content).connected_widgets.map(
        (w: { node_id: string }) => w.node_id,
      );
      expect(widgetIds, 'button is not a modal widget').to.not.include(
        'ai-btn-1',
      );
    });
  });

  it('wires into the Modal "Open" boolean input by name', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UIModalNode', 'ai-modal-1', 0, 0);
      await tc.addNode('WidgetButton', 'ai-btn-1', 300, 0);

      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-btn-1',
        from_socket: 'Out',
        to_node: 'ai-modal-1',
        to_socket: 'Open',
      });

      expect(result.is_error, `got: ${result.content}`).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('connected');
      expect(parsed.to.socket).to.equal('Open');
    });
  });

  it('describe_node tells the AI to wire the "Open Dialog" trigger', () => {
    doWithTestController(async (tc) => {
      const result = await tc.callAITool('describe_node', {
        node_type: 'UIModalNode',
      });

      expect(result.is_error, `got: ${result.content}`).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      // modal-specific guidance is appended to the inherited surface ai_docs
      expect(parsed.ai_docs).to.match(/Open Dialog/);
      expect(parsed.ai_docs, 'inherits surface docs too').to.match(
        /set_surface_layout/,
      );
    });
  });

  it('still places a widget on the modal when to_socket is an arbitrary label', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UIModalNode', 'ai-modal-1', 0, 0);
      await tc.addNode('WidgetButton', 'ai-btn-1', 300, 0);

      // "Button" is not a real socket on the modal — this is widget placement,
      // and the source's "Out" must still be redirected to its ReactUI output.
      const result = await tc.callAITool('connect_sockets', {
        from_node: 'ai-btn-1',
        from_socket: 'Out',
        to_node: 'ai-modal-1',
        to_socket: 'Button',
      });

      expect(result.is_error, `got: ${result.content}`).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('connected');
      expect(parsed.from.socket, 'redirected to ReactUI').to.equal('ReactUI');

      const surf = await tc.callAITool('inspect_surface', {
        node_id: 'ai-modal-1',
      });
      const widgetIds = JSON.parse(surf.content).connected_widgets.map(
        (w: { node_id: string }) => w.node_id,
      );
      expect(widgetIds, 'button is a modal widget').to.include('ai-btn-1');
    });
  });
});

// Covers the two fixes behind the earlier warnings: describe_node/add_node must
// accept a display name (not just the registry key), and describe_node must not
// crash on a template node's missing updateBehaviour ("reading 'load'").
describe('AI describe_node / add_node type resolution', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('describe_node resolves a display name and returns update_behaviour (no "load" crash)', () => {
    doWithTestController(async (tc) => {
      const result = await tc.callAITool('describe_node', {
        node_type: 'HTTP', // display name, not the "httpnode" key
      });

      expect(
        result.is_error,
        `describe_node should succeed, got: ${result.content}`,
      ).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.type).to.equal('httpnode');
      // the updateBehaviour guard: this is what threw "reading 'load'" before
      expect(parsed.update_behaviour).to.have.property('load');
    });
  });

  it('add_node resolves a display name to the real node (not a placeholder)', () => {
    doWithTestController(async (tc) => {
      const result = await tc.callAITool('add_node', {
        node_type: 'HTTP',
        node_id: 'ai-node-1',
      });

      expect(result.is_error).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.node_type).to.equal('httpnode');
      // a real HTTP node, not the "missing type" placeholder fallback
      expect(tc.getNodeByID(parsed.node_id).getName()).to.equal('HTTP');
    });
  });
});
