import { VISIBILITY_ACTION } from '../../../../src/utils/constants_shared';
import type TestController from '../../../../src/TestController';

// Long timeouts exist for the slow CI machines. Locally you can iterate
// faster by shortening them, e.g. CYPRESS_pnpTimeout=15000 yarn cy:run ...
export const PNP_TIMEOUT = Number(Cypress.env('pnpTimeout') ?? 120000);

export function doWithTestController<T>(
  inFunction: (testController: TestController) => T,
) {
  return cy
    .window()
    .its('testController', { timeout: PNP_TIMEOUT })
    .then({ timeout: PNP_TIMEOUT }, (testController) =>
      inFunction(testController as TestController),
    );
}

// Retries a testController assertion until it passes (unlike
// doWithTestController, whose callback runs only once).
export function shouldWithTestController(
  assertion: (testController: TestController) => void,
  timeout = 15000,
) {
  cy.window()
    .its('testController', { timeout })
    .should((testController) => assertion(testController as TestController));
}

/**
 * Resolves with screen coordinates once they stop changing between animation
 * frames. This replaces fixed waits: node additions, viewport pans/zooms,
 * drawer open/close transitions and the hybrid-node DOM containers (which
 * follow the canvas one requestAnimationFrame late) all settle within a few
 * frames, after which clicking at the returned position is safe.
 */
export const getStableScreenCoordinates = (
  getCoordinates: (
    testController: TestController,
  ) => [number, number] | null | undefined,
  timeout = 15000,
) =>
  cy
    .window()
    .its('testController', { timeout: PNP_TIMEOUT })
    .then({ timeout: timeout + 1000 }, (testController) =>
      cy.window({ log: false }).then({ timeout: timeout + 1000 }, (win) => {
        const startTime = Date.now();
        return new Cypress.Promise<[number, number]>((resolve, reject) => {
          let previous: [number, number] | null = null;
          let stableFrames = 0;

          const step = () => {
            let current: [number, number] | null = null;
            try {
              current =
                getCoordinates(testController as TestController) ?? null;
            } catch {
              current = null;
            }

            if (
              current !== null &&
              previous !== null &&
              Math.abs(current[0] - previous[0]) <= 0.5 &&
              Math.abs(current[1] - previous[1]) <= 0.5
            ) {
              stableFrames += 1;
            } else {
              stableFrames = 0;
            }
            previous = current;

            if (current !== null && stableFrames >= 2) {
              resolve(current);
              return;
            }
            if (Date.now() - startTime > timeout) {
              reject(
                new Error(
                  `Screen coordinates did not settle within ${timeout}ms`,
                ),
              );
              return;
            }
            win.requestAnimationFrame(step);
          };
          step();
        });
      }),
    );

// resolves once the element's bounding rect stops changing between animation
// frames — use before viewport-dependent actions when a drawer/panel resize
// (CSS transition or staged state updates) may still be in flight
export const waitForStableRect = (selector: string, timeout = 15000) =>
  cy.get(selector).then({ timeout: timeout + 1000 }, ($element) =>
    cy.window({ log: false }).then({ timeout: timeout + 1000 }, (win) => {
      const startTime = Date.now();
      return new Cypress.Promise<void>((resolve, reject) => {
        let previous: DOMRect | null = null;
        let stableFrames = 0;

        const step = () => {
          const rect = $element[0].getBoundingClientRect();
          if (
            previous !== null &&
            Math.abs(rect.left - previous.left) <= 0.5 &&
            Math.abs(rect.top - previous.top) <= 0.5 &&
            Math.abs(rect.width - previous.width) <= 0.5 &&
            Math.abs(rect.height - previous.height) <= 0.5
          ) {
            stableFrames += 1;
          } else {
            stableFrames = 0;
          }
          previous = rect;

          if (stableFrames >= 2) {
            resolve();
            return;
          }
          if (Date.now() - startTime > timeout) {
            reject(
              new Error(
                `Rect of ${selector} did not settle within ${timeout}ms`,
              ),
            );
            return;
          }
          win.requestAnimationFrame(step);
        };
        step();
      });
    }),
  );

export function controlOrMetaKey() {
  return Cypress.platform === 'darwin' ? '{meta}' : '{ctrl}';
}

export const logCypressStep = (
  name: string,
  message?: string | string[],
  displayName?: string,
) => {
  cy.wrap(null, { log: false }).then(() => {
    Cypress.log({
      name,
      message,
      displayName: displayName ?? name.toUpperCase(),
    });
  });
};

