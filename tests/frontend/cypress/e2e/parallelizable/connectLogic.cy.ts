import { clearGraph, doWithTestController, openNewGraph } from '../helpers';

describe('connectLogic', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add');
      await testController.addNode('Subtract', 'Subtract');
      await testController.addNode('Constant', 'Constant');
    });
  });

  it('move nodes', () => {
    doWithTestController((testController) => {
      const constantNode = testController.getNodeByID('Constant');
      const xPre = constantNode.x;
      testController.moveNodeByID('Constant', -200, 0);
      const xPost = constantNode.x;
      expect(xPost - xPre).to.eq(-200);
      testController.moveNodeByID('Subtract', 0, 200);
    });
  });

  it('connect nodes', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'Add', 'Out', 'Addend');
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'Subtract',
        'Add',
        'Subtracted',
        'Addend 2',
      );
      await testController.waitForPendingExecution();
      await testController.setNodeInputValue('Constant', 'In', 10);
      await testController.executeNodeByID('Constant');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('Add', 'Added')).to.eq(10);
      expect(testController.getSocketLinks('Constant', 'Out').length).to.eq(1);
    });
  });

  it('disconnect nodes', () => {
    doWithTestController(async (testController) => {
      await testController.disconnectLink('Add', 'Addend');
      await testController.waitForPendingExecution();
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('Add', 'Added')).to.eq(0);
      expect(testController.getSocketLinks('Constant', 'Out').length).to.eq(0);
    });
  });

  it('delete nodes', () => {
    doWithTestController(async (testController) => {
      await testController.removeNode('Add');
      await testController.removeNode('Subtract');
      await testController.removeNode('Constant');
    });

    doWithTestController((testController) => {
      expect(testController.getNodes().length).to.eq(0);
    });
  });

  it('check that preferred input by default gets used', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'Label', -200);
      await testController.addNode('IFrameRenderer', 'IFrameRenderer');
      await testController.connectNodesByID(
        'Label',
        'IFrameRenderer',
        'Output',
      );
      await testController.waitForPendingExecution();
      expect(
        testController.getSocketLinks('IFrameRenderer', 'Html').length,
      ).to.eq(1);
    });
  });

  it('check that we prefer not unplugging previous link', () => {
    clearGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant', -200, 100);
      await testController.addNode('DRAW_Text', 'DRAW_Text');
      await testController.connectNodesByID('Constant', 'DRAW_Text', 'Out');
      await testController.waitForPendingExecution();
      await testController.connectNodesByID('Constant', 'DRAW_Text', 'Out');
      await testController.waitForPendingExecution();
      expect(testController.getSocketLinks('DRAW_Text', 'Size').length).to.eq(
        1,
      );
      expect(
        testController.getSocketLinks('DRAW_Text', 'Line Height').length,
      ).to.eq(1);
    });
  });
});
