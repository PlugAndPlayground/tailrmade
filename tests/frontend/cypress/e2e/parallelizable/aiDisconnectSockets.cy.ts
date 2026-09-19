import { doWithTestController, openNewGraph } from '../helpers';

// Without a disconnect tool the AI could add links but never remove one, so
// "move this widget to its own page" left the widget on both surfaces. These
// cover the two ways a link is addressed: by the input socket holding it, and
// by where it comes from - the latter being the only workable one for a
// surface, whose element sockets are generated.
describe('AI disconnect_sockets', () => {
  beforeEach(() => {
    openNewGraph();
  });

  const widgetIdsOn = async (tc, surfaceId: string) => {
    const surface = await tc.callAITool('inspect_surface', {
      node_id: surfaceId,
    });
    return JSON.parse(surface.content).connected_widgets.map(
      (widget: { node_id: string }) => widget.node_id,
    );
  };

  it('takes a widget off a surface and cleans up its element sockets', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'dis-surface-1', 0, 0);
      await tc.addNode('WidgetButton', 'dis-btn-1', 300, 0);
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-btn-1',
        from_socket: 'Out',
        to_node: 'dis-surface-1',
        to_socket: 'Button',
      });
      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.include('dis-btn-1');
      const socketNamesBefore = tc
        .getInputSockets('dis-surface-1')
        .map((socket) => socket.name);

      const result = await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-surface-1',
        from_node: 'dis-btn-1',
      });
      expect(
        result.is_error,
        `disconnect should succeed, got: ${result.content}`,
      ).to.not.equal(true);
      const parsed = JSON.parse(result.content);
      expect(parsed.status).to.equal('disconnected');
      expect(parsed.links).to.have.length(1);
      expect(parsed.links[0].from.socket).to.equal('ReactUI');

      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.not.include(
        'dis-btn-1',
      );
      // the element socket and its "visible"/"layout" companions go with it
      const socketNamesAfter = tc
        .getInputSockets('dis-surface-1')
        .map((socket) => socket.name);
      expect(socketNamesAfter.length).to.be.lessThan(socketNamesBefore.length);
      expect(socketNamesAfter.filter((name) => name.includes('Button'))).to.have
        .length(0);
      // and the widget node itself is still there to be moved elsewhere
      expect(tc.getNodeByID('dis-btn-1')).to.not.equal(undefined);
    });
  });

  it('moves a widget from one page to another', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'dis-surface-1', 0, 0);
      await tc.addNode('UISurfaceNode', 'dis-surface-2', 0, 400);
      await tc.addNode('Label', 'dis-label-1', 300, 0);
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-label-1',
        from_socket: 'ReactUI',
        to_node: 'dis-surface-1',
        to_socket: 'Label',
      });

      await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-surface-1',
        from_node: 'dis-label-1',
      });
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-label-1',
        from_socket: 'ReactUI',
        to_node: 'dis-surface-2',
        to_socket: 'Label',
      });

      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.not.include(
        'dis-label-1',
      );
      expect(await widgetIdsOn(tc, 'dis-surface-2')).to.include('dis-label-1');
    });
  });

  it('unlinks a named input, including a trigger socket', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UIModalNode', 'dis-modal-1', 0, 0);
      await tc.addNode('WidgetButton', 'dis-btn-1', 300, 0);
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-btn-1',
        from_socket: 'Out',
        to_node: 'dis-modal-1',
        to_socket: 'Open Dialog',
      });
      expect(
        tc.getTriggerSocketByIDandName('dis-modal-1', 'Open Dialog').links,
      ).to.have.length(1);

      const result = await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-modal-1',
        to_socket: 'Open Dialog',
      });
      expect(result.is_error, `got: ${result.content}`).to.not.equal(true);
      expect(
        tc.getTriggerSocketByIDandName('dis-modal-1', 'Open Dialog').links,
      ).to.have.length(0);
    });
  });

  it('errors instead of reporting success when there is no such link', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'dis-surface-1', 0, 0);
      await tc.addNode('WidgetButton', 'dis-btn-1', 300, 0);
      await tc.addNode('Label', 'dis-label-1', 300, 400);
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-btn-1',
        from_socket: 'Out',
        to_node: 'dis-surface-1',
        to_socket: 'Button',
      });

      // a node that was never connected to this surface
      const wrongSource = await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-surface-1',
        from_node: 'dis-label-1',
      });
      expect(wrongSource.is_error).to.equal(true);
      // the error names what IS connected, so it can be fixed in one step
      expect(wrongSource.content).to.match(/dis-btn-1/);

      const missingNode = await tc.callAITool('disconnect_sockets', {
        to_node: 'nope',
        from_node: 'dis-btn-1',
      });
      expect(missingNode.is_error).to.equal(true);

      const noAddress = await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-surface-1',
      });
      expect(noAddress.is_error).to.equal(true);
      expect(noAddress.content).to.match(/to_socket|from_node/);

      // the real link survived every rejected call
      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.include('dis-btn-1');
    });
  });

  it('is undoable', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'dis-surface-1', 0, 0);
      await tc.addNode('WidgetButton', 'dis-btn-1', 300, 0);
      await tc.callAITool('connect_sockets', {
        from_node: 'dis-btn-1',
        from_socket: 'Out',
        to_node: 'dis-surface-1',
        to_socket: 'Button',
      });
      await tc.callAITool('disconnect_sockets', {
        to_node: 'dis-surface-1',
        from_node: 'dis-btn-1',
      });
      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.not.include(
        'dis-btn-1',
      );

      await tc.undo();
      expect(await widgetIdsOn(tc, 'dis-surface-1')).to.include('dis-btn-1');
    });
  });
});
