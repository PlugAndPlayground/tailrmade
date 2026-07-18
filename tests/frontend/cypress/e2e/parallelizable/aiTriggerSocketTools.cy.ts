import { doWithTestController, openNewGraph } from '../helpers';

// The AI's MCP tools for trigger sockets: add_trigger_input mirrors the
// user's right-click "Add Trigger Input", set_trigger_type changes when an
// existing trigger socket fires (TRIGGER_TYPE_OPTIONS). Called directly via
// testController.callMCPTool, without the LLM.
describe('AI trigger socket tools', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('add_trigger_input adds trigger sockets, optionally with a trigger type', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Add', 'trig-node-1');

      const first = await tc.callMCPTool('add_trigger_input', {
        node_id: 'trig-node-1',
      });
      expect(first.is_error).to.not.eq(true);
      const firstResult = JSON.parse(first.content);
      expect(firstResult.socket_name).to.eq('Trigger 1');
      expect(firstResult.trigger_type).to.eq('positiveFlank');

      const second = await tc.callMCPTool('add_trigger_input', {
        node_id: 'trig-node-1',
        trigger_type: 'change',
      });
      const secondResult = JSON.parse(second.content);
      expect(secondResult.socket_name).to.eq('Trigger 2');
      expect(secondResult.trigger_type).to.eq('change');

      const node = tc.getNodeByID('trig-node-1');
      expect(node.nodeTriggerSocketArray.length).to.eq(2);
      expect(
        (node.getNodeTriggerSocketByName('Trigger 2').dataType as any)
          .triggerType,
      ).to.eq('change');
    });
  });

  it('set_trigger_type changes an existing trigger socket and persists it', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('NavigateToPage', 'trig-node-2');

      const result = await tc.callMCPTool('set_trigger_type', {
        node_id: 'trig-node-2',
        socket_name: 'Execute',
        trigger_type: 'change',
      });
      expect(result.is_error).to.not.eq(true);

      const socket = tc.getTriggerSocketByIDandName('trig-node-2', 'Execute');
      expect((socket.dataType as any).triggerType).to.eq('change');
      // the changed type survives serialization
      expect(socket.serialize().dataType).to.contain(
        '"triggerType":"change"',
      );
    });
  });

  it('rejects unknown nodes, sockets and trigger types', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('NavigateToPage', 'trig-node-3');

      const badNode = await tc.callMCPTool('set_trigger_type', {
        node_id: 'nope',
        socket_name: 'Execute',
        trigger_type: 'change',
      });
      expect(badNode.is_error).to.eq(true);

      // 'Surface' is a regular input, not a trigger socket
      const badSocket = await tc.callMCPTool('set_trigger_type', {
        node_id: 'trig-node-3',
        socket_name: 'Surface',
        trigger_type: 'change',
      });
      expect(badSocket.is_error).to.eq(true);
      expect(badSocket.content).to.contain('Execute');

      const badType = await tc.callMCPTool('set_trigger_type', {
        node_id: 'trig-node-3',
        socket_name: 'Execute',
        trigger_type: 'onUpdate',
      });
      expect(badType.is_error).to.eq(true);
      expect(badType.content).to.contain('positiveFlank');

      const badAddType = await tc.callMCPTool('add_trigger_input', {
        node_id: 'trig-node-3',
        trigger_type: 'onUpdate',
      });
      expect(badAddType.is_error).to.eq(true);
    });
  });

  it('trigger type "change" fires navigation on a decreasing value (tabs going left)', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'trig-surface-1', 600, 0);
      await tc.addNode('UISurfaceNode', 'trig-surface-2', 600, 400);
      await tc.addNode('Label', 'trig-label-1', -200, 0);
      await tc.addNode('Label', 'trig-label-2', -200, 400);
      await tc.addNode('NavigateToPage', 'trig-nav-1', -200, 800);
      await tc.waitForPendingExecution();
      await tc.connectNodesByID('trig-label-1', 'trig-surface-1', 'ReactUI');
      await tc.connectNodesByID('trig-label-2', 'trig-surface-2', 'ReactUI');
      tc.setNodeInputValue('trig-surface-2', 'Route', 'page-two');
      await tc.waitForPendingExecution();
      tc.setNodeInputValue('trig-nav-1', 'Surface', 'page-two');
      await tc.callMCPTool('set_trigger_type', {
        node_id: 'trig-nav-1',
        socket_name: 'Execute',
        trigger_type: 'change',
      });

      // a decreasing value would NOT fire the default positiveFlank; with
      // "change" it must (the tabs-widget-going-left scenario). The first
      // set only establishes previousData (see TriggerType.onDataSet).
      const trigger = tc
        .getNodeByID('trig-nav-1')
        .getInputOrTriggerSocketByName('Execute', false);
      trigger.data = 5;
      trigger.data = 3;
      // open the dashboard to see the displayed surface
      tc.toggleDashboard('OPEN');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_trig-label-2"]')
      .filter(':visible')
      .should('exist');
  });
});
