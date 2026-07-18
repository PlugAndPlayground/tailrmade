import {
  addTwoNodes,
  assertNodesCount,
  beforeEachMouseInteraction,
  closeBothDrawers,
  doWithTestController,
  dragFromAtoB,
  getNodeCenterById,
  getSocketCenterByNodeIDAndSocketName,
  moveTwoNodes,
  openNewGraph,
} from '../helpers';

describe('mouseInteractions2', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
  });

  it('Creates a connection to preferred socket on dragging from unconnected output socket to node', () => {
    beforeEachMouseInteraction();

    addTwoNodes();
    moveTwoNodes();

    getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
      ([startX, startY]) => {
        getNodeCenterById('Constant4').then(([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY, true);
        });
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant3');
    });
  });
  it('Opens node browser on dragging from connected output socket to graph', () => {
    beforeEachMouseInteraction();

    const endX = 460;
    const endY = 50;

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, endX, endY, true);
        cy.get('body').realMouseUp();
      },
    );

    cy.get('input#node-search:visible').should('be.visible').type('{enter}', {
      force: true,
    });

    assertNodesCount(3, 5000);
  });
  it('Creates a connection on dragging from unconnected output socket to input socket without a connection', () => {
    beforeEachMouseInteraction();
    addTwoNodes();
    moveTwoNodes();

    getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant3');
    });
  });
  it('Creates a connection and removes previous one on dragging from unconnected output socket to input socket with a connection', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant3');
      await testController.moveNodeByID('Constant3', 0, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant2', 'In')[0].source.getNode().id,
      ).to.eq('Constant3');
    });
  });
  it('Does nothing on clicking unconnected output socket without or minimal dragging', () => {
    const moveX = 5;
    const moveY = 5;

    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant3');
      await testController.moveNodeByID('Constant3', 0, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, startX + moveX, startY + moveY, true);
      },
    );

    cy.get('input#node-search:visible').should('not.exist');
  });
  it('Creates a connection to preferred socket on dragging from connected output socket to node', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        getNodeCenterById('Constant4').then(([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY, true);
        });
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
    });
  });
  it('Creates a connection on dragging from connected output socket to input socket without a connection', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
    });
  });
  it('Creates a connection on dragging from connected output socket to input socket with a connection', () => {
    beforeEachMouseInteraction();
    addTwoNodes();
    moveTwoNodes();

    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'Constant3',
        'Constant4',
        'Out',
        'In',
      );
    });

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(2);
      expect(testController.getSocketLinks('Constant3', 'Out').length).to.eq(0);
    });
  });
  it('Does nothing on clicking connected output socket without or minimal dragging', () => {
    const moveX = 5;
    const moveY = 5;

    beforeEachMouseInteraction();

    getSocketCenterByNodeIDAndSocketName('Constant1', 'Out').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, startX + moveX, startY + moveY, true);
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant2', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
    });
    cy.get('input#node-search:visible').should('not.exist');
  });
  it('Opens node browser on dragging from unconnected input socket to graph', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, startX - 150, startY - 200, true);
        cy.get('body').realMouseUp();
      },
    );

    cy.get('input#node-search:visible').should('be.visible');
    cy.get('body').type('{esc}');
  });
  it('Creates a connection to preferred socket on dragging from unconnected input socket to node', () => {
    beforeEachMouseInteraction();
    addTwoNodes();
    moveTwoNodes();

    getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
      ([startX, startY]) => {
        getNodeCenterById('Constant3').then(([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY, true);
        });
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant3');
    });
  });
  it('Removes connection on dragging from connected input socket to graph', () => {
    const endX = 660;
    const endY = 200;

    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
      await testController.connectNodesByID(
        'Constant1',
        'Constant4',
        'Out',
        'In',
      );
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, endX, endY, true);
      },
    );

    doWithTestController((testController) => {
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(1);
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
    });
    cy.get('input#node-search:visible').should('not.exist');
  });
  it('Moves connection to preferred socket on dragging from connected input socket to node', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        getNodeCenterById('Constant4').then(([endX, endY]) => {
          dragFromAtoB(startX, startY, endX, endY, true);
        });
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
    });
  });
  it('Moves connection on dragging from connected input socket to output socket without a connection', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant4');
      await testController.moveNodeByID('Constant4', 230, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
    });
  });
  it('Moves connection and removes previous one on dragging from connected input socket to output socket with a connection', () => {
    beforeEachMouseInteraction();
    addTwoNodes();
    moveTwoNodes();

    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'Constant3',
        'Constant4',
        'Out',
        'In',
      );
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant4', 'In').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant1');
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
      expect(testController.getSocketLinks('Constant3', 'Out').length).to.eq(0);
    });
  });
  it('Removes connection on dragging from connected input socket to output socket without a connection', () => {
    beforeEachMouseInteraction();

    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant3');
      await testController.moveNodeByID('Constant3', 0, -100);
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(testController.getSocketLinks('Constant3', 'Out').length).to.eq(0);
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(0);
    });
  });
  it('Removes connection on dragging from connected input socket to output socket with a connection', () => {
    beforeEachMouseInteraction();
    addTwoNodes();
    moveTwoNodes();

    doWithTestController(async (testController) => {
      await testController.connectNodesByID(
        'Constant3',
        'Constant4',
        'Out',
        'In',
      );
    });

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        getSocketCenterByNodeIDAndSocketName('Constant3', 'Out').then(
          ([endX, endY]) => {
            dragFromAtoB(startX, startY, endX, endY, true);
          },
        );
      },
    );

    doWithTestController((testController) => {
      expect(
        testController.getSocketLinks('Constant4', 'In')[0].source.getNode().id,
      ).to.eq('Constant3');
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(0);
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(0);
    });
  });
  it('Does nothing on clicking connected input socket without or minimal dragging', () => {
    const moveX = -5;
    const moveY = -5;

    beforeEachMouseInteraction();

    getSocketCenterByNodeIDAndSocketName('Constant2', 'In').then(
      ([startX, startY]) => {
        dragFromAtoB(startX, startY, startX + moveX, startY + moveY, true);
      },
    );

    cy.get('input#node-search:visible').should('not.exist');
    doWithTestController((testController) => {
      expect(testController.getSocketLinks('Constant1', 'Out').length).to.eq(1);
      expect(testController.getSocketLinks('Constant2', 'In').length).to.eq(1);
    });
  });
});
