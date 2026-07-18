import { doWithTestController, openNewGraph } from '../helpers';

describe('Array Widget', () => {
  it('Add node and select', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Filter', 'Filter', 0);
      await testController.selectNodesById(['Filter']);
    });
  });

  it('Open inspector, select node', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('#inspector-filter-in').click();
  });

  it('Test array widget typing behaviour', () => {
    cy.get('body').contains('[]').click();
    // Workaround: I sped up typing to make it pass for now
    cy.get('body').contains('[]').realType(' 1, 2, 3, 4, 5', { delay: 5 });
    doWithTestController(async (testController) => {
      expect(
        await testController.getNodeOutputValue('Filter', 'Array').length,
      ).to.eq(5);
    });
  });
});
