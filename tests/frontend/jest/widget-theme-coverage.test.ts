import * as fs from 'fs';
import * as path from 'path';

// Source-level guards. Widget nodes cannot be instantiated here - they pull in
// pixi and the graph - but the two things worth protecting are visible in the
// source: that every widget rendering a themeable control offers the palette
// role socket, and that none of them paints a color the theme cannot reach.
const WIDGET_DIR = path.join(__dirname, '../../../src/nodes/widgets');

const read = (file: string) =>
  fs.readFileSync(path.join(WIDGET_DIR, file), 'utf8');

const widgetFiles = fs
  .readdirSync(WIDGET_DIR)
  .filter((file) => file.endsWith('.tsx'));

// every widget whose controls take a MUI palette role
const COLOR_SOCKET_WIDGETS = [
  'autocomplete.tsx',
  'buttons.tsx',
  'dropdowns.tsx',
  'inputs.tsx',
  'radioAndCheckbox.tsx',
  'sliders.tsx',
  'tabs.tsx',
];

describe('palette role coverage', () => {
  it.each(COLOR_SOCKET_WIDGETS)('%s offers the Color socket', (file) => {
    const source = read(file);
    expect(source).toMatch(/getColorSocket\(\)|colorName,\s*\n\s*new EnumType/);
  });

  it.each(COLOR_SOCKET_WIDGETS)('%s passes it to a control', (file) => {
    // most widgets hand the role straight to MUI as `color`; Tabs cannot,
    // because its own textColor/indicatorColor only accept primary and
    // secondary, so it resolves the role through sx instead
    expect(read(file)).toMatch(
      /color=\{(color|props\[colorName\])\}|\$\{color\}\.main/,
    );
  });

  it('offers only real MUI palette roles', () => {
    // the enum values are handed straight to MUI as `color`, so an invented
    // name would silently fall back instead of erroring
    const source = read('abstract.tsx');
    const block = source.slice(source.indexOf('export const colorOptions'));
    const roles = [
      ...block.slice(0, block.indexOf('];')).matchAll(/text: '(\w+)'/g),
    ].map((match) => match[1]);
    expect(roles).toEqual([
      'primary',
      'secondary',
      'success',
      'error',
      'info',
      'warning',
    ]);
  });
});

describe('no widget pins a button variant the theme cannot reach', () => {
  // buttonVariant is an app-wide token, so a hardcoded variant is the same
  // class of bug as a hardcoded color: it survives every preset and both
  // modes. colorPicker is the exception - its button is a SWATCH whose fill
  // is the picked value, and it overrides bgcolor/color/border outright.
  const ALLOWED_VARIANT_FILES = ['colorPicker.tsx'];

  it.each(widgetFiles.filter((file) => !ALLOWED_VARIANT_FILES.includes(file)))(
    '%s',
    (file) => {
      expect(read(file)).not.toMatch(/variant="(contained|outlined|text)"/);
    },
  );
});

describe('no widget paints outside the theme', () => {
  // A literal color cannot follow light/dark or a preset. The exceptions are
  // shadows and scrims, which are not palette roles - they are depth cues that
  // read the same on any background.
  const ALLOWED = [
    // indicators.tsx: inner shadow on the diode, a depth cue not a palette role
    'rgba(0,0,0,0.3)',
  ];

  it.each(widgetFiles)('%s', (file) => {
    const found = (
      read(file).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([\d\s.,]+\)/g) ?? []
    ).filter((color) => !ALLOWED.includes(color));
    expect(found).toEqual([]);
  });
});
