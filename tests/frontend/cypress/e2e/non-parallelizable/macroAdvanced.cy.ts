import {
  doWithTestController,
  openNewGraph,
  openExistingGraph,
  saveGraph,
} from '../helpers';

describe('macroAdvanced', () => {
  it('Create macro and map execute macro nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Macro', 'Macro');
      await testController.addNode('MapExecuteMacro', 'MapExecuteMacro');

      // Set MapExecuteMacro Array input to [{}]
      testController.setNodeInputValue('MapExecuteMacro', 'Array', [{}]);
    });
  });

  it('Connect macro output to Add node and then back to macro input', () => {
    doWithTestController(async (testController) => {
      // Add an Add node inside the macro
      await testController.addNode('Add', 'Add');

      // Position nodes for better visibility
      testController.moveNodeByID('Add', 200, 100);
      testController.moveNodeByID('MapExecuteMacro', 0, -200);

      // Connect the macro output to the Add node
      await testController.connectNodesByID('Macro', 'Add', 'Parameter 1');
      await testController.waitForPendingExecution();

      // Connect the Add node output back to the macro as input
      await testController.connectNodesByID('Add', 'Macro', 'Added');

      await testController.waitForPendingExecution();
    });
  });

  it('Select macro from dropdown in inspector container', () => {
    doWithTestController((testController) => {
      // Select the MapExecuteMacro node
      testController.selectNodesById(['MapExecuteMacro']);

      // Open inspector container
      cy.get('[data-cy="right-drawer-toggle-btn"]').click();

      cy.get('#inspector-filter-in').click();
      // Click on the dropdown to open it
      cy.get('.MuiSelect-select').click();

      // Select the first option (the created macro)
      cy.get('body').contains('Macro0').click();
    });
  });

  it('Verify Parameter socket is created and check output type', () => {
    doWithTestController((testController) => {
      // Check that the MapExecuteMacro node has input sockets created
      const node = testController.getNodeByID('MapExecuteMacro');
      expect(node.inputSocketArray.length).to.be.greaterThan(0);

      // Verify the parameter socket exists
      const inputSocket = node.getInputSocketByName('Parameter 1');
      expect(inputSocket).to.exist;

      // Check that Macro Parameter 1 output is a number type
      const macroNode = testController.getNodeByID('Macro');
      const outputSocket = macroNode.getOutputSocketByName('Parameter 1');
      expect(outputSocket.dataType.getName()).to.eq('Number');
    });
  });

  it('Switch dropdown to select Constant option', () => {
    doWithTestController((testController) => {
      // Make sure the MapExecuteMacro node is still selected
      testController.selectNodesById(['MapExecuteMacro']);

      // Open inspector container if not already open
      /*cy.get('[data-cy="right-drawer-toggle-btn"]').then(
        ($button) => {
          // Check if inspector is already open by looking for the dropdown
          cy.get('body').then(($body) => {
            if ($body.find('.MuiSelect-select').length === 0) {
              cy.wrap($button).click();
            }
          });
        },
      );
      */

      cy.contains('-- Entire Object --').click();
      cy.contains('-- Constant --').click();
    });
  });

  it('Verify corresponding socket appears in inspector container', () => {
    cy.contains('Parameter 1 - Constant').should('be.visible');
  });

  it('Save graph', () => {
    saveGraph();
  });

  it('Reload graph and verify MapExecuteMacro configuration persists', () => {
    openExistingGraph();
    doWithTestController((testController) => {
      // Select the MapExecuteMacro node
      testController.selectNodesById(['MapExecuteMacro']);
      cy.get('[data-cy="right-drawer-toggle-btn"]').click();

      // Open inspector container
      cy.get('[data-cy="right-drawer-toggle-btn"]').click();

      // Click on the input filter
      cy.get('#inspector-filter-in').click();

      // Verify that the "Parameter 1 - Constant" configuration is still there
      cy.contains('Parameter 1 - Constant').should('be.visible');
      cy.get('[data-cy="right-drawer-toggle-btn"]').click();

      // Close inspector container at the end
    });
  });
});
