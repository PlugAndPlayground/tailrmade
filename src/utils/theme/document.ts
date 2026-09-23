import { ThemeLayer } from './resolve';
import {
  COLOR_ROLES,
  ColorRole,
  ColorTokens,
  DEFAULT_THEME_MODE,
  DENSITIES,
  Density,
  isColorRole,
  THEME_MODES,
  ThemeMode,
  ThemeModeSetting,
  ThemeTokens,
} from './tokens';

// What actually gets stored in the app document: a SPARSE DIFF, never a
// resolved snapshot. A snapshot would freeze preset improvements out of
// existing apps, bloat every document, and turn "we added a role" into a
// migration. With a diff, an absent key just resolves from the preset.
export type ThemeDocument = {
  presetId?: string;
  mode?: ThemeModeSetting;
  override?: Partial<ThemeTokens>;
  overrideByMode?: Partial<Record<ThemeMode, Partial<ColorTokens>>>;
};

export const EMPTY_THEME_DOCUMENT: ThemeDocument = {};

const SHAPE_TOKEN_VALIDATORS: Partial<
  Record<keyof ThemeTokens, (value: unknown) => boolean>
> = {
  fontFamily: (value) => typeof value === 'string',
  fontFamilyMono: (value) => typeof value === 'string',
  fontSizeScalar: (value) => typeof value === 'number' && value > 0,
  radius: (value) => typeof value === 'number' && value >= 0,
  density: (value) => DENSITIES.includes(value as Density),
  spacingUnit: (value) => typeof value === 'number' && value > 0,
  buttonVariant: (value) =>
    value === 'contained' || value === 'outlined' || value === 'text',
  inputVariant: (value) =>
    value === 'outlined' || value === 'filled' || value === 'standard',
};

const isValidTokenEntry = (key: string, value: unknown): boolean => {
  if ((COLOR_ROLES as readonly string[]).includes(key)) {
    return typeof value === 'string' && value.length > 0;
  }
  const validator = SHAPE_TOKEN_VALIDATORS[key as keyof ThemeTokens];
  return validator !== undefined && validator(value);
};

/**
 * Tolerant read. Anything we do not recognise is DROPPED rather than carried
 * through, so a document written by a newer client - one that knows a role
 * this build does not - still resolves instead of poisoning the token record.
 */
export const parseThemeDocument = (value: unknown): ThemeDocument => {
  if (typeof value !== 'object' || value === null) {
    return EMPTY_THEME_DOCUMENT;
  }
  const raw = value as Record<string, unknown>;
  const document: ThemeDocument = {};

  if (typeof raw.presetId === 'string') {
    document.presetId = raw.presetId;
  }
  if (raw.mode === 'light' || raw.mode === 'dark' || raw.mode === 'system') {
    document.mode = raw.mode;
  }
  if (typeof raw.override === 'object' && raw.override !== null) {
    const override: Partial<ThemeTokens> = {};
    Object.entries(raw.override as Record<string, unknown>).forEach(
      ([key, entry]) => {
        if (isValidTokenEntry(key, entry)) {
          (override as Record<string, unknown>)[key] = entry;
        }
      },
    );
    if (Object.keys(override).length > 0) {
      document.override = override;
    }
  }

  if (typeof raw.overrideByMode === 'object' && raw.overrideByMode !== null) {
    const byMode: Partial<Record<ThemeMode, Partial<ColorTokens>>> = {};
    THEME_MODES.forEach((mode) => {
      const entry = (raw.overrideByMode as Record<string, unknown>)[mode];
      if (typeof entry !== 'object' || entry === null) {
        return;
      }
      const colors: Partial<ColorTokens> = {};
      Object.entries(entry as Record<string, unknown>).forEach(
        ([key, value]) => {
          if (isColorRole(key) && isValidTokenEntry(key, value)) {
            colors[key] = value as string;
          }
        },
      );
      if (Object.keys(colors).length > 0) {
        byMode[mode] = colors;
      }
    });
    if (Object.keys(byMode).length > 0) {
      document.overrideByMode = byMode;
    }
  }

  return document;
};

