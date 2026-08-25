import {
  isButtonVariant,
  isInputVariant,
  resolveButtonVariant,
  resolveInputVariant,
} from '../../../src/utils/theme/variants';

describe('variant inheritance', () => {
  it('follows the theme when the widget says Inherit', () => {
    expect(resolveButtonVariant('Inherit', 'outlined')).toBe('outlined');
    expect(resolveInputVariant('Inherit', 'standard')).toBe('standard');
  });

  it('lets an explicitly named variant opt out', () => {
    expect(resolveButtonVariant('text', 'contained')).toBe('text');
    expect(resolveInputVariant('filled', 'outlined')).toBe('filled');
  });

  it('does not confuse the two variant families', () => {
    // 'contained' is a button variant, never an input one
    expect(isInputVariant('contained')).toBe(false);
    expect(isButtonVariant('filled')).toBe(false);
    expect(resolveInputVariant('contained', 'filled')).toBe('filled');
  });

  it('treats anything unrecognised as Inherit rather than guessing', () => {
    expect(resolveButtonVariant(undefined, 'contained')).toBe('contained');
    expect(resolveButtonVariant('', 'contained')).toBe('contained');
    expect(resolveInputVariant(null, 'filled')).toBe('filled');
  });
});
