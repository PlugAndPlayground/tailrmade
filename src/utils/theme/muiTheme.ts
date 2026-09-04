import { createTheme, Theme, ThemeOptions } from '@mui/material';
import { ResolvedTheme } from './resolve';
import { Density, Elevation, ThemeTokens } from './tokens';

// MUI's shadow array has exactly 25 entries. A creator picks a character, not
// a ramp, so each of the three elevation steps expands into a full array here.
const ELEVATION_SHADOWS: Record<Elevation, [string, string]> = {
  none: ['none', 'none'],
  subtle: [
    '0px 1px 2px rgba(0, 0, 0, 0.12)',
    '0px 2px 8px rgba(0, 0, 0, 0.16)',
  ],
  raised: [
    '0px 2px 6px rgba(0, 0, 0, 0.20)',
    '0px 8px 24px rgba(0, 0, 0, 0.28)',
  ],
};

const buildShadows = (elevation: Elevation): string[] => {
  const [low, high] = ELEVATION_SHADOWS[elevation];
  return Array.from({ length: 25 }, (_, index) => {
    if (index === 0) {
      return 'none';
    }
    return index <= 4 ? low : high;
  });
};

// Density is the geometry of a CONTROL. MUI only distinguishes small/medium,
// so the XS/S and M/L/XL pairs share a MUI size here and the finer separation
// comes from the per-widget token table (see getSizeTokens in widgets/abstract).
const DENSITY_DEFAULTS: Record<
  Density,
  { size: 'small' | 'medium'; margin: 'dense' | 'normal' }
> = {
  XS: { size: 'small', margin: 'dense' },
  S: { size: 'small', margin: 'dense' },
  M: { size: 'medium', margin: 'dense' },
  L: { size: 'medium', margin: 'normal' },
  XL: { size: 'medium', margin: 'normal' },
};

// --- touch targets --------------------------------------------------------
// A deployed app is used with a finger as often as with a mouse, and the
// density steps a creator picks are visual choices, not hit-area ones: at XS/S
// a Checkbox is a 30px box and a Switch a 38px one, both well under the 44px
// minimum both Apple and Google publish.
//
// Rather than making every widget defend itself, the floor lives here, on the
// APP theme, so it reaches every control a creator can place at once. It is
// gated on `pointer: coarse` - the media query is about the primary input
// device, not the screen size - so a desktop app renders byte-identically to
// before and the pointer-precise density steps stay intact where they are
// usable.
export const TOUCH_TARGET_PX = 44;
const COARSE = '@media (pointer: coarse)';

// grows the hit area without moving the glyph: ButtonBase centres its content,
// so a min box just pads the ripple outwards around an unchanged icon
const coarseMinBox = {
  [COARSE]: {
    minWidth: `${TOUCH_TARGET_PX}px`,
    minHeight: `${TOUCH_TARGET_PX}px`,
  },
};

// Switch cannot use coarseMinBox: its root has an explicit width/height and the
// track fills the CONTENT box, so growing the box alone would stretch the track
// into a tall pill. Height and padding move together instead, which leaves the
// track at its designed 14px (medium) / 10px (small) and turns the extra space
// into slack around the thumb - and the thumb's input already spans the full
// root width, so the whole pill is tappable.
const coarseSwitchRoot = (trackHeight: number) => ({
  [COARSE]: {
    height: `${TOUCH_TARGET_PX}px`,
    paddingTop: `${(TOUCH_TARGET_PX - trackHeight) / 2}px`,
    paddingBottom: `${(TOUCH_TARGET_PX - trackHeight) / 2}px`,
  },
});

const fontStack = (family: string, fallbacks: string[]): string =>
  [`"${family}"`, ...fallbacks].join(', ');

// MUI's own typography baseline, scaled rather than replaced - the type scale
// keeps doing the work for control labels, input labels and helper text, and
// the theme only moves family and size.
const MUI_BASE_FONT_SIZE = 14;

