import { openStringifiedGraph } from '../helpers';

describe('Load CG graph and see that it passes the tests', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('CG Test.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
  });
  it('see that it passes', () => {
    cy.failOnText('Test Failure');

    cy.get('body').contains('Test Success!', { timeout: 60000 });
  });
});
