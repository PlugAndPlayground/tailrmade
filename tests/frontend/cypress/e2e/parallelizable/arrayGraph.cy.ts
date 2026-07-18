import { openStringifiedGraph } from '../helpers';

describe('Array stuff', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('arrayStuff.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
  });
  it('see that it passes', () => {
    cy.failOnText('Test Failure');

    cy.get('body').contains('Test Success!', { timeout: 20000 });
  });
});
