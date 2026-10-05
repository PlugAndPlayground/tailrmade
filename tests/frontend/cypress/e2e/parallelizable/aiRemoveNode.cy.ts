import { doWithTestController, openNewGraph } from '../helpers';

describe('AI remove_node', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('removes a connected widget and supports undo and redo', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'remove-surface');
      await tc.addNode('WidgetButton', 'remove-button');
      await tc.callAITool('connect_sockets', {
        from_node: 'remove-button',
        from_socket: 'ReactUI',
        to_node: 'remove-surface',
        to_socket: 'Button',
      });
      tc.selectNodesById(['remove-surface']);

      const widgetIds = async () => {
        const result = await tc.callAITool('inspect_surface', {
          node_id: 'remove-surface',
        });
        return JSON.parse(result.content).connected_widgets.map(
          (widget: { node_id: string }) => widget.node_id,
        );
      };
      expect(await widgetIds()).to.include('remove-button');

      const result = await tc.callAITool('remove_node', {
        node_id: 'remove-button',
      });
      expect(result.is_error, result.content).to.not.equal(true);
      expect(JSON.parse(result.content).status).to.equal('removed');
      expect(tc.getNodeByID('remove-button')).to.equal(undefined);
      expect(tc.getNodeByID('remove-surface')).to.not.equal(undefined);
      expect(await widgetIds()).to.not.include('remove-button');

      await tc.undo();
      expect(tc.getNodeByID('remove-button')).to.not.equal(undefined);
      expect(await widgetIds()).to.include('remove-button');

      await tc.redo();
      expect(tc.getNodeByID('remove-button')).to.equal(undefined);
      expect(await widgetIds()).to.not.include('remove-button');
    });
  });

  it('rejects missing, invalid, and unknown IDs without deleting nodes', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Label', 'keep-label');
      tc.selectNodesById(['keep-label']);
      for (const input of [
        {},
        { node_id: '' },
        { node_id: 42 },
        { node_id: 'missing' },
        { node_id: 'toString' },
      ]) {
        const result = await tc.callAITool('remove_node', input);
        expect(result.is_error, JSON.stringify(input)).to.equal(true);
      }
      expect(tc.getNodeByID('keep-label')).to.not.equal(undefined);
      expect(tc.getSelectedNodes().map((node) => node.id)).to.deep.equal([
        'keep-label',
      ]);
    });
  });
});
