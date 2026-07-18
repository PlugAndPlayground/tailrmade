import { openStringifiedGraph } from '../helpers';

describe('Load CG graph and see that it passes the tests', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('CKD-AKI Dashboard.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
  });
  it('see that it passes', () => {
    cy.get('body').contains('CKD Example 1');
    cy.get('body').contains('12-07-06');
    cy.get('body').contains('End: 24');
  });
});
