import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  doWithTestController,
  getSocketCenterByNodeIDAndSocketName,
  logCypressStep,
  openExistingGraph,
  openNewGraph,
  saveGraph,
  shouldWithTestController,
  zoomToFitAll,
} from '../helpers';

const getVisibleWidget = (selector) =>
  cy.get(selector).filter(':visible').first().should('be.visible');

const getVisibleNodeWidget = () =>
  getVisibleWidget('[data-cy^="widget of NODE_"]');

const getVisibleSocketWidget = () =>
  getVisibleWidget('[data-cy^="widget of SOCKET_"]');

const assertSelectedDashboardElementId = (
  expectedElementId,
  timeout = 8000,
) => {
  logCypressStep(
    'assertSelectedDashboardElementId',
    expectedElementId,
    'ASSERT DASHBOARD SELECT',
  );
  cy.get(`[data-cy="indicatorbox of ${expectedElementId}"]`, {
    timeout,
  }).should('be.visible');

  waitForDashboardSelectionToSettle();
  cy.wait(50);
};

const selectDashboardItemByElementId = (elementId) => {
  logCypressStep(
    'selectDashboardItemByElementId',
    elementId,
    'SELECT DASHBOARD ITEM',
  );
  cy.get('body').then(($body) => {
    const widget = $body.find(`[data-cy="widget of ${elementId}"]:visible`);

    if (widget.length > 0) {
      cy.wrap(widget.first()).click({ force: true });
      return;
    }

    doWithTestController((testController) => {
      testController.selectDashboardItemByElementId(elementId);
    });
  });

  waitForDashboardSelectionToSettle();
};

const assertNoVisibleWidgets = (selector) => {
  cy.get('body').should(($body) => {
    expect($body.find(`${selector}:visible`).length).to.eq(0);
  });
};

const getWidgetRect = (getWidget) =>
  getWidget().then(($widget) => $widget[0].getBoundingClientRect());

const waitForDashboardSelectionToSettle = () => {
  logCypressStep(
    'waitForDashboardSelectionToSettle',
    'double animation frame',
    'WAIT DASHBOARD',
  );
  cy.window().then(
    (win) =>
      new Cypress.Promise<void>((resolve) => {
        win.requestAnimationFrame(() => {
          win.requestAnimationFrame(() => resolve());
        });
      }),
  );
};

const assertNodesCount = (expectedCount) => {
  logCypressStep('assertNodesCount', String(expectedCount), 'ASSERT NODES');
  doWithTestController((testController) => {
    expect(testController.getNodes().length).to.eq(expectedCount);
  });
};

const pressUndo = () => {
  cy.realPress(
    Cypress.platform === 'darwin' ? ['Meta', 'Z'] : ['Control', 'Z'],
  );
};

const pressRedo = () => {
  if (Cypress.platform === 'darwin') {
    cy.realPress(['Meta', 'Shift', 'Z']);
    return;
  }

  cy.realPress(['Control', 'Y']);
};

const dispatchDashboardKey = (key, options = {}) => {
  logCypressStep('dispatchDashboardKey', key, 'DASHBOARD KEY');
  waitForDashboardSelectionToSettle();
  cy.window().then((win) => {
    win.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  });
};

const setupDashboardTestNodes = () => {
  logCypressStep('setupDashboardTestNodes', '', 'SETUP DASHBOARD');
  const htmlNodeId = 'teal-tiger-01';
  const buttonNodeId = 'blue-whale-02';

  doWithTestController(async (testController) => {
    await testController.addNode('HtmlRenderer', htmlNodeId, 0, -300);
    await testController.addNode('WidgetButton', buttonNodeId, 0, -100);
  });

  addToDashboard(htmlNodeId);
  addToDashboard(buttonNodeId);

  return { htmlNodeId, buttonNodeId };
};

