import {
  controlOrMetaKey,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('contextMenus', () => {
  it('open graph context menu', () => {
    openNewGraph();
    cy.get('body').rightclick(400, 400);
    cy.get('body').contains('Edit details').should('be.visible');
  });
  it('close it by clicking outside', () => {
    cy.get('body').click(200, 400);
    cy.contains('Edit details', { timeout: 1000 }).should('not.exist');
    cy.get('body')
      .contains('Edit details', { timeout: 1000 })
      .should('not.exist');
  });

  it('open again', () => {
    cy.get('body').rightclick(400, 400);
  });

  it('close via escape', () => {
    cy.get('body').type('{esc}');
    cy.contains('Edit details', { timeout: 1000 }).should('not.exist');
  });

  it('add node via node browser', () => {
    cy.get('body').dblclick(400, 400);
    cy.get('input#node-search:visible').type('Add{downArrow}{enter}');
  });

  it('select via ctrl a', () => {
    cy.get('body').type(`${controlOrMetaKey()}a`);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(1);
    });

    //cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });

  it('open socket context menu', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add', -100, 0);
      const [x, y] = testController.getSocketCenterByNodeIDAndSocketName(
        'Add',
        'Addend',
      );
      cy.get('body').click(x, y);
      cy.get('#tooltip-container').click();
    });
  });
});