export function areCoordinatesClose(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  marginOfError = 1,
) {
  console.log(x1, y1, x2, y2);
  const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  return distance <= marginOfError;
}

export const getDeleteDialog = () => cy.get('[data-cy="deleteDialog"]');
export const getEditDialog = () => cy.get('[data-cy="editDialog"]');

export const waitForDeleteDialogToClose = () => {
  getDeleteDialog().should('not.exist');
};

export function saveGraph() {
  cy.get('body').type(`${controlOrMetaKey()}s`);
  cy.get('body').contains('was saved', { timeout: 10000 }).should('exist');
}

export function openEditGraph() {
  cy.get('body').type(`${controlOrMetaKey()}e`);
  cy.wait(200); // wait for text to be selected
}

export const exitDashboardEditMode = () => {
  logCypressStep(
    'exitDashboardEditMode',
    'EditIcon visible',
    'EXIT DASHBOARD EDIT',
  );

  cy.get('body').then(($body) => {
    if (
      $body.find(
        '[data-cy="toggle-edit-mode-btn"] svg[data-testid="CloseIcon"]',
      ).length > 0
    ) {
      cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    }
  });

  cy.get('[data-cy="toggle-edit-mode-btn"] svg[data-testid="EditIcon"]')
    .first()
    .should('be.visible');
  cy.get(
    '[data-cy="toggle-edit-mode-btn"] svg[data-testid="CloseIcon"]',
  ).should('not.exist');
};

export const openGraphsList = () => {
  doWithTestController((testController) => {
    testController.toggleLeftSideDrawer(VISIBILITY_ACTION.OPEN);
  });

  cy.get('#graphs-list', { timeout: 10000 }).should('be.visible');
};

export const closeGraphsList = () => {
  doWithTestController((testController) => {
    testController.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
  });

  cy.get('#graphs-list', { timeout: 10000 }).should('not.exist');
};

export const closeRightSideDrawer = () => {
  doWithTestController((testController) => {
    testController.toggleRightSideDrawer(VISIBILITY_ACTION.CLOSE);
  });

  cy.get('#right-side-drawer', { timeout: 10000 }).should('not.exist');
};

export const closeBothDrawers = () => {
  closeGraphsList();
  closeRightSideDrawer();
};

export const dragFromAtoB = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  wait = false,
  button: 'left' | 'middle' | 'right' = 'left',
) => {
  const preDragPauseMs = wait ? 2000 : 0;
  const postDragPauseMs = wait ? 1000 : 0;

  if (!Cypress.$('#custom-mouse-pointer').length) {
    cy.showMousePosition();
  }

  cy.get('#pixi-container')
    .realMouseMove(startX, startY)
    .wait(preDragPauseMs)
    .realMouseDown({ x: startX, y: startY, button: button as any }) // Include button option
    .realMouseMove(endX, endY)
    .realMouseUp({ x: endX, y: endY, button: button as any }); // Ensure to release the same button
  cy.wait(postDragPauseMs);
};

export const addFirstTwoNodes = () => {
  doWithTestController(async (testController) => {
    testController.setShowUnsavedChangesWarning(false);
    await testController.addNode('Constant', 'Constant1');
    await testController.addNode('Constant', 'Constant2');
  });
  doWithTestController(async (testController) => {
    await testController.moveNodeByID('Constant2', 230, 0);
    await testController.connectNodesByID(
      'Constant1',
      'Constant2',
      'Out',
      'In',
    );
  });
};

export const addTwoNodes = () => {
  doWithTestController(async (testController) => {
    await testController.addNode('Constant', 'Constant3');
    await testController.addNode('Constant', 'Constant4');
  });
};

export const moveTwoNodes = () => {
  doWithTestController(async (testController) => {
    await testController.moveNodeByID('Constant3', 0, -100);
    await testController.moveNodeByID('Constant4', 230, -100);
  });
};

type ClearGraphOptions = {
  resetDashboard?: boolean;
};

export const clearGraph = ({
  resetDashboard = true,
}: ClearGraphOptions = {}) => {
  cy.get('body').type('{esc}');
  doWithTestController(async (testController) => {
    await testController.clear();
    if (resetDashboard) {
      testController.resetDashboardState();
    }
    testController.setShowUnsavedChangesWarning(false);
  });
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(() => resolve());
        });
      }),
  );
  cy.get('body').contains('graph_cleared', { timeout: 10000 }).should('exist');
};

