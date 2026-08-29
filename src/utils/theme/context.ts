import { Theme, useTheme } from '@mui/material';
import { ThemeWithTokens } from './muiTheme';
import { ResolvedTheme, resolveTheme } from './resolve';
import { DEFAULT_THEME_MODE, ThemeMode, ThemeTokens } from './tokens';

// What a theme resolves to when it carries no token set of its own - today
// that is the editor theme, which has not been converted yet.
const fallbacks = new Map<ThemeMode, ResolvedTheme>();

export const getFallbackResolvedTheme = (
  mode: ThemeMode = DEFAULT_THEME_MODE,
): ResolvedTheme => {
  const cached = fallbacks.get(mode);
  if (cached) {
    return cached;
  }
  const resolved = resolveTheme([{ source: 'saved', mode }], {
    prefersDark: mode === 'dark',
  });
  fallbacks.set(mode, resolved);
  return resolved;
};

export const resolveThemeOfMuiTheme = (theme: Theme): ResolvedTheme =>
  (theme as ThemeWithTokens).tm ??
  getFallbackResolvedTheme(theme.palette?.mode === 'light' ? 'light' : 'dark');

/**
 * The token set in force at this point in the tree.
 *
 * Reads the theme from CONTEXT rather than the app theme store, so a component
 * picks up whichever theme it is actually under: the editor theme on canvas
 * chrome, the app theme inside the dashboard boundary. That is also what makes
 * the inheritance chain work without the resolver knowing containers exist - a
 * container that provides its own theme overrides its whole subtree.
 */
export const useThemeTokens = (): ThemeTokens =>
  resolveThemeOfMuiTheme(useTheme()).tokens;
