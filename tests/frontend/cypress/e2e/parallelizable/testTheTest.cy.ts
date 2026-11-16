import {
  assertNodesCount,
  clearGraph,
  clickSocket,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('tests', () => {
  const smokeTimeout = 10000;

  Cypress.currentTest;

  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
    cy.showMousePosition();
  });

  after(() => {
    Cypress.$('#custom-mouse-pointer').remove();
  });

  it('checkAddingSpeed', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
    });

    assertNodesCount(1, smokeTimeout);
    clickSocket('Constant', 'In');
  });

  it('checkAddingAndMovingSpeed', () => {
    const testValue = 'TestValue1';

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
    });

    assertNodesCount(1, smokeTimeout);
    clickSocket('Constant', 'In');

    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', 'ConstantString');
      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('ConstantString', 230, 0);
      await testController.setNodeInputValue('Constant', 'In', testValue);
      await testController.connectNodesByID(
        'Constant',
        'ConstantString',
        'Out',
      );
      await testController.executeNodeByID('Constant');
    });

    assertNodesCount(2, smokeTimeout);
    clickSocket('ConstantString', 'String');

    doWithTestController((testController) => {
      expect(
        testController.getNodeInputValue('ConstantString', 'String'),
      ).to.eq(testValue);
    });
  });
});
