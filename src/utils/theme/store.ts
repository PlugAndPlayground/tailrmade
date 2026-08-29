import { useMemo, useSyncExternalStore } from 'react';
import { createStore } from '../../components/createStore';
import {
  EMPTY_THEME_DOCUMENT,
  ThemeDocument,
  themeDocumentToLayer,
} from './document';
import { ResolvedTheme, ThemeLayer, resolveTheme } from './resolve';

// The saved layer: what lives in the app document and is enough on its own to
// paint. Theming must never wait on graph execution - that would flash
// unthemed content on every load and break outright for apps whose theme node
// is never reached.
const documentStore = createStore<ThemeDocument>(EMPTY_THEME_DOCUMENT);

// The runtime layer sits ABOVE the saved one and is session-only, so pushing a
// theme at runtime never mutates the document - a reload returns to the saved
// theme. Increment C's Theme node writes here; nothing does yet, which is why
// the chain below already reads it.
const runtimeStore = createStore<Partial<ThemeLayer> | undefined>(undefined);

export const useThemeDocument = documentStore.useStore;
export const setThemeDocument = documentStore.set;

export const useRuntimeThemeLayer = runtimeStore.useStore;
export const setRuntimeThemeLayer = runtimeStore.set;
export const clearRuntimeThemeLayer = (): void => runtimeStore.set(undefined);

const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

const getSystemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SYSTEM_DARK_QUERY).matches
    : false;

const subscribeToSystemPreference = (onChange: () => void): (() => void) => {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => undefined;
  }
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

export const useSystemPrefersDark = (): boolean =>
  useSyncExternalStore(
    subscribeToSystemPreference,
    getSystemPrefersDark,
    () => false,
  );

/**
 * Assembles the layer chain, outermost first. The preset is not a layer of its
 * own here - it is the base the saved layer names and resolveTheme expands.
 */
export const buildThemeLayers = (
  document: ThemeDocument,
  runtime?: Partial<ThemeLayer>,
): ThemeLayer[] => {
  const layers: ThemeLayer[] = [themeDocumentToLayer(document)];
  if (runtime) {
    layers.push({ ...runtime, source: 'runtime' });
  }
  return layers;
};

export const useResolvedAppTheme = (): ResolvedTheme => {
  const document = useThemeDocument();
  const runtime = useRuntimeThemeLayer();
  const prefersDark = useSystemPrefersDark();
  // resolution walks the chain and runs the contrast checks - cheap, but not
  // cheap enough to redo on every render of every widget
  return useMemo(
    () => resolveTheme(buildThemeLayers(document, runtime), { prefersDark }),
    [document, runtime, prefersDark],
  );
};

/** Non-hook reads, for the imperative paths (graph load, serialization). */
export const getThemeDocument = documentStore.get;
export const getRuntimeThemeLayer = runtimeStore.get;

/**
 * Resolves outside React, for the same imperative paths. Takes the system
 * preference explicitly rather than reading matchMedia, so callers in tests
 * and workers are not at the mercy of the environment.
 */
export const resolveAppThemeNow = (
  prefersDark: boolean = getSystemPrefersDark(),
): ResolvedTheme =>
  resolveTheme(buildThemeLayers(documentStore.get(), runtimeStore.get()), {
    prefersDark,
  });
