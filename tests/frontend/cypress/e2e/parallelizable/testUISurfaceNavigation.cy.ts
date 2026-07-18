import { doWithTestController, openNewGraph } from '../helpers';

describe('UI surface navigation and management', () => {
  it('setup: two surfaces with one widget each', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'nav-surface-1', 600, 0);
      await testController.addNode('UISurfaceNode', 'nav-surface-2', 600, 400);
      await testController.addNode('Label', 'nav-label-1', -200, 0);
      await testController.addNode('Label', 'nav-label-2', -200, 400);
      await testController.waitForPendingExecution();
      await testController.connectNodesByID(
        'nav-label-1',
        'nav-surface-1',
        'ReactUI',
      );
      await testController.connectNodesByID(
        'nav-label-2',
        'nav-surface-2',
        'ReactUI',
      );
      await testController.waitForPendingExecution();
      testController.setShowUnsavedChangesWarning(false);
    });
  });

  it('lists all surfaces in the User Interface tab and selects one to edit', () => {
    // open the dashboard and the right drawer with the User Interface tab
    cy.get('body').type('2');
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="interface-settings-tab"]').first().click({ force: true });
    cy.get('[data-cy="surface-list-panel"]').should('be.visible');
    cy.get('[data-cy="surface-list-item-nav-surface-1"]').should('exist');
    cy.get('[data-cy="surface-list-item-nav-surface-2"]').should('exist');

    // the first added surface is displayed by default
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-label-1"]')
      .filter(':visible')
      .should('exist');

    // selecting the second surface switches the dashboard to it
    cy.get('[data-cy="surface-list-item-nav-surface-2"]').click();
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-label-2"]')
      .filter(':visible')
      .should('exist');
    cy.get(
      '[data-cy="dashboard"] [data-cy="widget of NODE_nav-label-1"]',
    ).should('not.exist');
  });

  it('allows editing a surface name in the list', () => {
    cy.get('[data-cy="surface-name-input-nav-surface-2"]')
      .clear()
      .type('Page Two{enter}');
    doWithTestController((testController) => {
      expect(testController.getNodeByID('nav-surface-2').nodeName).to.eq(
        'Page Two',
      );
    });
  });

  it('sets a default surface via the star toggle', () => {
    cy.get('[data-cy="surface-default-btn-nav-surface-2"]').click();
    doWithTestController((testController) => {
      expect(testController.getGraph().defaultUISurfaceNodeId).to.eq(
        'nav-surface-2',
      );
    });
    // toggling again unsets it
    cy.get('[data-cy="surface-default-btn-nav-surface-2"]').click();
    doWithTestController((testController) => {
      expect(testController.getGraph().defaultUISurfaceNodeId).to.eq(undefined);
    });
    cy.get('[data-cy="surface-default-btn-nav-surface-2"]').click();
  });

  it('NavigateToPage switches the displayed surface by name', () => {
    // both surfaces are named "UI surface" — rename via node name is not
    // exposed here, so navigate by the shared name resolves to the first.
    // This variant verifies the "Execute" trigger socket fires navigation
    // by itself (TriggerType.onDataSet calls executeOptimizedChain), without
    // ever calling executeOptimizedChain manually. The socket lives in
    // nodeTriggerSocketArray, which setNodeInputValue/getInputSocketByName
    // do not search, so drive it via the node object.
    doWithTestController(async (testController) => {
      await testController.addNode('NavigateToPage', 'nav-node-1', -200, 800);
      await testController.waitForPendingExecution();
      testController.setNodeInputValue('nav-node-1', 'Surface', 'UI surface');
      // TriggerType.onDataSet skips the first population of a socket
      // (previousData is undefined), so set 0 first to establish a baseline,
      // then 1 to produce the positiveFlank rising edge that fires the node.
      const trigger = testController
        .getNodeByID('nav-node-1')
        .getInputOrTriggerSocketByName('Execute', false);
      trigger.data = 0;
      trigger.data = 1;
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-label-1"]')
      .filter(':visible')
      .should('exist');
  });

  it('NavigateToPage switches the displayed surface by route slug', () => {
    // This variant verifies that manually running the node (e.g. via a
    // parent chain, not the trigger itself) still navigates now that the
    // boolean "shouldNavigate" gate is gone - navigation only depends on a
    // non-empty "Surface" target.
    doWithTestController(async (testController) => {
      // give surface-2 a distinct route slug; navigate by it
      testController.setNodeInputValue('nav-surface-2', 'Route', 'Second Page');
      await testController.waitForPendingExecution();
      testController.setNodeInputValue('nav-node-1', 'Surface', 'second-page');
      const node = testController.getNodeByID('nav-node-1');
      await node.executeOptimizedChain();
    });
    cy.get('[data-cy="dashboard"] [data-cy="widget of NODE_nav-label-2"]')
      .filter(':visible')
      .should('exist');
  });

  it('combines selected layoutable nodes into a new surface (Shift+U)', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'nav-label-3', -200, 1200);
      await testController.addNode('Label', 'nav-label-4', -200, 1400);
      await testController.waitForPendingExecution();
      testController.selectNodesById(['nav-label-3', 'nav-label-4']);
    });
    cy.get('body').type('{shift}U', { force: true });
    doWithTestController((testController) => {
      const surfaces = testController
        .getNodes()
        .filter((node) => node.isSurface());
      expect(surfaces.length).to.eq(3);
      const newSurface = surfaces.find(
        (surface) =>
          surface.id !== 'nav-surface-1' && surface.id !== 'nav-surface-2',
      );
      expect(
        testController.getSocketLinks('nav-label-3', 'ReactUI').length,
      ).to.eq(1);
      expect(
        testController.getSocketLinks('nav-label-4', 'ReactUI').length,
      ).to.eq(1);
      const tree = testController.getNodeInputValue(
        newSurface.id,
        'Layout JSON',
      ).tree;
      const ids = Object.values(tree)
        .map((item: any) => item?.props?.id)
        .filter(Boolean);
      expect(ids).to.include('NODE_nav-label-3');
      expect(ids).to.include('NODE_nav-label-4');
    });
  });
});
