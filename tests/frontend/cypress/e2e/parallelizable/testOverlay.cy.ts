import {
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
  openGraphsList,
  saveGraph,
  reloadGraph,
} from '../helpers';

describe('testOverlays', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
    cy.showMousePosition();
    cy.window().then((win) => {
      cy.stub(win, 'open').as('windowOpen');
    });
  });

  after(() => {
    Cypress.$('#custom-mouse-pointer').remove();
  });

  it('show left dashboard right with save', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
    });

    openGraphsList();
    saveGraph();
    cy.contains('Local apps').should('be.visible');

    reloadGraph();
    cy.contains('Local apps').should('be.visible');

    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.contains('Create user interface').should('be.visible');
    saveGraph();
    cy.wait(500);

    reloadGraph();
    cy.contains('Create user interface').should('be.visible');
    cy.get('[data-cy="right-drawer-toggle-btn"]')
      .first()
      .click({ force: true });
    cy.get('[data-cy="inspector-node-search-input"]').should('be.visible');

    reloadGraph();
    cy.get('[data-cy="inspector-node-search-input"]').should('be.visible');
  });

  it('help button', () => {
    cy.get('[data-cy="helpButton"]').click({ force: true });
    cy.get('@windowOpen').should(
      'have.been.calledWith',
      'https://tailrmade.app/help',
      '_blank',
    );
  });

  // it('test dashboard edit mode and fullscreen', () => {
  //   cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
  //   cy.contains('Create user interface').should('be.visible');
  //   cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
  //   cy.contains('Create user interface').should('not.exist');
  //   cy.get('[data-cy="toggle-edit-mode-btn"]').first().should('be.visible');

  //   cy.get('[data-cy="maximise-dashboard-btn"]').first().click({ force: true });
  //   cy.get('[data-cy="shrink-dashboard-btn"]').first().should('be.visible');

  //   cy.get('[data-cy="shrink-dashboard-btn"]').first().click({ force: true });
  //   cy.get('[data-cy="maximise-dashboard-btn"]').first().should('be.visible');
  // });

  it('test share app menu', () => {
    cy.get('[data-cy="shareCurrentButton"]').click({ force: true });
    cy.contains('Share app').should('be.visible');
    cy.get('body').click(100, 100);
    cy.contains('Share app').should('not.exist');
  });

  it('test app view toggle', () => {
    cy.get('[data-cy="helpButton"]').should('be.visible');

    cy.get('[data-cy="toggle-app-button"]').click({ force: true });
    cy.get('[data-cy="helpButton"]').should('not.exist');

    // the floating logo is the only way back out
    cy.get('[data-cy="app-view-exit-button"]').should('be.visible');
    cy.get('[data-cy="app-view-exit-button"]').click({ force: true });

    cy.get('[data-cy="helpButton"]').should('be.visible');
    cy.get('[data-cy="app-view-exit-button"]').should('not.exist');
  });

  it('T toggles app view, and E leaves it for the editor', () => {
    cy.get('body').type('t');
    cy.get('[data-cy="app-view-exit-button"]').should('be.visible');

    cy.get('body').type('e');
    cy.get('[data-cy="app-view-exit-button"]').should('not.exist');
    cy.get('[data-cy="shell-rail"]').should('be.visible');

    cy.get('[data-cy="toggle-edit-mode-btn"] svg[data-testid="CloseIcon"]')
      .first()
      .should('exist');

    cy.get('body').type('e');
  });

  it('the empty app view says so instead of showing build steps', () => {
    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.contains('Create user interface').should('be.visible');

    cy.get('body').type('t');

    cy.contains('Create user interface').should('not.exist');
    cy.get('[data-cy="dashboard-empty-state"]')
      .should('be.visible')
      .and('contain.text', 'no user interface yet');

    cy.get('[data-cy="app-view-exit-button"]').click({ force: true });
    cy.contains('Create user interface').should('be.visible');
  });
});
