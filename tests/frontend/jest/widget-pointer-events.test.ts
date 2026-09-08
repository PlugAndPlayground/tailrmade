import {
  getCanvasGrabThroughSx,
  getWidgetControlProps,
  getWidgetDragControlProps,
  WIDGET_CONTROL_ATTRIBUTE,
  WIDGET_DRAG_CONTROL_ATTRIBUTE,
} from '../../../src/utils/nodeInteractivity';

// A canvas widget turns pointer events off for its whole overlay and hands them
// back only to markup explicitly identified as a control, so the padding around
// it drags the node underneath.
const ruleOf = () => {
  const rules = Object.entries(getCanvasGrabThroughSx(false));
  expect(rules).toHaveLength(1);
  return rules[0];
};

describe('canvas widget grab-through', () => {
  it('hands pointer events back only to explicitly marked controls', () => {
    const [selector, declaration] = ruleOf();

    expect(declaration).toMatchObject({ pointerEvents: 'auto' });
    expect(selector).toContain(`[${WIDGET_CONTROL_ATTRIBUTE}]`);
    expect(selector).not.toContain('.MuiSlider-root');
    expect(selector).not.toContain('.MuiInputBase-root');
  });

  it('marks enabled widget controls without exposing canvas details', () => {
    expect(getWidgetControlProps()).toEqual({
      [WIDGET_CONTROL_ATTRIBUTE]: true,
    });
    expect(getWidgetControlProps(false)).toEqual({
      [WIDGET_CONTROL_ATTRIBUTE]: true,
    });
  });

  it('does not mark disabled controls', () => {
    expect(getWidgetControlProps(true)).toEqual({});
  });

  it('also rejects controls disabled directly in the DOM', () => {
    const [selector] = ruleOf();
    expect(selector).toContain(':not(.Mui-disabled):not([disabled])');
  });

  it('scopes the control marker to the widget', () => {
    const [selector] = ruleOf();
    expect(selector.startsWith('& ')).toBe(true);
  });

  it('stops the browser claiming a drag that starts on a control', () => {
    const [, declaration] = ruleOf();
    expect(declaration).toMatchObject({ touchAction: 'none' });
  });

  // the iOS selection callout would land on top of the node's own long-press
  // context menu
  it('keeps the platform text callout off canvas controls', () => {
    const [, declaration] = ruleOf();
    expect(declaration).toMatchObject({
      WebkitTouchCallout: 'none',
      userSelect: 'none',
    });
  });
});

// a slider's drag is its value, so it must not be handed to the canvas as a
// pan the way a tap-only control's is
describe('controls that own their drag', () => {
  it('marks a drag control as a control as well', () => {
    expect(getWidgetDragControlProps()).toEqual({
      [WIDGET_CONTROL_ATTRIBUTE]: true,
      [WIDGET_DRAG_CONTROL_ATTRIBUTE]: true,
    });
  });

  it('does not mark a disabled drag control', () => {
    expect(getWidgetDragControlProps(true)).toEqual({});
  });

  it('leaves ordinary controls unmarked for drag ownership', () => {
    expect(getWidgetControlProps()).not.toHaveProperty(
      WIDGET_DRAG_CONTROL_ATTRIBUTE,
    );
  });
});

// On a phone the canvas is explore-only: the widget is a picture of a control,
// so nothing in it takes a press and panning across one works like panning
// across anything else.
describe('canvas widgets on a phone', () => {
  it('hands pointer events back to nothing at all', () => {
    expect(getCanvasGrabThroughSx(true)).toEqual({});
  });

  it('still hands them to controls everywhere else', () => {
    expect(Object.keys(getCanvasGrabThroughSx(false))).toHaveLength(1);
  });
});
