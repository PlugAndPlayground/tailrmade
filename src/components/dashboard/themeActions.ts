import { ActionHandler } from '../../classes/Action';
import {
  clearAllDocumentOverrides,
  clearDocumentOverride,
  setDocumentMode,
  setDocumentModeOverride,
  setDocumentOverride,
  setDocumentPreset,
  ThemeDocument,
} from '../../utils/theme/document';
import { getThemeDocument, setThemeDocument } from '../../utils/theme/store';
import {
  ColorRole,
  ThemeMode,
  ThemeModeSetting,
  ThemeTokens,
} from '../../utils/theme/tokens';

/**
 * Every write to the saved theme layer goes through here, so marking the graph
 * dirty can never be forgotten at a call site.
 */
export const updateThemeDocument = (
  update: (document: ThemeDocument) => ThemeDocument,
): void => {
  const next = update(getThemeDocument());
  setThemeDocument(next);
  ActionHandler.setUnsavedChange(true);
};

export const chooseThemePreset = (presetId: string): void =>
  updateThemeDocument((document) => setDocumentPreset(document, presetId));

export const chooseThemeMode = (mode: ThemeModeSetting): void =>
  updateThemeDocument((document) => setDocumentMode(document, mode));

export const overrideThemeToken = <K extends keyof ThemeTokens>(
  key: K,
  value: ThemeTokens[K],
): void =>
  updateThemeDocument((document) => setDocumentOverride(document, key, value));

export const overrideThemeColorForMode = (
  mode: ThemeMode,
  role: ColorRole,
  value: string,
): void =>
  updateThemeDocument((document) =>
    setDocumentModeOverride(document, mode, role, value),
  );

export const resetThemeToken = (key: keyof ThemeTokens): void =>
  updateThemeDocument((document) => clearDocumentOverride(document, key));

export const resetAllThemeTokens = (): void =>
  updateThemeDocument(clearAllDocumentOverrides);

// Color pickers and sliders fire continuously while dragged, and every
// distinct value resolves a new token set and builds a new MUI theme. Trailing
// the write keeps that off the pointermove path while staying visibly live.
const OVERRIDE_DEBOUNCE_MS = 80;

// keyed per token, not one shared timer: adjusting a second role within the
// debounce window must not cancel the first role's pending write
const pendingOverrides = new Map<
  keyof ThemeTokens,
  { timer: ReturnType<typeof setTimeout>; write: () => void }
>();

const debounce = (key: keyof ThemeTokens, write: () => void): void => {
  const existing = pendingOverrides.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    pendingOverrides.delete(key);
    write();
  }, OVERRIDE_DEBOUNCE_MS);
  pendingOverrides.set(key, { timer, write });
};

export const overrideThemeTokenDebounced = <K extends keyof ThemeTokens>(
  key: K,
  value: ThemeTokens[K],
): void => debounce(key, () => overrideThemeToken(key, value));

export const overrideThemeColorForModeDebounced = (
  mode: ThemeMode,
  role: ColorRole,
  value: string,
): void => debounce(role, () => overrideThemeColorForMode(mode, role, value));

/** Writes any trailing values immediately - for tests and teardown. */
export const flushThemeTokenOverrides = (): void => {
  pendingOverrides.forEach(({ timer, write }) => {
    clearTimeout(timer);
    write();
  });
  pendingOverrides.clear();
};
