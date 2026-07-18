import { doWithTestController, openNewGraph } from '../helpers';

// Regression tests for the ElementRenderer-on-UI-surface crash:
// 1. React crashed with "Failed to execute 'removeChild' on 'Node'" because
//    the component let container.replaceChildren() wipe React-managed
//    children (the "Connect a DOM element" hint) when the element arrived
//    after the link (e.g. an npm package loading asynchronously).
// 2. A DOM element is a single instance - the surface's canvas preview stole
//    it from the dashboard, leaving the live UI empty. Previews now show the
//    placeholder instead.
describe('ElementRenderer on a UI surface', () => {
  it('builds the graph: surface link first, element arrives later', () => {
    openNewGraph();
    cy.failOnText('App Crashed');
    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'custom-function-1', -300, 0);
      await testController.addNode('ElementRenderer', 'element-renderer-1', 0, 0);
      await testController.addNode('UISurfaceNode', 'ui-surface-1', 400, 0);
      // link the renderer into the surface BEFORE any element exists - this
      // mirrors the crash timeline (null -> element transition after mount)
      await testController.connectNodesByID('element-renderer-1', 'ui-surface-1', 'ReactUI');
      await testController.connectNodesByID(
        'custom-function-1',
        'element-renderer-1',
        'OutData',
        'DOM Element',
      );
      await testController.waitForPendingExecution();
      // DOM elements can only be created on the main thread
      testController.setNodeInputValue('custom-function-1', 'Main Thread', true);
      testController.setNodeInputValue(
        'custom-function-1',
        'Code',
        `() => { const el = document.createElement('div'); el.textContent = 'EL-MARKER-1'; return el; }`,
      );
      await testController.executeNodeByID('custom-function-1');
      await testController.waitForPendingExecution();
    });
  });

  it('the canvas preview shows the placeholder, not the element', () => {
    cy.get(
      '[data-cy="surface-renderer"] [data-cy="widget preview of NODE_element-renderer-1"]',
    )
      .should('contain.text', 'Element rendered in User Interface')
      .should('not.contain.text', 'EL-MARKER-1');
  });

  it('the dashboard shows the real element and does not crash', () => {
    doWithTestController((testController) => {
      const surface = testController.getNodeByID('ui-surface-1');
      // opens the surface in the DashboardEditor
      expect(surface.onEnterKeyPressed()).to.eq(true);
    });
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="widget of NODE_element-renderer-1"]', { timeout: 10000 }).should(
      'contain.text',
      'EL-MARKER-1',
    );
    cy.failOnText('App Crashed');
  });

  it('replacing the element updates the dashboard without crashing', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue(
        'custom-function-1',
        'Code',
        `() => { const el = document.createElement('div'); el.textContent = 'EL-MARKER-2'; return el; }`,
      );
      await testController.executeNodeByID('custom-function-1');
      await testController.waitForPendingExecution();
    });
    cy.get('[data-cy="widget of NODE_element-renderer-1"]', { timeout: 10000 }).should(
      'contain.text',
      'EL-MARKER-2',
    );
    cy.failOnText('App Crashed');
  });
});
