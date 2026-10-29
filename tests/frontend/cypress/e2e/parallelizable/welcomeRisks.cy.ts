import {
  openNewGraph,
  doWithTestController,
  approveLoadedTestApp,
} from '../helpers';

describe('welcome graph risk regression', () => {
  it('starts the welcome graph after accepting its risks', () => {
    openNewGraph();
    cy.window().then((win) => {
      Object.keys(win.localStorage)
        .filter((key) => key.startsWith('tailrmade.app-approval.'))
        .forEach((key) => win.localStorage.removeItem(key));
    });
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
        expect(blocking, 'welcome graph blocking risks').not.to.be.empty;
        expect(controller.isLoadedAppRunning()).to.equal(false);
      });
    });
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    approveLoadedTestApp();
  });
});
