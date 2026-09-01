import {
  getCanvasGrabThroughSx,
  getWidgetControlProps,
  WIDGET_CONTROL_ATTRIBUTE,
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

    expect(declaration).toEqual({ pointerEvents: 'auto' });
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
});