export const beforeEachMouseInteraction = () => {
  clearGraph();
  doWithTestController(async (testController) => {
    await testController.addNode('Constant', 'Constant1');
    await testController.addNode('Constant', 'Constant2');
  });
  doWithTestController(async (testController) => {
    testController.moveNodeByID('Constant2', 230, 0);
    await testController.connectNodesByID(
      'Constant1',
      'Constant2',
      'Out',
      'In',
    );
  });
  cy.showMousePosition();
};

export const afterEachMouseInteraction = () => {
  if (Cypress.$('#custom-mouse-pointer').length) {
    Cypress.$('#custom-mouse-pointer').remove();
  }
};

export const clickEditButtonOfGraph = (graphName: string) => {
  cy.get(`[data-cy="hover-${graphName}"]`)
    .find(`[data-cy="editButton"]`)
    .click({ force: true });
};

export const completeDeleteAction = (graphName: string) => {
  clickDeleteButtonOfGraph(graphName);
  getDeleteDialog()
    .find('[data-cy="deleteDialogDeleteButton"]')
    .click({ force: true });
  waitForDeleteDialogToClose();
};

export const clickDeleteButtonOfGraph = (graphName: string) => {
  // First ensure the graph item is visible and ready
  cy.get('body').contains(`${graphName}`, { timeout: 10000 }).should('exist');

  // The row can be covered by fixed UI while the action buttons still exist.
  // Force-click the scoped delete button to avoid hover/actionability flakes.
  cy.get(`[data-cy="hover-${graphName}"]`, { timeout: 10000 })
    .should('exist')
    .within(() => {
      cy.get(`[data-cy="deleteButton"]`, { timeout: 5000 }).click({
        force: true,
      });
    });
};

export const waitForGraphToBeReady = () => {
  cy.get('body')
    .contains('App was loaded', { timeout: PNP_TIMEOUT })
    .should('exist');
};

// slow visit
export const openExistingGraph = () => {
  cy.reload();
  waitForGraphToBeReady();
  doWithTestController(async (testController) => {
    await testController.setShowUnsavedChangesWarning(false);
  });
};

const prepareLoadedGraph = () => {
  doWithTestController(async (testController) => {
    await testController.setShowUnsavedChangesWarning(false);
  });
  cy.get('body')
    .contains('startup_complete', { timeout: 90000 })
    .should('exist');
  // The shell shows one of two logo buttons depending on the view the graph
  // opens in: the rail's toggle in build view, the exit button in app view
  // (apps saved with the dashboard fullscreen open straight into app view).
  // Either one means the shell is mounted and all toggles are ready.
  cy.get('[data-cy="toggle-app-button"], [data-cy="app-view-exit-button"]', {
    timeout: PNP_TIMEOUT,
  }).should('be.visible');
};

export const reloadGraph = () => {
  logCypressStep('reloadGraph', 'Reload graph');
  cy.reload();
  waitForGraphToBeReady();
};

export const loginWithTestAccount = (
  clickAway = true,
  forceRelogin = false,
) => {
  const testEmail =
    Cypress.env('TEST_EMAIL') ||
    Cypress.env('CYPRESS_TEST_EMAIL') ||
    'cypress-test@tailrmade.app';

  loginWithCredentials(testEmail, 'testing', clickAway, forceRelogin);
};

