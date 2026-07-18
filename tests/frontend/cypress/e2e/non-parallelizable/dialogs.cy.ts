import {
  addFirstTwoNodes,
  closeBothDrawers,
  clickDeleteButtonOfGraph,
  clickEditButtonOfGraph,
  openGraphsList,
  completeDeleteAction,
  controlOrMetaKey,
  doWithTestController,
  getDeleteDialog,
  getEditDialog,
  openEditGraph,
  openNewGraph,
  saveGraph,
  closeBothDrawers,
} from '../helpers';

describe('dialogs (local graph storage)', () => {
  let graphName;
  let secondGraphName;
  const newGraphName = 'My app';
  const newSecondGraphName = 'My 2nd app';

  before(() => {
    openNewGraph();

    /*
    // Sign out if logged in
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="sign-out-button"]').length > 0) {
        cy.get('[data-cy="auth-button"]').click();
        cy.get('[data-cy="sign-out-button"]').click();
        cy.wait(500);
      }
    });

    // Close graph list if open
    cy.get('body').then(($body) => {
      if ($body.find('#graphs-list').is(':visible')) {
        cy.get('body').type('1'); // close left side menu
      }
    });
    */

    doWithTestController(async (testController) => {
      await testController.deleteAllGraphs();
      // cy.get('body').click(coordinates[0], coordinates[1]);
    });
    addFirstTwoNodes();
    closeBothDrawers();
    saveGraph();
    cy.get('[id^="notistack-snackbar"]', { timeout: 20000 })
      .contains('was saved')
      .invoke('text')
      .then((text) => {
        const match = text.match(/(.+?) was saved to local database/);
        if (match) {
          graphName = match[1];
          cy.log(graphName);
        }
      });
  });

  // Edit graph dialog of current graph
  it('Opens and closes edit graph dialog via clicking cancel', () => {
    openEditGraph();
    getEditDialog().contains('Edit app details', { timeout: 10000 });
    getEditDialog().contains('button', 'Cancel').click();
    getEditDialog().should('not.exist');
  });

  it('Opens and closes edit graph dialog via clicking outside', () => {
    openEditGraph();
    getEditDialog().contains('Edit app details');
    cy.get('body').click(500, 100); // click outside
    getEditDialog().should('not.exist');
  });

  it('Opens and closes edit graph dialog via shortcuts', () => {
    openEditGraph();
    getEditDialog().contains('Edit app details');
    getEditDialog().type('{esc}');
    getEditDialog().should('not.exist');
  });

  it('Checks if graph name is selected', () => {
    openGraphsList();
    cy.get('#graphs-list').contains(graphName);
  });

  it('Changes graph name after graph name change and clicking save', () => {
    openEditGraph();
    cy.get('#app-name-input').clear().type(`${newGraphName}`);
    getEditDialog().contains('button', 'Save').click();
    cy.get('[id^="notistack-snackbar"]', { timeout: 15000 })
      .contains(`${newGraphName}`)
      .should('exist');
    clickEditButtonOfGraph(newGraphName);
    cy.get('#app-name-input').should('have.value', newGraphName);
    getEditDialog().contains('button', 'Cancel').click();
  });

  // Edit graph dialog of other graph
  it('Changes graph name of other graph after graph name change and clicking save', () => {
    //cy.wait(1000);
    cy.get('body').type(`${controlOrMetaKey()}{shift}s`); // save new graph
    //cy.wait(1000)
    cy.get('[id^="notistack-snackbar"]', { timeout: 15000 })
      .last()
      .contains('was saved')
      .invoke('text')
      .then((text) => {
        const match = text.match(/(.+?) was saved/);
        if (match) {
          secondGraphName = match[1];
          cy.log(secondGraphName);
          clickEditButtonOfGraph(secondGraphName);
          cy.get('#app-name-input')
            .clear()
            .type(`${newSecondGraphName}{enter}`);
          clickEditButtonOfGraph(newSecondGraphName);
          cy.get('#app-name-input').should('have.value', newSecondGraphName);
          getEditDialog().contains('button', 'Cancel').click();
        }
      });
  });

  // Delete graph dialog
  it('Opens and closes delete graph dialog via clicking cancel', () => {
    clickDeleteButtonOfGraph(newGraphName);
    getDeleteDialog().contains('Delete app');
    getDeleteDialog().contains('button', 'Cancel').click();
    getDeleteDialog().should('not.exist');
  });

  it('Opens and closes delete graph dialog via clicking outside', () => {
    clickDeleteButtonOfGraph(newGraphName);
    getDeleteDialog().contains('Delete app');
    cy.get('body').click(500, 100); // click outside
    getDeleteDialog().should('not.exist');
  });

  it('Deletes other graph after clicking delete', () => {
    clickDeleteButtonOfGraph(newGraphName);
    getDeleteDialog().contains('Delete app');
    getDeleteDialog().contains('button', 'Delete').click();
    getDeleteDialog().should('not.exist');
    cy.wait(3000); // ycrsed
    cy.get(`[data-cy="hover-${newGraphName}"]`).should('not.exist', {
      timeout: 30000,
    });
  });

  it('Deletes current graph after clicking delete', () => {
    doWithTestController((testController) => {
      testController.hideSnackBar();
    });
    completeDeleteAction(newSecondGraphName);
  });
});
