import { useThemeTokens } from './context';
import { ButtonVariant, InputVariant } from './tokens';

// The default MUI variant for buttons and inputs is two lines of theme config
// that change the entire character of an app, so presets own it. A widget that
// names a variant explicitly opts out, exactly like Size.
export const INHERIT = 'Inherit';

const BUTTON_VARIANTS: ButtonVariant[] = ['contained', 'outlined', 'text'];
const INPUT_VARIANTS: InputVariant[] = ['outlined', 'filled', 'standard'];

export const isButtonVariant = (value: unknown): value is ButtonVariant =>
  BUTTON_VARIANTS.includes(value as ButtonVariant);

export const isInputVariant = (value: unknown): value is InputVariant =>
  INPUT_VARIANTS.includes(value as InputVariant);

export const resolveButtonVariant = (
  setting: unknown,
  inherited: ButtonVariant,
): ButtonVariant => (isButtonVariant(setting) ? setting : inherited);

export const resolveInputVariant = (
  setting: unknown,
  inherited: InputVariant,
): InputVariant => (isInputVariant(setting) ? setting : inherited);

export const useResolvedButtonVariant = (setting: unknown): ButtonVariant =>
  resolveButtonVariant(setting, useThemeTokens().buttonVariant);

/**
 * Inputs have no per-widget Variant socket - they follow the theme outright.
 * The argument is still accepted so a socket can be added later without
 * touching the call sites.
 */
export const useResolvedInputVariant = (setting?: unknown): InputVariant =>
  resolveInputVariant(setting, useThemeTokens().inputVariant);
