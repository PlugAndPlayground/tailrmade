import { doWithTestController, openNewGraph } from '../helpers';

// "Navigate to UI surface" resolves its target by route slug or by the target
// surface's NODE name. Every surface starts out named "UI surface", so the
// mistake the AI keeps making is pointing the node at a name no surface has
// (or at several surfaces that share the default one) - which used to do
// nothing at all, silently. These cover the two halves of the fix: the node
// navigates from a plain "Surface" change (no trigger wiring needed), and a
// target that does not resolve lands as a warning the AI can read back.
describe('Navigate to UI surface: data flow and misconfiguration warnings', () => {
  beforeEach(() => {
    openNewGraph();
  });

  // two surfaces with one label each, named so navigation has something to hit
  const buildTwoPages = async (tc, firstName: string, secondName: string) => {
    await tc.addNode('UISurfaceNode', 'nav-page-1', 600, 0);
    await tc.addNode('UISurfaceNode', 'nav-page-2', 600, 400);
    await tc.addNode('Label', 'nav-content-1', -200, 0);
    await tc.addNode('Label', 'nav-content-2', -200, 400);
    await tc.waitForPendingExecution();
    await tc.connectNodesByID('nav-content-1', 'nav-page-1', 'ReactUI');
    await tc.connectNodesByID('nav-content-2', 'nav-page-2', 'ReactUI');
    await tc.callMCPTool('set_node_name', {
      node_id: 'nav-page-1',
      name: firstName,
    });
    await tc.callMCPTool('set_node_name', {
      node_id: 'nav-page-2',
      name: secondName,
    });
    await tc.waitForPendingExecution();
  };

  // a button wired into "Execute": a positive flank is what fires a trigger
  const fireExecute = (tc, nodeId: string) => {
    const trigger = tc
      .getNodeByID(nodeId)
      .getInputOrTriggerSocketByName('Execute', false);
    trigger.data = 0;
    trigger.data = 1;
  };

  const configWarningsFor = (content: string, nodeId: string) =>
    JSON.parse(content).issues.filter(
      (i: { node_id: string; status_name: string }) =>
        i.node_id === nodeId && i.status_name === 'Node Configuration Warning',
    );

  it('navigates from a tabs widget wired into "Surface" alone, with no trigger', () => {
    doWithTestController(async (tc) => {
      await buildTwoPages(tc, 'Home', 'Settings');
      await tc.addNode('WidgetTabs', 'nav-tabs', -200, 800);
      await tc.addNode('NavigateToPage', 'nav-go', -200, 1100);
      tc.setNodeInputValue('nav-tabs', 'Tab Options', ['Home', 'Settings']);
      await tc.waitForPendingExecution();
      // the whole wiring: the selected tab label IS the target surface name
      await tc.connectNodesByID('nav-tabs', 'nav-go', 'Out', 'Surface');

      // select the second tab, as a user click would
      tc.setNodeInputValue('nav-tabs', 'Selected Tab', 1);
      await tc.executeNodeByID('nav-tabs');
      tc.toggleDashboard('OPEN');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-content-2"]')
      .filter(':visible')
      .should('exist');
  });

  it('warns and names the surfaces that exist when the target matches none', () => {
    doWithTestController(async (tc) => {
      await buildTwoPages(tc, 'Home', 'Settings');
      await tc.addNode('NavigateToPage', 'nav-go', -200, 1100);

      // lowercase: no route slug matches, and surface names are case-sensitive
      const set = await tc.callAITool('set_socket_value', {
        node_id: 'nav-go',
        socket_name: 'Surface',
        value: 'home',
      });
      expect(set.is_error, `set_socket_value: ${set.content}`).to.not.equal(
        true,
      );
      await tc.waitForPendingExecution();

      const warnings = await tc.callAITool('inspect_warnings_and_errors', {});
      const issues = configWarningsFor(warnings.content, 'nav-go');
      expect(
        issues.length,
        `expected a configuration warning, got: ${warnings.content}`,
      ).to.be.greaterThan(0);
      expect(issues[0].severity).to.equal('warning');
      expect(issues[0].message).to.match(/No UI surface named "home"/);
      // the message has to carry the strings that would have worked
      expect(issues[0].message, 'lists the real names').to.match(
        /"Home".*"Settings"/,
      );
    });
  });

  it('warns when several surfaces share the target name, and clears once it resolves', () => {
    doWithTestController(async (tc) => {
      // both keep the default node name "UI surface"
      await tc.addNode('UISurfaceNode', 'nav-page-1', 600, 0);
      await tc.addNode('UISurfaceNode', 'nav-page-2', 600, 400);
      await tc.addNode('NavigateToPage', 'nav-go', -200, 1100);
      await tc.waitForPendingExecution();

      await tc.callAITool('set_socket_value', {
        node_id: 'nav-go',
        socket_name: 'Surface',
        value: 'UI surface',
      });
      await tc.waitForPendingExecution();

      const ambiguous = await tc.callAITool('inspect_warnings_and_errors', {});
      const issues = configWarningsFor(ambiguous.content, 'nav-go');
      expect(
        issues.length,
        `expected an ambiguity warning, got: ${ambiguous.content}`,
      ).to.be.greaterThan(0);
      expect(issues[0].message).to.match(/2 UI surfaces are named/);

      // giving the target surface its own name fixes it
      await tc.callMCPTool('set_node_name', {
        node_id: 'nav-page-2',
        name: 'Settings',
      });
      await tc.callAITool('set_socket_value', {
        node_id: 'nav-go',
        socket_name: 'Surface',
        value: 'Settings',
      });
      await tc.waitForPendingExecution();

      const cleared = await tc.callAITool('inspect_warnings_and_errors', {});
      expect(configWarningsFor(cleared.content, 'nav-go')).to.have.length(0);
    });
  });

  it('fires again on the "Execute" trigger even when the target has not changed', () => {
    doWithTestController(async (tc) => {
      await buildTwoPages(tc, 'Home', 'Settings');
      await tc.addNode('NavigateToPage', 'nav-go', -200, 1100);
      await tc.addNode('NavigateToPage', 'nav-back', -200, 1400);
      await tc.waitForPendingExecution();
      tc.setNodeInputValue('nav-go', 'Surface', 'Settings');
      tc.setNodeInputValue('nav-back', 'Surface', 'Home');

      // a button-per-destination pair: the target never changes, only the
      // event does, so the trigger must navigate every single time
      fireExecute(tc, 'nav-go');
      fireExecute(tc, 'nav-back');
      fireExecute(tc, 'nav-go');
      tc.toggleDashboard('OPEN');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-content-2"]')
      .filter(':visible')
      .should('exist');
  });

  // A graph saved with a v3 node carries a trigger that runs the node's chain,
  // so it navigates through onExecute - where the lastNavigatedTarget guard
  // added in v4 swallows the second press of a fixed-target button. Without
  // the v3 -> v4 migration this test ends up on "Home".
  it('keeps a v3 fixed-target button working after navigating elsewhere', () => {
    doWithTestController(async (tc) => {
      await buildTwoPages(tc, 'Home', 'Settings');
      await tc.addNode('NavigateToPage', 'nav-v3', -200, 1100);
      await tc.addNode('NavigateToPage', 'nav-home', -200, 1400);
      await tc.waitForPendingExecution();
      tc.setNodeInputValue('nav-v3', 'Surface', 'Settings');
      tc.setNodeInputValue('nav-home', 'Surface', 'Home');

      // what a v3 graph deserializes as: an "Execute" trigger with no custom
      // function, which executes the node instead of calling navigateNow
      const node = tc.getNodeByID('nav-v3');
      const triggerType = node.getNodeTriggerSocketByName('Execute')
        .dataType as { customFunctionString: string };
      triggerType.customFunctionString = '';
      await node.migrate(3);
      expect(
        triggerType.customFunctionString,
        'v3 -> v4 rewires the trigger to navigateNow',
      ).to.equal('navigateNow');

      // press the button, leave, press it again - it has to still work
      fireExecute(tc, 'nav-v3');
      fireExecute(tc, 'nav-home');
      fireExecute(tc, 'nav-v3');
      tc.toggleDashboard('OPEN');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-content-2"]')
      .filter(':visible')
      .should('exist');
    // :visible in the selector, so "the Home surface is not mounted at all"
    // passes too - cy.get would fail its own existence check before a
    // .filter() chain ever ran
    cy.get(
      '[data-cy="dashboard"] [data-cy="widget of NODE_nav-content-1"]:visible',
    ).should('not.exist');
  });
});
