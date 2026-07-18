import { controlOrMetaKey, doWithTestController, openNewGraph } from '../helpers';

describe('Undo with Number Widget', () => {
  it('Add number widget and test undo', () => {
    openNewGraph();
    
    doWithTestController(async (testController) => {
      await testController.addNode('WidgetSlider', 'WidgetSlider', 0, 0);
      await testController.selectNodesById(['WidgetSlider']);
    });
    
    // Open inspector to interact with widget
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
  });

  it('Change slider value by interacting with UI', () => {
    // Find and interact with the slider component directly using data-cy
    cy.get('[data-cy="Initial Value-slider"]').should('be.visible');
    
    // Click on the slider to change its value (click at 25% position)
    cy.get('[data-cy="Initial Value-slider"]').then($slider => {
      const sliderRect = $slider[0].getBoundingClientRect();
      const targetX = sliderRect.left + (sliderRect.width * 0.25); // 25% position
      const targetY = sliderRect.top + (sliderRect.height / 2);
      
      cy.get('[data-cy="Initial Value-slider"]').click(targetX - sliderRect.left, targetY - sliderRect.top);
    });
    
    
    doWithTestController(async (testController) => {
      // Verify the value changed (should be around 25)
      const value = testController.getNodeOutputValue('WidgetSlider', 'Out');
      expect(value).to.be.greaterThan(20);
      expect(value).to.be.lessThan(30);
    });
  });

  it('Change value again and test undo (edits outside the merge window are separate undo entries)', () => {
    // the previous test's click must fall outside the merge window
    // (ACTION_GROUP_WINDOW_MS) for this click to become its own undo entry
    cy.wait(1000);

    // Click on the slider at 75% position
    cy.get('[data-cy="Initial Value-slider"]').then($slider => {
      const sliderRect = $slider[0].getBoundingClientRect();
      const targetX = sliderRect.left + (sliderRect.width * 0.75); // 75% position
      const targetY = sliderRect.top + (sliderRect.height / 2);

      cy.get('[data-cy="Initial Value-slider"]').click(targetX - sliderRect.left, targetY - sliderRect.top);
    });

    doWithTestController(async (testController) => {
      // Verify the new value (should be around 75)
      const value = testController.getNodeOutputValue('WidgetSlider', 'Out');
      expect(value).to.be.greaterThan(70);
      expect(value).to.be.lessThan(80);
    });

    // First undo, the two clicks happened seconds apart (outside the merge
    // window) so this only undoes the second click, restoring ~25
    cy.get('body').type(`${controlOrMetaKey()}z`);

    doWithTestController(async (testController) => {
      const value = testController.getNodeOutputValue('WidgetSlider', 'Out');
      expect(value).to.be.greaterThan(20);
      expect(value).to.be.lessThan(30);
    });

    // Second undo restores the value to 0
    cy.get('body').type(`${controlOrMetaKey()}z`);

    doWithTestController(async (testController) => {
      const value = testController.getNodeOutputValue('WidgetSlider', 'Out');
      expect(value).to.be.equal(0);
    });
  });
});