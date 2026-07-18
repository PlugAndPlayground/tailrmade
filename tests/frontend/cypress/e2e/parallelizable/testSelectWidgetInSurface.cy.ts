import {
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('node inspector "Used in" surface links', () => {
  it('shows the other surface and selects the widget there', () => {
    openNewGraph();
    closeBothDrawers();

    doWithTestController(async (testController) => {
      // surface A becomes the displayed surface; the label is wired into
      // surface B only
      await testController.addNode('UISurfaceNode', 'ui-surface-a', 400, 0);
      await testController.addNode('UISurfaceNode', 'ui-surface-b', 400, 400);
      await testController.addNode('Label', 'amber-otter-11', 0, -200);
      await testController.setNodeInputValue(
        'amber-otter-11',
        'Input',
        'hello',
      );
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'amber-otter-11',
        'ui-surface-b',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
      await testController.selectNodesById(['amber-otter-11']);
    });

    // open the node inspector
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();

    // the label's widget lives in surface B, which is not the displayed one
    cy.get('[data-cy="select-dashboard-widget-ui-surface-b"]').click();

    // surface B is now shown in the dashboard editor with the widget
    // selected (the selection indicator names the widget's element id)
    cy.get('[data-cy="indicatorbox of NODE_amber-otter-11"]').should(
      'be.visible',
    );
  });
});
