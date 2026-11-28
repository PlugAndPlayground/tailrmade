import {
  doWithTestController,
  openNewGraph,
  setSurfaceLayout,
  shouldWithTestController,
} from '../helpers';

const LABEL = 'Field label';
const POSITION = 'Label position';
// FORM_LABEL_WIDTH plus the frame's column gap, when no container sets one
const LEFT_CONTROL_OFFSET = 160 + 16;
// a Left label stays beside its control while the widget has room for the
// label column, the 16px gap and a 200px control
const roomBeside = (labelWidth = 160) => labelWidth + 16 + 200;
const STACK_BELOW = roomBeside();
// the page opens beside the canvas at 35% of the window, so a Left label
// needs a wide window to get a page wide enough for its column
const WIDE = { width: 1800, height: 900 };
const DEFAULT_VIEWPORT = { width: 1000, height: 660 };
// waits for the page pane to follow, so a test measures the wide page and
// not the one before it
const useWideWindow = (width = WIDE.width, height = WIDE.height) => {
  cy.viewport(width, height);
  cy.get('[data-cy="dashboard"]').should(($page) =>
    expect($page[0].getBoundingClientRect().width, 'page width').to.be.at.least(
      width * 0.3,
    ),
  );
};

type WidgetCase = {
  id: string;
  type: string;
  // the control the widget is built around, inside its widget box
  control: string;
  inputs?: Record<string, unknown>;
  // a group: a Left label lines up with its first option, not its middle
  firstRow?: string;
  // the part a person sees, which starts at the left edge even where the
  // control's box reaches past it to keep MUI's touch target
  visible?: string;
};

const WIDGETS: WidgetCase[] = [
  { id: 'text', type: 'WidgetTextField', control: '.MuiInputBase-root' },
  { id: 'number', type: 'WidgetNumberField', control: '.MuiInputBase-root' },
  { id: 'dropdown', type: 'WidgetDropdown', control: '.MuiInputBase-root' },
  {
    id: 'multi-dropdown',
    type: 'WidgetMultiDropdown',
    control: '.MuiInputBase-root',
  },
  {
    id: 'autocomplete',
    type: 'WidgetAutocomplete',
    control: '.MuiInputBase-root',
  },
  {
    id: 'multi-autocomplete',
    type: 'WidgetMultiAutocomplete',
    control: '.MuiInputBase-root',
  },
  {
    id: 'switch',
    type: 'WidgetSwitch',
    control: '.MuiSwitch-root',
    visible: '.MuiSwitch-track',
  },
  {
    id: 'switch-checkbox',
    type: 'WidgetSwitch',
    control: '.MuiCheckbox-root',
    inputs: { Control: 'Checkbox' },
    visible: '.MuiCheckbox-root svg',
  },
  {
    id: 'checkbox',
    type: 'WidgetCheckbox',
    control: 'fieldset',
    firstRow: '.MuiFormControlLabel-root',
    visible: '.MuiCheckbox-root svg',
  },
  {
    id: 'radio',
    type: 'WidgetRadio',
    control: 'fieldset',
    firstRow: '.MuiFormControlLabel-root',
    visible: '.MuiRadio-root svg',
  },
  {
    id: 'slider',
    type: 'WidgetSlider',
    control: '.MuiSlider-root',
    inputs: { Label: `${LABEL}: {{value}}` },
  },
  { id: 'color', type: 'WidgetColorPicker', control: '.MuiButton-root' },
  {
    id: 'button-group',
    type: 'WidgetButtonGroup',
    control: '.MuiButton-root',
  },
];

const widgetBox = (id: string) => `[data-cy="widget of NODE_${id}"]`;

// setSurfaceLayout returns before the page redraws, so wait for a widget to
// show the new layout before measuring it
const waitForWidget = (id: string, ready: (box: HTMLElement) => void) =>
  cy
    .get(`[data-cy="dashboard"] ${widgetBox(id)}`)
    .should(($box) => ready($box[0]));

