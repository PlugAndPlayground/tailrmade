import { openNewGraph, doWithTestController } from '../helpers';

describe('welcome graph risk regression', () => {
  it('loads the welcome graph without blocking risks', () => {
    openNewGraph();
    cy.fixture('Welcome to Tailrmade.ppgraph').then((graph) => {
      doWithTestController(async (controller) => {
        await controller.loadStringifiedGraph(graph.trim());
        const blocking = controller.getNodes().flatMap((node) =>
          node
            .getRisks()
            .filter((risk) => risk.severity !== 'info')
            .map((risk) => ({
              node: node.id,
              name: node.nodeName,
              risk: risk.title,
            })),
        );
        expect(blocking, 'welcome graph blocking risks').to.deep.equal([]);
      });
    });
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
  });
});
