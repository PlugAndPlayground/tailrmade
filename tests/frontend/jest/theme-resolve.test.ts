import {
  clearDocumentOverride,
  parseThemeDocument,
  serializeThemeDocument,
  setDocumentMode,
  setDocumentOverride,
  ThemeDocument,
  themeDocumentToLayer,
} from '../../../src/utils/theme/document';
import {
  DEFAULT_PRESET_ID,
  getPreset,
  PRESETS,
  presetToTokens,
} from '../../../src/utils/theme/presets';
import {
  hashTokens,
  listColorOverrides,
  resolveTheme,
  ThemeLayer,
} from '../../../src/utils/theme/resolve';
import {
  COLOR_ROLES,
  DEFAULT_THEME_MODE,
  ThemeMode,
} from '../../../src/utils/theme/tokens';
import { TRgba } from '../../../src/utils/color';

const light = { prefersDark: false };
const dark = { prefersDark: true };

describe('preset data', () => {
  // guards the promise that adding a preset is a data change: a preset missing
  // a mode or a role would resolve to undefined and paint nothing
  it.each(PRESETS.map((preset) => [preset.id, preset] as const))(
    '%s defines every role in both modes',
    (_id, preset) => {
      (['light', 'dark'] as ThemeMode[]).forEach((mode) => {
        COLOR_ROLES.forEach((role) => {
          expect(typeof preset.roles[mode][role]).toBe('string');
          expect(preset.roles[mode][role].length).toBeGreaterThan(0);
        });
      });
    },
  );

  it('falls back to the default preset for an unknown id', () => {
    expect(getPreset('does-not-exist').id).toBe(DEFAULT_PRESET_ID);
    expect(getPreset(undefined).id).toBe(DEFAULT_PRESET_ID);
  });
});

describe('mode resolution', () => {
  it('falls back to the default mode when no layer chooses one', () => {
    // an unconfigured app is dark on every machine, NOT whatever the viewer's
    // OS happens to be set to
    expect(resolveTheme([], light).mode).toBe(DEFAULT_THEME_MODE);
    expect(resolveTheme([], dark).mode).toBe(DEFAULT_THEME_MODE);
    expect(resolveTheme([], light).followsSystem).toBe(false);
  });

  it('follows the system preference only when a layer asks for it', () => {
    const layers: ThemeLayer[] = [{ source: 'saved', mode: 'system' }];
    expect(resolveTheme(layers, dark).mode).toBe('dark');
    expect(resolveTheme(layers, light).mode).toBe('light');
    expect(resolveTheme(layers, light).followsSystem).toBe(true);
  });

  it('lets a pinned mode beat the system preference', () => {
    const layers: ThemeLayer[] = [{ source: 'saved', mode: 'dark' }];
    const resolved = resolveTheme(layers, light);
    expect(resolved.mode).toBe('dark');
    expect(resolved.followsSystem).toBe(false);
  });

  it('lets the innermost layer win - last write wins, no extra rules', () => {
    const layers: ThemeLayer[] = [
      { source: 'saved', mode: 'dark' },
      { source: 'runtime', mode: 'light' },
    ];
    expect(resolveTheme(layers, dark).mode).toBe('light');
  });

  it('lets an inner layer take an outer pin back to the system', () => {
    const layers: ThemeLayer[] = [
      { source: 'saved', mode: 'dark' },
      { source: 'runtime', mode: 'system' },
    ];
    expect(resolveTheme(layers, light).mode).toBe('light');
    expect(resolveTheme(layers, light).followsSystem).toBe(true);
  });
});

