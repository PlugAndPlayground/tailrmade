// The fixed role set a creator authors. Everything else - contrast text,
// hover/active states, light/dark shades - MUI derives from these.
//
// The token record is deliberately FLAT, with dotted keys for the roles that
// end up nested in MUI's palette ('background.default', ...). Every layer of
// the theme stack is a sparse diff over this record, and a flat record makes
// "absent key inherits from the layer above" a plain shallow merge. A nested
// shape would need a deep merge, which is the same thing with more ways to be
// subtly wrong about which level an absent key inherits from.

export type ThemeMode = 'light' | 'dark';

// The stored form of mode has a third state - 'follow the system preference' -
// which is represented by the key being ABSENT rather than by a literal.
// See resolveMode() for why.
export type ThemeModeSetting = ThemeMode | undefined;

// Geometry of a control (height, inner padding, icon size), as opposed to
// spacingUnit, which is the geometry of layout (gaps, margins, surface
// padding). The two are independent knobs on purpose: a compact form inside a
// generous card is a legitimate design, so spacing is never derived from
// density.
export type Density = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const DENSITIES: Density[] = ['XS', 'S', 'M', 'L', 'XL'];

// Three steps, not MUI's 25. A creator picks a character, not a shadow ramp.
export type Elevation = 'none' | 'subtle' | 'raised';

export type ButtonVariant = 'contained' | 'outlined' | 'text';
export type InputVariant = 'outlined' | 'filled' | 'standard';

// Authored per mode. A preset defines all of these for BOTH modes, so
// switching preset can never land someone in an unthemed dark mode.
export const COLOR_ROLES = [
  'primary',
  'secondary',
  'background.default',
  'background.paper',
  'text.primary',
  'text.secondary',
  'divider',
  'error',
  'warning',
  // not in the original role set, but the widget Color enum has shipped 'info'
  // since before theming - dropping it would break existing apps
  'info',
  'success',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];

export type ColorTokens = Record<ColorRole, string>;

// Authored once, shared by both modes.
export type ShapeTokens = {
  fontFamily: string;
  // needed separately: code editor, data grid, anything monospace
  fontFamilyMono: string;
  // multiplier on the base type scale, not an absolute size - the scale does
  // the rest (control labels, input labels, helper text)
  fontSizeScalar: number;
  // a single scalar, not a scale
  radius: number;
  density: Density;
  spacingUnit: number;
  elevation: Elevation;
  buttonVariant: ButtonVariant;
  inputVariant: InputVariant;
};

export type ThemeTokens = ColorTokens & ShapeTokens;

export const COLOR_ROLE_SET: ReadonlySet<string> = new Set<string>(COLOR_ROLES);

export const isColorRole = (key: string): key is ColorRole =>
  COLOR_ROLE_SET.has(key);
