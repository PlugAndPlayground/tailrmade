import { doWithTestController, openNewGraph } from '../helpers';

const getSurfaceTree = (testController) =>
  testController.getNodeInputValue('ui-surface-1', 'Layout JSON').tree;

const getWidgetElementIds = (tree) =>
  Object.values(tree)
    .map((item: any) => item?.props?.id)
    .filter(Boolean);

describe('UI surface node', () => {
  it('adds a UI surface and a label node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'ui-surface-1', 400, 0);
      await testController.addNode('Label', 'test-label-1', -200, 0);
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      expect(testController.getNodeByID('ui-surface-1')).to.not.eq(undefined);
      // the first created surface becomes the default automatically
      expect(testController.getGraph().defaultUISurfaceNodeId).to.eq(
        'ui-surface-1',
      );
      const tree = getSurfaceTree(testController);
      expect(tree.ROOT).to.not.eq(undefined);
      expect(tree.ROOT.nodes.length).to.eq(0);
    });
  });

  it('connecting a label creates an element socket pair and a widget in the tree', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'test-label-1',
        'ui-surface-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const inputNames = testController
        .getInputSockets('ui-surface-1')
        .map((socket) => socket.name);
      expect(inputNames).to.include('Label');
      expect(inputNames).to.include('Label visible');
      expect(inputNames).to.include('Label layout');

      // the paired sockets stay hidden until wired
      const visibleNames = testController
        .getVisibleInputSockets('ui-surface-1')
        .map((socket) => socket.name);
      expect(visibleNames).to.include('Label');
      expect(visibleNames).to.not.include('Label visible');
      expect(visibleNames).to.not.include('Label layout');

      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_test-label-1');
      expect(tree.ROOT.nodes.length).to.eq(1);
    });
  });

  it('shows the widget in the surface preview on the canvas', () => {
    cy.get('[data-cy="surface-renderer"]').should('exist');
    cy.get(
      '[data-cy="surface-renderer"] [data-cy="widget preview of NODE_test-label-1"]',
    ).should('exist');
  });

  it('the surface node is a read-only preview on the canvas (no interaction mode)', () => {
    doWithTestController(async (testController) => {
      const surface = testController.getNodeByID('ui-surface-1');
      // Enter is handled, but instead of entering hybrid interaction mode on
      // the canvas it opens the surface in the DashboardEditor
      expect(surface.onEnterKeyPressed()).to.eq(true);
      await surface.enableInteraction();
      expect(surface.isInteractionEnabled()).to.eq(false);
    });
    cy.get('[data-cy="dashboard"]').should('be.visible');
    // the canvas preview content is rendered non-interactive
    cy.get('#Container-ui-surface-1 [data-cy="surface-renderer"]')
      .first()
      .should('have.css', 'pointer-events', 'none');
    // close the dashboard again so the remaining tests run against the canvas
    doWithTestController((testController) => {
      testController.resetDashboardState();
    });
    cy.get('[data-cy="dashboard"]').should('not.be.visible');
  });

  it('disconnecting removes the widget and the element sockets', () => {
    doWithTestController(async (testController) => {
      await testController.disconnectLink('ui-surface-1', 'Label');
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const inputNames = testController
        .getInputSockets('ui-surface-1')
        .map((socket) => socket.name);
      expect(inputNames).to.not.include('Label');
      expect(inputNames).to.not.include('Label visible');
      expect(inputNames).to.not.include('Label layout');

      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.not.include('NODE_test-label-1');
      expect(tree.ROOT.nodes.length).to.eq(0);

      // the label node itself is untouched
      expect(testController.getNodeByID('test-label-1')).to.not.eq(undefined);
    });
  });

  it('reconnecting restores the widget', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'test-label-1',
        'ui-surface-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_test-label-1');
    });
  });

  it('deleting the connected node removes widget and sockets', () => {
    doWithTestController(async (testController) => {
      await testController.removeNodeAction('test-label-1');
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const inputNames = testController
        .getInputSockets('ui-surface-1')
        .map((socket) => socket.name);
      expect(inputNames).to.not.include('Label');

      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.not.include('NODE_test-label-1');
    });
  });

  it('undoing the node deletion restores widget and connection', () => {
    doWithTestController(async (testController) => {
      await testController.undo();
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      expect(testController.getNodeByID('test-label-1')).to.not.eq(undefined);
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_test-label-1');
      expect(
        testController.getSocketLinks('test-label-1', 'ReactUI').length,
      ).to.eq(1);
    });
  });

  it('UI modal dialog is a surface with modal sockets', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('UIModalNode', 'ui-modal-1', 800, 0);
      await testController.addNode('Label', 'test-label-2', -200, 800);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'test-label-2',
        'ui-modal-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const inputNames = testController
        .getInputSockets('ui-modal-1')
        .map((socket) => socket.name);
      expect(inputNames).to.include('Open');
      expect(inputNames).to.include('Title');
      expect(inputNames).to.include('Layout JSON');
      expect(
        (testController.getNodeByID('ui-modal-1') as any).isSurface(),
      ).to.eq(true);

      // widgets connect like with any surface
      const tree = testController.getNodeInputValue(
        'ui-modal-1',
        'Layout JSON',
      ).tree;
      const ids = Object.values(tree)
        .map((item: any) => item?.props?.id)
        .filter(Boolean);
      expect(ids).to.include('NODE_test-label-2');

      // Is Open output reflects the Open input
      expect(testController.getNodeOutputValue('ui-modal-1', 'Is Open')).to.eq(
        false,
      );
    });
  });

  it('surfaces can nest: connecting a surface to a surface embeds it', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'ui-surface-2', 400, 400);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'ui-surface-2',
        'ui-surface-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_ui-surface-2');
      // a later surface does not steal the default from the first one
      expect(testController.getGraph().defaultUISurfaceNodeId).to.eq(
        'ui-surface-1',
      );
      // embedded surface gets its root Layout socket suppressed
      const visibleNames = testController
        .getVisibleInputSockets('ui-surface-2')
        .map((socket) => socket.name);
      expect(visibleNames).to.not.include('Layout');
    });
  });

  it('blocks embedding a surface into one it already contains (loop guard)', () => {
    // ui-surface-1 already embeds ui-surface-2; embedding ui-surface-1 into
    // ui-surface-2 would form a cycle and must be rejected
    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'ui-surface-1',
        'ui-surface-2',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('ui-surface-1', 'ReactUI').length,
      ).to.eq(0);
      const tree = testController.getNodeInputValue(
        'ui-surface-2',
        'Layout JSON',
      ).tree;
      const ids = Object.values(tree)
        .map((item: any) => item?.props?.id)
        .filter(Boolean);
      expect(ids).to.not.include('NODE_ui-surface-1');
    });
  });

  it('the canvas preview shows browser chrome with a route badge', () => {
    // ui-surface-1 is top-level (not embedded) -> bezel + header + route badge
    cy.get(
      `#Container-ui-surface-1 [data-cy="surface-chrome-route-badge"]`,
    ).should('exist');
    // ui-surface-2 is embedded -> accent rail, no header/badge
    cy.get(
      `#Container-ui-surface-2 [data-cy="surface-chrome-route-badge"]`,
    ).should('not.exist');
  });

  it('the route slug appears in the canvas route badge', () => {
    doWithTestController((testController) => {
      testController.setNodeInputValue('ui-surface-1', 'Route', 'My Home Page');
      // re-render the canvas preview (the inspector edit path does this via
      // socketChangedFromWidget)
      (testController.getNodeByID('ui-surface-1') as any).forceRerender(false);
    });
    doWithTestController((testController) => {
      // slugified on read
      expect(
        (testController.getNodeByID('ui-surface-1') as any).getRouteSlug(),
      ).to.eq('my-home-page');
    });
    cy.get(
      `#Container-ui-surface-1 [data-cy="surface-chrome-route-badge"]`,
    ).should('contain.text', '/my-home-page');
  });
});
