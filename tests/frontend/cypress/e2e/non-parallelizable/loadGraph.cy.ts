import {
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

const checkExpectedOutputValuesOfNodes = () => {
  doWithTestController(async (testController) => {
    expect(testController.getNodeOutputValue('Constant2', 'Out')).to.eq(10);
    expect(testController.getNodeOutputValue('Constant3', 'Out')).to.eq(10);
  });
};

describe('Load Graph', () => {
  it('add nodes, configure and connect', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode('Constant', 'Constant2', 200);
      await testController.addNode('Constant', 'Constant3', 200, 100);

      await testController.connectNodesByID('Constant', 'Constant2');
      await testController.connectNodesByID('Constant', 'Constant3');
      await testController.waitForPendingExecution();

      await testController.setNodeInputValue('Constant', 'In', 10);
      await testController.executeNodeByID('Constant');

      testController.getNodeByID('Constant3').updateBehaviour.update = false;
      testController.getNodeByID('Constant3').updateBehaviour.load = true;
    });
  });
  it('verify that value is propagating to connected nodes before saving', () => {
    checkExpectedOutputValuesOfNodes();
    saveGraph();
  });
  it('re-open', () => {
    openExistingGraph();
  });
  it('see that both update and load nodes get propagated the right value after load', () => {
    checkExpectedOutputValuesOfNodes();
  });
});
