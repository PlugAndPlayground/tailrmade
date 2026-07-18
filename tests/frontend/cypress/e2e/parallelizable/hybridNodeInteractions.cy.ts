import {
  addToDashboard,
  assertFocusedNodeId,
  assertNoFocusedNode,
  doWithTestController,
  getNodeCenterById,
  assertSelectedNodesCount,
  openNewGraph,
} from '../helpers';

const clickElementCenter = (selector: string) => {
  cy.get(selector).then(($element) => {
    const rect = $element[0].getBoundingClientRect();
    cy.get('body').click(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
  });
};

describe('hybrid node interactions', () => {
  beforeEach(() => {
    cy.showMousePosition();
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('Table2', 'busy-table-42', -250, -100);
      testController.setNodeInputValue('busy-table-42', 'Data', [{ Label: 'row-1' }]);
      testController.setNodeInputValue('busy-table-42', 'Column Meta', {
        Label: { width: 140 },
      });
    });
  });

  it('enters edit mode on double-click even when the hybrid node was not selected', () => {
    getNodeCenterById('busy-table-42').then(([x, y]) => {
      cy.get('#pixi-container').dblclick(x, y + 40);
    });

    assertFocusedNodeId('busy-table-42');
  });

  it('enters edit mode on a slower second click after selection', () => {
    getNodeCenterById('busy-table-42').then(([x, y]) => {
      cy.get('#pixi-container').realMouseDown({ x, y: y + 40 });
      cy.get('#pixi-container').realMouseUp({ x, y: y + 40 });
    });

    assertNoFocusedNode();

    cy.wait(350);

    getNodeCenterById('busy-table-42').then(([x, y]) => {
      cy.get('#pixi-container').realMouseDown({ x, y: y + 40 });
      cy.get('#pixi-container').realMouseUp({ x, y: y + 40 });
    });

    assertFocusedNodeId('busy-table-42');
  });

  it('enters edit mode on canvas after the hybrid node is added to the dashboard', () => {
    addToDashboard('busy-table-42');

    // getNodeCenterById waits for the canvas to settle after the dashboard
    // drawer opened (opening it resizes the canvas and moves the node)
    getNodeCenterById('busy-table-42').then(([x, y]) => {
      cy.get('#pixi-container').realMouseDown({ x, y: y + 40 });
      cy.get('#pixi-container').realMouseUp({ x, y: y + 40 });
    });

    assertFocusedNodeId('busy-table-42');
  });

  it('does not enter edit mode when the interaction resolves as a drag', () => {
    let startX = 0;
    let startY = 0;

    getNodeCenterById('busy-table-42').then(([x, y]) => {
      startX = x;
      startY = y + 40;
      cy.get('#pixi-container').realMouseDown({ x: startX, y: startY });
      cy.get('#pixi-container').realMouseMove(startX + 30, startY + 10);
      cy.get('#pixi-container').realMouseUp({ x: startX + 30, y: startY + 10 });
    });

    assertNoFocusedNode();

    doWithTestController((testController) => {
      const [newX, newY] = testController.getNodeCenterById('busy-table-42');
      expect(newX).to.not.eq(startX);
      expect(newY).to.not.eq(startY);
    });
  });

  it('does not rerender unaffected hybrid nodes on unrelated selection changes', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Table2', 'TableB', 180, -100);
      await testController.addNode('Table2', 'TableC', 520, -100);

      const unaffectedNode = testController.getNodeByID('TableC') as any;
      const originalForceRerender =
        unaffectedNode.forceRerender.bind(unaffectedNode);
      let rerenderCount = 0;

      unaffectedNode.forceRerender = ((allowCancel = true) => {
        rerenderCount += 1;
        return originalForceRerender(allowCancel);
      }) as typeof unaffectedNode.forceRerender;

      unaffectedNode.forceRerender(false);
      rerenderCount = 0;

      testController.selectNodesById(['busy-table-42']);
      testController.selectNodesById(['TableB']);

      expect(rerenderCount).to.eq(0);
    });
  });

  it('keeps shift-click node selection additive after deferred click resolution', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant1', -200, -300);
    });

    getNodeCenterById('busy-table-42').then(([x, y]) => {
      cy.get('#pixi-container').click(x, y + 40);
    });

    assertSelectedNodesCount(1);

    getNodeCenterById('Constant1').then(([x, y]) => {
      cy.get('#pixi-container').click(x, y, { shiftKey: true });
    });

    assertSelectedNodesCount(2);
    assertNoFocusedNode();
  });

  it('disables widget content interaction while the widget node is part of a multi-selection', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('WidgetTabs', 'Tabs1', -100, -300);
      await testController.addNode('Constant', 'Constant1', -300, -300);
      testController.setNodeInputValue('Tabs1', 'Tab Options', [
        'Alpha',
        'Beta',
      ]);
      testController.setNodeInputValue('Tabs1', 'Selected Tab', 0);
      await testController.executeNodeByID('Tabs1');
    });

    clickElementCenter('[data-cy="Tabs1-canvas-tab-1"]');

    doWithTestController(async (testController) => {
      await testController.waitForPendingExecution();
      expect(testController.getNodeOutputValue('Tabs1', 'Index')).to.eq(1);
      testController.selectNodesById(['Tabs1', 'Constant1']);
    });

    assertSelectedNodesCount(2);

    clickElementCenter('[data-cy="Tabs1-canvas-tab-0"]');

    doWithTestController(async (testController) => {
      await testController.waitForPendingExecution();
      expect(testController.getNodeOutputValue('Tabs1', 'Index')).to.eq(1);
    });
  });
});
