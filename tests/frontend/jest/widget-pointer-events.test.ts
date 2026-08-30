import * as fs from 'fs';
import * as path from 'path';
import {
  getCanvasGrabThroughSx,
  WIDGET_CONTROL_CLASS,
} from '../../../src/utils/nodeInteractivity';

// A canvas widget turns pointer events off for its whole overlay and hands them
// back only to the parts it names as controls, so the padding around them drags
// the node underneath. There is no DOM in this suite, so these guard the rule
// the widget's names are turned into.
const ruleOf = (selectors: string[]) => {
  const rules = Object.entries(getCanvasGrabThroughSx(selectors));
  expect(rules).toHaveLength(1);
  return rules[0];
};

describe('canvas widget grab-through', () => {
  // Widgets used to share one global list of control selectors, which meant
  // every widget paid for every other widget's controls and adding one was a
  // change with global blast radius. A widget now gets its own names and
  // nothing else - this is what stops a shared default list creeping back.
  it('hands pointer events back to the named controls and nothing else', () => {
    const [selector, declaration] = ruleOf(['.MuiSlider-root']);

    expect(declaration).toEqual({ pointerEvents: 'auto' });
    expect(selector).toContain('.MuiSlider-root');
    expect(selector).not.toContain('.MuiInputBase-root');
  });

  it('always keeps the opt-in class live, for controls easier to tag than name', () => {
    const [selector] = ruleOf([]);
    expect(selector).toContain(`.${WIDGET_CONTROL_CLASS}`);
  });

  it('never hands pointer events back to a disabled control', () => {
    const [selector] = ruleOf(['.MuiButtonBase-root']);

    for (const control of [`.${WIDGET_CONTROL_CLASS}`, '.MuiButtonBase-root']) {
      expect(selector).toContain(
        `${control}:not(.Mui-disabled):not([disabled])`,
      );
    }
  });

  it('scopes every selector to the widget, not just the first', () => {
    const [selector] = ruleOf(['.MuiInputBase-root', '.MuiInputLabel-root']);

    // emotion would leave an unprefixed selector matching the whole page
    for (const compound of selector.split(', ')) {
      expect(compound.startsWith('& ')).toBe(true);
    }
  });
});

// Source-level guard: a widget that renders a control has to say so, or its
// control ends up transparent and the widget looks broken on the canvas.
const WIDGET_DIR = path.join(__dirname, '../../../src/nodes/widgets');
const CONTROL_TAGS = [
  '<Slider',
  '<Button',
  '<Switch',
  '<TextField',
  '<Select',
  '<Autocomplete',
  '<Tabs',
  '<FormControlLabel',
];
// FileDropzone renders a Button but is a plain PPNode - it never goes through
// WidgetPaper, so none of this applies to it
const widgetFiles = fs
  .readdirSync(WIDGET_DIR)
  .filter((file) => file.endsWith('.tsx'))
  .filter((file) =>
    fs
      .readFileSync(path.join(WIDGET_DIR, file), 'utf8')
      .includes('<WidgetPaper'),
  );

describe('widgets declare their own controls', () => {
  it('finds the widget files to check', () => {
    expect(widgetFiles.length).toBeGreaterThan(5);
  });

  it.each(widgetFiles)('%s', (file) => {
    const source = fs.readFileSync(path.join(WIDGET_DIR, file), 'utf8');
    const rendersAControl = CONTROL_TAGS.some((tag) => source.includes(tag));

    if (rendersAControl) {
      expect(source).toContain('getCanvasControlSelectors');
    }
  });
});