describe('layer stack', () => {
  it('inherits every absent key from the preset', () => {
    const resolved = resolveTheme(
      [{ source: 'saved', presetId: 'cloud', mode: 'dark' }],
      light,
    );
    expect(resolved.tokens).toEqual(presetToTokens(getPreset('cloud'), 'dark'));
    expect(resolved.provenance).toEqual({});
  });

  it('applies layers in order, innermost last', () => {
    const layers: ThemeLayer[] = [
      {
        source: 'saved',
        presetId: 'cloud',
        mode: 'dark',
        tokens: { radius: 2 },
      },
      { source: 'runtime', tokens: { radius: 16 } },
    ];
    const resolved = resolveTheme(layers, dark);
    expect(resolved.tokens.radius).toBe(16);
    expect(resolved.provenance.radius).toBe('runtime');
  });

  it('keeps an override across a preset switch and reports it', () => {
    // the agreed behaviour: switching preset does NOT silently discard work.
    // The override wins, and provenance is how the UI can say so.
    const overridden: ThemeDocument = {
      presetId: 'cloud',
      mode: 'dark',
      override: { 'background.paper': '#123456' },
    };
    const switched: ThemeDocument = { ...overridden, presetId: 'newsprint' };

    const resolved = resolveTheme([themeDocumentToLayer(switched)], dark);
    expect(resolved.presetId).toBe('newsprint');
    expect(resolved.tokens['background.paper']).toBe('#123456');
    expect(listColorOverrides(resolved)).toEqual([
      { key: 'background.paper', source: 'saved' },
    ]);
    // everything the creator did not touch does come from the new preset
    expect(resolved.tokens['background.default']).toBe(
      getPreset('newsprint').roles.dark['background.default'],
    );
  });
});

describe('token hashing', () => {
  it('is stable across key insertion order', () => {
    const preset = getPreset('cloud');
    const a = presetToTokens(preset, 'dark');
    const b = Object.keys(a)
      .reverse()
      .reduce((acc, key) => ({ ...acc, [key]: a[key] }), {} as typeof a);
    expect(hashTokens(b, 'dark')).toBe(hashTokens(a, 'dark'));
  });

  it('separates the two modes of one preset', () => {
    const preset = getPreset('cloud');
    expect(hashTokens(presetToTokens(preset, 'dark'), 'dark')).not.toBe(
      hashTokens(presetToTokens(preset, 'light'), 'light'),
    );
  });
});

describe('contrast warnings', () => {
  it('stays quiet for the shipped presets', () => {
    PRESETS.forEach((preset) => {
      (['light', 'dark'] as ThemeMode[]).forEach((mode) => {
        const resolved = resolveTheme(
          [{ source: 'saved', presetId: preset.id, mode }],
          light,
        );
        expect(resolved.warnings).toEqual([]);
      });
    });
  });

  it('flags an unreadable authored combination', () => {
    const resolved = resolveTheme(
      [
        {
          source: 'saved',
          mode: 'dark',
          tokens: {
            'text.primary': '#777777',
            'background.default': '#808080',
            'background.paper': '#808080',
          },
        },
      ],
      dark,
    );
    const flagged = resolved.warnings.filter(
      (warning) => warning.role === 'text.primary',
    );
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].ratio).toBeLessThan(4.5);
  });

  it('measures a translucent role against what it sits on', () => {
    // rgba text has no contrast of its own - measured raw it reports nonsense
    const resolved = resolveTheme(
      [
        {
          source: 'saved',
          mode: 'dark',
          tokens: {
            'text.secondary': 'rgba(255, 255, 255, 0.08)',
            'background.default': '#111111',
            'background.paper': '#111111',
          },
        },
      ],
      dark,
    );
    expect(
      resolved.warnings.some((warning) => warning.role === 'text.secondary'),
    ).toBe(true);
  });
});

describe('theme document', () => {
  it('drops keys it does not recognise', () => {
    const parsed = parseThemeDocument({
      presetId: 'cloud',
      mode: 'sideways',
      override: {
        radius: 12,
        'background.default': '#000000',
        density: 'XXL',
        somethingNewer: '#ffffff',
        spacingUnit: -4,
      },
    });
    expect(parsed).toEqual({
      presetId: 'cloud',
      override: { radius: 12, 'background.default': '#000000' },
    });
  });

  it('survives being handed nonsense', () => {
    expect(parseThemeDocument(undefined)).toEqual({});
    expect(parseThemeDocument('theme')).toEqual({});
    expect(parseThemeDocument(null)).toEqual({});
  });

  it('serializes an untouched theme as absent', () => {
    expect(serializeThemeDocument({})).toBeUndefined();
    expect(serializeThemeDocument({ override: {} })).toBeUndefined();
    expect(serializeThemeDocument({ presetId: 'cloud' })).toEqual({
      presetId: 'cloud',
    });
  });

  it('removes an override rather than storing the preset value back', () => {
    const withOverride = setDocumentOverride({}, 'radius', 12);
    expect(withOverride.override).toEqual({ radius: 12 });
    expect(
      clearDocumentOverride(withOverride, 'radius').override,
    ).toBeUndefined();
  });
});