export const tokensToThemeOptions = (resolved: ResolvedTheme): ThemeOptions => {
  const tokens: ThemeTokens = resolved.tokens;
  const density = DENSITY_DEFAULTS[tokens.density] ?? DENSITY_DEFAULTS.M;
  const denseOnly = density.margin === 'dense' ? ('dense' as const) : undefined;

  return {
    palette: {
      mode: resolved.mode,
      // only `main` is authored - MUI derives light, dark and contrastText
      primary: { main: tokens.primary },
      secondary: { main: tokens.secondary },
      error: { main: tokens.error },
      warning: { main: tokens.warning },
      info: { main: tokens.info },
      success: { main: tokens.success },
      background: {
        default: tokens['background.default'],
        paper: tokens['background.paper'],
      },
      text: {
        primary: tokens['text.primary'],
        secondary: tokens['text.secondary'],
      },
      divider: tokens.divider,
    },
    typography: {
      fontFamily: fontStack(tokens.fontFamily, [
        'Roboto',
        'Helvetica',
        'Arial',
        'sans-serif',
      ]),
      fontSize: MUI_BASE_FONT_SIZE * tokens.fontSizeScalar,
    },
    // the geometry of LAYOUT - gaps, stack spacing, surface padding. Never
    // derived from density.
    spacing: tokens.spacingUnit,
    shape: { borderRadius: tokens.radius },
    shadows: buildShadows(tokens.elevation) as ThemeOptions['shadows'],
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: {
        defaultProps: { variant: tokens.buttonVariant, size: density.size },
        styleOverrides: { root: coarseMinBox },
      },
      MuiButtonGroup: { defaultProps: { size: density.size } },
      MuiCheckbox: {
        defaultProps: { size: density.size },
        styleOverrides: { root: coarseMinBox },
      },
      MuiFab: { defaultProps: { size: density.size } },
      MuiIconButton: {
        defaultProps: { size: density.size },
        styleOverrides: { root: coarseMinBox },
      },
      MuiRadio: {
        defaultProps: { size: density.size },
        styleOverrides: { root: coarseMinBox },
      },
      MuiSwitch: {
        defaultProps: { size: density.size },
        styleOverrides: {
          root: coarseSwitchRoot(14),
          sizeSmall: coarseSwitchRoot(10),
        },
      },
      MuiTable: { defaultProps: { size: density.size } },
      // MUI drops MenuItem's 48px floor to `auto` above the sm breakpoint, so a
      // dropdown opened on a tablet has ~36px rows. The floor is about the
      // finger, not the window, so put it back for coarse pointers.
      MuiMenuItem: {
        styleOverrides: { root: { [COARSE]: { minHeight: 48 } } },
      },
      MuiTab: {
        styleOverrides: {
          root: { [COARSE]: { minHeight: `${TOUCH_TARGET_PX}px` } },
        },
      },
      MuiFormControl: {
        defaultProps: {
          variant: tokens.inputVariant,
          size: density.size,
          margin: density.margin,
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: tokens.inputVariant,
          size: density.size,
          margin: density.margin,
        },
      },
      // the low-level input parts only know 'dense' - undefined leaves them on
      // the MUI default, which is what the roomier steps want anyway
      MuiInputBase: { defaultProps: { margin: denseOnly } },
      MuiInputLabel: { defaultProps: { margin: denseOnly } },
      MuiFormHelperText: { defaultProps: { margin: denseOnly } },
    },
  };
};

// createTheme returns a NEW object every call and MUI re-renders its whole
// subtree on identity change. Hybrid nodes each render into their own React
// root, so an unmemoized theme means a color picker dragged across the accent
// socket re-themes every root on every pointer move. Key on the resolved token
// hash instead, so equal tokens are the same object.
// The resolved token set travels ON the theme object, so anything under a
// ThemeProvider can read the tokens of the theme it is ACTUALLY under without
// reaching back into a store.
//
// It is attached by cast rather than by module augmentation because
// custom.d.ts declares '@mui/material/styles' as an ambient module, which
// SHADOWS the real one instead of augmenting it - an `interface Theme`
// declaration there would never reach the type MUI hands back.
export type ThemeWithTokens = Theme & { tm?: ResolvedTheme };

const THEME_CACHE_LIMIT = 12;
const themeCache = new Map<string, Theme>();

export const createAppTheme = (resolved: ResolvedTheme): Theme => {
  const cached = themeCache.get(resolved.hash);
  if (cached) {
    return cached;
  }
  // attached AFTER createTheme, not passed in: createTheme deep-merges its
  // options, so a `tm` handed to it arrives as a structural copy - wasted work
  // on every theme, and reference identity on the token set is lost
  const theme = createTheme(tokensToThemeOptions(resolved)) as ThemeWithTokens;
  theme.tm = resolved;
  // bounded rather than single-entry: the editor theme and the app theme are
  // both live at once, and a single slot would thrash between them
  if (themeCache.size >= THEME_CACHE_LIMIT) {
    const oldest = themeCache.keys().next().value;
    if (oldest !== undefined) {
      themeCache.delete(oldest);
    }
  }
  themeCache.set(resolved.hash, theme);
  return theme;
};

export const clearAppThemeCache = (): void => {
  themeCache.clear();
};
