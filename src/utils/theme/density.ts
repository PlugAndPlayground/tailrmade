import { Theme, useTheme } from '@mui/material';
import { ThemeWithTokens } from './muiTheme';
import { ResolvedTheme, resolveTheme } from './resolve';
import { Density, DENSITIES } from './tokens';

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

export const isDensity = (value: unknown): value is Density =>
  DENSITIES.includes(value as Density);

/**
 * Resolves a widget's Size setting against what it inherits.
 *
 * 'Inherit' is the default for every widget, and it is what makes the theme's
 * density reach controls at all - a widget that names an explicit size opts
 * out of the chain, everything else follows it.
 */
export const resolveDensity = (
  setting: unknown,
  inherited: Density,
): Density => (isDensity(setting) ? setting : inherited);

/**
 * The density in force at this point in the tree.
 *
 * The inheritance chain is the ThemeProvider chain: whichever theme is nearest
 * wins. That is what lets a container override density for its subtree later
 * (it provides a theme with a different tm.density) without the resolver
 * needing to know containers exist - and it is why widgets must read this
 * rather than the app theme store, so a widget on canvas follows the editor
 * theme and the same widget in the dashboard follows the app theme.
 */
export const useThemeDensity = (): Density =>
  resolveThemeOfMuiTheme(useTheme()).tokens.density;

export const useResolvedDensity = (setting: unknown): Density =>
  resolveDensity(setting, useThemeDensity());