export const loginWithCredentials = (
  email: string,
  password: string,
  clickAway = true,
  forceRelogin = false,
) => {
  let submittedLogin = false;

  cy.get('[data-cy="auth-button"]').click({ force: true });
  cy.wait(500);
  cy.get('body').should(($body) => {
    const hasVisibleLoginForm =
      $body.find('#email:visible').length > 0 ||
      $body.find('#password:visible').length > 0;
    const hasAccountModal =
      $body.find('[data-cy="sign-out-button"]').length > 0 ||
      $body.text().includes('Log out');
    const hasResetPasswordMode = $body.text().includes('Back to Log in');

    expect(
      hasVisibleLoginForm || hasAccountModal || hasResetPasswordMode,
      'auth dialog state',
    ).to.eq(true);
  });

  cy.get('body').then(($body) => {
    // If sign out is visible, the user is already authenticated in this session.
    if (
      $body.find('[data-cy="sign-out-button"]').length > 0 ||
      $body.text().includes('Log out')
    ) {
      if (forceRelogin) {
        cy.get('[data-cy="sign-out-button"]').click({ force: true });
        cy.get('#email:visible', { timeout: 15000 })
          .should('be.visible')
          .type(email);
        submittedLogin = true;
        cy.get('#password:visible')
          .should('be.visible')
          .click()
          .type(`${password}{enter}`);
      }
      return;
    }

    if ($body.find('#email:visible').length > 0) {
      if (
        $body.find('#password:visible').length === 0 &&
        ($body.find('[data-cy="sign-out-button"]').length > 0 ||
          $body.text().includes('Log out'))
      ) {
        return;
      }

      // In Electron runs, the auth modal can occasionally reopen in reset-password mode.
      if (
        $body.find('#password:visible').length === 0 &&
        $body.text().includes('Back to Log in')
      ) {
        cy.contains('button', 'Back to Log in').click({ force: true });
      }

      if ($body.find('#password:visible').length === 0) {
        return;
      }

      cy.get('#email:visible').should('be.visible').type(email);
      cy.get('body', { timeout: 15000 }).should(($updatedBody) => {
        const hasPasswordInput =
          $updatedBody.find('#password:visible').length > 0;
        const hasAccountModal =
          $updatedBody.find('[data-cy="sign-out-button"]').length > 0 ||
          $updatedBody.text().includes('Log out');

        expect(
          hasPasswordInput || hasAccountModal,
          'password input or logged-in account dialog',
        ).to.eq(true);
      });
      cy.get('body').then(($updatedBody) => {
        if (
          $updatedBody.find('[data-cy="sign-out-button"]').length > 0 ||
          $updatedBody.text().includes('Log out')
        ) {
          return;
        }

        submittedLogin = true;
        cy.get('#password:visible')
          .should('be.visible')
          .click()
          .type(`${password}{enter}`);
      });
      return;
    }

    throw new Error(
      'Authentication dialog did not open and no logged-in profile was detected',
    );
  });

  cy.then(() => {
    if (submittedLogin) {
      cy.get('body')
        .contains('AI assistance', { timeout: 30000 })
        .should('exist'); // this should show up after logging in
      // the "User logged in" confirmation is a toast with a fixed 3s
      // real-time autoHideDuration (see SnackbarProvider in index.tsx); under
      // CPU throttling the surrounding auth work slows down but the toast's
      // dismissal timer doesn't, so it can vanish before this gets checked -
      // assert on the persistent sign-out button instead
      cy.get('[data-cy="sign-out-button"]', { timeout: 30000 }).should('exist');
    }
  });
  // click away
  if (clickAway) {
    cy.get('[data-cy="close-auth-modal-button"]', { timeout: 15000 }).click({
      force: true,
    });
    cy.get('[data-cy="close-auth-modal-button"]').should('not.exist');
  }
};

// override with CYPRESS_pnpBaseUrl to run against a dev server on another port
const PNP_BASE_URL = Cypress.env('pnpBaseUrl') || 'http://127.0.0.1:8080';

export const openNewGraph = () => {
  logCypressStep('openNewGraph', 'new graph');
  cy.visit(`${PNP_BASE_URL}/?new=true&toastEverything=true`, {
    timeout: 90000,
  });
  prepareLoadedGraph();
};

export const openStringifiedGraph = (graph: string) => {
  cy.visit(`${PNP_BASE_URL}/?toastEverything=true&loadFullGraph=` + graph, {
    timeout: 120000,
  });
  prepareLoadedGraph();
};

export const clickNode = (
  nodeId: string,
  options: Partial<Cypress.ClickOptions> = {},
) => {
  logCypressStep('clickNode', nodeId, 'CLICK NODE');
  getStableScreenCoordinates((testController) =>
    testController.getNodeCenterById(nodeId),
  ).then(([x, y]) => {
    cy.get('body').click(x, y, options);
  });
};

export const activateCanvasHybridNode = (nodeId: string) => {
  logCypressStep('activateCanvasHybridNode', nodeId, 'ACTIVATE HYBRID');
  clickNode(nodeId);
  assertOnlySelectedNodeId(nodeId);
  cy.get('body').type('{enter}', { force: true });
};

export const getNodeCenterById = (nodeId: string) =>
  getStableScreenCoordinates((testController) =>
    testController.getNodeCenterById(nodeId),
  );

