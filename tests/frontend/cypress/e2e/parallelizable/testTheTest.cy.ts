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
      await testController.addNode('Label', 'Label');
      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('Label', 230, 0);
      await testController.setNodeInputValue('Constant', 'In', testValue);
      await testController.connectNodesByID('Constant', 'Label', 'Out');
      await testController.executeNodeByID('Constant');
    });

    assertNodesCount(2, smokeTimeout);
    clickSocket('Label', 'Input');

    doWithTestController((testController) => {
      expect(testController.getNodeInputValue('Label', 'Input')).to.eq(
        testValue,
      );
    });
  });
});
