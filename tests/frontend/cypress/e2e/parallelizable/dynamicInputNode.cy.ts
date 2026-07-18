import { clearGraph, doWithTestController, openNewGraph } from '../helpers';

describe('dynamic input node', () => {
  it('add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add', 200, 0);
      await testController.addNode('Constant', 'Constant');
    });
  });
  it('check for two inputs on the Add node', () => {
    doWithTestController((testController) => {
      expect(testController.getVisibleInputSockets('Add').length).to.eq(2);
    });
  });
  it('connect to the add node, expect there to still only be 2 inputs (because it should connect to one of the existing sockets)', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'Add');
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      expect(testController.getVisibleInputSockets('Add').length).to.eq(2);
      expect(testController.getSocketLinks('Constant', 'Out').length).to.eq(1);
    });
  });

  it('disconnecting link should not cause any sockets to disappear', () => {
    doWithTestController(async (testController) => {
      await testController.disconnectLink('Add', 'Addend');
    });
    doWithTestController((testController) => {
      expect(testController.getVisibleInputSockets('Add').length).to.eq(2);
      expect(testController.getSocketLinks('Constant', 'Out').length).to.eq(0);
    });
  });

  it('try deleting the constant node with many links going out of it', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'Add');
      await testController.connectNodesByID('Constant', 'Add');
      await testController.connectNodesByID('Constant', 'Add');
      await testController.connectNodesByID('Constant', 'Add');
      await testController.waitForPendingExecution();
      await testController.removeNode('Constant');
      expect(testController.getVisibleInputSockets('Add').length).to.eq(2);
    });
  });

  it('make JSON should be adding two sockets when a connection is made', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');

      await testController.addNode('Make', 'Make', 0, -200);
      await testController.connectNodesByID('Constant', 'Make');
      await testController.waitForPendingExecution();
      expect(testController.getVisibleInputSockets('Make').length).to.eq(2);
    });
  });

  it('connecting to socket #2 then removing the node should not cause any sockets to disappear', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'Constant',
        'Make',
        'Out',
        'Out - Override Name',
      );
      await testController.waitForPendingExecution();
      expect(testController.getVisibleInputSockets('Make').length).to.eq(2);
    });
    doWithTestController(async (testController) => {
      await testController.disconnectLink('Make', 'Out - Override Name');
      expect(testController.getVisibleInputSockets('Make').length).to.eq(2);
    });
  });

  it('add another input, then see that we can delete the node withot anything strange happening', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'Make');
      await testController.waitForPendingExecution();
      expect(testController.getVisibleInputSockets('Make').length).to.eq(4);
    });
    doWithTestController(async (testController) => {
      await testController.removeNode('Make');
      expect(testController.getSocketLinks('Constant', 'Out').length).to.eq(0);
    });
  });

  it('clear graph', () => {
    clearGraph();
  });

  it('add and copy paste an extend json node, see that it retains its sockets', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Extend', 'Extend');
      testController.selectNodesById(['Extend']);
      await testController.duplicateSelection();
      const nodes = testController.getNodes();
      const extendNodes = nodes.filter((node) => node.name === 'Extend Object');
      const copiedNode = extendNodes[1]; // The second Extend node is the copy
      expect(testController.getVisibleInputSockets(copiedNode.id).length).to.eq(
        1,
      );
    });
  });
});
