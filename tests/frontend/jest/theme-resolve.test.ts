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
import { COLOR_ROLES, ThemeMode } from '../../../src/utils/theme/tokens';

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
  it('follows the system preference when no layer pins a mode', () => {
    expect(resolveTheme([], dark).mode).toBe('dark');
    expect(resolveTheme([], light).mode).toBe('light');
    expect(resolveTheme([], light).followsSystem).toBe(true);
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
});

describe('layer stack', () => {
  it('inherits every absent key from the preset', () => {
    const resolved = resolveTheme(
      [{ source: 'saved', presetId: 'slate', mode: 'dark' }],
      light,
    );
    expect(resolved.tokens).toEqual(presetToTokens(getPreset('slate'), 'dark'));
    expect(resolved.provenance).toEqual({});
  });

  it('applies layers in order, innermost last', () => {
    const layers: ThemeLayer[] = [
      {
        source: 'saved',
        presetId: 'slate',
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
      presetId: 'slate',
      mode: 'dark',
      override: { 'background.paper': '#123456' },
    };
    const switched: ThemeDocument = { ...overridden, presetId: 'paper' };

    const resolved = resolveTheme([themeDocumentToLayer(switched)], dark);
    expect(resolved.presetId).toBe('paper');
    expect(resolved.tokens['background.paper']).toBe('#123456');
    expect(listColorOverrides(resolved)).toEqual([
      { key: 'background.paper', source: 'saved' },
    ]);
    // everything the creator did not touch does come from the new preset
    expect(resolved.tokens['background.default']).toBe(
      getPreset('paper').roles.dark['background.default'],
    );
  });
});

describe('token hashing', () => {
  it('is stable across key insertion order', () => {
    const preset = getPreset('slate');
    const a = presetToTokens(preset, 'dark');
    const b = Object.keys(a)
      .reverse()
      .reduce((acc, key) => ({ ...acc, [key]: a[key] }), {} as typeof a);
    expect(hashTokens(b, 'dark')).toBe(hashTokens(a, 'dark'));
  });

  it('separates the two modes of one preset', () => {
    const preset = getPreset('slate');
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
      presetId: 'slate',
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
      presetId: 'slate',
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
    expect(serializeThemeDocument({ presetId: 'slate' })).toEqual({
      presetId: 'slate',
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
  it('stores a mode that differs from the system preference', () => {
    expect(setDocumentMode({}, 'light', true)).toEqual({ mode: 'light' });
  });

  it('removes the key when the choice matches the system preference', () => {
    // storing the matching literal would silently convert a temporary
    // adjustment into a permanent pin with no way back
    expect(setDocumentMode({ mode: 'light' }, 'dark', true)).toEqual({});
  });

  it('keeps a stored pin that the system preference later drifts into', () => {
    // evaluated only on user interaction - plenty of people run their OS on a
    // time-of-day schedule, and clearing proactively makes pinning impossible
    const pinned = setDocumentMode({}, 'light', true);
    const resolved = resolveTheme([themeDocumentToLayer(pinned)], light);
    expect(resolved.mode).toBe('light');
    expect(resolved.followsSystem).toBe(false);
    expect(pinned.mode).toBe('light');
  });
});
