import {
  closeBothDrawers,
  doWithTestController,
  getStableScreenCoordinates,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

describe('redundant node status', () => {
  it('shows redundancy below warnings and updates without executing the source', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      await controller.addNode('Add', 'source');
      await controller.addNode('Add', 'consumer', 600, 0);
    });
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('source');
      expect(node.getWorstStatus()?.getSeverityName()).to.eq('redundant');
      expect(node.getWarningsAndErrors()).to.have.length(0);
      expect(controller.getStatusBadgeCenter('source', 'status')).not.to.be
        .null;
    });

    doWithTestController(async (controller) => {
      await controller.connectNodesByID(
        'source',
        'consumer',
        'Added',
        'Addend',
      );
    });
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('source').getVisibleStatuses(),
      ).to.have.length(0);
      expect(controller.getStatusBadgeCenter('source', 'status')).to.be.null;
    });

    doWithTestController(async (controller) => {
      await controller.disconnectLink('consumer', 'Addend');
    });
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('source').getWorstStatus()?.getSeverityName(),
      ).to.eq('redundant');
      expect(controller.getStatusBadgeCenter('source', 'status')).not.to.be
        .null;
    });

    doWithTestController(async (controller) => {
      controller.setNodeInputValue('source', 'Addend', 'not a number');
      await controller.executeNodeByID('source');
    });
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('source');
      expect(
        node.getVisibleStatuses().map((status) => status.getSeverityName()),
      ).to.deep.eq(['warning', 'redundant']);
      expect(node.getWorstStatus()?.getSeverityName()).to.eq('warning');
    });

    doWithTestController((controller) =>
      controller.zoomToFitNodesById(['source']),
    );
    getStableScreenCoordinates((controller) =>
      controller.getStatusBadgeCenter('source', 'status'),
    ).then(([x, y]) => cy.get('#pixi-container').realClick({ x, y }));
    cy.get('[data-cy="status-detail-message"]').should('have.length', 2);
    doWithTestController(async (controller) => {
      controller.setNodeInputValue('source', 'Addend', 5);
      await controller.executeNodeByID('source');
    });
    cy.get('[data-cy="status-detail-message"]')
      .should('have.length', 1)
      .and('contain', 'none of its outputs are connected');
  });
});
