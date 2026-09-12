import {
  doWithTestController,
  openGraphWithURLParams,
  openNewGraph,
  shouldWithTestController,
  waitForGraphToBeReady,
} from '../helpers';

describe('Opening imported apps', () => {
  let sharedApp: string;

  const openSharedApp = () => {
    openGraphWithURLParams(`loadFullGraph=${sharedApp}`);
    waitForGraphToBeReady();
  };
  const expectAppNotRun = () =>
    cy.window().then((win) => {
      expect((win as any).importedAppRan).to.equal(undefined);
    });

  before(() => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'sideEffect');
      testController.setNodeInputValue('sideEffect', 'Main Thread', true);
      testController.setNodeInputValue(
        'sideEffect',
        'Code',
        '() => {\n\twindow.importedAppRan = true;\n\treturn 1;\n}',
      );
      sharedApp = testController.getCompressedCurrentGraph();
    });
  });

  it('opens a shared link paused, with nothing run', () => {
    openSharedApp();
    cy.get('[data-cy="appPermissionsSheet"]').should('be.visible');
    cy.get('[data-cy="appPermissionsSheet"]').should(
      'contain',
      'Full access to Tailrmade in this tab',
    );
    expectAppNotRun();
    doWithTestController((testController) => {
      expect(testController.getGraph().paused).to.equal(true);
    });
  });

  it('keeps code blocked when run with full access off', () => {
    cy.get('[data-cy="appPermissionsRunButton"]').click();
    cy.get('[data-cy="appPermissionsSheet"]').should('not.exist');
    cy.get('[data-cy="appPermissionsBadge"]').should(
      'contain',
      'Running with limits (1 off)',
    );
    shouldWithTestController((testController) => {
      expect(
        testController.getNodeByID('sideEffect').status.node.message,
      ).to.equal('Off for this app: running code');
    });
    expectAppNotRun();
  });

  it('runs code once full access is ticked, and remembers that', () => {
    cy.get('[data-cy="appPermissionsBadge"]').click();
    cy.get('[data-cy="appPermission-fullAccess"]').click();
    cy.get('[data-cy="appPermissionsRunButton"]').click();
    cy.window().its('importedAppRan').should('equal', true);

    openSharedApp();
    cy.window().its('importedAppRan').should('equal', true);
    cy.get('[data-cy="appPermissionsSheet"]').should('not.exist');
    cy.get('[data-cy="appPermissionsChrome"]').should('not.exist');
  });
});
