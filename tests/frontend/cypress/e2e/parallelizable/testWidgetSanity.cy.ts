import { doWithTestController, openNewGraph } from '../helpers';

// see that we are not executing anything by selecting it, chose this widget because it has plenty of widgets
describe('Widget Sanity', () => {
  it('Add and select node', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('DRAW_Line', 'DRAW_Line');
      await testController.selectNodesById(['DRAW_Line']);
    });
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });

  it('See that its only executed once', () => {
    doWithTestController(async (testController) => {
      expect(
        testController.getNodeByID('DRAW_Line').debug_timesExecuted,
      ).to.be.below(2);
    });
  });
});
