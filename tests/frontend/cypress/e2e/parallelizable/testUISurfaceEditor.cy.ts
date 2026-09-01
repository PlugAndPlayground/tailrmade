import { addToDashboard, doWithTestController, openNewGraph } from '../helpers';

const getSurfaceTree = (testController, surfaceId = 'ui-surface-1') =>
  testController.getNodeInputValue(surfaceId, 'Layout JSON').tree;

const getWidgetElementIds = (tree) =>
  Object.values(tree)
    .map((item: any) => item?.props?.id)
    .filter(Boolean);

// retrying assertion — editor edits reach the graph via a debounced handler
const assertEventually = (
  callback: (testController) => void,
  timeout = 8000,
) => {
  cy.window().its('testController', { timeout }).should(callback);
};

describe('UI surface editing in the dashboard', () => {
  it('setup: add a UI surface and a label node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'ui-surface-1', 600, 0);
      await testController.addNode('Label', 'test-label-1', -200, 0);
      await testController.waitForPendingExecution();
      testController.setShowUnsavedChangesWarning(false);
    });
  });

  it('adding a node widget from the node header creates a connection to the surface', () => {
    addToDashboard('test-label-1');
    cy.get(
      '[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]',
    ).should('be.visible');
    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('test-label-1', 'ReactUI').length,
      ).to.eq(1);
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_test-label-1');
    });
  });

  it('shows the surface breadcrumb in edit mode', () => {
    cy.get('[data-cy="surface-breadcrumb"]').should('be.visible');
    cy.get('[data-cy="surface-crumb-ui-surface-1"]').should('exist');
  });

  // it('editing a widget prop in the editor writes to the surface tree and is undoable', () => {
  //   cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]')
  //     .filter(':visible')
  //     .first()
  //     .click({ force: true });
  //   cy.get('[data-cy="indicatorbox-inspector-widget-btn"]')
  //     .should('be.visible')
  //     .click({ force: true });
  //   cy.get('[data-cy="label-switch"]').first().click({ force: true });

  //   // change lands in the surface node's Layout JSON socket
  //   doWithTestController((testController) => {
  //     const tree = getSurfaceTree(testController);
  //     const widget: any = Object.values(tree).find(
  //       (item: any) => item?.props?.id === 'NODE_test-label-1',
  //     );
  //     expect(widget.props.showLabel).to.eq(true);
  //   });

  //   // app-level undo reverts the layout edit
  //   doWithTestController(async (testController) => {
  //     await testController.undo();
  //   });
  //   doWithTestController((testController) => {
  //     const tree = getSurfaceTree(testController);
  //     const widget: any = Object.values(tree).find(
  //       (item: any) => item?.props?.id === 'NODE_test-label-1',
  //     );
  //     expect(widget.props.showLabel).to.not.eq(true);
  //   });
  // });

  it('deleting the widget in the editor removes the connection (kept node), undo restores both', () => {
    // select the widget first — the indicator box buttons need selection
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]')
      .filter(':visible')
      .first()
      .click({ force: true });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]')
      .filter(':visible')
      .first()
      .realHover();
    cy.get('[data-cy="indicatorbox-delete-widget-btn"]')
      .should('be.visible')
      .click({ force: true });

    cy.get(
      '[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]',
    ).should('not.exist');
    assertEventually((testController) => {
      expect(
        testController.getSocketLinks('test-label-1', 'ReactUI').length,
      ).to.eq(0);
      expect(testController.getNodeByID('test-label-1')).to.not.eq(undefined);
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.not.include('NODE_test-label-1');
    });

    doWithTestController(async (testController) => {
      await testController.undo();
      await testController.waitForPendingExecution();
    });
    assertEventually((testController) => {
      expect(
        testController.getSocketLinks('test-label-1', 'ReactUI').length,
      ).to.eq(1);
      const tree = getSurfaceTree(testController);
      expect(getWidgetElementIds(tree)).to.include('NODE_test-label-1');
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_test-label-1"]')
      .filter(':visible')
      .should('exist');
  });

  it('double-clicking an embedded surface dives into it; breadcrumb navigates back', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'ui-surface-2', 600, 500);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'ui-surface-2',
        'ui-surface-1',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });

    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_ui-surface-2"]')
      .filter(':visible')
      .first()
      .dblclick({ force: true });

    // breadcrumb now shows the dive path; editor shows surface 2 (empty)
    cy.get('[data-cy="surface-crumb-ui-surface-1"]').should('exist');
    cy.get('[data-cy="surface-crumb-ui-surface-2"]').should('exist');
    cy.get(
      '[data-cy="dashboard"] [data-cy="widget of NODE_ui-surface-2"]',
    ).should('not.exist');

    // crumb navigates back up
    cy.get('[data-cy="surface-crumb-ui-surface-1"]').click({ force: true });
    cy.get('[data-cy="surface-crumb-ui-surface-2"]').should('not.exist');
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_ui-surface-2"]')
      .filter(':visible')
      .should('exist');
  });

  it('embedded surface is read-only in edit mode, interactive in view mode', () => {
    // editing surface-1, which embeds surface-2. Give surface-2 a widget of
    // its own: an empty surface renders with no area, so "can a pointer reach
    // the content" would have nothing to reach and would hold either way
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'test-label-2', -200, 900);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'test-label-2',
        'ui-surface-2',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });

    const embeddedWidget =
      '[data-cy="dashboard"] [data-cy="widget of NODE_ui-surface-2"]';
    // the dashboard keeps non-visible copies of a widget around (the canvas
    // thumbnail, the surface's own preview), so every query pins to the live
    // one the same way the tests above do
    const liveRenderer = () =>
      cy
        .get(embeddedWidget)
        .filter(':visible')
        .first()
        .find('[data-cy="surface-renderer"]')
        .first();

    // Assert the OUTCOME - can a pointer reach the embedded content? - rather
    // than the mechanism that produces it. Edit mode blocks with a capturing
    // overlay while view mode does not, so a test pinned to the renderer's own
    // pointer-events would be testing an implementation detail that is now
    // deliberately identical in both modes.
    const expectContentReachable = (reachable: boolean) => {
      liveRenderer().should(($renderer) => {
        const rect = $renderer[0].getBoundingClientRect();
        // a zero-sized renderer would make elementFromPoint answer about some
        // unrelated element and pass the `false` case for the wrong reason
        expect(
          rect.width * rect.height,
          'the embedded surface has area',
        ).to.be.greaterThan(0);
        const hit = $renderer[0].ownerDocument.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        expect(
          Boolean(hit && $renderer[0].contains(hit)),
          reachable
            ? 'a pointer over the embedded surface reaches its content'
            : 'a pointer over the embedded surface is intercepted',
        ).to.eq(reachable);
      });
    };

    // ...and out of the KEYBOARD's reach too, which a pointer overlay on its
    // own would not achieve - a tab stop inside a surface you are only laying
    // out is still a way to type into it
    const expectKeyboardBlocked = (blocked: boolean) => {
      liveRenderer().should(($renderer) => {
        expect(
          Boolean($renderer[0].closest('[inert]')),
          blocked
            ? 'the embedded surface is inert, so it cannot be tabbed into'
            : 'the embedded surface is reachable by keyboard',
        ).to.eq(blocked);
      });
    };

    // edit mode: interaction is prevented (dive in to edit it instead)
    expectContentReachable(false);
    expectKeyboardBlocked(true);

    // ...while the widget itself stays a first-class editor citizen: still
    // selectable, still draggable, still divable
    cy.get(embeddedWidget).filter(':visible').first().click();
    cy.get(embeddedWidget)
      .filter(':visible')
      .first()
      .should('have.css', 'cursor', 'move')
      .dblclick();
    cy.get('[data-cy="surface-crumb-ui-surface-2"]').should('exist');
    cy.get('[data-cy="surface-crumb-ui-surface-1"]').click({ force: true });
    cy.get('[data-cy="surface-crumb-ui-surface-2"]').should('not.exist');

    // view/app mode: the embedded surface becomes interactive so the UI works
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    expectContentReachable(true);
    expectKeyboardBlocked(false);

    // back to edit mode for the following tests
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    expectContentReachable(false);
    expectKeyboardBlocked(true);
  });

  it('wiring the Layout JSON socket makes the editor read-only', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', 'test-json-1', -200, 500);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'test-json-1',
        'ui-surface-1',
        undefined,
        'Layout JSON',
      );
      await testController.waitForPendingExecution();
    });
    cy.get('[data-cy="surface-locked-banner"]').should('be.visible');

    doWithTestController(async (testController) => {
      await testController.disconnectLink('ui-surface-1', 'Layout JSON');
      await testController.waitForPendingExecution();
    });
    cy.get('[data-cy="surface-locked-banner"]').should('not.exist');
  });
});
