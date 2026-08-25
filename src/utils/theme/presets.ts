import {
  ButtonVariant,
  ColorRole,
  ColorTokens,
  COLOR_ROLES,
  Density,
  Elevation,
  InputVariant,
  ThemeMode,
  ThemeTokens,
} from './tokens';
import paper from './presets/paper.json';
import slate from './presets/slate.json';
import tailrmade from './presets/tailrmade.json';

// A preset is a named bundle of role values, shipped as DATA. Adding one is a
// data change (drop a .json file in ./presets and list it below), not a code
// change - which is the whole point of keeping this shape stable.
export type ThemePreset = {
  id: string;
  name: string;
  description: string;
  // both modes are mandatory, so switching preset can never leave someone in
  // an unthemed dark mode
  roles: Record<ThemeMode, ColorTokens>;
  typography: {
    fontFamily: string;
    fontFamilyMono: string;
    fontSizeScalar: number;
    headingWeight: number;
  };
  geometry: {
    radius: number;
    density: Density;
    spacingUnit: number;
    elevation: Elevation;
  };
  variants: {
    button: ButtonVariant;
    input: InputVariant;
  };
};

// Curated, not accumulated. Tags, search and community submission are problems
// for a scale we do not have.
export const PRESETS: ThemePreset[] = [
  tailrmade as ThemePreset,
  slate as ThemePreset,
  paper as ThemePreset,
];

// The preset a document falls back to when its presetId is missing or unknown
// (a document authored against a preset we later renamed, say). It reproduces
// the look Tailrmade shipped before theming existed, so an untouched app is
// unchanged by the theme layer.
export const DEFAULT_PRESET_ID = 'tailrmade';

const presetsById = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const getPreset = (presetId: string | undefined): ThemePreset =>
  (presetId !== undefined ? presetsById.get(presetId) : undefined) ??
  presetsById.get(DEFAULT_PRESET_ID)!;

export const isKnownPresetId = (presetId: string | undefined): boolean =>
  presetId !== undefined && presetsById.has(presetId);

/**
 * Flattens a preset into the single flat token record every layer above it
 * diffs against. Colors come from the preset's entry for `mode`; everything
 * else is shared by both modes.
 */
export const presetToTokens = (
  preset: ThemePreset,
  mode: ThemeMode,
): ThemeTokens => {
  const colors = preset.roles[mode];
  const resolved = {} as ThemeTokens;
  COLOR_ROLES.forEach((role: ColorRole) => {
    resolved[role] = colors[role];
  });
  return {
    ...resolved,
    fontFamily: preset.typography.fontFamily,
    fontFamilyMono: preset.typography.fontFamilyMono,
    fontSizeScalar: preset.typography.fontSizeScalar,
    headingWeight: preset.typography.headingWeight,
    radius: preset.geometry.radius,
    density: preset.geometry.density,
    spacingUnit: preset.geometry.spacingUnit,
    elevation: preset.geometry.elevation,
    buttonVariant: preset.variants.button,
    inputVariant: preset.variants.input,
  };
};
