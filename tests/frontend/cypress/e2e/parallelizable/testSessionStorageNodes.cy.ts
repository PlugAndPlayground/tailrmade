import { doWithTestController, openNewGraph } from '../helpers';

let testLocation: string;
function setSessionBackend(testController: any, ...nodeIds: string[]) {
  for (const nodeId of nodeIds)
    testController.setNodeInputValue(nodeId, 'Storage type', 'Session');
}

describe('Storage nodes (Session backend)', () => {
  beforeEach(() => {
    testLocation = `SessionTest-${Cypress._.uniqueId()}`;
  });

  it('StorageWrite and StorageRead round-trip', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW1');
      await testController.addNode('StorageRead', 'LSR1');
      setSessionBackend(testController, 'LSW1', 'LSR1');
    });

    // Write a value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW1', 'Location', testLocation);
      testController.setNodeInputValue('LSW1', 'Key', 'myKey');
      testController.setNodeInputValue('LSW1', 'Value', 'myValue');
      testController.setNodeInputValue('LSW1', 'Non-empty only', false);
      testController.setNodeInputValue('LSW1', 'Insert only', false);
      await testController.executeNodeByID('LSW1');
    });

    // Check Success output
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('LSW1', 'Success')).to.eq(true);
      expect(testController.getNodeOutputValue('LSW1', 'Error')).to.eq('');
    });

    // Read it back
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSR1', 'Location', testLocation);
      testController.setNodeInputValue('LSR1', 'Key', 'myKey');
      testController.setNodeInputValue('LSR1', 'Fallback value', 'fallback');
      await testController.executeNodeByID('LSR1');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSR1', 'Value')).to.eq(
        'myValue',
      );
    });
  });

  it('StorageRead returns fallback for missing key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageRead', 'LSR2');
      setSessionBackend(testController, 'LSR2');
    });

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSR2', 'Location', testLocation);
      testController.setNodeInputValue('LSR2', 'Key', 'missingKey');
      testController.setNodeInputValue('LSR2', 'Fallback value', 'default');
      await testController.executeNodeByID('LSR2');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSR2', 'Value')).to.eq(
        'default',
      );
    });
  });

  it('StorageWrite skips null value in only-if-non-empty mode', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW3');
      setSessionBackend(testController, 'LSW3');
    });

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW3', 'Location', testLocation);
      testController.setNodeInputValue('LSW3', 'Key', 'emptyTest');
      testController.setNodeInputValue('LSW3', 'Value', null);
      testController.setNodeInputValue('LSW3', 'Non-empty only', true);
      testController.setNodeInputValue('LSW3', 'Insert only', false);
      await testController.executeNodeByID('LSW3');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSW3', 'Success')).to.eq(false);
      expect(testController.getNodeOutputValue('LSW3', 'Error')).to.eq(
        'Write skipped: value is empty',
      );
    });
  });

  it('StorageWrite skips existing key in only-if-key-missing mode', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW4');
      setSessionBackend(testController, 'LSW4');
    });

    // First write succeeds
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW4', 'Location', testLocation);
      testController.setNodeInputValue('LSW4', 'Key', 'existingKey');
      testController.setNodeInputValue('LSW4', 'Value', 'first');
      testController.setNodeInputValue('LSW4', 'Non-empty only', false);
      testController.setNodeInputValue('LSW4', 'Insert only', false);
      await testController.executeNodeByID('LSW4');
    });

    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('LSW4', 'Success')).to.eq(true);
    });

    // Second write with only-if-key-missing should skip
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW4', 'Value', 'second');
      testController.setNodeInputValue('LSW4', 'Non-empty only', false);
      testController.setNodeInputValue('LSW4', 'Insert only', true);
      await testController.executeNodeByID('LSW4');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSW4', 'Success')).to.eq(false);
      expect(testController.getNodeOutputValue('LSW4', 'Error')).to.eq(
        'Write skipped: key already exists',
      );
    });
  });

  it('StorageDelete removes a key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW5');
      await testController.addNode('StorageDelete', 'LSD5');
      await testController.addNode('StorageRead', 'LSR5');
      setSessionBackend(testController, 'LSW5', 'LSD5', 'LSR5');
    });

    // Write a value first
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW5', 'Location', testLocation);
      testController.setNodeInputValue('LSW5', 'Key', 'deleteMe');
      testController.setNodeInputValue('LSW5', 'Value', 'toDelete');
      testController.setNodeInputValue('LSW5', 'Non-empty only', false);
      testController.setNodeInputValue('LSW5', 'Insert only', false);
      await testController.executeNodeByID('LSW5');
    });

    // Delete the key
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSD5', 'Location', testLocation);
      testController.setNodeInputValue('LSD5', 'Key', 'deleteMe');
      await testController.executeNodeByID('LSD5');
    });

    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('LSD5', 'Success')).to.eq(true);
    });

    // Read should return fallback
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSR5', 'Location', testLocation);
      testController.setNodeInputValue('LSR5', 'Key', 'deleteMe');
      testController.setNodeInputValue('LSR5', 'Fallback value', 'wasDeleted');
      await testController.executeNodeByID('LSR5');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSR5', 'Value')).to.eq(
        'wasDeleted',
      );
    });
  });

  it('StorageWrite has Execute trigger socket', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW6');
      setSessionBackend(testController, 'LSW6');
    });

    doWithTestController((testController) => {
      const socket = testController.getTriggerSocketByIDandName(
        'LSW6',
        'Execute',
      );
      expect(socket).to.not.be.undefined;
    });
  });

  it('StorageDelete has Execute trigger socket', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageDelete', 'LSD6');
      setSessionBackend(testController, 'LSD6');
    });

    doWithTestController((testController) => {
      const socket = testController.getTriggerSocketByIDandName(
        'LSD6',
        'Execute',
      );
      expect(socket).to.not.be.undefined;
    });
  });

  it('StorageWrite overwrites existing key', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW7');
      await testController.addNode('StorageRead', 'LSR7');
      setSessionBackend(testController, 'LSW7', 'LSR7');
    });

    // Write first value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW7', 'Location', testLocation);
      testController.setNodeInputValue('LSW7', 'Key', 'overwriteKey');
      testController.setNodeInputValue('LSW7', 'Value', 'first');
      testController.setNodeInputValue('LSW7', 'Non-empty only', false);
      testController.setNodeInputValue('LSW7', 'Insert only', false);
      await testController.executeNodeByID('LSW7');
    });

    // Overwrite with second value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW7', 'Value', 'second');
      await testController.executeNodeByID('LSW7');
    });

    // Read should return second value
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSR7', 'Location', testLocation);
      testController.setNodeInputValue('LSR7', 'Key', 'overwriteKey');
      testController.setNodeInputValue('LSR7', 'Fallback value', 'nope');
      await testController.executeNodeByID('LSR7');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSR7', 'Value')).to.eq(
        'second',
      );
    });
  });

  it('StorageBrowse returns keys for selected location', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageWrite', 'LSW8');
      await testController.addNode('StorageBrowse', 'LSB8');
      setSessionBackend(testController, 'LSW8', 'LSB8');
    });

    // Write a value so there is something to browse
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSW8', 'Location', testLocation);
      testController.setNodeInputValue('LSW8', 'Key', 'browseKey');
      testController.setNodeInputValue('LSW8', 'Value', 'browseValue');
      testController.setNodeInputValue('LSW8', 'Non-empty only', false);
      testController.setNodeInputValue('LSW8', 'Insert only', false);
      await testController.executeNodeByID('LSW8');
    });

    // Browse keys at the location
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSB8', 'Filter by Location', true);
      testController.setNodeInputValue('LSB8', 'Location', testLocation);
      await testController.executeNodeByID('LSB8');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSB8', 'Objects')).to.deep.eq([
        { key: 'browseKey', location: testLocation },
      ]);
      expect(testController.getNodeOutputValue('LSB8', 'Error')).to.eq('');
    });
  });

  it('StorageBrowse returns empty keys for missing location', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('StorageBrowse', 'LSB9');
      setSessionBackend(testController, 'LSB9');
    });

    // Browse a location that doesn't exist
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('LSB9', 'Filter by Location', true);
      testController.setNodeInputValue('LSB9', 'Location', 'NoSuchLocation');
      await testController.executeNodeByID('LSB9');
    });

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('LSB9', 'Objects')).to.deep.eq(
        [],
      );
      expect(testController.getNodeOutputValue('LSB9', 'Error')).to.eq('');
    });
  });
});
