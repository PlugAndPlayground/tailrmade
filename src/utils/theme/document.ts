import { ThemeLayer } from './resolve';
import {
  COLOR_ROLES,
  DENSITIES,
  Density,
  ThemeMode,
  ThemeTokens,
} from './tokens';

// What actually gets stored in the app document: a SPARSE DIFF, never a
// resolved snapshot. A snapshot would freeze preset improvements out of
// existing apps, bloat every document, and turn "we added a role" into a
// migration. With a diff, an absent key just resolves from the preset.
export type ThemeDocument = {
  presetId?: string;
  // absent means "follow the system preference" - see setDocumentMode
  mode?: ThemeMode;
  override?: Partial<ThemeTokens>;
};

export const EMPTY_THEME_DOCUMENT: ThemeDocument = {};

const SHAPE_TOKEN_VALIDATORS: Partial<
  Record<keyof ThemeTokens, (value: unknown) => boolean>
> = {
  fontFamily: (value) => typeof value === 'string',
  fontFamilyMono: (value) => typeof value === 'string',
  fontSizeScalar: (value) => typeof value === 'number' && value > 0,
  headingWeight: (value) => typeof value === 'number',
  radius: (value) => typeof value === 'number' && value >= 0,
  density: (value) => DENSITIES.includes(value as Density),
  spacingUnit: (value) => typeof value === 'number' && value > 0,
  elevation: (value) =>
    value === 'none' || value === 'subtle' || value === 'raised',
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
  if (raw.mode === 'light' || raw.mode === 'dark') {
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

  return document;
};

export const isEmptyThemeDocument = (document: ThemeDocument): boolean =>
  document.presetId === undefined &&
  document.mode === undefined &&
  (document.override === undefined ||
    Object.keys(document.override).length === 0);

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
});

/**
 * Applies a mode choice made by a person, following the two-state toggle rules:
 *
 * - choosing a mode that DIFFERS from the system preference stores the override
 * - choosing a mode that MATCHES the system preference REMOVES the stored value
 *   rather than storing the matching literal, which would silently convert a
 *   temporary adjustment into a permanent pin with no way back
 *
 * Note that this evaluation happens only here, on user interaction. A stored
 * override is never cleared just because the system preference later drifted
 * into agreement with it - plenty of people run their OS on a time-of-day
 * schedule, and proactive clearing would make pinning impossible.
 */
export const setDocumentMode = (
  document: ThemeDocument,
  next: ThemeMode,
  systemPrefersDark: boolean,
): ThemeDocument => {
  const systemMode: ThemeMode = systemPrefersDark ? 'dark' : 'light';
  if (next === systemMode) {
    const { mode: _removed, ...rest } = document;
    return rest;
  }
  return { ...document, mode: next };
};

/** Explicitly follow the system preference again (the three-state setting). */
export const clearDocumentMode = (document: ThemeDocument): ThemeDocument => {
  const { mode: _removed, ...rest } = document;
  return rest;
};

export const setDocumentPreset = (
  document: ThemeDocument,
  presetId: string,
): ThemeDocument => ({ ...document, presetId });

export const setDocumentOverride = <K extends keyof ThemeTokens>(
  document: ThemeDocument,
  key: K,
  value: ThemeTokens[K],
): ThemeDocument => ({
  ...document,
  override: { ...document.override, [key]: value },
});

/** Removes one override so the role resolves from the preset again. */
export const clearDocumentOverride = (
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

export const clearAllDocumentOverrides = (
  document: ThemeDocument,
): ThemeDocument => {
  const { override: _removed, ...rest } = document;
  return rest;
};
