import {
  closeBothDrawers,
  doWithTestController,
  getStableScreenCoordinates,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const NODE_ID = 'BadgeNode1';
const COMMENT = 'Hello world';

// the badges sit to the right of the node, so keep the node centered in the
// uncovered part of the canvas before clicking them
const focusNode = () => {
  doWithTestController((testController) => {
    testController.zoomToFitNodesById([NODE_ID]);
  });
};

const assertBadgeDrawn = (kind: 'status' | 'comment', drawn = true) => {
  shouldWithTestController((testController) => {
    expect(
      testController.getStatusBadgeCenter(NODE_ID, kind) !== null,
      `${kind} badge is drawn`,
    ).to.eq(drawn);
  });
};

const clickBadge = (kind: 'status' | 'comment') => {
  focusNode();
  getStableScreenCoordinates((testController) =>
    testController.getStatusBadgeCenter(NODE_ID, kind),
  ).then(([x, y]) => {
    cy.get('#pixi-container').realClick({ x, y });
  });
};

const getPopover = () => cy.get('[data-cy="node-detail-popover"]');

describe('nodeStatusBadges', () => {
  it('a comment shows a comment badge on the node', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', NODE_ID);
    });
    doWithTestController((testController) => {
      testController.getNodeByID(NODE_ID).setComment(COMMENT);
    });

    assertBadgeDrawn('comment');
    // nothing is wrong with the node yet
    assertBadgeDrawn('status', false);
  });

  it('clicking the comment badge opens the comment', () => {
    clickBadge('comment');

    getPopover().should('be.visible').and('contain', `Comment on `);
    cy.get('[data-cy="node-comment-body"]').should('have.text', COMMENT);
  });

  it('clicking the same badge again closes the popover', () => {
    clickBadge('comment');

    getPopover().should('not.exist');
  });

  it('a parsing warning shows a warning badge next to the comment badge', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue(NODE_ID, 'Addend', 'not a number');
      await testController.executeNodeByID(NODE_ID);
    });

    assertBadgeDrawn('status');
    assertBadgeDrawn('comment');
    shouldWithTestController((testController) => {
      expect(testController.doesNodeHaveError(NODE_ID), 'is only a warning').to
        .be.false;
    });
  });

  it('clicking the warning badge opens the warning message', () => {
    clickBadge('status');

    getPopover().should('be.visible');
    cy.get('[data-cy="status-detail-message"]')
      .should('be.visible')
      .and('contain', 'Not a number');
  });

  it('fixing the input removes the warning badge and closes the popover', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue(NODE_ID, 'Addend', 5);
      await testController.executeNodeByID(NODE_ID);
    });

    assertBadgeDrawn('status', false);
    getPopover().should('not.exist');
    // the comment is untouched by the status changing
    assertBadgeDrawn('comment');
  });

  it('removing the comment removes the comment badge', () => {
    doWithTestController((testController) => {
      testController.getNodeByID(NODE_ID).setComment('');
    });

    assertBadgeDrawn('comment', false);
  });

  it('an execution error shows an error badge with its message', () => {
    doWithTestController(async (testController) => {
      testController.getNodeByID(NODE_ID).setComment('');
      await testController.addNode('CustomFunction', 'BadgeErrorNode');
    });
    doWithTestController(async (testController) => {
      testController.setNodeInputValue(
        'BadgeErrorNode',
        'Code',
        '() => { throw new Error("intentional test failure"); }',
      );
      await testController.executeNodeByID('BadgeErrorNode');
    });

    shouldWithTestController((testController) => {
      expect(testController.doesNodeHaveError('BadgeErrorNode')).to.be.true;
      expect(
        testController.getStatusBadgeCenter('BadgeErrorNode', 'status'),
        'error badge is drawn',
      ).to.not.be.null;
    });

    doWithTestController((testController) => {
      testController.zoomToFitNodesById(['BadgeErrorNode']);
    });
    getStableScreenCoordinates((testController) =>
      testController.getStatusBadgeCenter('BadgeErrorNode', 'status'),
    ).then(([x, y]) => {
      cy.get('#pixi-container').realClick({ x, y });
    });

    getPopover().should('be.visible');
    cy.get('[data-cy="status-detail-message"]')
      .should('be.visible')
      .and('contain', 'intentional test failure');
  });
});
