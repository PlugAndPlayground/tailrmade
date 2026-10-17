import {
  doWithTestController,
  openNewGraph,
  serializedNode,
  serializedSocket,
  shouldWithTestController,
} from '../helpers';
import type { StoredGraph } from '../../../../../src/utils/indexedDB';

describe('app startup after risk review', () => {
  let stored: StoredGraph;

  beforeEach(() => {
    cy.viewport(1280, 900);
    openNewGraph();
    cy.window().then((win) => {
      Object.keys(win.localStorage)
        .filter((key) => key.startsWith('tailrmade.app-approval.'))
        .forEach((key) => win.localStorage.removeItem(key));
    });
    doWithTestController(async (controller) => {
      await controller.addNode('UISurfaceNode', 'startup-surface', 400, 0);
      await controller.addNode('Label', 'startup-label', 0, 0);
      await controller.connectNodesByID(
        'startup-label',
        'startup-surface',
        'ReactUI',
      );
      await controller.waitForPendingExecution();
      stored = controller.getGraph().getSerializedStoredGraph();
      stored.graphData.nodes.push({
        ...serializedNode('customfunction', 'startup-code', [
          serializedSocket('Code', '() => 7', 'CodeType'),
          serializedSocket('Main Thread', true, 'BooleanType'),
        ]),
        version: 3,
      });
    });
  });

  const load = () =>
    doWithTestController((controller) =>
      controller.getGraph().configure(structuredClone(stored)),
    );

  const expectDashboard = () => {
    shouldWithTestController((controller) => {
      expect(controller.getGraph().serialize().overlay.dashboard).to.deep.equal(
        stored.graphData.overlay.dashboard,
      );
      expect(
        controller.getNodeByID('startup-code').debug_timesExecuted,
      ).to.be.greaterThan(0);
    });
  };

  ['visible', 'maximized', 'fullscreen', 'hidden'].forEach((mode) => {
    it(`restores the ${mode} dashboard after approval and on trusted reload`, () => {
      cy.then(() => {
        stored.graphData.overlay.dashboard = {
          ...stored.graphData.overlay.dashboard,
          visible: mode !== 'hidden',
          maximized: mode === 'maximized',
          fullscreen: mode === 'fullscreen',
          widthPercentage: 45,
        };
      });
      load();
      cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
      shouldWithTestController((controller) => {
        expect(
          controller.getGraph().serialize().overlay.dashboard,
        ).to.deep.equal(stored.graphData.overlay.dashboard);
        expect(
          controller.getNodeByID('startup-code').debug_timesExecuted,
        ).to.equal(0);
      });
      if (mode !== 'hidden') {
        cy.get('[data-cy="app-risk-dialog"] [role="dialog"]').should(
          'have.attr',
          'aria-modal',
          'true',
        );
      }
      cy.get(
        '[data-cy="go-to-risk-node"][data-node-id="startup-code"]',
      ).click();
      cy.get('[data-cy="app-risk-dialog"]').should(
        'have.attr',
        'aria-modal',
        'false',
      );
      shouldWithTestController((controller) => {
        expect(
          controller.getNodeByID('startup-code').debug_timesExecuted,
        ).to.equal(0);
        expect(
          controller.getGraph().serialize().overlay.dashboard.visible,
        ).to.equal(false);
      });
      cy.get('[data-cy="run-reviewed-app"]').click();
      cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
      expectDashboard();
      cy.get('[data-cy="dashboard-column"]').should(
        mode === 'hidden' ? 'not.be.visible' : 'be.visible',
      );
      load();
      expectDashboard();
      cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    });
  });

  it('restores the dashboard when approval follows Keep inspecting', () => {
    cy.then(() => {
      stored.graphData.overlay.dashboard.visible = true;
      stored.graphData.overlay.dashboard.fullscreen = true;
    });
    load();
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
    shouldWithTestController((controller) => {
      expect(
        controller.getGraph().serialize().overlay.dashboard.fullscreen,
      ).to.equal(false);
      expect(
        controller.getNodeByID('startup-code').debug_timesExecuted,
      ).to.equal(0);
    });
    cy.get('[data-cy="start-app"]').click();
    cy.get('[data-cy="run-reviewed-app"]').click();
    expectDashboard();
  });

  [1280, 390].forEach((width) => {
    it(`keeps the dashboard open throughout review and approval at ${width}px`, () => {
      cy.viewport(width, 844);
      cy.then(() => {
        stored.graphData.overlay.dashboard.visible = true;
        stored.graphData.overlay.dashboard.fullscreen = true;
      });
      load();
      cy.get('[data-cy="app-risk-dialog"] [role="dialog"]').should(
        'have.attr',
        'aria-modal',
        'true',
      );
      const expectStartupView = () => {
        shouldWithTestController((controller) => {
          expect(
            controller.getGraph().serialize().overlay.dashboard,
          ).to.deep.equal(stored.graphData.overlay.dashboard);
        });
        if (width < 900) {
          cy.get('[data-cy="stack-view"]').should(
            'have.attr',
            'data-stack-view',
            'ui',
          );
          cy.get('[data-cy="stack-graph-header"]').should('not.exist');
        } else {
          cy.get('[data-cy="canvas-strip"]').should('not.be.visible');
        }
      };
      expectStartupView();
      shouldWithTestController((controller) => {
        expect(
          controller.getNodeByID('startup-code').debug_timesExecuted,
        ).to.equal(0);
      });
      cy.screenshot(`dashboard-risk-review-${width}`);
      cy.get('[data-cy="run-reviewed-app"]').click();
      cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
      expectStartupView();
      expectDashboard();
      cy.get('[data-cy="widget of NODE_startup-label"]').should('be.visible');
    });
  });
});
