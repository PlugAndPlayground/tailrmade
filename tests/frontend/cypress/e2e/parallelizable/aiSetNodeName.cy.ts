import { doWithTestController, openNewGraph } from '../helpers';

// set_node_name lets the AI give nodes readable display names. For UI
// surfaces the name is a navigation target: "Navigate to surface" matches it
// exactly (after route slugs, which are always lowercased) - so capitalized
// tab labels like "Text & Display" must be surface NAMES, not routes.
describe('AI set_node_name tool', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('renames a node and reports the custom name in inspections', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'name-surface-1');

      const result = await tc.callMCPTool('set_node_name', {
        node_id: 'name-surface-1',
        name: '  Text & Display  ',
      });
      expect(result.is_error).to.not.eq(true);
      // trimmed, like the surface list's rename input
      expect(tc.getNodeByID('name-surface-1').nodeName).to.eq(
        'Text & Display',
      );

      const graph = await tc.callMCPTool('inspect_graph', {});
      const entry = JSON.parse(graph.content).nodes.find(
        (node) => node.id === 'name-surface-1',
      );
      expect(entry.custom_name).to.eq('Text & Display');

      const surface = await tc.callMCPTool('inspect_surface', {
        node_id: 'name-surface-1',
      });
      expect(JSON.parse(surface.content).name).to.eq('Text & Display');
    });
  });

  it('rejects empty names and unknown nodes', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'name-surface-2');

      const empty = await tc.callMCPTool('set_node_name', {
        node_id: 'name-surface-2',
        name: '   ',
      });
      expect(empty.is_error).to.eq(true);

      const badNode = await tc.callMCPTool('set_node_name', {
        node_id: 'nope',
        name: 'X',
      });
      expect(badNode.is_error).to.eq(true);
    });
  });

  it('navigates by a capitalized surface name (tab-label scenario)', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'name-surface-3', 600, 0);
      await tc.addNode('UISurfaceNode', 'name-surface-4', 600, 400);
      await tc.addNode('Label', 'name-label-3', -200, 0);
      await tc.addNode('Label', 'name-label-4', -200, 400);
      await tc.addNode('NavigateToPage', 'name-nav-1', -200, 800);
      await tc.waitForPendingExecution();
      await tc.connectNodesByID('name-label-3', 'name-surface-3', 'ReactUI');
      await tc.connectNodesByID('name-label-4', 'name-surface-4', 'ReactUI');
      await tc.callMCPTool('set_node_name', {
        node_id: 'name-surface-4',
        name: 'Text & Display',
      });
      await tc.waitForPendingExecution();
      // a capitalized name never matches a route slug (always lowercase);
      // navigateToSurface falls through to the exact surface-name match
      tc.setNodeInputValue('name-nav-1', 'Surface', 'Text & Display');

      const trigger = tc
        .getNodeByID('name-nav-1')
        .getInputOrTriggerSocketByName('Execute', false);
      trigger.data = 0;
      trigger.data = 1;
      tc.toggleDashboard('OPEN');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_name-label-4"]')
      .filter(':visible')
      .should('exist');
  });
});
