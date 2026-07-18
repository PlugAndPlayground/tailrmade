import { doWithTestController, openNewGraph } from '../helpers';

describe('duplicate', () => {
  it('try duplicating a draw image node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('DRAW_Image', 'DRAW_Image');
      testController.selectNodesById(['DRAW_Image']);
      await testController.duplicateSelection();
    });
  });

  it('alt-drag duplicates an unselected node instead of an empty selection', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant1');

      const node = testController.getNodeByID('Constant1');
      const [x, y] = testController.getNodeCenter(node);
      const selection = testController.getGraph().selection;
      const pointerEvent = {
        altKey: true,
        global: { x, y },
        clientX: x,
        clientY: y,
        stopPropagation() {},
      } as any;

      selection.beginPendingClick(node, pointerEvent, {
        clearExistingSelection: true,
        isShiftClick: false,
        wasOnlySelectedAtPointerDown: false,
      });
      await selection.beginNodePointerInteraction(pointerEvent);

      const constantNodes = testController
        .getNodes()
        .filter((candidate) => candidate.getName() === 'Constant');

      expect(constantNodes.length).to.eq(2);
      expect(selection.selectedNodes.length).to.eq(1);
      expect(selection.selectedNodes[0].id).to.not.eq('Constant1');
    });
  });
});