const rect = (el: Element) => el.getBoundingClientRect();
const near = (actual: number, expected: number, what: string, slack = 1) =>
  expect(
    Math.abs(actual - expected),
    `${what}: ${actual} vs ${expected}`,
  ).to.be.at.most(slack);

// every widget on one page, all with the same label and position
const showOnPage = (position: string) => {
  doWithTestController(async (tc: any) => {
    for (const widget of WIDGETS) {
      if (!tc.getNodes().some((node: any) => node.id === widget.id)) {
        await tc.addNode(widget.type, widget.id, 0, 0);
      }
      const node = tc.getNodeByID(widget.id);
      // a saved Button Group has no label; one with a label shows it above
      const noLabel = position === 'Default' && widget.id === 'button-group';
      node.setInputData('Label', noLabel ? '' : LABEL);
      node.setInputData(POSITION, position);
      for (const [name, value] of Object.entries(widget.inputs ?? {})) {
        node.setInputData(name, value);
      }
      await node.executeOptimizedChain();
    }
  });
  setSurfaceLayout(
    'page',
    WIDGETS.map((widget) => ({ widget: widget.id })),
  );
  for (const widget of WIDGETS) {
    cy.get(`[data-cy="dashboard"] ${widgetBox(widget.id)}`).should(($box) => {
      const frames = $box.find('[data-cy="widget-label-frame"]');
      if (position === 'Default') {
        expect(frames.length, `${widget.id} frame`).to.eq(0);
      } else {
        expect(frames.attr('data-label-position'), widget.id).to.eq(position);
      }
    });
  }
};

const measure = (
  widget: WidgetCase,
  check: (parts: {
    box: DOMRect;
    frame?: HTMLElement;
    label?: DOMRect;
    wrapper?: DOMRect;
    control: DOMRect;
    firstRow?: DOMRect;
    visible?: DOMRect;
    el: HTMLElement;
  }) => void,
) =>
  cy
    .get(`[data-cy="dashboard"] ${widgetBox(widget.id)}`)
    .scrollIntoView()
    // laid out by now: showOnPage waited for every widget to take its position
    .then(($box) => {
      const el = $box[0];
      const frame = el.querySelector<HTMLElement>(
        '[data-cy="widget-label-frame"]',
      );
      const label = frame?.querySelector('[data-cy="widget-label"]');
      const wrapper = frame?.querySelector('[data-cy="widget-control"]');
      const control = el.querySelector(widget.control);
      expect(control, `${widget.id} control`).to.exist;
      const firstRow = widget.firstRow && el.querySelector(widget.firstRow);
      const visible = widget.visible && el.querySelector(widget.visible);
      check({
        box: rect(el),
        frame: frame ?? undefined,
        label: label ? rect(label) : undefined,
        wrapper: wrapper ? rect(wrapper) : undefined,
        control: rect(control!),
        firstRow: firstRow ? rect(firstRow) : undefined,
        visible: visible ? rect(visible) : undefined,
        el,
      });
    });

// the visible part of a control starts at the widget's left edge, give or
// take the few pixels MUI draws its icons inset by
const startsAtLeftEdge = (
  widget: WidgetCase,
  box: DOMRect,
  control: DOMRect,
  visible?: DOMRect,
) => {
  if (visible) {
    expect(visible.left - box.left, `${widget.id} visible left`).to.be.within(
      -4,
      8,
    );
  } else {
    near(control.left, box.left, `${widget.id} control left`);
  }
};

