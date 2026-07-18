import { doWithTestController, openNewGraph } from '../helpers';

describe('customFunction', () => {
  it('Add node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'CustomFunction');
    });
  });
  it('set new code parameter input, see that we adapt', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('CustomFunction', 'Code', '(a,b) => {}');
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;
      expect(testController.getInputSocketByIDandName('CustomFunction', 'b')).to
        .exist;
    });
  });

  it("try bad arguments, see that we don't destroy the node (this was a bug at one point)", () => {
    doWithTestController(async (testController) => {
      await testController.executeNodeByID('CustomFunction');
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '(a, ) => {}',
      );
      await testController.executeNodeByID('CustomFunction');
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '(a, a) => {}',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;
    });
  });

  it('check output results', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '() => {return 15;}',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(15);
    });
  });

  it('handles alternative function formats', () => {
    doWithTestController(async (testController) => {
      // single param without parens
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        'a => { return a; }',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;

      // expression body (no braces)
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '(x) => x + 1',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'x')).to
        .exist;
      await testController.setNodeInputValue('CustomFunction', 'x', 4);
      await testController.executeNodeByID('CustomFunction');
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(5);

      // single param + expression body combined
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        'a => a * 2',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;
      await testController.setNodeInputValue('CustomFunction', 'a', 3);
      await testController.executeNodeByID('CustomFunction');
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(6);

      // traditional function declaration
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        'function(a, b) { return a + b; }',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;
      expect(testController.getInputSocketByIDandName('CustomFunction', 'b')).to
        .exist;

      // named function declaration
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        'function add(a, b) { return a + b; }',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;
      expect(testController.getInputSocketByIDandName('CustomFunction', 'b')).to
        .exist;
    });
  });

  const customFunctionCode = '(a) => {return await macro("MyMacro");}';

  it('set up and call macro', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Macro', 'Macro', 300);
      await testController.addNode('Add', 'Add', 350);
      testController.getNodeByID('Macro').setNodeName('MyMacro');

      await testController.connectNodesByID('Macro', 'Add');
      await testController.connectNodesByID('Add', 'Macro');
      await testController.setNodeInputValue('Add', 'Addend 2', 10);

      await testController.setNodeInputValue(
        'CustomFunction',
        'Main Thread',
        true,
      );
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        customFunctionCode,
      );

      await testController.executeNodeByID('CustomFunction');
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(10);
    });
  });

  it('call macro from worker (non main thread)', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'CustomFunction',
        'Main Thread',
        false,
      );
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        customFunctionCode,
      );
      await testController.setNodeInputValue('Add', 'Addend 2', 5);

      await testController.executeNodeByID('CustomFunction');
      await testController.waitForPendingExecution();
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(5);
    });
  });

  it('see that the code inside custom function still looks as expected', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('CustomFunction', 'Code')).to.eq(
        customFunctionCode,
      );
    });
  });

  it('test base level sanitization', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'CustomFunction',
        'Main Thread',
        false,
      );
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '(a) => {return window;}',
      );
      await testController.executeNodeByID('CustomFunction');
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData'),
      ).to.eq(0);
    });
  });

  
  it('remove parameter after connecting node, socket should stay, then disconnect and socket should be gone', () => {
    doWithTestController(async (testController) => {
      // Set up custom function with parameter 'a'
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '(a) => {return a;}',
      );
      await testController.executeNodeByID('CustomFunction');
      
      // Verify socket 'a' exists
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;

      // Add a Constant node and connect it to the 'a' socket
      await testController.addNode('Constant', 'Constant');
      await testController.setNodeInputValue('Constant', 'In', 5);
      await testController.connectNodesByID('Constant', 'CustomFunction', 'Out', 'a');
      await testController.waitForPendingExecution();

      // Remove parameter from code (change to no parameters)
      await testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '() => {return 10;}',
      );
      await testController.executeNodeByID('CustomFunction');

      // Socket should still exist because it has a connection
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .exist;

      // Disconnect the input to that socket
      await testController.disconnectLink('CustomFunction', 'a');
      await testController.waitForPendingExecution();

      // Socket should be gone now
      expect(testController.getInputSocketByIDandName('CustomFunction', 'a')).to
        .not.exist;
    });
  });
  
});
