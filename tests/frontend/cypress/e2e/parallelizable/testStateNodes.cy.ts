import { doWithTestController, openNewGraph } from '../helpers';

describe('State nodes', () => {
  it('StateWrite and StateRead round-trip', () => {
    openNewGraph();

    // Add StateWrite and StateRead nodes
    doWithTestController(async (testController) => {
      await testController.addNode('StateWrite', 'SW1');
      await testController.addNode('StateRead', 'SR1');
    });

    // Write a value via StateWrite
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SW1', 'Key', 'testKey');
      testController.setNodeInputValue('SW1', 'Value', 'hello world');
      await testController.executeNodeByID('SW1');
    });

    // Read it back via StateRead with same key
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SR1', 'Key', 'testKey');
      testController.setNodeInputValue('SR1', 'Fallback value', 'fallback');
      await testController.executeNodeByID('SR1');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('SR1', 'Value')).to.eq(
        'hello world',
      );
    });
  });

  it('StateRead returns fallback for missing key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StateRead', 'SR2');
    });

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SR2', 'Key', 'nonExistentKey');
      testController.setNodeInputValue('SR2', 'Fallback value', 42);
      await testController.executeNodeByID('SR2');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('SR2', 'Value')).to.eq(42);
    });
  });

  it('StateWrite overwrites existing key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StateWrite', 'SW3');
      await testController.addNode('StateRead', 'SR3');
    });

    // Write first value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SW3', 'Key', 'overwriteKey');
      testController.setNodeInputValue('SW3', 'Value', 'first');
      await testController.executeNodeByID('SW3');
    });

    // Overwrite with second value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SW3', 'Value', 'second');
      await testController.executeNodeByID('SW3');
    });

    // Read should return second value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('SR3', 'Key', 'overwriteKey');
      testController.setNodeInputValue('SR3', 'Fallback value', 'nope');
      await testController.executeNodeByID('SR3');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('SR3', 'Value')).to.eq('second');
    });
  });

  it('StateWrite has Execute trigger socket', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StateWrite', 'SW4');
    });

    doWithTestController((testController) => {
      const socket = testController.getTriggerSocketByIDandName(
        'SW4',
        'Execute',
      );
      expect(socket).to.not.be.undefined;
    });
  });
});
