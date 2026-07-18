import {
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

describe('macro', () => {
  const checkDropdownWorks = () => {
    doWithTestController((testController) => {
      testController.selectNodesById(['ExecuteMacro']);
      // if this breaks, maybe ID has changed
      cy.get('[data-cy="right-drawer-toggle-btn"]').click();
      cy.get('.MuiSelect-select').click();
      cy.get('body').contains('Macro0').click();
    });
  };

  it('Add macro nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Macro', 'Macro');
      await testController.addNode('Add', 'Add');

      await testController.addNode('Constant', 'Constant');
      await testController.addNode('ExecuteMacro', 'ExecuteMacro');
    });
  });

  it('Connect macro nodes', () => {
    // connect up inside macro
    doWithTestController(async (testController) => {
      testController.moveNodeByID('Add', 200, 100);
      testController.moveNodeByID('ExecuteMacro', 0, -200);
      testController.moveNodeByID('Constant', -200, -200);
      await testController.connectNodesByID('Macro', 'Add', 'Parameter 1');
      await testController.connectNodesByID('Add', 'Macro', 'Added');
      await testController.waitForPendingExecution();
    });
  });

  it('Select executemacro and select macro from dropdown', () => {
    checkDropdownWorks();
  });

  it('Set up macro caller env', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'ExecuteMacro', 'Out');
      await testController.waitForPendingExecution();
      testController.setNodeInputValue('Constant', 'In', 10);
      await testController.executeNodeByID('Constant');
    });
  });

  it('See that the macro runs as expected when called from outside (it should be passthrough)', () => {
    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue('ExecuteMacro', 'Output', 10),
      ).to.eq(10);
    });
  });

  it('see that updating the node inside the macro calls the calling one as well', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Add', 'Addend 2', 1);
      await testController.executeNodeByID('Add');
      expect(testController.getNodeOutputValue('ExecuteMacro', 'Output', 11));
    });
  });

  it('see that the caller node gets the same display name as the node inside the macro', () => {
    doWithTestController(async (testController) => {
      const node = testController.getNodeByID('ExecuteMacro');
      const inputSocket = node.getInputSocketByName('Parameter 1');
      expect(node.getSocketDisplayName(inputSocket)).to.eq('Addend');
    });
  });

  it('see that when we add a new socket in the macro, the caller also adapts', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant2', 300, -300);
      await testController.connectNodesByID(
        'Macro',
        'Constant2',
        'Parameter 2',
      );
      expect(
        testController.getNodeByID('ExecuteMacro').inputSocketArray.length,
      ).to.eq(3);
    });
  });

  it('and then check when removing that the socket disappers from caller', () => {
    doWithTestController(async (testController) => {
      await testController.disconnectLink('Constant2', 'In');
      expect(
        testController.getNodeByID('ExecuteMacro').inputSocketArray.length,
      ).to.eq(2);
    });
  });
  it('Save graph', () => {
    saveGraph();
  });

  it("Removing the node in the macro should remove the macro's sockets", () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Macro', 'Add', 'Parameter 2');
      await testController.waitForPendingExecution();
      await testController.removeNode('Add');

      expect(testController.getOutputSockets('Macro').length).to.eq(1);
    });
  });

  it('See that dropdown still works after reload', () => {
    openExistingGraph();
    doWithTestController((testController) => {
      testController.selectNodesById(['ExecuteMacro']);
      cy.contains('Macro0').click();
      cy.get('body').type('{enter}');
    });
  });

  it('See that not everything is selected when graph is selected', () => {
    doWithTestController((testController) => {
      testController.selectNodesById(['Macro']);
      expect(testController.getSelectedNodes().length).to.eq(1);
    });
  });
});
