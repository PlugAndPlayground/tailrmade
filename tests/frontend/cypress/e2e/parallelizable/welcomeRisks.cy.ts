import {
  approveLoadedTestApp,
  doWithTestController,
  openNewGraph,
  PNP_TIMEOUT,
  shouldWithTestController,
} from '../helpers';
import type TestController from '../../../../../src/TestController';

// Fetched from the library rather than copied, so a new runtime rule or
// migration is checked against the apps people actually open. Set
// CYPRESS_libraryRef to test a library branch before it is merged.
const LIBRARY_REF = Cypress.expose('libraryRef') ?? 'main';

const loadLibraryApp = (name: string) => {
  openNewGraph();
  cy.window().then((win) => {
    Object.keys(win.localStorage)
      .filter((key) => key.startsWith('tailrmade.app-approval.'))
      .forEach((key) => win.localStorage.removeItem(key));
  });
  cy.request({
    url: `https://raw.githubusercontent.com/PlugAndPlayground/tailrmade-library/${LIBRARY_REF}/apps/examples/${encodeURIComponent(name)}.tmapp`,
    encoding: 'utf8',
  }).then(({ body }) => {
    const graph = typeof body === 'string' ? body : JSON.stringify(body);
    doWithTestController((controller) =>
      controller.loadStringifiedGraph(graph),
    );
  });
};

const blockingRisks = (controller: TestController) =>
  controller.getNodes().flatMap((node) =>
    node
      .getRisks()
      .filter((risk) => risk.severity !== 'info')
      .map((risk) => `${node.nodeName}: ${risk.title}`),
  );

describe('library app risks', () => {
  it('opens the welcome app for new users without a risk review', () => {
    loadLibraryApp('Welcome to Tailrmade');
    doWithTestController((controller) => {
      expect(blockingRisks(controller), 'welcome app blocking risks').to.be
        .empty;
    });
    shouldWithTestController((controller) => {
      expect(controller.isLoadedAppRunning()).to.equal(true);
    }, PNP_TIMEOUT);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    shouldWithTestController((controller) => {
      const problems = controller
        .getNodes()
        .flatMap((node) =>
          node
            .getWarningsAndErrors()
            .map((status) => `${node.nodeName}: ${status.message}`),
        );
      expect(problems, 'welcome app node problems').to.be.empty;
    });
  });

  it('starts a library app with main-thread code only after approval', () => {
    loadLibraryApp('Get dominant colors from images');
    doWithTestController((controller) => {
      expect(blockingRisks(controller), 'blocking risks').not.to.be.empty;
      expect(controller.isLoadedAppRunning()).to.equal(false);
    });
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    approveLoadedTestApp();
  });
});
