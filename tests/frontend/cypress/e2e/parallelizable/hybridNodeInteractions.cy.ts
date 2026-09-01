import {
  addToDashboard,
  areCoordinatesClose,
  dragFromAtoB,
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
      testController.setNodeInputValue('busy-table-42', 'Data', [
        { Label: 'row-1' },
      ]);
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

  // A widget's HTML overlay used to cover the whole node, so once the widget
  // was selected there was nowhere left to grab it. Only the control takes
  // pointer events now; everything around it belongs to the node underneath.
  describe('widget grab handles', () => {
    const sliderId = 'Slider1';

    beforeEach(() => {
      doWithTestController(async (testController) => {
        await testController.addNode('WidgetSlider', sliderId, -100, -300);
        await testController.executeNodeByID(sliderId);
        // selecting it is what used to make the overlay swallow the drag
        testController.selectNodesById([sliderId]);
      });
    });

    it('drags the node by the label above the slider', () => {
      let startX = 0;
      let startY = 0;

      getNodeCenterById(sliderId).then(([x, y]) => {
        startX = x;
        startY = y;
      });

      // the label sits inside the widget but is not part of the control, so a
      // drag on it has to reach the node rather than the overlay
      cy.get(`#slider-label-${sliderId}`).then(($label) => {
        const rect = $label[0].getBoundingClientRect();
        const fromX = rect.left + rect.width / 2;
        const fromY = rect.top + rect.height / 2;

        dragFromAtoB(fromX, fromY, fromX + 60, fromY + 40);
      });

      doWithTestController((testController) => {
        const [newX, newY] = testController.getNodeCenterById(sliderId);
        expect(newX).to.be.greaterThan(startX);
        expect(newY).to.be.greaterThan(startY);
      });
    });

    // a blocked widget must be dead to the pointer, not merely inert: if its
    // control still swallows the press, the multi-selection cannot be dragged
    // from anywhere over the widget
    it('drags a multi-selection by the slider rail once the widget is blocked', () => {
      doWithTestController(async (testController) => {
        await testController.addNode('Constant', 'Constant1', -400, -300);
        testController.selectNodesById([sliderId, 'Constant1']);
      });
      assertSelectedNodesCount(2);

      let startX = 0;
      let startY = 0;
      getNodeCenterById(sliderId).then(([x, y]) => {
        startX = x;
        startY = y;
      });

      cy.get(`#Container-${sliderId} .MuiSlider-root`).then(($slider) => {
        const rect = $slider[0].getBoundingClientRect();
        const fromX = rect.left + rect.width / 2;
        const fromY = rect.top + rect.height / 2;
        dragFromAtoB(fromX, fromY, fromX + 60, fromY + 40);
      });

      doWithTestController((testController) => {
        const [newX, newY] = testController.getNodeCenterById(sliderId);
        expect(newX).to.be.greaterThan(startX);
        expect(newY).to.be.greaterThan(startY);
        // and the blocked control must not have acted on the press
        expect(testController.getNodeOutputValue(sliderId, 'Out')).to.eq(0);
      });
    });

    // MUI turns pointer events off on a disabled ButtonBase but NOT on a
    // disabled InputBase, so the grab-through rule has to skip dead controls
    // itself - otherwise a field nobody can type in still swallows the drag
    it('drags the node by a disabled control', () => {
      doWithTestController(async (testController) => {
        await testController.addNode('WidgetAutocomplete', 'Auto1', -300, 0);
        testController.setNodeInputValue('Auto1', 'Disabled', true);
        await testController.executeNodeByID('Auto1');
      });

      let startX = 0;
      let startY = 0;
      getNodeCenterById('Auto1').then(([x, y]) => {
        startX = x;
        startY = y;
      });

      cy.get('#Container-Auto1 .MuiInputBase-root').then(($input) => {
        const rect = $input[0].getBoundingClientRect();
        const fromX = rect.left + rect.width / 2;
        const fromY = rect.top + rect.height / 2;
        dragFromAtoB(fromX, fromY, fromX + 60, fromY + 40);
      });

      doWithTestController((testController) => {
        const [newX, newY] = testController.getNodeCenterById('Auto1');
        expect(newX).to.be.greaterThan(startX);
        expect(newY).to.be.greaterThan(startY);
      });
    });

    it('still operates the slider rail without moving the node', () => {
      let startX = 0;
      let startY = 0;

      getNodeCenterById(sliderId).then(([x, y]) => {
        startX = x;
        startY = y;
      });

      // the whole rail is live, not just the thumb - MUI derives the value from
      // where the press lands, so a press far from the thumb has to reach it
      cy.get(`#Container-${sliderId} .MuiSlider-root`).then(($slider) => {
        const rect = $slider[0].getBoundingClientRect();
        const railY = rect.top + rect.height / 2;
        const railX = rect.left + rect.width * 0.75;

        cy.get('#pixi-container').realMouseMove(railX, railY);
        cy.get('#pixi-container').realClick({ x: railX, y: railY });
      });

      doWithTestController(async (testController) => {
        await testController.waitForPendingExecution();
        expect(
          testController.getNodeOutputValue(sliderId, 'Out'),
        ).to.be.greaterThan(50);

        // the viewport can settle by a sub-pixel between the two reads, so
        // this asks that the node stayed put, not that it never moved a hair
        const [newX, newY] = testController.getNodeCenterById(sliderId);
        expect(areCoordinatesClose(newX, newY, startX, startY, 2)).to.eq(true);
      });
    });
  });
});
