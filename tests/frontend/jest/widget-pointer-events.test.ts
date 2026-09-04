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
  const rules = Object.entries(getCanvasGrabThroughSx());
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

  // the canvas is touch-action: none but these controls are HTML on top of it,
  // so without this the browser scrolls the hybrid container (overflow: auto)
  // out from under a finger that meant to use the control or pan the canvas
  it('stops the browser claiming a drag that starts on a control', () => {
    const [, declaration] = ruleOf();
    expect(declaration).toMatchObject({ touchAction: 'none' });
  });

  // iOS answers a long press on HTML with its selection callout, which would
  // land on top of the node's own long-press context menu
  it('keeps the platform text callout off canvas controls', () => {
    const [, declaration] = ruleOf();
    expect(declaration).toMatchObject({
      WebkitTouchCallout: 'none',
      userSelect: 'none',
    });
  });
});

describe('controls that own their drag', () => {
  // a slider's drag IS its value, so it must not be handed to the canvas as a
  // pan the way a tap-only control's is
  it('marks a drag control as a control as well', () => {
    expect(getWidgetDragControlProps()).toEqual({
      [WIDGET_CONTROL_ATTRIBUTE]: true,
      [WIDGET_DRAG_CONTROL_ATTRIBUTE]: true,
    });
  });

  it('does not mark a disabled drag control', () => {
    expect(getWidgetDragControlProps(true)).toEqual({});
  });

  // the two markers are separate so that everything else stays pannable
  it('leaves ordinary controls unmarked for drag ownership', () => {
    expect(getWidgetControlProps()).not.toHaveProperty(
      WIDGET_DRAG_CONTROL_ATTRIBUTE,
    );
  });
});