export const getSocketCenterByNodeIDAndSocketName = (
  nodeId: string,
  socketName: string,
) =>
  getStableScreenCoordinates(
    (testController) =>
      testController.getSocketCenterByNodeIDAndSocketName(
        nodeId,
        socketName,
      ) as [number, number],
  );

export const hoverNode = (nodeId: string) => {
  logCypressStep('hoverNode', nodeId, 'HOVER NODE');
  getNodeCenterById(nodeId).then(([x, y]) => {
    cy.get('#pixi-container').realMouseMove(x, y);
  });
};

export const clickSocket = (
  nodeId: string,
  socketName: string,
  options: Partial<Cypress.ClickOptions> = {},
) => {
  getSocketCenterByNodeIDAndSocketName(nodeId, socketName).then(([x, y]) => {
    cy.get('#pixi-container').click(x, y, options);
  });
};

// polls an app-state predicate once per animation frame and yields whether
// it became true within timeoutMs (a soft check: callers decide what a false
// result means, e.g. retrying a click)
const pollAppState = (
  predicate: (testController: TestController) => boolean,
  timeoutMs = 4000,
) =>
  cy
    .window()
    .its('testController', { timeout: PNP_TIMEOUT })
    .then({ timeout: timeoutMs + 6000 }, (testController) =>
      cy.window({ log: false }).then({ timeout: timeoutMs + 6000 }, (win) => {
        const startTime = Date.now();
        return new Cypress.Promise<boolean>((resolve) => {
          const poll = () => {
            let result = false;
            try {
              result = predicate(testController as TestController);
            } catch {
              result = false;
            }
            if (result) {
              resolve(true);
              return;
            }
            if (Date.now() - startTime > timeoutMs) {
              resolve(false);
              return;
            }
            win.requestAnimationFrame(poll);
          };
          poll();
        });
      }),
    );

// Adds a node to the dashboard through its header buttons (hover -> add ->
// confirm), verifying the outcome of every step. The confirmation is clicked
// WITHOUT re-hovering the node: the pointer already rests on the button
// after the add click, and moving it away fires the button's pointerout
// which cancels the confirmation again. If any step's effect does not
// materialize (the node can shift between reading coordinates and clicking,
// e.g. late drawer/deck layout), the whole add->confirm pair is retried
// from a fresh hover with fresh coordinates.
const addWidgetViaHeaderButtons = (nodeId: string, attemptsLeft = 3) => {
  const widgetExists = () =>
    Cypress.$(`[data-cy="widget of NODE_${nodeId}"]`).length > 0;

  pollAppState(
    (testController) =>
      widgetExists() ||
      testController.isHeaderButtonVisible(nodeId, 'confirmAddToDashboard'),
    0,
  ).then((confirmationAlreadyShowing) => {
    if (widgetExists()) {
      return;
    }

    if (!confirmationAlreadyShowing) {
      hoverNode(nodeId);
      // hovering alone is unreliable when the node's DOM overlay is
      // interactive (it swallows the pointer events before the canvas sees
      // them), so also reveal the header programmatically; the button
      // clicks themselves stay real pointer events
      doWithTestController((testController) => {
        testController.setHeaderVisible(nodeId, true);
      });
      shouldWithTestController((testController) => {
        expect(
          testController.isHeaderButtonVisible(nodeId, 'addToDashboard'),
          `header button addToDashboard of ${nodeId} is visible`,
        ).to.eq(true);
      });
      getStableScreenCoordinates((testController) =>
        testController.getHeaderButtonCenter(nodeId, 'addToDashboard'),
      ).then(([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      });
      pollAppState((testController) =>
        testController.isHeaderButtonVisible(nodeId, 'confirmAddToDashboard'),
      ).then((confirmationShowing) => {
        if (!confirmationShowing) {
          if (attemptsLeft <= 1) {
            throw new Error(
              `clicking addToDashboard of ${nodeId} did not show the confirmation`,
            );
          }
          addWidgetViaHeaderButtons(nodeId, attemptsLeft - 1);
        }
      });
    }

    cy.wrap(null, { log: false }).then(() => {
      if (widgetExists()) {
        return;
      }
      getStableScreenCoordinates((testController) =>
        testController.getHeaderButtonCenter(nodeId, 'confirmAddToDashboard'),
      ).then(([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      });
      pollAppState(() => widgetExists()).then((widgetAdded) => {
        if (!widgetAdded) {
          if (attemptsLeft <= 1) {
            throw new Error(
              `confirming addToDashboard of ${nodeId} did not add the widget`,
            );
          }
          addWidgetViaHeaderButtons(nodeId, attemptsLeft - 1);
        }
      });
    });
  });
};

export const addToDashboard = (nodeId: string) => {
  logCypressStep('addToDashboard', nodeId, 'ADD DASHBOARD');
  doWithTestController((testController) => {
    testController.toggleRightSideDrawer(VISIBILITY_ACTION.CLOSE);
    // an open dashboard covers part of the canvas; pointer events over that
    // area hit the dashboard DOM instead of the node's header buttons, so
    // free the whole canvas first (the add flow reopens the dashboard)
    testController.toggleDashboard(VISIBILITY_ACTION.CLOSE);
  });
  // wait until the dashboard is really closed BEFORE zooming: the zoom
  // compensates for open overlays, so zooming while the close is still
  // pending applies a stale offset and pushes the node out of the window.
  // (no cy.get here: on a fresh graph the dashboard element does not exist)
  cy.get('body').should(($body) => {
    expect(
      $body.find('[data-cy="dashboard"]:visible').length,
      'dashboard closed',
    ).to.eq(0);
  });
  doWithTestController((testController) => {
    testController.zoomToFitNodesById([nodeId]);
  });
  addWidgetViaHeaderButtons(nodeId);
  // adding always opens the dashboard in edit mode and inserts the widget;
  // waiting for that here lets callers continue without fixed waits
  cy.get('[data-cy="dashboard"]').should('be.visible');
  cy.get(`[data-cy="widget of NODE_${nodeId}"]`).should('exist');
  cy.get(
    '[data-cy="toggle-edit-mode-btn"] svg[data-testid="CloseIcon"]',
  ).should('exist');
  // the add flow also selects the new widget on a short delay; wait for it
  // here so the pending selection cannot fire later and steal a selection
  // the test makes itself
  cy.get(`[data-cy="indicatorbox of NODE_${nodeId}"]`, {
    timeout: 10000,
  }).should('be.visible');
  // the reopened dashboard covers part of the canvas; keep the node in the
  // uncovered area for callers that keep interacting with it on the canvas
  doWithTestController((testController) => {
    testController.zoomToFitNodesById([nodeId]);
  });
};

export const assertNodesCount = (
  expectedCount: number,
  timeout = PNP_TIMEOUT,
) => {
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      expect(testController.getNodes().length).to.eq(expectedCount);
    });
};

