import {
  controlOrMetaKey,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('String and Code Widgets', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'Label', 0, -400);
      await testController.addNode('CustomFunction', 'CustomFunction', 0, -200);
      await testController.addNode('CodeEditor', 'CodeEditor', -300, 0);
    });
  });

  it('Open inspector', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });
  it('test inspector text field', () => {
    doWithTestController(async (testController) => {
      await testController.selectNodesById(['Label']);
    });
    cy.get('[data-cy="textinput"]')
      .eq(0)
      .type('{selectall}Testing', { delay: 50 });
    cy.get('[data-cy="textinput"]')
      .eq(0)
      .type('{leftarrow}{leftarrow}', { delay: 50 }); // Move cursor left
    cy.get('[data-cy="textinput"]').eq(0).type('iii', { delay: 50 });

    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Label', 'Output')).to.eq(
        'Testiiiing',
      );
    });
  });

  it('test inspector code field', () => {
    doWithTestController(async (testController) => {
      await testController.selectNodesById(['CustomFunction']);
    });
    cy.get('#inspector-filter-in').click();

    cy.get('body').contains('(a) => ', { timeout: 10000 }).should('be.visible');
    cy.get('body').contains('(a) => ').should('not.have.attr', 'readonly');
    cy.wait(100); // WHY
    cy.get('body')
      .contains('(a) => ')
      .type(`${controlOrMetaKey()}a{backspace}`, { delay: 50 });
    cy.get('body').realType('(a) => ', { delay: 50 });
    cy.get('body').realType('{', { delay: 50 });
    cy.get('body').realType('return 5;', { delay: 50 });
    cy.get('body').realType('}', { delay: 50 });
    doWithTestController(async (testController) => {
      await testController.waitForPendingExecution();
    });
    doWithTestController(async (testController) => {
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(5);
    });
  });

  it('Close inspector', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });

  // disabled this test as it seems to sometimes crash on github actions... (cannot read properties of null reading checkAndUpdateTexture) TODO figure out why
  /*it('test code widget', () => {
    cy.get('[data-cy="CodeEditor-edit-hybridnode-btn"]').click();
    cy.get('body').contains('(a) => ').type(`${controlOrMetaKey()}a{backspace}`, { delay: 50 });
    cy.get('#Container-CodeEditor').realType('testing code editor widget', { delay: 50 });
    cy.wait(100);

    doWithTestController(async (testController) => {
      expect(
        testController.getNodeOutputValue('CodeEditor', 'output'),
      ).to.include('testing code editor widget');
    });
  });
  */
});