const hasModeOverrides = (document: ThemeDocument): boolean =>
  document.overrideByMode !== undefined &&
  THEME_MODES.some(
    (mode) => Object.keys(document.overrideByMode?.[mode] ?? {}).length > 0,
  );

export const isEmptyThemeDocument = (document: ThemeDocument): boolean =>
  document.presetId === undefined &&
  document.mode === undefined &&
  (document.override === undefined ||
    Object.keys(document.override).length === 0) &&
  !hasModeOverrides(document);

/**
 * Serialized form for graphSettings.theme. Returns undefined for an untouched
 * theme so we do not write an empty object into every graph that never opened
 * the theming UI.
 */
export const serializeThemeDocument = (
  document: ThemeDocument,
): ThemeDocument | undefined =>
  isEmptyThemeDocument(document) ? undefined : document;

export const themeDocumentToLayer = (document: ThemeDocument): ThemeLayer => ({
  source: 'saved',
  presetId: document.presetId,
  mode: document.mode,
  tokens: document.override,
  tokensByMode: document.overrideByMode,
});

// Applies a mode choice made by a person.
export const setDocumentMode = (
  document: ThemeDocument,
  next: ThemeModeSetting,
): ThemeDocument => {
  if (next === DEFAULT_THEME_MODE) {
    const { mode: _removed, ...rest } = document;
    return rest;
  }
  return { ...document, mode: next };
};

export const setDocumentPreset = (
  document: ThemeDocument,
  presetId: string,
): ThemeDocument => ({ ...document, presetId });

export const setDocumentOverride = <K extends keyof ThemeTokens>(
  document: ThemeDocument,
  key: K,
  value: ThemeTokens[K],
): ThemeDocument =>
  dropModeOverrides(
    { ...document, override: { ...document.override, [key]: value } },
    key,
  );

export const setDocumentModeOverride = (
  document: ThemeDocument,
  mode: ThemeMode,
  role: ColorRole,
  value: string,
): ThemeDocument => {
  const next: ThemeDocument = {
    ...document,
    overrideByMode: {
      ...document.overrideByMode,
      [mode]: { ...document.overrideByMode?.[mode], [role]: value },
    },
  };
  return dropFlatOverride(next, role);
};

const dropFlatOverride = (
  document: ThemeDocument,
  key: keyof ThemeTokens,
): ThemeDocument => {
  if (!document.override || !(key in document.override)) {
    return document;
  }
  const { [key]: _removed, ...rest } = document.override;
  const next: ThemeDocument = { ...document };
  if (Object.keys(rest).length > 0) {
    next.override = rest;
  } else {
    delete next.override;
  }
  return next;
};

const dropModeOverrides = (
  document: ThemeDocument,
  key: keyof ThemeTokens,
): ThemeDocument => {
  if (!document.overrideByMode) {
    return document;
  }
  const byMode: Partial<Record<ThemeMode, Partial<ColorTokens>>> = {};
  THEME_MODES.forEach((mode) => {
    const colors = document.overrideByMode?.[mode];
    if (!colors) {
      return;
    }
    const { [key as ColorRole]: _removed, ...rest } = colors;
    if (Object.keys(rest).length > 0) {
      byMode[mode] = rest;
    }
  });
  const next: ThemeDocument = { ...document };
  if (Object.keys(byMode).length > 0) {
    next.overrideByMode = byMode;
  } else {
    delete next.overrideByMode;
  }
  return next;
};

export const clearDocumentOverride = (
  document: ThemeDocument,
  key: keyof ThemeTokens,
): ThemeDocument => dropModeOverrides(dropFlatOverride(document, key), key);

export const clearAllDocumentOverrides = (
  document: ThemeDocument,
): ThemeDocument => {
  const {
    override: _removed,
    overrideByMode: _removedByMode,
    ...rest
  } = document;
  return rest;
};

