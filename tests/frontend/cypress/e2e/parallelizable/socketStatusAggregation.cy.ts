import {
  closeBothDrawers,
  doWithTestController,
  getStableScreenCoordinates,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const NODE_ID = 'TwoWarningNode';

// An Add node has two Addend sockets, so both can be made to warn at once.
const FIRST_SOCKET = 'Addend';
const SECOND_SOCKET = 'Addend 2';

const setAddends = (first: unknown, second: unknown) => {
  doWithTestController(async (testController) => {
    testController.setNodeInputValue(NODE_ID, FIRST_SOCKET, first);
    testController.setNodeInputValue(NODE_ID, SECOND_SOCKET, second);
    await testController.executeNodeByID(NODE_ID);
  });
};

// clicking a badge toggles, so make sure nothing is open before opening
const dismissPopover = () => {
  cy.get('body').then(($body) => {
    if ($body.find('[data-cy="node-detail-popover"]').length) {
      cy.get('#pixi-container').realClick({ x: 40, y: 500 });
      cy.get('[data-cy="node-detail-popover"]').should('not.exist');
    }
  });
};

const openStatusPopover = () => {
  dismissPopover();
  doWithTestController((testController) => {
    testController.zoomToFitNodesById([NODE_ID]);
  });
  getStableScreenCoordinates((testController) =>
    testController.getStatusBadgeCenter(NODE_ID, 'status'),
  ).then(([x, y]) => {
    cy.get('#pixi-container').realClick({ x, y });
  });
  cy.get('[data-cy="node-detail-popover"]').should('be.visible');
};

const getMessages = () => cy.get('[data-cy="status-detail-message"]');

describe('socketStatusAggregation', () => {
  it('reports one warning per failing socket', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', NODE_ID);
    });
    setAddends('not a number', 'also not a number');

    shouldWithTestController((testController) => {
      expect(
        testController.getNodeByID(NODE_ID).getWarningsAndErrors(),
        'both sockets warn',
      ).to.have.length(2);
    });

    openStatusPopover();
    getMessages().should('have.length', 2);
  });

  // Regression: the node used to cache a copy of a socket's status, and only
  // cleared it once every socket was clean. Fixing one socket while another
  // was still failing left the recovered socket's warning on the node.
  it('drops the warning of a socket that recovered while another still fails', () => {
    setAddends(5, 'still not a number');

    shouldWithTestController((testController) => {
      const statuses = testController
        .getNodeByID(NODE_ID)
        .getWarningsAndErrors();
      expect(statuses, 'only the failing socket warns').to.have.length(1);
      expect(statuses[0].getName()).to.contain(SECOND_SOCKET);
    });

    openStatusPopover();
    getMessages().should('have.length', 1);
  });

  it('clears the badge once every socket is clean again', () => {
    setAddends(5, 7);

    shouldWithTestController((testController) => {
      expect(
        testController.getNodeByID(NODE_ID).getWarningsAndErrors(),
      ).to.have.length(0);
      expect(
        testController.getStatusBadgeCenter(NODE_ID, 'status'),
        'no status badge is drawn',
      ).to.be.null;
    });
  });
});
