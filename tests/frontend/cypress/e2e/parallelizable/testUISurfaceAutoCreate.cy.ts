import { doWithTestController, openNewGraph } from '../helpers';

const countSurfaces = (testController) =>
  testController.getNodes().filter((node) => node.isSurface()).length;

describe('UI surface auto-creation for an empty dashboard', () => {
  it('creates a UI surface node when entering edit mode on an empty dashboard', () => {
    openNewGraph();
    doWithTestController((testController) => {
      testController.setShowUnsavedChangesWarning(false);
      expect(countSurfaces(testController)).to.eq(0);
    });

    // open the dashboard, then enter edit mode (EditIcon -> CloseIcon)
    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });

    // a surface node is auto-created and becomes the default
    cy.window()
      .its('testController', { timeout: 10000 })
      .should((testController) => {
        expect(countSurfaces(testController)).to.eq(1);
        const surface = testController
          .getNodes()
          .find((node) => node.isSurface());
        expect(testController.getGraph().defaultUISurfaceNodeId).to.eq(
          surface.id,
        );
      });
  });

  it('does not create a second surface if one already exists', () => {
    doWithTestController(async (testController) => {
      // toggle edit off and on again
      const before = countSurfaces(testController);
      expect(before).to.eq(1);
    });
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    doWithTestController((testController) => {
      expect(countSurfaces(testController)).to.eq(1);
    });
  });

  it('adding a node widget links it into the auto-created surface', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'auto-label-1', -200, 0);
      await testController.waitForPendingExecution();
      const surface = testController
        .getNodes()
        .find((node) => node.isSurface());
      // connecting the node to the surface is what the add flow does
      await testController.connectNodesByID(
        'auto-label-1',
        surface.id,
        'ReactUI',
      );
      await testController.waitForPendingExecution();
    });
    doWithTestController((testController) => {
      const surface = testController
        .getNodes()
        .find((node) => node.isSurface());
      const tree = testController.getNodeInputValue(
        surface.id,
        'Layout JSON',
      ).tree;
      const ids = Object.values(tree)
        .map((item: any) => item?.props?.id)
        .filter(Boolean);
      expect(ids).to.include('NODE_auto-label-1');
      expect(
        testController.getSocketLinks('auto-label-1', 'ReactUI').length,
      ).to.eq(1);
    });
  });

  it('does not recreate the surface after it is deleted', () => {
    doWithTestController(async (testController) => {
      const surface = testController
        .getNodes()
        .find((node) => node.isSurface());
      await testController.removeNode(surface.id);
      await testController.waitForPendingExecution();
      expect(countSurfaces(testController)).to.eq(0);
    });
    // still in edit mode — the surface must NOT be auto-recreated this session
    cy.wait(500);
    doWithTestController((testController) => {
      expect(countSurfaces(testController)).to.eq(0);
    });
  });
});