export type ParsedThemeOverrides = {
  tokens?: Partial<ThemeTokens>;
  tokensByMode?: Partial<Record<ThemeMode, Partial<ColorTokens>>>;
  rejected: string[];
};

const TOKEN_VALUE_HINTS: Record<string, string> = {
  fontFamily: 'a font stack, as a string',
  fontFamilyMono: 'a monospace font stack, as a string',
  fontSizeScalar: 'a number greater than 0',
  radius: 'a number of 0 or more',
  density: DENSITIES.join(' | '),
  spacingUnit: 'a number greater than 0',
  buttonVariant: 'contained | outlined | text',
  inputVariant: 'outlined | filled | standard',
};

const isTokenKey = (key: string): boolean =>
  isColorRole(key) || key in SHAPE_TOKEN_VALIDATORS;

const describeExpected = (key: string): string =>
  isColorRole(key) ? 'a color string' : (TOKEN_VALUE_HINTS[key] ?? 'a value');

const collectTokenEntries = (
  raw: Record<string, unknown>,
  colorsOnly: boolean,
  path: string,
  rejected: string[],
): Record<string, unknown> => {
  const collected: Record<string, unknown> = {};
  Object.entries(raw).forEach(([key, value]) => {
    const label = `${path}${key}`;
    if (!isTokenKey(key)) {
      rejected.push(`"${label}" is not a theme token`);
      return;
    }
    if (colorsOnly && !isColorRole(key)) {
      rejected.push(
        `"${label}" has no light/dark variant - move it to the top level`,
      );
      return;
    }
    if (!isValidTokenEntry(key, value)) {
      rejected.push(`"${label}" must be ${describeExpected(key)}`);
      return;
    }
    collected[key] = value;
  });
  return collected;
};

const asRecord = (
  value: unknown,
  label: string,
  rejected: string[],
): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    rejected.push(`"${label}" must be a JSON object`);
    return undefined;
  }
  return value as Record<string, unknown>;
};

export const parseThemeOverrides = (value: unknown): ParsedThemeOverrides => {
  const rejected: string[] = [];
  if (value === undefined || value === null || value === '') {
    return { rejected };
  }

  let raw: unknown = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { rejected: ['The overrides are not valid JSON'] };
    }
  }
  const entries = asRecord(raw, 'overrides', rejected);
  if (!entries) {
    return { rejected };
  }

  const flat: Record<string, unknown> = {};
  const perMode: Partial<Record<ThemeMode, Record<string, unknown>>> = {};
  const byMode = asRecord(entries.byMode, 'byMode', rejected) ?? {};

  Object.entries(entries).forEach(([key, entry]) => {
    if (key === 'byMode') {
      return;
    }
    if ((THEME_MODES as string[]).includes(key)) {
      const colors = asRecord(entry, key, rejected);
      if (colors) {
        perMode[key as ThemeMode] = { ...colors };
      }
      return;
    }
    flat[key] = entry;
  });

  THEME_MODES.forEach((mode) => {
    const colors = asRecord(byMode[mode], `byMode.${mode}`, rejected);
    if (colors) {
      perMode[mode] = { ...perMode[mode], ...colors };
    }
  });

  const result: ParsedThemeOverrides = { rejected };

  const tokens = collectTokenEntries(flat, false, '', rejected);
  if (Object.keys(tokens).length > 0) {
    result.tokens = tokens as Partial<ThemeTokens>;
  }

  const tokensByMode: Partial<Record<ThemeMode, Partial<ColorTokens>>> = {};
  THEME_MODES.forEach((mode) => {
    const colors = perMode[mode];
    if (!colors) {
      return;
    }
    const collected = collectTokenEntries(colors, true, `${mode}.`, rejected);
    if (Object.keys(collected).length > 0) {
      tokensByMode[mode] = collected as Partial<ColorTokens>;
    }
  });
  if (Object.keys(tokensByMode).length > 0) {
    result.tokensByMode = tokensByMode;
  }

  return result;
};
