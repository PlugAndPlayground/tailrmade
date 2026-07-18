import { openStringifiedGraph } from '../helpers';

describe('Load CG graph and see that it passes the tests', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('Portal.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
  });
  it('see that it passes', () => {
    cy.get('body').contains('Kidney Function Assessment Tools');
    cy.get('body').contains('Please sign');
    cy.contains('button', 'AI Parsing').should('be.disabled');
  });
});
