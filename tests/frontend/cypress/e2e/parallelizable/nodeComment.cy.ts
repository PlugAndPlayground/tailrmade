import { doWithTestController, openNewGraph } from '../helpers';

describe('nodeComment', () => {
  it('Comment bubble is visible on hover', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'CommentNode1');
    });
    doWithTestController((testController) => {
      const node = testController.getNodeByID('CommentNode1');
      node.setComment('Hello world');
    });

    // hover over the node
    let centerX: number;
    let centerY: number;
    doWithTestController((testController) => {
      const coords = testController.getNodeCenterById('CommentNode1');
      centerX = coords[0];
      centerY = coords[1];
    });
    cy.then(() => {
      cy.get('#pixi-container').realMouseMove(centerX, centerY);
    });
    cy.wait(500);

    doWithTestController((testController) => {
      const commentContainer = testController.getChildByName(
        'CommentNode1',
        'userComment',
      );
      const bubble = commentContainer.getChildByName('commentBubble');
      expect(bubble).to.not.be.null;
      expect(bubble.visible).to.eq(true);
    });
  });
});
