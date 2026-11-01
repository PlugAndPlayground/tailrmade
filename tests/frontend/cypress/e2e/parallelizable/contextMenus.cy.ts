import {
  controlOrMetaKey,
  doWithTestController,
  getNodeCenterById,
  getSocketCenterByNodeIDAndSocketName,
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

  const shouldFitInWindow = (selector: string) =>
    cy.get(selector).should(($menu) => {
      const { top, bottom } = $menu[0].getBoundingClientRect();
      expect(top).to.be.gte(0);
      expect(bottom).to.be.lte(Cypress.config('viewportHeight'));
    });

  it('fits the graph context menu in the window near the bottom', () => {
    openNewGraph();
    cy.get('#pixi-container').rightclick(
      400,
      Cypress.config('viewportHeight') - 10,
    );
    shouldFitInWindow('#graph-contextmenu');
    cy.get('#graph-contextmenu').contains('Show debug output').scrollIntoView();
    cy.contains('Show debug output').should('be.visible');
    cy.get('body').type('{esc}');
  });

  it('fits the node context menu in the window near the bottom', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'BottomNode', 0, 0);
      const [, y] = testController.getNodeCenterById('BottomNode');
      testController.getGraph().viewport.y +=
        Cypress.config('viewportHeight') - 10 - y;
    });
    getNodeCenterById('BottomNode').then(([x, y]) => {
      cy.get('#pixi-container').rightclick(x, y);
    });
    shouldFitInWindow('#node-contextmenu');
    cy.get('body').type('{esc}');
  });

  it('fits the socket context menu in the window near the bottom', () => {
    doWithTestController((testController) => {
      const [, y] = testController.getSocketCenterByNodeIDAndSocketName(
        'BottomNode',
        'Addend',
      );
      testController.getGraph().viewport.y +=
        Cypress.config('viewportHeight') - 10 - y;
    });
    getSocketCenterByNodeIDAndSocketName('BottomNode', 'Addend').then(
      ([x, y]) => {
        cy.get('#pixi-container').rightclick(x, y);
      },
    );
    shouldFitInWindow('#socket-contextmenu');
    cy.get('body').type('{esc}');
  });

  it('opens the file browser with ctrl/cmd shift O', () => {
    cy.window().then((win) => {
      cy.stub(win.HTMLInputElement.prototype, 'click').as('fileBrowser');
    });
    cy.get('body').type(`${controlOrMetaKey()}{shift}o`);
    cy.get('@fileBrowser').should('have.been.calledOnce');
  });
});
