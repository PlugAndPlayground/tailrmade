import { doWithTestController, openNewGraph, zoomToFitAll } from '../helpers';

const widgetSelector = '[data-cy="widget of NODE_sockets-label-1"]';
const previewWidgetSelector =
  '[data-cy="widget preview of NODE_sockets-label-1"]';
const previewWidget = `#Container-sockets-surface-1 ${previewWidgetSelector}`;

const setVisible = async (testController, value: boolean) => {
  testController.setNodeInputValue('sockets-surface-1', 'Label visible', value);
  // executing the surface mirrors the inspector edit path: it re-renders the
  // canvas preview and notifies the dashboard to re-apply overrides
  await testController.getNodeByID('sockets-surface-1').executeOptimizedChain();
  await testController.waitForPendingExecution();
};

describe('UI surface override sockets', () => {
  it('setup: a surface with one connected label', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode(
        'UISurfaceNode',
        'sockets-surface-1',
        200,
        0,
      );
      await testController.addNode('Label', 'sockets-label-1', -250, 0);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'sockets-label-1',
        'sockets-surface-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
      testController.setShowUnsavedChangesWarning(false);
    });
    zoomToFitAll();
    cy.get(previewWidget).should('exist');
  });

  it('the visible socket hides/shows the element even when not wired', () => {
    doWithTestController((testController) => {
      // the paired visible socket is auto-created and named "<element> visible"
      const inputNames = testController
        .getInputSockets('sockets-surface-1')
        .map((socket) => socket.name);
      expect(inputNames).to.include('Label visible');
    });

    // setting it false (no wire) hides the element in the canvas preview
    doWithTestController((testController) => setVisible(testController, false));
    cy.get(previewWidget).should('not.exist');

    // setting it back true shows it again
    doWithTestController((testController) => setVisible(testController, true));
    cy.get(previewWidget).should('exist');
  });

  it('the visible socket also controls visibility in the dashboard (view mode)', () => {
    // open the dashboard in view mode (not edit) showing this surface
    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.get('[data-cy="dashboard"]').should('be.visible');
    // the widget is present in the dashboard (a hidden override removes it
    // from craft entirely, so existence is the reliable signal)
    cy.get(`[data-cy="dashboard"] ${widgetSelector}`).should('exist');

    // hide via the visible socket -> the dashboard reflects it
    doWithTestController((testController) => setVisible(testController, false));
    cy.get(`[data-cy="dashboard"] ${widgetSelector}`).should('not.exist');

    // show again
    doWithTestController((testController) => setVisible(testController, true));
    cy.get(`[data-cy="dashboard"] ${widgetSelector}`).should('exist');

    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
  });

  it('the layout socket is collapsed by default in the inspector and can be expanded', () => {
    doWithTestController((testController) => {
      testController.selectNodesById(['sockets-surface-1']);
    });
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('#inspector-filter-in').click({ force: true });

    // the Layout socket exposes a collapse toggle and starts collapsed
    cy.get('[data-cy="socket-collapse-button"]').should('exist');
    cy.get('[data-cy="widget-layout-widget"]').should('not.exist');

    // expanding reveals the layout widget
    cy.get('[data-cy="socket-collapse-button"]').first().click({ force: true });
    cy.get('[data-cy="widget-layout-widget"]').should('exist');

    // collapsing hides it again
    cy.get('[data-cy="socket-collapse-button"]').first().click({ force: true });
    cy.get('[data-cy="widget-layout-widget"]').should('not.exist');

    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });
});
