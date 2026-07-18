import { doWithTestController, openStringifiedGraph, waitForGraphToBeReady } from '../helpers';

describe('Load button graph and see that it passes the tests', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('button.ppgraph').then((data) => {
      openStringifiedGraph(data);
    });
    waitForGraphToBeReady();
  });
  it('push the button two times', () => {
    cy.get('[data-cy="button-Button"]').realClick();
    // this second click should not register
    cy.get('[data-cy="button-Button"]').realClick();
    cy.wait(3000); // this is waiting on purpose, we want to see that we get two executions
    cy.get('[data-cy="button-Button"]').realClick();
  });
  it('see that it passes', () => {
    
    cy.get('body').contains('Test Success!', { timeout: 60000 });
    cy.wait(1000);
    cy.failOnText('Test Failure');
  });
});
