import { doWithTestController, openNewGraph } from '../helpers';

describe('StringFunction', () => {
  it('Add node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('StringFunction', 'StringFunction');
    });
  });

  // -------------------------------------------------------------------------
  // 0-param methods — should be called, not returned as a function reference
  // -------------------------------------------------------------------------

  it('trim — removes surrounding whitespace', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'trim',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        '  hello  ',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('hello');
    });
  });

  it('trimStart — removes only leading whitespace, not trailing', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'trimStart',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        '  hello  ',
      );
      await testController.executeNodeByID('StringFunction');
      // Bug: old impl returned the function itself instead of calling it
      const result = testController.getNodeOutputValue(
        'StringFunction',
        'Output',
      );
      expect(typeof result).to.eq('string');
      expect(result).to.eq('hello  ');
    });
  });

  it('trimEnd — removes only trailing whitespace', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'trimEnd',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        '  hello  ',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('  hello');
    });
  });

  it('toUpperCase', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'toUpperCase',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('HELLO');
    });
  });

  it('toLowerCase', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'toLowerCase',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'HELLO',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('hello');
    });
  });

  // -------------------------------------------------------------------------
  // 1-param methods
  // -------------------------------------------------------------------------

  it('includes — true when present', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'includes',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        'world',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq(true);
    });
  });

  it('includes — false when absent', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'includes',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        'xyz',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq(false);
    });
  });

  it('startsWith', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'startsWith',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        'hello',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq(true);
    });
  });

  it('repeat', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'repeat',
      );
      await testController.setNodeInputValue('StringFunction', 'Input', 'ab');
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        '3',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('ababab');
    });
  });

  // -------------------------------------------------------------------------
  // 2-param methods — the problematic ones
  // -------------------------------------------------------------------------

  it('replace — normal replacement', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'replace',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        'world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        'there',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('hello there');
    });
  });

  it('replace — empty string param2 REMOVES match (not "undefined")', () => {
    doWithTestController(async (testController) => {
      // This is the exact bug from the screenshot:
      // Input: "at://did:plc:..." + replace("at://", "") should yield "did:plc:..."
      // Old code dropped param2 when empty → replacement became undefined → "undefineddid:plc:..."
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'replace',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'at://did:plc:abc',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        'at://',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        '',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('did:plc:abc');
    });
  });

  it('replaceAll — empty string param2 removes all matches', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'replaceAll',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'a-b-c',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        '-',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        '',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('abc');
    });
  });

  it('slice — with only param1 set (param2 empty/undefined)', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'slice',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        '6',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        '',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('world');
    });
  });

  it('slice — with both params', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'slice',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Input',
        'hello world',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        '0',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        '5',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('hello');
    });
  });

  it('padStart — pads with character', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'StringFunction',
        'Option',
        'padStart',
      );
      await testController.setNodeInputValue('StringFunction', 'Input', '5');
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter1',
        '3',
      );
      await testController.setNodeInputValue(
        'StringFunction',
        'Parameter2',
        '0',
      );
      await testController.executeNodeByID('StringFunction');
      expect(
        testController.getNodeOutputValue('StringFunction', 'Output'),
      ).to.eq('005');
    });
  });
});