describe('mode storage rules', () => {
  it('stores a mode that differs from the default', () => {
    expect(setDocumentMode({}, 'light')).toEqual({ mode: 'light' });
  });

  it('stores the request to follow the system as itself', () => {
    // unlike a light/dark literal, 'system' says what was meant - it cannot be
    // confused with a pin to whatever the machine was set to at the time
    expect(setDocumentMode({}, 'system')).toEqual({ mode: 'system' });
  });

  it('drops the key when the choice is the default', () => {
    // keeps the document a true sparse diff: an app left on the default stores
    // nothing about mode, like one whose creator never opened the control
    expect(setDocumentMode({ mode: 'light' }, DEFAULT_THEME_MODE)).toEqual({});
    expect(setDocumentMode({ mode: 'system' }, DEFAULT_THEME_MODE)).toEqual({});
  });

  it('keeps a pin the system preference later drifts into', () => {
    // a pin is evaluated only against the default, never against the machine -
    // plenty of people run their OS on a time-of-day schedule
    const pinned = setDocumentMode({}, 'light');
    const resolved = resolveTheme([themeDocumentToLayer(pinned)], light);
    expect(resolved.mode).toBe('light');
    expect(resolved.followsSystem).toBe(false);
    expect(pinned.mode).toBe('light');
  });

  it('round-trips a saved system choice through serialization', () => {
    const document = setDocumentMode({}, 'system');
    expect(parseThemeDocument(serializeThemeDocument(document))).toEqual({
      mode: 'system',
    });
  });
});

describe('authored color values round-trip through the color picker', () => {
  // the panel hands every role to ColorPickerComponent as a TRgba and writes
  // back whatever comes out, so any value a preset can hold must survive that
  it.each(
    PRESETS.flatMap((preset) =>
      (['light', 'dark'] as ThemeMode[]).flatMap((mode) =>
        COLOR_ROLES.map(
          (role) =>
            [`${preset.id}/${mode}/${role}`, preset.roles[mode][role]] as const,
        ),
      ),
    ),
  )('%s', (_name, value) => {
    const parsed = TRgba.fromString(value);
    expect(Number.isNaN(parsed.r)).toBe(false);
    // and the string it writes back must parse again
    expect(() => TRgba.fromString(parsed.toString())).not.toThrow();
  });
});

describe('presets are actually distinct', () => {
  // a preset set that only varies its palette produces apps that all feel the
  // same. Guard the non-color axes too, so a new preset has to commit to a
  // shape as well as a hue.
  const shapeOf = (preset: (typeof PRESETS)[number]) =>
    [
      preset.geometry.radius,
      preset.geometry.density,
      preset.geometry.spacingUnit,
      preset.geometry.elevation,
      preset.variants.button,
      preset.variants.input,
    ].join('|');

  it('gives every preset its own shape, not just its own palette', () => {
    const shapes = PRESETS.map(shapeOf);
    expect(new Set(shapes).size).toBe(PRESETS.length);
  });

  it('spreads across the geometry range rather than clustering', () => {
    const radii = new Set(PRESETS.map((preset) => preset.geometry.radius));
    const densities = new Set(PRESETS.map((preset) => preset.geometry.density));
    const buttons = new Set(PRESETS.map((preset) => preset.variants.button));
    const inputs = new Set(PRESETS.map((preset) => preset.variants.input));
    expect(radii.size).toBeGreaterThanOrEqual(3);
    expect(densities.size).toBeGreaterThanOrEqual(3);
    // all three of each variant family should be represented somewhere
    expect(buttons.size).toBe(3);
    expect(inputs.size).toBe(3);
  });

  // compared WITHIN a mode: a preset reusing one accent across both modes is
  // a legitimate choice (tailrmade keeps the brand blue), but two presets
  // sharing an accent in the same mode are not telling apart.
  it.each(['light', 'dark'] as ThemeMode[])(
    'has no two presets sharing a %s primary',
    (mode) => {
      const primaries = PRESETS.map((preset) =>
        preset.roles[mode].primary.toUpperCase(),
      );
      expect(new Set(primaries).size).toBe(primaries.length);
    },
  );
});
