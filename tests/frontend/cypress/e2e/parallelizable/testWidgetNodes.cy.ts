import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  exitDashboardEditMode,
  openNewGraph,
  shouldWithTestController,
  waitForStableRect,
} from '../helpers';

// Retries until the node output matches. `expected` can be a plain value
// (deep-compared) or a predicate receiving the current value, so state
// changes triggered by clicks need no fixed waits.
const assertNodeOutputValue = (
  nodeId: string,
  socketName: string,
  expected: unknown | ((value: any) => void),
) => {
  shouldWithTestController((testController) => {
    const value = testController.getNodeOutputValue(nodeId, socketName);
    if (typeof expected === 'function') {
      (expected as (value: any) => void)(value);
    } else {
      expect(value).to.deep.eq(expected);
    }
  });
};

// the picker is a Popper with a ClickAwayListener (no backdrop, no Escape),
// so it only closes on a click strictly outside of it; fixed coordinates can
// land inside the picker depending on where its anchor ended up, so compute
// an outside point from the picker's own position
const dismissColorPicker = () => {
  cy.get('.chrome-picker').then(($picker) => {
    const rect = $picker[0].getBoundingClientRect();
    const win = $picker[0].ownerDocument.defaultView!;
    const clickX =
      rect.right + 40 < win.innerWidth
        ? rect.right + 40
        : Math.max(rect.left - 40, 10);
    const clickY = Math.min(Math.max(rect.top + 10, 10), win.innerHeight - 10);
    cy.get('body').click(clickX, clickY);
  });
  cy.get('.chrome-picker').should('not.exist');
};

// exiting edit mode changes the dashboard drawer width, which can cover the
// canvas node again; bring it back into the uncovered area before clicking it
const exitEditModeAndShowNode = (nodeId: string) => {
  exitDashboardEditMode();
  // the drawer resizes when leaving edit mode; wait until it has settled,
  // otherwise the fit below uses a stale width and leaves the node covered
  waitForStableRect('[data-cy="dashboard"]');
  // the widget's own `disabled` prop (forced true while in edit mode) flips
  // back on a separate render pass from the toggle button's own state, so on
  // slow machines a click can land before the control re-enables; MUI's
  // interaction handlers silently no-op on a disabled control even for a
  // forced click (e.g. Slider's pointer-down handler bails out when
  // disabled), so wait for the DOM to catch up here instead of asserting on
  // the button icon alone
  cy.get(`[data-cy="widget of NODE_${nodeId}"]`).should(($widget) => {
    expect($widget.find('.Mui-disabled').length).to.eq(0);
  });
  doWithTestController((testController) => {
    testController.zoomToFitNodesById([nodeId]);
  });
};

// clicks at a horizontal fraction of the slider rail; a relative force-click
// on the element itself keeps the positional semantics (MUI derives the value
// from the event coordinates vs the rail rect) while being immune to overlays
// covering the canvas, like the force-clicks used by the other widget tests
const clickSliderAt = (selector: string, fraction: number) => {
  cy.get(selector).then(($slider) => {
    const rect = $slider[0].getBoundingClientRect();
    cy.wrap($slider).click(rect.width * fraction, rect.height / 2, {
      force: true,
    });
  });
};

const realClickSwitch = (selector: string) => {
  cy.get(selector)
    .should('be.visible')
    .then(($switch) => {
      const switchInput = $switch.find('input.MuiSwitch-input').get(0);

      if (switchInput) {
        cy.wrap(switchInput).then(($input) => {
          if (($input[0] as HTMLInputElement).checked) {
            cy.wrap($input).uncheck({ force: true });
            return;
          }

          cy.wrap($input).check({ force: true });
        });
        return;
      }

      cy.wrap($switch).click({ force: true });
    });
};

