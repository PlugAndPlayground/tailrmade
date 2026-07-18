import {
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

const testPosition = (nodeName, positionArray, coordinateTolerance = 1) => {
  cy.wait(1000);
  doWithTestController((testController) => {
    const container = testController.getChildByName(
      nodeName,
      `${nodeName}-container`,
    );
    const actualPositions = testController.getCoordinatesOfChildren(container);

    expect(actualPositions).to.have.length(positionArray.length);
    actualPositions.forEach(([actualX, actualY], index) => {
      const [expectedX, expectedY] = positionArray[index];
      expect(Math.abs(actualX - expectedX)).to.be.lte(coordinateTolerance);
      expect(Math.abs(actualY - expectedY)).to.be.lte(coordinateTolerance);
    });
  });
};

const prepareEach = () => {
  doWithTestController(async (testController) => {
    await testController.addNode('DRAW_Text', 'DRAW_Text-1');
    await testController.addNode('DRAW_Shape', 'DRAW_Shape');
    await testController.addNode('DRAW_Text', 'DRAW_Text-2');
    await testController.addNode('DRAW_Combine', 'DRAW_Combine-1');
    await testController.addNode('DRAW_Combine', 'DRAW_Combine-2');
    await testController.addNode('DRAW_Combine', 'DRAW_Combine-3');
    await testController.moveNodeByID('DRAW_Text-1', -400, -300);
    await testController.moveNodeByID('DRAW_Combine-1', -200, -300);
    await testController.moveNodeByID('DRAW_Shape', -200, -50);
    await testController.moveNodeByID('DRAW_Text-2', -400, 200);
    await testController.moveNodeByID('DRAW_Combine-2', -200, 200);
    await testController.moveNodeByID('DRAW_Combine-3', 0, -300);
    await testController.connectNodesByID(
      'DRAW_Text-1',
      'DRAW_Combine-1',
      'Graphics',
    );
    await testController.connectNodesByID(
      'DRAW_Text-2',
      'DRAW_Combine-2',
      'Graphics',
    );
    await testController.connectNodesByID(
      'DRAW_Combine-1',
      'DRAW_Combine-3',
      'Graphics',
    );
    await testController.connectNodesByID(
      'DRAW_Shape',
      'DRAW_Combine-3',
      'Graphics',
    );
    await testController.connectNodesByID(
      'DRAW_Combine-2',
      'DRAW_Combine-3',
      'Graphics',
    );
    await testController.setNodeInputValue(
      'DRAW_Text-1',
      'Text',
      'Test text with one line',
    );
    await testController.setNodeInputValue('DRAW_Text-1', 'Color', '#333333');
    await testController.setNodeInputValue('DRAW_Text-1', 'Line Height', 28);
    await testController.setNodeInputValue('DRAW_Text-2', 'Color', '#CCCCCC');
    await testController.setNodeInputValue('DRAW_Text-2', 'Line Height', 28);
    await testController.setNodeInputValue(
      'DRAW_Text-2',
      'Text',
      'Test text with a first\nand a second line',
    );
    await testController.setNodeInputValue('DRAW_Shape', 'Shape', 'Circle');
    await testController.setNodeInputValue('DRAW_Shape', 'Width', 320);
    await testController.setNodeInputValue('DRAW_Shape', 'Height', 40);
    await testController.setNodeInputValue('DRAW_Combine-1', 'Padding', 8);
    await testController.setNodeInputValue(
      'DRAW_Combine-1',
      'Background color',
      '#CCCCCC',
    );
    await testController.setNodeInputValue('DRAW_Combine-2', 'Padding', 8);
    await testController.setNodeInputValue(
      'DRAW_Combine-2',
      'Background color',
      '#333333',
    );
    await testController.setNodeInputValue(
      'DRAW_Combine-2',
      'Width behaviour',
      'fill',
    );
    await testController.setNodeInputValue(
      'DRAW_Combine-2',
      'Horizontal alignment',
      'right',
    );
    await testController.setNodeInputValue(
      'DRAW_Combine-2',
      'Vertical alignment',
      'bottom',
    );
    await testController.setNodeInputValue(
      'DRAW_Combine-3',
      'Background color',
      '#EF0F0F66',
    );
    await testController.setNodeInputValue('DRAW_Combine-3', 'Padding', 24);
    await testController.setNodeInputValue('DRAW_Combine-3', 'Gap', 24);
    await testController.executeNodeByID('DRAW_Shape');
    await testController.executeNodeByID('DRAW_Text-1');
    await testController.executeNodeByID('DRAW_Text-2');
  });
  cy.wait(1000);
};

describe('testCombineObjects', { defaultCommandTimeout: 10000 }, () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
  });

  beforeEach(() => {
    clearGraph();
    prepareEach();
  });

  it('Initial setup', () => {
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [24, 92],
      [24, 436],
    ]);
  });

  it('Test layout option vertical and horizontal: manual', () => {
    const targetPosition = [
      [0, 0],
      [0, 50],
      [0, 100],
      [200, 0],
    ];

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Layout mode',
        'manual',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Position',
        [0, 50],
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Position 2',
        [0, 100],
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Position 3',
        [200, 0],
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', targetPosition);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Direction',
        'horizontal',
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', targetPosition);
  });

  it('Test layout option vertical: gap', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Layout mode',
        'gap',
      );
      await testController.setNodeInputValue('DRAW_Combine-3', 'Gap', 48);
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [24, 116],
      [24, 484],
    ]);
  });

  it('Test layout option vertical: spread', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Layout mode',
        'spread',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Height behaviour',
        'fixed',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Background height',
        500,
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [24, 76],
      [24, 404],
    ]);
  });

  it('Test layout option vertical: center align', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Horizontal alignment',
        'center',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Width behaviour',
        'fixed',
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [96, 24],
      [40, 92],
      [24, 436],
    ]);
  });

  it('Test layout option vertical: right align', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Horizontal alignment',
        'right',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Width behaviour',
        'fixed',
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [169, 24],
      [56, 92],
      [24, 436],
    ]);
  });

  it('Test layout option horizontal: center align', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Direction',
        'horizontal',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Vertical alignment',
        'center',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Height behaviour',
        'fixed',
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 178],
      [255, 40],
      [599, 164],
    ]);
  });

  it('Test layout option horizontal: bottom align', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Direction',
        'horizontal',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Vertical alignment',
        'bottom',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Height behaviour',
        'fixed',
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 332],
      [255, 56],
      [599, 304],
    ]);
  });

  it('Test layout option horizontal: gap', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Width behaviour',
        'hug',
      );
      await testController.executeNodeByID('DRAW_Combine-2');
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Direction',
        'horizontal',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Layout mode',
        'gap',
      );
      await testController.setNodeInputValue('DRAW_Combine-3', 'Gap', 48);
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [279, 24],
      [647, 24],
    ]);
  });

  it('Test layout option horizontal: spread', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Width behaviour',
        'hug',
      );
      await testController.executeNodeByID('DRAW_Combine-2');
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Direction',
        'horizontal',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Layout mode',
        'spread',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Width behaviour',
        'fixed',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-3',
        'Background width',
        2000,
      );
      await testController.executeNodeByID('DRAW_Combine-3');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [851, 24],
      [1790, 24],
    ]);
  });

  it('Test fixed width', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Width behaviour',
        'fixed',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Background width',
        600,
      );
      await testController.executeNodeByID('DRAW_Combine-2');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [24, 92],
      [24, 436],
    ]);
  });

  it('Test fixed height', () => {
    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Height behaviour',
        'fixed',
      );
      await testController.setNodeInputValue(
        'DRAW_Combine-2',
        'Background height',
        600,
      );
      await testController.executeNodeByID('DRAW_Combine-2');
    });
    testPosition('DRAW_Combine-3', [
      [0, 0],
      [24, 24],
      [24, 92],
      [24, 436],
    ]);
  });
});