const shiftClickSocket = (nodeId, socketName) => {
  logCypressStep(
    'shiftClickSocket',
    `${nodeId}:${socketName}`,
    'SHIFT CLICK SOCKET',
  );
  if (!Cypress.$('#custom-mouse-pointer').length) {
    cy.showMousePosition();
  }

  getSocketCenterByNodeIDAndSocketName(nodeId, socketName).then(([x, y]) => {
    cy.get('#pixi-container').click(x, y, { shiftKey: true });
  });

  // assert the effect instead of the socket_shift_clicked debug toast: the
  // toast queue is capped and can drop it (e.g. right after a cold start)
  cy.get(`[data-cy="widget of SOCKET_${nodeId}::in::${socketName}"]`, {
    timeout: 10000,
  }).should('exist');
};

describe('Test dashboard', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('Opens and closes an empty dashboard', () => {
    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });

    cy.get('[data-cy="dashboard"]')
      .should('be.visible')
      .and('contain.text', 'Create user interface');

    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.get('[data-cy="dashboard"]').should('not.be.visible');
  });

  it('Adds a node and a socket widget to the dashboard from the graph', () => {
    const hybridNodeId = 'orange-stingray-61';
    const socketNodeId = 'red-bull-42';

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketNodeId, 300, -500);
      await testController.addNode('IFrameRenderer', hybridNodeId);
    });

    shiftClickSocket(socketNodeId, 'String');
    addToDashboard(hybridNodeId);

    cy.get('[data-cy="dashboard"]')
      .should('be.visible')
      .and('not.contain.text', 'Create user interface');

    getVisibleNodeWidget().click({ force: true });
    cy.get('[data-cy="indicatorbox-inspector-widget-btn"]')
      .should('be.visible')
      .click({ force: true });
    cy.get('[data-cy="label-switch"]').first().click({ force: true });
    getVisibleNodeWidget().should('contain.text', 'IFrame renderer');

    getVisibleNodeWidget().realHover();
    cy.get('[data-cy="indicatorbox-delete-widget-btn"]')
      .should('be.visible')
      .click({ force: true });
    assertNoVisibleWidgets('[data-cy^="widget of NODE_"]');

    getVisibleSocketWidget().should('be.visible');
    getVisibleSocketWidget().realHover();
    cy.get('[data-cy="indicatorbox-delete-widget-btn"]')
      .should('be.visible')
      .click({ force: true });
    assertNoVisibleWidgets('[data-cy^="widget of SOCKET_"]');

    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    cy.get('[data-cy="dashboard"]')
      .should('be.visible')
      .and('contain.text', 'Create user interface');
  });

  it('Moves a widget on the dashboard', () => {
    const hybridNodeId = 'orange-stingray-61';
    const socketNodeId = 'red-bull-42';

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketNodeId, 250, -500);
      await testController.addNode('IFrameRenderer', hybridNodeId);
    });

    shiftClickSocket(socketNodeId, 'String');
    addToDashboard(hybridNodeId);

    cy.get('[data-cy="dashboard"]').should('be.visible');
    getVisibleNodeWidget().should('be.visible');
    getVisibleSocketWidget().should('be.visible');

    let expectedFinallyNodeAboveSocket;

    // retries until both widgets are visible and their vertical order matches
    const assertWidgetOrder = () => {
      cy.get('body').should(($body) => {
        const nodeWidget = $body
          .find('[data-cy^="widget of NODE_"]:visible')
          .first();
        const socketWidget = $body
          .find('[data-cy^="widget of SOCKET_"]:visible')
          .first();
        expect(nodeWidget.length, 'a node widget is visible').to.eq(1);
        expect(socketWidget.length, 'a socket widget is visible').to.eq(1);
        const nodeAboveSocket =
          nodeWidget[0].getBoundingClientRect().top <
          socketWidget[0].getBoundingClientRect().top;
        expect(nodeAboveSocket, 'node widget above socket widget').to.eq(
          expectedFinallyNodeAboveSocket,
        );
      });
    };

    getWidgetRect(getVisibleNodeWidget).then((initialNodeBox) => {
      getWidgetRect(getVisibleSocketWidget).then((initialSocketBox) => {
        const initiallyNodeAboveSocket =
          initialNodeBox.top < initialSocketBox.top;
        expectedFinallyNodeAboveSocket = !initiallyNodeAboveSocket;

        // the move buttons only render inside the SELECTED widget's
        // indicator box, so select the node widget first and scope the
        // button lookup to its box (a global selector can hit the other
        // widget's box and reorder the wrong item)
        getVisibleNodeWidget().click({ force: true });
        cy.get(`[data-cy="indicatorbox of NODE_${hybridNodeId}"]`)
          .find(
            initiallyNodeAboveSocket
              ? '[data-cy="indicatorbox-move-down-widget-btn"]'
              : '[data-cy="indicatorbox-move-up-widget-btn"]',
          )
          .should('be.visible')
          .click({ force: true });

        assertWidgetOrder();

        // the editor persists layout edits into the surface's 'Layout JSON'
        // socket with a debounce; toggling edit mode before that flush
        // reloads the stale persisted tree and reverts the move, so wait
        // until the new order has been persisted
        shouldWithTestController((testController) => {
          const surface = testController
            .getNodes()
            .find((node) => node.isSurface());
          expect(surface, 'a surface node exists').to.not.eq(undefined);
          const tree = testController.getNodeInputValue(
            surface.id,
            'Layout JSON',
          ).tree;
          const rootNodes: string[] = tree.ROOT.nodes;
          const nodeIndex = rootNodes.findIndex((itemId) =>
            tree[itemId]?.props?.id?.startsWith('NODE_'),
          );
          const socketIndex = rootNodes.findIndex((itemId) =>
            tree[itemId]?.props?.id?.startsWith('SOCKET_'),
          );
          expect(nodeIndex, 'node widget persisted').to.be.at.least(0);
          expect(socketIndex, 'socket widget persisted').to.be.at.least(0);
          expect(
            nodeIndex < socketIndex,
            'persisted node widget above socket widget',
          ).to.eq(expectedFinallyNodeAboveSocket);
        });
      });
    });

    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });

    assertWidgetOrder();
  });

  const addDashboardContent = () => {
    const hybridNodeId = 'orange-stingray-61';
    const socketNodeId = 'red-bull-42';

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketNodeId, 250, -500);
      await testController.addNode('IFrameRenderer', hybridNodeId);
    });

    shiftClickSocket(socketNodeId, 'String');
    addToDashboard(hybridNodeId);
    cy.get('[data-cy="dashboard"]').should('be.visible');
  };

  it('Maximizes, saves, and reopens still maximized with the editor intact', () => {
    addDashboardContent();

    cy.get('[data-cy="maximise-dashboard-btn"]').first().click({ force: true });
    cy.get('[data-cy="shrink-dashboard-btn"]').first().should('be.visible');
    // maximising happens INSIDE the editor, so its chrome stays put
    cy.get('[data-cy="shell-rail"]').should('be.visible');
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().should('be.visible');

    saveGraph();
    openExistingGraph();

    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="shrink-dashboard-btn"]').first().should('be.visible');
    cy.get('[data-cy="shell-rail"]').should('be.visible');
    cy.get('[data-cy="toggle-dashboard-btn"]').should('be.visible');
    // maximised is not app view - no exit logo
    cy.get('[data-cy="app-view-exit-button"]').should('not.exist');

    // shrinking back is persisted too
    cy.get('[data-cy="shrink-dashboard-btn"]').first().click({ force: true });
    cy.get('[data-cy="maximise-dashboard-btn"]').first().should('be.visible');

    saveGraph();
    openExistingGraph();

    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="maximise-dashboard-btn"]').first().should('be.visible');
    cy.get('[data-cy="toggle-dashboard-btn"]').should('be.visible');
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().should('be.visible');
  });

  it('Saves in app view and reopens as the app', () => {
    addDashboardContent();

    cy.get('[data-cy="toggle-app-button"]').click({ force: true });

    // app view is zero chrome: the rail is unmounted, not just hidden, so no
    // editor control exists in the running app's DOM
    cy.get('[data-cy="app-view-exit-button"]').should('be.visible');
    cy.get('[data-cy="shell-rail"]').should('not.exist');
    cy.get('[data-cy="toggle-dashboard-btn"]').should('not.exist');
    cy.get('[data-cy="toggle-edit-mode-btn"]').should('not.exist');

    saveGraph();
    openExistingGraph();

    // an app saved in app view opens as the app
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="app-view-exit-button"]').should('be.visible');
    cy.get('[data-cy="shell-rail"]').should('not.exist');
    cy.get('[data-cy="toggle-dashboard-btn"]').should('not.exist');
    cy.get('[data-cy="toggle-edit-mode-btn"]').should('not.exist');

    // the exit logo is the only way back into the editor
    cy.get('[data-cy="app-view-exit-button"]').click({ force: true });
    cy.get('[data-cy="shell-rail"]').should('be.visible');
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().should('be.visible');

    saveGraph();
    openExistingGraph();

    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="app-view-exit-button"]').should('not.exist');
    cy.get('[data-cy="toggle-dashboard-btn"]').should('be.visible');
  });

  it('Clears the dashboard', () => {
    const hybridNodeId = 'orange-stingray-61';
    const socketNodeId = 'red-bull-42';

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketNodeId, 250, -500);
      await testController.addNode('IFrameRenderer', hybridNodeId);
    });

    assertNodesCount(2);

    shiftClickSocket(socketNodeId, 'String');
    addToDashboard(hybridNodeId);

    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });

    getVisibleNodeWidget().should('be.visible');

    doWithTestController(async (testController) => {
      await testController.clear();
      testController.setShowUnsavedChangesWarning(false);
    });
    cy.contains('graph_cleared', { timeout: 10000 }).should('exist');

    cy.get('[data-cy="dashboard"]')
      .should('be.visible')
      .and('contain.text', 'Create user interface');
    assertNoVisibleWidgets('[data-cy^="widget of NODE_"]');
    assertNoVisibleWidgets('[data-cy^="widget of SOCKET_"]');
    assertNodesCount(0);
  });

  it('Creates a new app with empty dashboard when clicking Create new app button', () => {
    const hybridNodeId = 'orange-stingray-61';
    const socketNodeId = 'red-bull-42';

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketNodeId, 250, -500);
      await testController.addNode('IFrameRenderer', hybridNodeId);
    });

    assertNodesCount(2);

    shiftClickSocket(socketNodeId, 'String');
    addToDashboard(hybridNodeId);

    cy.get('[data-cy="dashboard"]').should('be.visible');

    saveGraph();

    cy.get('[data-cy="createNewAppButton"]')
      .should('be.visible')
      .click({ force: true });
    cy.contains('Created new empty app', { timeout: 10000 }).should('exist');
    cy.url().should('not.include', 'loadLocalGraph');
    cy.url().should('not.include', 'loadLocalGraph=');

    assertNodesCount(0);
    cy.get('[data-cy="dashboard"]').should('not.be.visible');
  });
  it('Adds a node and a socket widget to the dashboard', () => {
    const existingNodeId = 'orange-stingray-61';

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', existingNodeId, 0, -300);
    });

    assertNodesCount(1);

    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });

    // the toolbox is docked open on a wide dashboard and closed on a narrow
    // one, where it opens as an overlay - either way the header button is
    // what shows it, so only click it when it is not already showing
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="vertical-toolbox"]:visible').length === 0) {
        cy.get('[data-cy="toggle-toolbox-btn"]').click({ force: true });
      }
    });

    cy.get('[data-cy="vertical-toolbox"]').should('be.visible');

    cy.get('[data-cy="tool-vertical-container"]').click({ force: true });
    cy.get('[data-cy="tool-text"]').click({ force: true });
    cy.contains('Hello world').should('be.visible');

    cy.get(`[data-cy="layoutable-node-${existingNodeId}"]`).click({
      force: true,
    });

    // entering edit mode on an empty dashboard auto-creates a UI surface
    // node, so the graph now holds the HtmlRenderer + the surface
    assertNodesCount(2);
    cy.get(`[data-cy="widget of NODE_${existingNodeId}"]`).should('be.visible');
    cy.contains('Hello world').should('be.visible');
  });

  // it('Moves widgets up and down using keyboard shortcuts', () => {
  //   const { buttonNodeId } = setupDashboardTestNodes();

  //   const widgetSelector = `[data-cy="widget of NODE_${buttonNodeId}"]`;
  //   selectDashboardItemByElementId(`NODE_${buttonNodeId}`);
  //   assertSelectedDashboardElementId(`NODE_${buttonNodeId}`);

  //   getWidgetRect(() => cy.get(widgetSelector).first()).then((initialBox) => {
  //     dispatchDashboardKey('ArrowUp', { altKey: true });
  //     cy.wait(300);

  //     getWidgetRect(() => cy.get(widgetSelector).first()).then((movedUpBox) => {
  //       expect(movedUpBox.top).to.be.lessThan(initialBox.top);

  //       dispatchDashboardKey('ArrowDown', { altKey: true });
  //       cy.wait(300);

  //       getWidgetRect(() => cy.get(widgetSelector).first()).then(
  //         (movedDownBox) => {
  //           expect(Math.abs(movedDownBox.top - initialBox.top)).to.be.lessThan(
  //             10,
  //           );

  //           selectDashboardItemByElementId(`NODE_${buttonNodeId}`);
  //           assertSelectedDashboardElementId(`NODE_${buttonNodeId}`);
  //           cy.get('[data-cy="indicatorbox-move-up-widget-btn"]').click({
  //             force: true,
  //           });
  //           cy.wait(300);

  //           getWidgetRect(() => cy.get(widgetSelector).first()).then(
  //             (buttonMoveBox) => {
  //               expect(buttonMoveBox.top).to.be.lessThan(movedDownBox.top);
  //             },
  //           );
  //         },
  //       );
  //     });
  //   });
  // });
  // it('Navigates between widgets using arrow keys', () => {
  //   const { htmlNodeId, buttonNodeId } =
  //     setupDashboardTestNodes();

  //   selectDashboardItemByElementId(`NODE_${htmlNodeId}`);
  //   assertSelectedDashboardElementId(`NODE_${htmlNodeId}`);

  //   dispatchDashboardKey('ArrowDown');
  //   assertSelectedDashboardElementId(`NODE_${buttonNodeId}`);

  //   selectDashboardItemByElementId(`NODE_${buttonNodeId}`);
  //   assertSelectedDashboardElementId(`NODE_${buttonNodeId}`);

  //   dispatchDashboardKey('ArrowDown');
  //   assertSelectedDashboardElementId(`NODE_${buttonNodeId}`);

  //   dispatchDashboardKey('ArrowUp');
  //   assertSelectedDashboardElementId(`NODE_${htmlNodeId}`);
  // });
  it('Supports undo and redo operations', () => {
    // dashboard edits are undoable via the app-wide undo stack when the
    // layout lives in a UI surface node (legacy layouts are not undoable)
    doWithTestController(async (testController) => {
      await testController.addNode(
        'UISurfaceNode',
        'undo-surface-01',
        600,
        300,
      );
      await testController.waitForPendingExecution();
    });
    const { htmlNodeId } = setupDashboardTestNodes();

    const widgetSelector = `[data-cy="widget of NODE_${htmlNodeId}"]`;

    // In surface mode a node widget is added by connecting the node to the
    // surface, so editing the layout (here: deleting the widget) is recorded
    // on the app-wide undo stack. The widget starts present from setup.
    cy.get(widgetSelector).filter(':visible').should('have.length', 1);

    // delete the widget -> disconnects from the surface
    cy.get(widgetSelector).filter(':visible').first().click({ force: true });
    // the Delete key only acts on the selected item, so wait for the click
    // to have registered as a selection before pressing it
    cy.get(`[data-cy="indicatorbox of NODE_${htmlNodeId}"]`).should(
      'be.visible',
    );
    cy.realPress('Delete');
    cy.get(widgetSelector).should('not.exist');

    // undo restores the widget (and its connection)
    pressUndo();
    cy.get(widgetSelector).filter(':visible').should('have.length', 1);

    // redo removes it again
    pressRedo();
    cy.get(widgetSelector).should('not.exist');

    // leave the dashboard in a restored state
    pressUndo();
    cy.get(widgetSelector).filter(':visible').should('have.length', 1);
  });
});