describe('testWidgetNodes', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('testDropdownWidget', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode('WidgetDropdown', 'WidgetDropdown');
      await testController.addNode('Label', 'Label');

      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('Label', 230, 0);
      await testController.connectNodesByID(
        'Constant',
        'WidgetDropdown',
        'Out',
        'Selected Option',
      );
      await testController.connectNodesByID('WidgetDropdown', 'Label', 'Out');
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetDropdown', 'Out', '');

    cy.get('.MuiSelect-select').first().click({ force: true });
    cy.get('li[data-value="Option 2"]').click({ force: true });

    assertNodeOutputValue('WidgetDropdown', 'Out', 'Option 2');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 'WrongOption');
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetDropdown', 'Out', '');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 'Option 3');
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetDropdown', 'Out', 'Option 3');
  });

  it('testMultiDropdownWidget', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode(
        'WidgetMultiDropdown',
        'WidgetMultiDropdown',
      );
      await testController.addNode('Label', 'Label');

      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('Label', 230, 0);
      await testController.connectNodesByID(
        'Constant',
        'WidgetMultiDropdown',
        'Out',
        'Selected Option',
      );
      await testController.connectNodesByID(
        'WidgetMultiDropdown',
        'Label',
        'Out',
      );
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiDropdown', 'Out', []);

    cy.get('.MuiSelect-select').first().click({ force: true });
    cy.get('.MuiMenu-list li').contains('Option 1').click({ force: true });

    // The widget applies selections asynchronously. Wait for the first
    // selection to propagate before clicking again so the second MUI change
    // event is based on the updated controlled value.
    assertNodeOutputValue('WidgetMultiDropdown', 'Out', ['Option 1']);

    cy.get('.MuiMenu-list li').contains('Option 2').click({ force: true });
    cy.get('body').type('{esc}');
    cy.get('.MuiSelect-select')
      .first()
      .should('contain.text', 'Option 1, Option 2');

    assertNodeOutputValue('WidgetMultiDropdown', 'Out', [
      'Option 1',
      'Option 2',
    ]);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', [
        'WrongOption',
        'Option 3',
      ]);
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiDropdown', 'Out', ['Option 3']);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', [
        'Option 1',
        'Option 3',
      ]);
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiDropdown', 'Out', [
      'Option 1',
      'Option 3',
    ]);
  });

  it('testAutocompleteWidget', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode('WidgetAutocomplete', 'WidgetAutocomplete');
      await testController.addNode('Label', 'Label');

      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('Label', 280, 0);
      await testController.connectNodesByID(
        'Constant',
        'WidgetAutocomplete',
        'Out',
        'Selected Option',
      );
      await testController.connectNodesByID(
        'WidgetAutocomplete',
        'Label',
        'Out',
      );
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetAutocomplete', 'Out', '');

    cy.get('#Container-WidgetAutocomplete .MuiAutocomplete-root input')
      .click({ force: true })
      .clear({ force: true })
      .type('Option 2', { force: true });
    cy.get('.MuiAutocomplete-listbox li')
      .contains('Option 2')
      .click({ force: true });

    assertNodeOutputValue('WidgetAutocomplete', 'Out', 'Option 2');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 'WrongOption');
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetAutocomplete', 'Out', '');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 'Option 3');
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetAutocomplete', 'Out', 'Option 3');
  });

  it('testMultiAutocompleteWidget', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode(
        'WidgetMultiAutocomplete',
        'WidgetMultiAutocomplete',
      );
      await testController.addNode('Label', 'Label');

      await testController.moveNodeByID('Constant', -200, 0);
      await testController.moveNodeByID('Label', 280, 0);
      await testController.connectNodesByID(
        'Constant',
        'WidgetMultiAutocomplete',
        'Out',
        'Selected Option',
      );
      await testController.connectNodesByID(
        'WidgetMultiAutocomplete',
        'Label',
        'Out',
      );
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiAutocomplete', 'Out', []);

    cy.get(
      '#Container-WidgetMultiAutocomplete .MuiAutocomplete-root input',
    ).click({ force: true });
    cy.get('.MuiAutocomplete-listbox').should('be.visible');
    cy.get('.MuiAutocomplete-listbox li')
      .contains('Option 1')
      .click({ force: true });
    cy.get(
      '#Container-WidgetMultiAutocomplete .MuiAutocomplete-tag .MuiChip-label',
    ).should('contain.text', 'Option 1');
    cy.get('body').then(($body) => {
      if ($body.find('.MuiAutocomplete-listbox').length === 0) {
        cy.get(
          '#Container-WidgetMultiAutocomplete .MuiAutocomplete-root input',
        ).click({ force: true });
      }
    });
    cy.get('.MuiAutocomplete-listbox').should('be.visible');
    cy.get('.MuiAutocomplete-listbox li')
      .contains('Option 2')
      .click({ force: true });
    cy.get('body').type('{esc}');

    assertNodeOutputValue('WidgetMultiAutocomplete', 'Out', [
      'Option 1',
      'Option 2',
    ]);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', [
        'WrongOption',
        'Option 3',
      ]);
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiAutocomplete', 'Out', ['Option 3']);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', [
        'Option 1',
        'Option 3',
      ]);
      await testController.executeNodeByID('Constant');
    });

    assertNodeOutputValue('WidgetMultiAutocomplete', 'Out', [
      'Option 1',
      'Option 3',
    ]);
  });
  it('tests slider widget functionality in canvas and dashboard', () => {
    const sliderId = 'slider-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetSlider', sliderId, 0, -200);
      await testController.executeNodeByID(sliderId);
    });

    assertNodeOutputValue(sliderId, 'Out', 0);

    clickSliderAt(`#Container-${sliderId} .MuiSlider-root`, 0.25);

    assertNodeOutputValue(sliderId, 'Out', (value) => {
      expect(value).to.be.greaterThan(15);
      expect(value).to.be.lessThan(35);
    });

    addToDashboard(sliderId);
    exitEditModeAndShowNode(sliderId);

    clickSliderAt(
      `[data-cy="widget of NODE_${sliderId}"] .MuiSlider-root`,
      0.75,
    );

    assertNodeOutputValue(sliderId, 'Out', (value) => {
      expect(value).to.be.greaterThan(65);
      expect(value).to.be.lessThan(85);
    });

    clickSliderAt(`#Container-${sliderId} .MuiSlider-root`, 0.5);

    assertNodeOutputValue(sliderId, 'Out', (value) => {
      expect(value).to.be.greaterThan(40);
      expect(value).to.be.lessThan(60);
    });

    doWithTestController((testController) => {
      const finalCanvasOutput = testController.getNodeOutputValue(
        sliderId,
        'Out',
      );
      cy.get(`[data-cy="widget of NODE_${sliderId}"]`).should(
        'contain.text',
        finalCanvasOutput.toString(),
      );
    });
  });
  it('tests tabs widget functionality in canvas and dashboard', () => {
    const tabsId = 'tabs-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetTabs', tabsId, 0, -200);
      await testController.executeNodeByID(tabsId);
    });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(tabsId, 'Out')).to.eq('Tab 1');
      expect(testController.getNodeOutputValue(tabsId, 'Index')).to.eq(0);
    });

    cy.get(`#Container-${tabsId} .MuiTab-root`).eq(1).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(tabsId, 'Out')).to.eq('Tab 2');
      expect(testController.getNodeOutputValue(tabsId, 'Index')).to.eq(1);
    });

    addToDashboard(tabsId);
    exitEditModeAndShowNode(tabsId);

    cy.get(`[data-cy="widget of NODE_${tabsId}"] .MuiTab-root`)
      .filter(':visible')
      .eq(2)
      .click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(tabsId, 'Out')).to.eq('Tab 3');
      expect(testController.getNodeOutputValue(tabsId, 'Index')).to.eq(2);
    });

    cy.get(`#Container-${tabsId} .MuiTab-root`).eq(0).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(tabsId, 'Out')).to.eq('Tab 1');
      expect(testController.getNodeOutputValue(tabsId, 'Index')).to.eq(0);
    });

    cy.get(`[data-cy="widget of NODE_${tabsId}"]`).should(
      'contain.text',
      'Tab 1',
    );
  });
  it('tests color picker widget functionality in canvas and dashboard', () => {
    const colorPickerId = 'colorpicker-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetColorPicker', colorPickerId, 0, -200);
      await testController.executeNodeByID(colorPickerId);
    });

    let initialOutput;
    let updatedOutput;
    let dashboardUpdatedOutput;

    doWithTestController((testController) => {
      initialOutput = testController.getNodeOutputValue(colorPickerId, 'Out');
      expect(initialOutput).to.not.eq(undefined);
    });

    cy.get(`#Container-${colorPickerId} button`).click({ force: true });
    cy.get('.chrome-picker').should('be.visible');
    cy.get('.w-color-saturation').then(($area) => {
      const rect = $area[0].getBoundingClientRect();
      cy.get('body').click(
        rect.left + rect.width * 0.9,
        rect.top + rect.height * 0.1,
      );
    });

    assertNodeOutputValue(colorPickerId, 'Out', (value) => {
      expect(value).to.not.deep.eq(initialOutput);
    });
    doWithTestController((testController) => {
      updatedOutput = testController.getNodeOutputValue(colorPickerId, 'Out');
    });

    dismissColorPicker();

    addToDashboard(colorPickerId);
    exitEditModeAndShowNode(colorPickerId);

    cy.get(`[data-cy="widget of NODE_${colorPickerId}"] button`)
      .filter(':visible')
      .first()
      .click({ force: true });
    cy.get('.chrome-picker').should('be.visible');
    cy.get('.w-color-saturation').then(($area) => {
      const rect = $area[0].getBoundingClientRect();
      cy.get('body').click(
        rect.left + rect.width * 0.1,
        rect.top + rect.height * 0.9,
      );
    });

    assertNodeOutputValue(colorPickerId, 'Out', (value) => {
      expect(value).to.not.deep.eq(updatedOutput);
    });
    doWithTestController((testController) => {
      dashboardUpdatedOutput = testController.getNodeOutputValue(
        colorPickerId,
        'Out',
      );
    });

    dismissColorPicker();

    cy.get(`#Container-${colorPickerId} button`).click({ force: true });
    cy.get('.chrome-picker').should('be.visible');
    cy.get('.w-color-saturation').then(($area) => {
      const rect = $area[0].getBoundingClientRect();
      cy.get('body').click(
        rect.left + rect.width * 0.5,
        rect.top + rect.height * 0.5,
      );
    });

    assertNodeOutputValue(colorPickerId, 'Out', (value) => {
      expect(value).to.not.deep.eq(dashboardUpdatedOutput);
    });

    dismissColorPicker();
  });
  it('tests switch widget functionality in canvas and dashboard', () => {
    const switchId = 'switch-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetSwitch', switchId, 0, -200);
      await testController.executeNodeByID(switchId);
    });

    // toggling depends on the current DOM state, so before every toggle wait
    // for the widget to reflect the node state (canvas and dashboard widgets
    // sync asynchronously after a change made through the other one)
    const assertSwitchDomState = (parentSelector: string, checked: boolean) =>
      cy
        .get(`${parentSelector} input.MuiSwitch-input`)
        .first()
        .should(checked ? 'be.checked' : 'not.be.checked');

    assertNodeOutputValue(switchId, 'Out', false);

    assertSwitchDomState(`#Container-${switchId}`, false);
    realClickSwitch(`#Container-${switchId} .MuiSwitch-root`);

    assertNodeOutputValue(switchId, 'Out', true);

    addToDashboard(switchId);
    exitEditModeAndShowNode(switchId);

    assertSwitchDomState(`[data-cy="widget of NODE_${switchId}"]`, true);
    realClickSwitch(`[data-cy="widget of NODE_${switchId}"] .MuiSwitch-root`);

    assertNodeOutputValue(switchId, 'Out', false);

    assertSwitchDomState(`#Container-${switchId}`, false);
    realClickSwitch(`#Container-${switchId} .MuiSwitch-root`);

    assertNodeOutputValue(switchId, 'Out', true);

    cy.get(`[data-cy="widget of NODE_${switchId}"] .MuiSwitch-input`)
      .first()
      .should('be.checked');
  });
  it('tests radio button widget functionality in canvas and dashboard', () => {
    const radioId = 'radio-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetRadio', radioId, 0, -200);
      await testController.executeNodeByID(radioId);
    });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(radioId, 'Out')).to.eq('');
      expect(
        testController.getNodeInputValue(radioId, 'Selected Option'),
      ).to.eq('');
    });

    cy.get(`#Container-${radioId} .MuiRadio-root`).eq(1).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(radioId, 'Out')).to.eq(
        'Option 2',
      );
      expect(
        testController.getNodeInputValue(radioId, 'Selected Option'),
      ).to.eq('Option 2');
    });

    addToDashboard(radioId);
    exitEditModeAndShowNode(radioId);

    cy.get(`[data-cy="widget of NODE_${radioId}"] .MuiRadio-root`)
      .filter(':visible')
      .eq(2)
      .click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(radioId, 'Out')).to.eq(
        'Option 3',
      );
      expect(
        testController.getNodeInputValue(radioId, 'Selected Option'),
      ).to.eq('Option 3');
    });

    cy.get(`#Container-${radioId} .MuiRadio-root`).eq(0).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(radioId, 'Out')).to.eq(
        'Option 1',
      );
      expect(
        testController.getNodeInputValue(radioId, 'Selected Option'),
      ).to.eq('Option 1');
    });

    cy.get(`[data-cy="widget of NODE_${radioId}"] input[type="radio"]`)
      .eq(0)
      .should('be.checked');
    cy.get(`[data-cy="widget of NODE_${radioId}"]`).should(
      'contain.text',
      'Option 1',
    );
  });
  it('tests checkbox widget functionality in canvas and dashboard', () => {
    const checkboxId = 'checkbox-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetCheckbox', checkboxId, 0, -200);
      await testController.executeNodeByID(checkboxId);
    });

    assertNodeOutputValue(checkboxId, 'Out', []);

    cy.get(`#Container-${checkboxId} .MuiCheckbox-root`)
      .eq(0)
      .click({ force: true });
    cy.get(`#Container-${checkboxId} .MuiCheckbox-root`)
      .eq(1)
      .click({ force: true });

    assertNodeOutputValue(checkboxId, 'Out', ['Option 1', 'Option 2']);

    addToDashboard(checkboxId);
    exitEditModeAndShowNode(checkboxId);

    // toggling depends on the current DOM state, so before every toggle wait
    // for the widget to reflect the node state (canvas and dashboard widgets
    // sync asynchronously after a change made through the other one)
    const assertCheckboxDomStates = (
      parentSelector: string,
      checkedStates: boolean[],
    ) => {
      checkedStates.forEach((checked, index) => {
        cy.get(`${parentSelector} input[type="checkbox"]`)
          .eq(index)
          .should(checked ? 'be.checked' : 'not.be.checked');
      });
    };

    assertCheckboxDomStates(`[data-cy="widget of NODE_${checkboxId}"]`, [
      true,
      true,
      false,
    ]);
    cy.get(`[data-cy="widget of NODE_${checkboxId}"] .MuiCheckbox-root`)
      .filter(':visible')
      .eq(0)
      .click({ force: true });
    cy.get(`[data-cy="widget of NODE_${checkboxId}"] .MuiCheckbox-root`)
      .filter(':visible')
      .eq(2)
      .click({ force: true });

    assertNodeOutputValue(checkboxId, 'Out', ['Option 2', 'Option 3']);

    assertCheckboxDomStates(`#Container-${checkboxId}`, [false, true, true]);
    cy.get(`#Container-${checkboxId} .MuiCheckbox-root`)
      .eq(1)
      .click({ force: true });
    cy.get(`#Container-${checkboxId} .MuiCheckbox-root`)
      .eq(0)
      .click({ force: true });

    assertNodeOutputValue(checkboxId, 'Out', ['Option 1', 'Option 3']);

    cy.get(`[data-cy="widget of NODE_${checkboxId}"] input[type="checkbox"]`)
      .eq(0)
      .should('be.checked');
    cy.get(`[data-cy="widget of NODE_${checkboxId}"] input[type="checkbox"]`)
      .eq(1)
      .should('not.be.checked');
    cy.get(`[data-cy="widget of NODE_${checkboxId}"] input[type="checkbox"]`)
      .eq(2)
      .should('be.checked');
    cy.get(`[data-cy="widget of NODE_${checkboxId}"]`).should(
      'contain.text',
      'Option 1',
    );
    cy.get(`[data-cy="widget of NODE_${checkboxId}"]`).should(
      'contain.text',
      'Option 3',
    );
  });
  it('tests button group widget functionality in canvas and dashboard', () => {
    const buttonGroupId = 'buttongroup-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('WidgetButtonGroup', buttonGroupId, 0, -200);
      await testController.executeNodeByID(buttonGroupId);
    });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(buttonGroupId, 'Out')).to.eq(
        'Option 1',
      );
      expect(testController.getNodeOutputValue(buttonGroupId, 'Index')).to.eq(
        0,
      );
    });

    cy.get(`#Container-${buttonGroupId} button`).eq(1).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(buttonGroupId, 'Out')).to.eq(
        'Option 2',
      );
      expect(testController.getNodeOutputValue(buttonGroupId, 'Index')).to.eq(
        1,
      );
    });

    addToDashboard(buttonGroupId);
    exitEditModeAndShowNode(buttonGroupId);

    cy.get(`[data-cy="widget of NODE_${buttonGroupId}"] button`)
      .filter(':visible')
      .should('have.length.at.least', 3)
      .eq(2)
      .click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(buttonGroupId, 'Out')).to.eq(
        'Option 3',
      );
      expect(testController.getNodeOutputValue(buttonGroupId, 'Index')).to.eq(
        2,
      );
    });

    cy.get(`#Container-${buttonGroupId} button`).eq(0).click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(buttonGroupId, 'Out')).to.eq(
        'Option 1',
      );
      expect(testController.getNodeOutputValue(buttonGroupId, 'Index')).to.eq(
        0,
      );
    });

    cy.get(`[data-cy="widget of NODE_${buttonGroupId}"] button`)
      .eq(0)
      .should('have.class', 'MuiButton-contained');
    cy.get(`[data-cy="widget of NODE_${buttonGroupId}"] button`)
      .eq(1)
      .should('not.have.class', 'MuiButton-contained');
    cy.get(`[data-cy="widget of NODE_${buttonGroupId}"]`).should(
      'contain.text',
      'Option 1',
    );
  });
});
