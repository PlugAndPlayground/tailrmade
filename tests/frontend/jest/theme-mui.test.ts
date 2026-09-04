import {
  clearAppThemeCache,
  createAppTheme,
  tokensToThemeOptions,
} from '../../../src/utils/theme/muiTheme';
import { resolveDensity } from '../../../src/utils/theme/density';
import { resolveTheme } from '../../../src/utils/theme/resolve';
import { Density } from '../../../src/utils/theme/tokens';

const resolvedWith = (tokens: Record<string, unknown>) =>
  resolveTheme([{ source: 'saved', mode: 'dark', tokens: tokens as never }], {
    prefersDark: true,
  });

beforeEach(() => clearAppThemeCache());

describe('token -> MUI mapping', () => {
  it('puts layout geometry on spacing and shape, not on density', () => {
    const theme = createAppTheme(
      resolvedWith({ spacingUnit: 12, radius: 6, density: 'XS' }),
    );
    expect(theme.spacing(1)).toBe('12px');
    expect(theme.shape.borderRadius).toBe(6);
  });

  it('drives control size from density and nothing else', () => {
    const compact = tokensToThemeOptions(resolvedWith({ density: 'XS' }));
    const roomy = tokensToThemeOptions(resolvedWith({ density: 'XL' }));
    expect(compact.components?.MuiButton?.defaultProps?.size).toBe('small');
    expect(roomy.components?.MuiButton?.defaultProps?.size).toBe('medium');
    // spacing is untouched by the density change - two independent knobs
    expect(compact.spacing).toBe(roomy.spacing);
  });

  it('sets the default variants that give an app its character', () => {
    const options = tokensToThemeOptions(
      resolvedWith({ buttonVariant: 'text', inputVariant: 'standard' }),
    );
    expect(options.components?.MuiButton?.defaultProps?.variant).toBe('text');
    expect(options.components?.MuiTextField?.defaultProps?.variant).toBe(
      'standard',
    );
  });

  it('expands the three elevation steps into a full shadow array', () => {
    const flat = createAppTheme(resolvedWith({ elevation: 'none' }));
    const raised = createAppTheme(resolvedWith({ elevation: 'raised' }));
    expect(flat.shadows).toHaveLength(25);
    expect(raised.shadows).toHaveLength(25);
    expect(flat.shadows[4]).toBe('none');
    expect(raised.shadows[4]).not.toBe('none');
    // index 0 is 'none' at every step - MUI relies on it
    expect(raised.shadows[0]).toBe('none');
  });

  it('lets MUI derive what the creator did not author', () => {
    const theme = createAppTheme(resolvedWith({ primary: '#3C54AB' }));
    expect(theme.palette.primary.main).toBe('#3C54AB');
    expect(theme.palette.primary.light).toBeTruthy();
    expect(theme.palette.primary.dark).toBeTruthy();
    expect(theme.palette.primary.contrastText).toBeTruthy();
  });

  it('carries the resolved token set on the theme', () => {
    const resolved = resolvedWith({ radius: 3 });
    const theme = createAppTheme(resolved) as { tm?: unknown };
    expect(theme.tm).toBe(resolved);
  });
});

describe('theme identity', () => {
  it('returns the same object for equal tokens', () => {
    // a color picker wired to an accent fires continuously; a new theme object
    // per pointer move re-themes every React root
    const a = createAppTheme(resolvedWith({ radius: 4 }));
    const b = createAppTheme(resolvedWith({ radius: 4 }));
    expect(a).toBe(b);
  });

  it('returns a different object when a token actually changes', () => {
    const a = createAppTheme(resolvedWith({ radius: 4 }));
    const b = createAppTheme(resolvedWith({ radius: 5 }));
    expect(a).not.toBe(b);
  });

  it('keeps both a light and a dark theme live without thrashing', () => {
    const darkTheme = createAppTheme(
      resolveTheme([{ source: 'saved', mode: 'dark' }], { prefersDark: true }),
    );
    const lightTheme = createAppTheme(
      resolveTheme([{ source: 'saved', mode: 'light' }], { prefersDark: true }),
    );
    expect(darkTheme).not.toBe(lightTheme);
    expect(
      createAppTheme(
        resolveTheme([{ source: 'saved', mode: 'dark' }], {
          prefersDark: true,
        }),
      ),
    ).toBe(darkTheme);
  });
});

describe('touch targets', () => {
  const COARSE = '@media (pointer: coarse)';
  const coarseRule = (slot: unknown): Record<string, unknown> =>
    (slot as Record<string, Record<string, unknown>>)[COARSE];

  // the floor exists so a creator cannot accidentally ship a control that is
  // too small to hit with a thumb - the density steps are a visual choice and
  // XS/S land well under the 44px both platforms publish
  it('floors every tappable control at 44px on a coarse pointer', () => {
    const options = tokensToThemeOptions(resolvedWith({ density: 'XS' }));
    const components = options.components!;
    (
      ['MuiButton', 'MuiIconButton', 'MuiCheckbox', 'MuiRadio'] as const
    ).forEach((name) => {
      const rule = coarseRule(components[name]?.styleOverrides?.root);
      expect(rule).toEqual({ minWidth: '44px', minHeight: '44px' });
    });
  });

  // Switch grows by height+padding instead of a min box, so that the track
  // keeps its designed thickness rather than stretching into a tall pill
  it('grows the switch around its track rather than stretching it', () => {
    const components = tokensToThemeOptions(resolvedWith({}))!.components!;
    const medium = coarseRule(components.MuiSwitch?.styleOverrides?.root);
    const small = coarseRule(components.MuiSwitch?.styleOverrides?.sizeSmall);
    // height minus the two paddings is the track: 14px medium, 10px small
    expect(medium).toEqual({
      height: '44px',
      paddingTop: '15px',
      paddingBottom: '15px',
    });
    expect(small).toEqual({
      height: '44px',
      paddingTop: '17px',
      paddingBottom: '17px',
    });
  });

  // MUI drops MenuItem's 48px floor above the sm breakpoint, which is a window
  // measurement - the finger does not get more precise on a tablet
  it('keeps menu rows tappable regardless of window width', () => {
    const components = tokensToThemeOptions(resolvedWith({}))!.components!;
    expect(coarseRule(components.MuiMenuItem?.styleOverrides?.root)).toEqual({
      minHeight: 48,
    });
  });

  it('leaves precise pointers exactly as they were', () => {
    const components = tokensToThemeOptions(resolvedWith({}))!.components!;
    // every floor lives INSIDE the media query - nothing leaks to the root
    (
      [
        'MuiButton',
        'MuiIconButton',
        'MuiCheckbox',
        'MuiRadio',
        'MuiSwitch',
      ] as const
    ).forEach((name) => {
      const root = components[name]?.styleOverrides?.root as Record<
        string,
        unknown
      >;
      expect(Object.keys(root)).toEqual([COARSE]);
    });
  });
});

describe('density inheritance', () => {
  it('follows what it inherits when the widget says Inherit', () => {
    expect(resolveDensity('Inherit', 'L')).toBe('L');
    expect(resolveDensity(undefined, 'S')).toBe('S');
  });

  it('lets an explicit widget size opt out of the chain', () => {
    (['XS', 'S', 'M', 'L', 'XL'] as Density[]).forEach((step) => {
      expect(resolveDensity(step, 'M')).toBe(step);
    });
  });

  it('treats an unrecognised setting as Inherit rather than guessing', () => {
    expect(resolveDensity('HUGE', 'S')).toBe('S');
  });
});
