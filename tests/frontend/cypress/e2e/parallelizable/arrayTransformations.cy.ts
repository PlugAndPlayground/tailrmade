import { doWithTestController, openNewGraph } from '../helpers';

describe('arrayTransformations', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode('MapNode', 'MapNode', 200, 100);
      await testController.addNode('Filter', 'Filter', 200, -100);
    });
  });

  it('Set values and connect', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'MapNode');
      await testController.connectNodesByID('Constant', 'Filter');
      await testController.waitForPendingExecution();
      await testController.setNodeInputValue(
        'MapNode',
        'Code',
        '(a, index) => a+1',
      );
      await testController.setNodeInputValue('Filter', 'Code', '(a) => a < 2');
      await testController.setNodeInputValue('Constant', 'In', [1, 2, 3, 4]);
      await testController.executeNodeByID('Constant');
    });
  });

  it('Check results of map and filter', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('MapNode', 'Array')[0]).to.eq(2);
      expect(testController.getNodeOutputValue('Filter', 'Array').length).to.eq(
        1,
      );
    });
  });
});
