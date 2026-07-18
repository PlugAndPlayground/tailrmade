describe('Graph Links', () => {
  it('open graph, old format', () => {
    const pnpBaseUrl = Cypress.env('pnpBaseUrl') || 'http://127.0.0.1:8080';

    cy.readFile('tests/frontend/cypress/fixtures/button.ppgraph').then(
      (data) => {
        cy.intercept('GET', '/public/graph/test-owner/Test/TestPublic', {
          success: true,
          data,
        }).as('loadPublicGraph');

        cy.visit(
          `${pnpBaseUrl}/?loadGraph=test-owner;;TestPublic;;Test;;public`,
        );
        cy.wait('@loadPublicGraph');
      },
    );

    cy.get('[data-cy="button-Button"]', { timeout: 60000 }).should(
      'be.visible',
    );
  });
});
