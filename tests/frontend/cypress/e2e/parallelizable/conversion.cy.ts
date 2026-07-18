import { doWithTestController, openNewGraph } from '../helpers';

describe('conversion', () => {
  it('Add nodes, connect', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add');
      await testController.addNode('DRAW_Shape', 'DRAW_Shape', 300, 0);
      await testController.connectNodesByID(
        'Add',
        'DRAW_Shape',
        'Added',
        'Scale',
      );
      await testController.waitForPendingExecution();
    });
  });

  it('expect there to be a conversion node inbetween them', () => {
    doWithTestController(async (testController) => {
      expect(
        testController.getInputSocketLinkNamesForID('DRAW_Shape', 'Scale')[0],
      ).to.eq('2D vector');
    });
  });

  it('see that JSON array data prefers to get converted to graph input', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      testController.setNodeInputValue('Constant', 'In', [{ Test: 'a' }]);
      await testController.executeNodeByID('Constant');
      await testController.addNode('GRAPH_LINE', 'GRAPH_LINE', 300, 0);
      await testController.connectNodesByID('Constant', 'GRAPH_LINE');
      await testController.waitForPendingExecution();
      expect(
        testController.getSocketLinks('GRAPH_LINE', 'Input Data').length,
      ).to.eq(1);
    });
  });
});
