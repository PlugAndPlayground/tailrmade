import {
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

const triggerMultiplyObjectPointerDown = (index: number) =>
  cy
    .window()
    .its('testController', { timeout: 120000 })
    .should((testController) => {
      const container = testController.getChildByName(
        'DRAW_COMBINE_ARRAY',
        'DRAW_COMBINE_ARRAY-container',
      );
      expect(container.children.length, 'rendered objects').to.eq(2);
    })
    .then((testController) => {
      const container = testController.getChildByName(
        'DRAW_COMBINE_ARRAY',
        'DRAW_COMBINE_ARRAY-container',
      );
      const boundsMinY = (bounds: any) =>
        bounds.rectangle?.y ?? bounds.minY ?? bounds.y;
      const boundsMinX = (bounds: any) =>
        bounds.rectangle?.x ?? bounds.minX ?? bounds.x;
      const objects = [...container.children].sort(
        (a: any, b: any) =>
          boundsMinY(a.getBounds()) - boundsMinY(b.getBounds()) ||
          boundsMinX(a.getBounds()) - boundsMinX(b.getBounds()),
      );
      const object = objects[index] as any;

      expect(object, `rendered object at index ${index}`).to.exist;
      object.emit('pointerdown', {});
    });

const setupTest = () => {
  openNewGraph();
  closeBothDrawers();
  cy.showMousePosition();

  doWithTestController(async (testController) => {
    await testController.addNode('DRAW_Shape', 'DRAW_Shape1', -300, -300);
    await testController.addNode('DRAW_Shape', 'DRAW_Shape2', -300, -100);
    await testController.addNode('ArrayCreate', 'ArrayCreate', -100, 0);
    await testController.addNode(
      'DRAW_COMBINE_ARRAY',
      'DRAW_COMBINE_ARRAY',
      -200,
      0,
    );
    await testController.connectNodesByID(
      'DRAW_Shape1',
      'ArrayCreate',
      'Graphics',
    );
    await testController.connectNodesByID(
      'DRAW_Shape2',
      'ArrayCreate',
      'Graphics',
    );
    await testController.connectNodesByID(
      'ArrayCreate',
      'DRAW_COMBINE_ARRAY',
      'Array',
    );
    await testController.setNodeInputValue(
      'DRAW_COMBINE_ARRAY',
      'Clickable objects',
      true,
    );
    await testController.setNodeInputValue(
      'DRAW_COMBINE_ARRAY',
      'Change Column/Row drawing order',
      false,
    );
    await testController.executeNodeByID('DRAW_Shape1');
  });
};

describe('testMultiplyObject', () => {
  beforeEach(() => {
    setupTest();
  });

  after(() => {
    Cypress.$('#custom-mouse-pointer').remove();
  });

  it('Check index of multiply object', () => {
    cy.window()
      .its('testController')
      .invoke('getNodeOutputValue', 'DRAW_COMBINE_ARRAY', 'LastPressedIndex')
      .should('eq', -1);

    triggerMultiplyObjectPointerDown(0);

    cy.window()
      .its('testController')
      .invoke('getNodeOutputValue', 'DRAW_COMBINE_ARRAY', 'LastPressedIndex')
      .should('eq', 0);
  });
});
