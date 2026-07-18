import { doWithTestController, openNewGraph } from '../helpers';

describe('Browser Storage nodes (IndexedDB)', () => {
  it('StorageWrite and StorageRead round-trip', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'BSW1');
      await testController.addNode('StorageRead', 'BSR1');
    });

    // Write a value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSW1', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSW1', 'Key', 'key1');
      testController.setNodeInputValue('BSW1', 'Value', { data: 123 });
      testController.setNodeInputValue('BSW1', 'Non-empty only', false);
      testController.setNodeInputValue('BSW1', 'Insert only', false);
      await testController.executeNodeByID('BSW1');
    });

    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('BSW1', 'Success')).to.eq(true);
      expect(testController.getNodeOutputValue('BSW1', 'Error')).to.eq('');
    });

    // Read it back
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSR1', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSR1', 'Key', 'key1');
      testController.setNodeInputValue('BSR1', 'Fallback value', null);
      await testController.executeNodeByID('BSR1');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('BSR1', 'Value')).to.deep.eq({
        data: 123,
      });
    });
  });

  it('StorageRead returns fallback for missing key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageRead', 'BSR2');
    });

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSR2', 'Location', 'NoSuchLoc');
      testController.setNodeInputValue('BSR2', 'Key', 'noSuchKey');
      testController.setNodeInputValue('BSR2', 'Fallback value', 'fb');
      await testController.executeNodeByID('BSR2');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('BSR2', 'Value')).to.eq('fb');
    });
  });

  it('StorageWrite skips empty value in only-if-non-empty mode', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'BSW3');
    });

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSW3', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSW3', 'Key', 'emptyKey');
      testController.setNodeInputValue('BSW3', 'Value', null);
      testController.setNodeInputValue('BSW3', 'Non-empty only', true);
      testController.setNodeInputValue('BSW3', 'Insert only', false);
      await testController.executeNodeByID('BSW3');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('BSW3', 'Success')).to.eq(false);
      expect(testController.getNodeOutputValue('BSW3', 'Error')).to.eq(
        'Write skipped: value is empty',
      );
    });
  });

  it('StorageDelete removes a key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'BSW4');
      await testController.addNode('StorageDelete', 'BSD4');
      await testController.addNode('StorageRead', 'BSR4');
    });

    // Write a value first
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSW4', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSW4', 'Key', 'delKey');
      testController.setNodeInputValue('BSW4', 'Value', 'toDelete');
      testController.setNodeInputValue('BSW4', 'Non-empty only', false);
      testController.setNodeInputValue('BSW4', 'Insert only', false);
      await testController.executeNodeByID('BSW4');
    });

    // Delete the key
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSD4', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSD4', 'Key', 'delKey');
      await testController.executeNodeByID('BSD4');
    });

    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('BSD4', 'Success')).to.eq(true);
    });

    // Read should return fallback
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('BSR4', 'Location', 'TestLoc');
      testController.setNodeInputValue('BSR4', 'Key', 'delKey');
      testController.setNodeInputValue('BSR4', 'Fallback value', 'wasDeleted');
      await testController.executeNodeByID('BSR4');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('BSR4', 'Value')).to.eq(
        'wasDeleted',
      );
    });
  });

  it('StorageWrite has Execute trigger socket', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'BSW5');
    });

    doWithTestController((testController) => {
      const socket = testController.getTriggerSocketByIDandName(
        'BSW5',
        'Execute',
      );
      expect(socket).to.not.be.undefined;
    });
  });

  it('StorageDelete has Execute trigger socket', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageDelete', 'BSD5');
    });

    doWithTestController((testController) => {
      const socket = testController.getTriggerSocketByIDandName(
        'BSD5',
        'Execute',
      );
      expect(socket).to.not.be.undefined;
    });
  });
});