describe('form labels on widgets', () => {
  before(() => {
    openNewGraph();
  });

  it('puts the label above the control, with no gap below it', () => {
    showOnPage('Above');
    for (const widget of WIDGETS) {
      measure(widget, ({ box, frame, label, wrapper, control, visible }) => {
        expect(frame!.dataset.labelPosition).to.eq('Above');
        // the frame draws the label, so no floating label or group title
        expect(frame!.querySelector('.MuiInputLabel-root')).to.not.exist;
        expect(frame!.querySelector('.MuiTypography-subtitle1')).to.not.exist;
        near(label!.left, box.left, `${widget.id} label left`);
        near(wrapper!.left, box.left, `${widget.id} control column left`);
        expect(label!.bottom, `${widget.id} label above`).to.be.at.most(
          control.top + 0.5,
        );
        startsAtLeftEdge(widget, box, control, visible);
        // the widget is the label, a 4px gap and the control, nothing more
        near(box.top, label!.top, `${widget.id} top`);
        near(
          box.height,
          label!.height + 4 + wrapper!.height,
          `${widget.id} height`,
        );
        near(wrapper!.height, control.height, `${widget.id} control hugs`);
      });
    }
    cy.get(`${widgetBox('slider')} [data-cy="widget-label"]`).should(
      'have.text',
      `${LABEL}: 0`,
    );
    // the color pill names its color once the label is outside it
    cy.get(`${widgetBox('color')} .MuiButton-root`).should(($button) =>
      expect($button.text()).to.match(/^#[0-9A-F]{6}$/),
    );
  });

  it('puts the label in a fixed column on the left', () => {
    useWideWindow();
    showOnPage('Left');
    for (const widget of WIDGETS) {
      measure(widget, ({ box, label, wrapper, control, firstRow, visible }) => {
        expect(box.width, `${widget.id} width`).to.be.at.least(STACK_BELOW);
        near(label!.left, box.left, `${widget.id} label left`);
        // the same column width on every widget, so their controls line up
        near(
          wrapper!.left - box.left,
          LEFT_CONTROL_OFFSET,
          `${widget.id} control column`,
        );
        expect(label!.right).to.be.at.most(wrapper!.left);
        // centred on the control, or on a group's first option
        const row = firstRow ?? control;
        near(
          label!.top + label!.height / 2,
          row.top + row.height / 2,
          `${widget.id} label centre`,
          2,
        );
        startsAtLeftEdge(
          widget,
          { ...box.toJSON(), left: wrapper!.left } as DOMRect,
          control,
          visible,
        );
        near(box.height, wrapper!.height, `${widget.id} height`);
        near(wrapper!.height, control.height, `${widget.id} control hugs`);
      });
    }
  });

  it('takes the label width from the container, nested ones too', () => {
    useWideWindow();
    showOnPage('Left');
    const ids = ['text', 'switch', 'radio', 'slider'];
    setSurfaceLayout('page', [
      {
        direction: 'column',
        width: '100%',
        labelWidth: 220,
        children: [
          { widget: 'text' },
          { widget: 'switch' },
          // a nested container inherits the width it does not set
          {
            direction: 'column',
            width: '100%',
            children: [{ widget: 'radio' }, { widget: 'slider' }],
          },
        ],
      },
      // outside the form the default column stays
      { widget: 'number' },
    ]);
    waitForWidget('slider', (box) =>
      expect(
        getComputedStyle(box).getPropertyValue('--tm-label-width'),
        'slider inherits the width',
      ).to.eq('220px'),
    );
    for (const id of ids) {
      measure(
        WIDGETS.find((w) => w.id === id)!,
        ({ box, label, wrapper }) => {
          expect(box.width, `${id} width`).to.be.at.least(roomBeside(220));
          near(wrapper!.left - box.left, 220 + 16, `${id} control column`);
          expect(label!.right).to.be.at.most(wrapper!.left);
        },
      );
    }
    measure(
      WIDGETS.find((w) => w.id === 'number')!,
      ({ box, wrapper }) => {
        near(wrapper!.left - box.left, LEFT_CONTROL_OFFSET, 'number column');
      },
    );
  });

  it('stacks a Left label in a narrow column on a wide screen', () => {
    // a page of about 1050px: two 300px columns and a wide one beside them
    useWideWindow(3000, 1000);
    showOnPage('Left');
    setSurfaceLayout('page', [
      {
        direction: 'row',
        width: '100%',
        children: [
          {
            direction: 'column',
            width: '300px',
            children: [{ widget: 'text' }, { widget: 'switch' }],
          },
          // a shorter label column fits beside the control in the same width
          {
            direction: 'column',
            width: '300px',
            labelWidth: 80,
            children: [{ widget: 'radio' }],
          },
          {
            direction: 'column',
            width: '100%',
            children: [{ widget: 'number' }],
          },
        ],
      },
    ]);
    waitForWidget('text', (box) =>
      expect(box.getBoundingClientRect().width, 'text width').to.be.lessThan(
        STACK_BELOW,
      ),
    );
    for (const id of ['text', 'switch']) {
      measure(
        WIDGETS.find((w) => w.id === id)!,
        ({ box, label, wrapper }) => {
          expect(box.width, `${id} width`).to.be.lessThan(STACK_BELOW);
          near(wrapper!.left, box.left, `${id} control left`);
          expect(label!.bottom).to.be.at.most(wrapper!.top + 0.5);
        },
      );
    }
    measure(
      WIDGETS.find((w) => w.id === 'radio')!,
      ({ box, wrapper }) => {
        expect(box.width, 'radio width').to.be.lessThan(STACK_BELOW);
        expect(box.width, 'radio width').to.be.at.least(roomBeside(80));
        near(wrapper!.left - box.left, 80 + 16, 'radio column');
      },
    );
    // the wide column beside them keeps the default column
    measure(
      WIDGETS.find((w) => w.id === 'number')!,
      ({ box, wrapper }) => {
        expect(box.width, 'number width').to.be.at.least(STACK_BELOW);
        near(wrapper!.left - box.left, LEFT_CONTROL_OFFSET, 'number column');
      },
    );
    cy.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
  });

  it('keeps each widget as it was with Default, minus the baseline gap', () => {
    showOnPage('Default');
    // heights measured before Label position existed, at the default theme;
    // the slider was 63px, 7px of it room for descenders below the slider
    const heights: Record<string, number> = {
      text: 56,
      number: 56,
      dropdown: 56,
      'multi-dropdown': 56,
      autocomplete: 56,
      'multi-autocomplete': 56,
      switch: 56,
      'switch-checkbox': 56,
      checkbox: 130,
      radio: 130,
      slider: 56,
      color: 56,
      'button-group': 56,
    };
    for (const widget of WIDGETS) {
      measure(widget, ({ box, el, control }) => {
        near(box.height, heights[widget.id], `${widget.id} height`);
        expect(el.querySelector('[data-cy="widget-label-frame"]')).to.not.exist;
        if (widget.control === '.MuiInputBase-root') {
          // the floating label stays
          expect(
            el.querySelector('.MuiInputLabel-root')?.textContent,
          ).to.contain(LABEL);
          near(box.height, control.height, `${widget.id} hugs`);
        }
      });
    }
    // the group title, the centred slider label and the label on the pill
    cy.get(`${widgetBox('radio')} .MuiTypography-subtitle1`).should(
      'have.text',
      LABEL,
    );
    cy.get(`${widgetBox('checkbox')} .MuiTypography-subtitle1`).should(
      'have.text',
      LABEL,
    );
    cy.get(`#slider-label-slider`)
      .should('have.text', `${LABEL}: 0`)
      .and('have.css', 'text-align', 'center');
    cy.get(`${widgetBox('color')} .MuiButton-root`).should(
      'contain.text',
      LABEL,
    );
    // a switch keeps its label on its right, but starts at the left edge
    measure(
      WIDGETS.find((w) => w.id === 'switch')!,
      ({ box, el, visible }) => {
        const text = rect(el.querySelector('.MuiTypography-root')!);
        expect(text.left).to.be.greaterThan(visible!.right);
        expect(visible!.left - box.left).to.be.within(-4, 8);
      },
    );
    // and so does the slider, with no room left under it
    measure(
      WIDGETS.find((w) => w.id === 'slider')!,
      ({ box, control }) => {
        near(box.bottom, control.bottom, 'slider bottom');
      },
    );
  });

  it('toggles an on/off checkbox, alone and in every row of a list', () => {
    doWithTestController(async (tc: any) => {
      await tc.addNode('WidgetSwitch', 'flag', 0, 400);
      const flag = tc.getNodeByID('flag');
      flag.setInputData('Control', 'Checkbox');
      flag.setInputData(POSITION, 'Left');
      await flag.executeOptimizedChain();
    });
    setSurfaceLayout('page', [{ widget: 'flag' }]);
    const box = `[data-cy="dashboard"] ${widgetBox('flag')}`;
    cy.get(`${box} .MuiSwitch-root`).should('not.exist');
    cy.get(`${box} input[type=checkbox]`).should('not.be.checked').check();
    shouldWithTestController((tc: any) =>
      expect(tc.getNodeOutputValue('flag', 'Out')).to.equal(true),
    );
    // the label is the checkbox's label: clicking it toggles
    cy.get(`${box} label[data-cy="widget-label"]`).click();
    shouldWithTestController((tc: any) =>
      expect(tc.getNodeOutputValue('flag', 'Out')).to.equal(false),
    );

    doWithTestController(async (tc: any) => {
      await tc.addNode('UITemplate', 'row', -1500, 400);
      await tc.addNode('UISurfaceNode', 'row-sf', 400, 400);
      await tc.connectNodesByID('row-sf', 'row', 'ReactUI', 'UI');
      await tc.addNode('WidgetSwitch', 'row-flag', -200, 400);
      const rowFlag = tc.getNodeByID('row-flag');
      rowFlag.setInputData('Control', 'Checkbox');
      rowFlag.setInputData(POSITION, 'Left');
      await tc.connectNodesByID('row-flag', 'row-sf', 'ReactUI');
      await tc.connectNodesByID(
        'row',
        'row-flag',
        'Parameter 1',
        'Initial Value',
      );
      await tc.connectNodesByID('row-flag', 'row', 'Out', 'Output 1');

      await tc.addNode('RepeatTemplate', 'rows', 800, 400);
      const repeat = tc.getNodeByID('rows');
      repeat.setInputData('Template', tc.getNodeByID('row').nodeName);
      repeat.updateTemplateSockets();
      if (repeat.getInputSocketByName('Parameter 1 from')) {
        repeat.setInputData('Parameter 1 from', 'entry');
      }
      repeat.setInputData('Items', [true, false, true]);
      await repeat.executeOptimizedChain();
      await tc.waitForPendingExecution();
    });
    setSurfaceLayout('page', [{ widget: 'flag' }, { widget: 'rows' }]);

    const rows =
      '[data-cy="dashboard"] [data-cy="repeat-template of rows"] input[type=checkbox]';
    cy.get(rows).should('have.length', 3);
    cy.get(rows).eq(0).should('be.checked');
    cy.get(rows).eq(1).should('not.be.checked').check();
    cy.get(rows).eq(2).should('be.checked').uncheck();
    shouldWithTestController((tc: any) =>
      expect(tc.getNodeByID('rows').getOutputData('Output')).to.deep.equal([
        true,
        true,
        false,
      ]),
    );
    // each row keeps its own edit
    cy.get(rows).eq(0).should('be.checked');
    cy.get(rows).eq(1).should('be.checked');
    cy.get(rows).eq(2).should('not.be.checked');
  });

  it('stacks a Left label above the control on a phone', () => {
    cy.viewport(360, 780);
    showOnPage('Left');
    for (const id of ['text', 'switch', 'radio', 'slider']) {
      const widget = WIDGETS.find((w) => w.id === id)!;
      measure(widget, ({ box, label, wrapper }) => {
        expect(box.width, `${id} width`).to.be.lessThan(STACK_BELOW);
        near(label!.left, box.left, `${id} label left`);
        near(wrapper!.left, box.left, `${id} control left`);
        expect(label!.bottom).to.be.at.most(wrapper!.top + 0.5);
      });
    }
    cy.viewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
  });
});
