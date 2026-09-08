import Color from 'color';
import { getPreset, presetToTokens } from './presets';
import {
  ColorRole,
  DEFAULT_THEME_MODE,
  isColorRole,
  ThemeMode,
  ThemeModeSetting,
  ThemeTokens,
} from './tokens';

// Resolution is a chain of sparse layers, outermost first. Each layer that
// defines a key overrides the layers before it; an absent key inherits.
//
// This is deliberately an ORDERED ARRAY rather than a fixed set of named
// arguments. The chain is preset -> saved -> runtime -> widget today, but
// per-surface overrides slot in as one more element rather than as a new
// parameter threaded through every call site.
export type ThemeLayerSource =
  'preset' | 'saved' | 'runtime' | 'surface' | 'widget';

export type ThemeLayer = {
  source: ThemeLayerSource;
  presetId?: string;
  // absent means "inherit the mode from the layer above" - NOT "follow the
  // system preference", which is the explicit 'system' value. The absence of a
  // mode across the whole chain means DEFAULT_THEME_MODE. See resolveMode().
  mode?: ThemeModeSetting;
  tokens?: Partial<ThemeTokens>;
};

export type ThemeWarningKind = 'contrast';

export type ThemeWarning = {
  kind: ThemeWarningKind;
  // the authored role the creator can act on
  role: ColorRole;
  against: ColorRole;
  ratio: number;
  required: number;
  message: string;
};

export type ThemeProvenance = Partial<
  Record<keyof ThemeTokens, ThemeLayerSource>
>;

export type ResolvedTheme = {
  mode: ThemeMode;
  followsSystem: boolean;
  presetId: string;
  tokens: ThemeTokens;
  // which layer supplied each token, for tokens NOT coming from the preset.
  // The theming UI uses this to show that a role is overridden and by what,
  // rather than silently resolving and leaving the creator to wonder why a
  // preset switch did not change anything.
  provenance: ThemeProvenance;
  warnings: ThemeWarning[];
  // stable identity for the resolved token set - the memo key for createTheme
  hash: string;
};

export type ResolveContext = {
  prefersDark: boolean;
};

const MIN_CONTRAST_RATIO = 4.5;

// Walks the chain for a chosen mode.
export const resolveMode = (
  layers: ThemeLayer[],
  context: ResolveContext,
): { mode: ThemeMode; followsSystem: boolean } => {
  for (let i = layers.length - 1; i >= 0; i--) {
    const mode = layers[i].mode;
    if (mode === 'system') {
      return {
        mode: context.prefersDark ? 'dark' : 'light',
        followsSystem: true,
      };
    }
    if (mode !== undefined) {
      return { mode, followsSystem: false };
    }
  }
  return { mode: DEFAULT_THEME_MODE, followsSystem: false };
};

const resolvePresetId = (layers: ThemeLayer[]): string | undefined => {
  for (let i = layers.length - 1; i >= 0; i--) {
    const presetId = layers[i].presetId;
    if (presetId !== undefined) {
      return presetId;
    }
  }
  return undefined;
};

// A partly transparent role has no contrast ratio of its own - it takes one
// from whatever it sits on. Composite before measuring, or every `rgba(...)`
// text role reports a nonsense number.
const flatten = (color: string, over: string): ReturnType<typeof Color> => {
  try {
    const parsed = Color(color);
    const alpha = parsed.alpha();
    if (alpha >= 1) {
      return parsed;
    }
    return Color(over).mix(parsed.alpha(1), alpha);
  } catch {
    return Color('#000000');
  }
};

const contrastRatio = (foreground: string, background: string): number => {
  try {
    return flatten(foreground, background).contrast(Color(background));
  } catch {
    return MIN_CONTRAST_RATIO;
  }
};

const CONTRAST_PAIRS: Array<[ColorRole, ColorRole]> = [
  ['text.primary', 'background.default'],
  ['text.primary', 'background.paper'],
  ['text.secondary', 'background.default'],
  ['text.secondary', 'background.paper'],
];

/**
 * Cheap now, painful to retrofit once presets exist in the wild: flag authored
 * combinations that fall below WCAG AA for body text. This warns, it never
 * corrects - a creator who wants low contrast is allowed to have it.
 */
export const checkContrast = (tokens: ThemeTokens): ThemeWarning[] =>
  CONTRAST_PAIRS.flatMap(([role, against]) => {
    const ratio = contrastRatio(tokens[role], tokens[against]);
    if (ratio >= MIN_CONTRAST_RATIO) {
      return [];
    }
    return [
      {
        kind: 'contrast' as const,
        role,
        against,
        ratio: Math.round(ratio * 100) / 100,
        required: MIN_CONTRAST_RATIO,
        message: `${role} on ${against} has a contrast ratio of ${
          Math.round(ratio * 100) / 100
        }:1, below the ${MIN_CONTRAST_RATIO}:1 needed for body text.`,
      },
    ];
  });

// Stable across key insertion order, so two token sets that differ only in how
// they were assembled hash the same and do not re-create the MUI theme.
export const hashTokens = (tokens: ThemeTokens, mode: ThemeMode): string => {
  const keys = Object.keys(tokens).sort() as Array<keyof ThemeTokens>;
  return `${mode}|${keys.map((key) => `${key}:${tokens[key]}`).join('|')}`;
};

export const resolveTheme = (
  layers: ThemeLayer[],
  context: ResolveContext,
): ResolvedTheme => {
  const { mode, followsSystem } = resolveMode(layers, context);
  const presetId = resolvePresetId(layers);
  const preset = getPreset(presetId);

  const tokens = presetToTokens(preset, mode);
  const provenance: ThemeProvenance = {};

  layers.forEach((layer) => {
    if (!layer.tokens) {
      return;
    }
    (Object.keys(layer.tokens) as Array<keyof ThemeTokens>).forEach((key) => {
      const value = layer.tokens![key];
      if (value === undefined) {
        return;
      }
      tokens[key] = value as never;
      if (layer.source !== 'preset') {
        provenance[key] = layer.source;
      }
    });
  });

  return {
    mode,
    followsSystem,
    presetId: preset.id,
    tokens,
    provenance,
    warnings: checkContrast(tokens),
    hash: hashTokens(tokens, mode),
  };
};

/**
 * The roles a creator has changed away from the preset, grouped by the layer
 * that changed them. Drives the "you have overrides, here is what and where"
 * disclosure - switching preset keeps overrides on top of the new preset, so
 * this is how a creator understands why a preset does not look like its
 * thumbnail.
 */
export const listOverrides = (
  resolved: ResolvedTheme,
): Array<{ key: keyof ThemeTokens; source: ThemeLayerSource }> =>
  (Object.keys(resolved.provenance) as Array<keyof ThemeTokens>)
    .sort()
    .map((key) => ({ key, source: resolved.provenance[key]! }));

export const listColorOverrides = (
  resolved: ResolvedTheme,
): Array<{ key: ColorRole; source: ThemeLayerSource }> =>
  listOverrides(resolved).filter(
    (
      entry,
    ): entry is {
      key: ColorRole;
      source: ThemeLayerSource;
    } => isColorRole(entry.key as string),
  );
