import { Theme, useTheme } from '@mui/material';
import { ThemeWithTokens } from './muiTheme';
import { ResolvedTheme, resolveTheme } from './resolve';
import { ThemeTokens } from './tokens';

// What a theme resolves to when it carries no token set of its own - today
// that is the editor theme, which has not been converted yet. Resolving an
// empty chain yields the default preset, so an unconverted theme behaves
// exactly as it did before theming existed.
let fallback: ResolvedTheme | undefined;

export const getFallbackResolvedTheme = (prefersDark = true): ResolvedTheme => {
  if (!fallback) {
    fallback = resolveTheme([], { prefersDark });
  }
  return fallback;
};

export const resolveThemeOfMuiTheme = (theme: Theme): ResolvedTheme =>
  (theme as ThemeWithTokens).tm ??
  getFallbackResolvedTheme(theme.palette?.mode !== 'light');

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