export const assertNodeCountByType = (
  nodeType: string,
  expectedCount: number,
  timeout = PNP_TIMEOUT,
) => {
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      const nodes = testController.getNodes();
      expect(
        nodes.filter((node: { type: string }) => node.type === nodeType).length,
      ).to.eq(expectedCount);
    });
};

export const assertFocusedNodeId = (
  expectedNodeId: string,
  timeout = PNP_TIMEOUT,
) => {
  logCypressStep('assertFocusedNodeId', expectedNodeId, 'ASSERT FOCUS');
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      const graph = testController.getGraph();
      const activeHybridNode =
        graph.interactionEnabledHybridNode ?? graph.focusedHybridNode;

      expect(activeHybridNode?.id).to.eq(expectedNodeId);
    });
};

export const assertOnlySelectedNodeId = (
  expectedNodeId: string,
  timeout = PNP_TIMEOUT,
) => {
  logCypressStep('assertOnlySelectedNodeId', expectedNodeId, 'ASSERT SELECT');
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      const selectedNodes = testController.getSelectedNodes();

      expect(selectedNodes).to.have.length(1);
      expect(selectedNodes[0]?.id).to.eq(expectedNodeId);
    });
};

export const assertNoFocusedNode = (timeout = PNP_TIMEOUT) => {
  logCypressStep('assertNoFocusedNode', 'none', 'ASSERT NO FOCUS');
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      const graph = testController.getGraph();
      const activeHybridNode =
        graph.interactionEnabledHybridNode ?? graph.focusedHybridNode;

      expect(activeHybridNode).to.eq(undefined);
    });
};

// Function to assert the number of selected nodes
export const assertSelectedNodesCount = (
  expectedCount: number,
  timeout = PNP_TIMEOUT,
) => {
  cy.window()
    .its('testController', { timeout })
    .should((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(expectedCount);
    });
};

export const zoomToFitAll = () => {
  cy.get('body').type('{esc}');
  cy.get('body').type('{shift}1');
};
