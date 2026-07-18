import { openStringifiedGraph } from '../helpers';

describe('Test Shader Sharpening', () => {
  it('open graph', () => {
    cy.failOnText('Test Failure');
    cy.fixture('testShaderSharpening.ppgraph').then(
      (data) => {
        openStringifiedGraph(data);
      },
    );
  });
  it('see that it passes', () => {
    cy.failOnText('Test Failure');

    cy.get('body').contains('Test Success!', { timeout: 60000 });
  });
});
