import {
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

// check execution mode flow working as intended
describe('graph execution', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant', -200);
      await testController.addNode('Constant', 'Constant2', -200, 100);
      await testController.addNode('Constant', 'Constant3', -200, -100);
      await testController.addNode('Constant', 'Constant4', -400);
      await testController.addNode('Constant', 'Constant5', 200, 100);
      await testController.addNode('Add', 'Add');
    });
  });

  it('Set Update Behaviours', () => {
    doWithTestController((testController) => {
      testController.getNodeByID('Constant').updateBehaviour.update = false;
      testController.getNodeByID('Constant').updateBehaviour.load = true;
    });
  });

  it('Connect them', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'Add');
      await testController.connectNodesByID('Constant2', 'Add');
      await testController.connectNodesByID('Constant3', 'Add');
      await testController.connectNodesByID('Constant4', 'Constant');
      await testController.connectNodesByID('Constant', 'Constant5');
      await testController.waitForPendingExecution();
    });
  });

  it('Set input values', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 1);
      await testController.setNodeInputValue('Constant2', 'In', 2);
      await testController.setNodeInputValue('Constant3', 'In', 4);
      await testController.setNodeInputValue('Constant4', 'In', 8);
    });
  });

  it('Execute them all', () => {
    doWithTestController(async (testController) => {
      await testController.executeNodeByID('Constant');
      await testController.executeNodeByID('Constant2');
      await testController.executeNodeByID('Constant3');
      await testController.executeNodeByID('Constant4');
    });
  });

  it("See that propagation was blocked through the node with 'update' disabled", () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Add', 'Added')).to.eq(7);
    });
  });

  it("execute node with 'update' disabled and see that the resulting value in added is now updated as well", () => {
    doWithTestController(async (testController) => {
      await testController.executeNodeByID('Constant');
      expect(testController.getNodeOutputValue('Add', 'Added')).to.eq(14);
    });
  });

  it('see that nodes behind a non-executing-on-load node is executing on load, prepare them', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant6', 0, -400);
      await testController.addNode('Label', 'Label', 200, -400);
      await testController.connectNodesByID('Constant6', 'Label');
      testController.getNodeByID('Constant6').updateBehaviour.update = false;
      testController.getNodeByID('Constant6').updateBehaviour.load = false;
    });
  });

  it('Reload graph', () => {
    saveGraph();
    openExistingGraph();
  });

  it('see that nodes behind a non-executing-on-load node is executing on load, test them', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Label', 'Output')).to.eq('0');
    });
  });

  it('See that it figured out the proper execution order after reload', () => {
    doWithTestController(async (testController) => {
      await testController.executeNodeByID('Constant');
      expect(testController.getNodeOutputValue('Add', 'Added')).to.eq(14);
      expect(testController.getNodeOutputValue('Constant5', 'Out')).to.eq(8);
    });
  });

  it('verify correct behaviour of our macro execution graph', () => {
    // Read the contents of the file
    let graphData = {};
    cy.fixture('testExecution.ppgraph').then(
      (fileContent) => {
        // Parse the JSON content
        graphData = fileContent;
        doWithTestController(async (testController) => {
          await testController.loadStringifiedGraph(graphData);
          await testController.waitForPendingExecution();
        });

        doWithTestController(async (testController) => {
          expect(
            testController.getNodeOutputValue('chilly-wombat-61', 'Added'),
          ).to.eq(4);
          expect(
            testController.getNodeOutputValue('itchy-zebra-77', 'Added'),
          ).to.eq(12);

          //console.log(fileContent);
        });
        // Use the parsed data in your test
      },
    );
  });
});
