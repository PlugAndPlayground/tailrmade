import {
  areCoordinatesClose,
  assertSelectedNodesCount,
  beforeEachMouseInteraction,
  clickNode,
  clickSocket,
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  dragFromAtoB,
  getNodeCenterById,
  getSocketCenterByNodeIDAndSocketName,
  openNewGraph,
} from '../helpers';

const shiftClickNode = (nodeId: string) => {
  getNodeCenterById(nodeId).then(([x, y]) => {
    cy.get('#pixi-container').click(x, y, { shiftKey: true });
  });
};

describe('mouseInteractions1', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
  });

  it('Opens node browser on double clicking', () => {
    clearGraph();

    cy.get('body').dblclick(400, 200);
    cy.get('input#node-search:visible').should('be.visible');
    cy.get('body').type('{esc}');
  });
  it('Selects all nodes within drag area on dragging over graph', () => {
    beforeEachMouseInteraction();

    dragFromAtoB(400, 300, 860, 460);
    assertSelectedNodesCount(2);
  });
  it('Deselects all nodes on clicking graph without dragging', () => {
    beforeEachMouseInteraction();

    clickNode('Constant1');
    assertSelectedNodesCount(1);

    cy.get('body').click(300, 300);
    assertSelectedNodesCount(0);
  });
  it('Drags node and releasing it over graph', () => {
    beforeEachMouseInteraction();

    const endX = 860;
    const endY = 460;

    getNodeCenterById('Constant1').then(([startX, startY]) => {
      dragFromAtoB(startX, startY, endX, endY);
    });

    getNodeCenterById('Constant1').should(([newX, newY]) => {
      expect(areCoordinatesClose(newX, newY, endX, endY, 2)).to.eq(true);
    });
  });
  it('Drags node and releasing it over node', () => {
    beforeEachMouseInteraction();

    getNodeCenterById('Constant1').then(([startX, startY]) => {
      getNodeCenterById('Constant2').then(([targetX, targetY]) => {
        const endX = targetX + 20;
        const endY = targetY + 20;

        dragFromAtoB(startX, startY, endX, endY, true);

        getNodeCenterById('Constant1').should(([newX, newY]) => {
          expect(areCoordinatesClose(newX, newY, endX, endY, 2)).to.eq(true);
        });
      });
    });
  });
  it('Selects and deselects nodes on clicking and shift-clicking node without dragging', () => {
    beforeEachMouseInteraction();

    clickNode('Constant1');
    assertSelectedNodesCount(1, 5000);

    shiftClickNode('Constant2');
    assertSelectedNodesCount(2, 5000);

    shiftClickNode('Constant1');
    assertSelectedNodesCount(1, 5000);

    shiftClickNode('Constant2');
    assertSelectedNodesCount(0, 5000);
  });
  it('Drags node and releasing it over socket', () => {
    beforeEachMouseInteraction();

    getNodeCenterById('Constant1').then(([startX, startY]) => {
      getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
        ([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY);

          getNodeCenterById('Constant1').should(([newX, newY]) => {
            expect(areCoordinatesClose(newX, newY, endX, endY, 2)).to.eq(true);
          });
        },
      );
    });
  });
  it('Toggle floating inspector on clicking socket', () => {
    beforeEachMouseInteraction();

    clickSocket('Constant2', 'In');
    cy.get('#tooltip-container').should('be.visible');

    cy.wait(500);

    cy.get('body').click(200, 400);
    cy.get('#tooltip-container').should('not.be.visible');
  });
  it('Does nothing on clicking connected and dynamic input socket without or minimal dragging', () => {
    const moveX = 5;
    const moveY = 5;

    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add');
      await testController.moveNodeByID('Add', 330, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        getNodeCenterById('Add').then(([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY, true);
        });
      },
    );

    getSocketCenterByNodeIDAndSocketName('Add', 'Addend').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, startX + moveX, startY + moveY, true);
      },
    );

    doWithTestController((testController) => {
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(2);
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(1);
    });

    cy.get('input#node-search:visible').should('not.exist');
  });
  it('Opens graph context menu on right-clicking graph', () => {
    beforeEachMouseInteraction();

    cy.get('#pixi-container').rightclick(400, 200);
    cy.get('#graph-contextmenu').should('be.visible');
    cy.get('body').type('{esc}');
  });
  // it('Opens socket context menu on right-clicking socket', () => {
  //   beforeEachMouseInteraction();

  //   getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(([x, y]) => {
  //     cy.get('#pixi-container').rightclick(x, y);
  //   });
  //   cy.get('#socket-contextmenu').should('be.visible');
  //   cy.get('body').type('{esc}');
  // });
  it('Opens node context menu on right-clicking node', () => {
    beforeEachMouseInteraction();

    getNodeCenterById('Constant2').then(([x, y]) => {
      cy.get('#pixi-container').rightclick(x, y);
    });
    cy.get('#node-contextmenu').should('be.visible');
    cy.get('body').type('{esc}');
  });
});
