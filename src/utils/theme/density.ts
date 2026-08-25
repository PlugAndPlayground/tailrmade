import { useThemeTokens } from './context';
import { Density, DENSITIES } from './tokens';

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

export const useThemeDensity = (): Density => useThemeTokens().density;

export const useResolvedDensity = (setting: unknown): Density =>
  resolveDensity(setting, useThemeDensity());
