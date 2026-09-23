import { containerEmphasisSx } from '../../../src/utils/theme/emphasis';

const themeIn = (mode: 'light' | 'dark') =>
  ({
    shape: { borderRadius: 6 },
    shadows: ['none', 'low', 'the low shadow'],
    palette: {
      mode,
      divider: 'rgba(0, 0, 0, 0.12)',
      text: {
        primary: mode === 'light' ? 'rgba(0, 0, 0, 0.87)' : '#FFFFFF',
      },
    },
  }) as any;

// resolves the theme callbacks the way MUI's sx would
const resolve = (sx: Record<string, unknown>, mode: 'light' | 'dark') =>
  Object.fromEntries(
    Object.entries(sx).map(([key, value]) => [
      key,
      typeof value === 'function' ? value(themeIn(mode)) : value,
    ]),
  );

describe('container emphasis', () => {
  it('paints nothing for none, or for a value it does not know', () => {
    expect(containerEmphasisSx('none', false)).toEqual({});
    expect(containerEmphasisSx(undefined, false)).toEqual({});
    expect(containerEmphasisSx('loud', false)).toEqual({});
  });

  // the whole point: one stored level, a tint that flips with the mode
  it('tints subtle with the text color of whichever mode is on', () => {
    const light = resolve(containerEmphasisSx('subtle', false), 'light');
    const dark = resolve(containerEmphasisSx('subtle', false), 'dark');
    expect(light.backgroundColor).toBe(
      'color-mix(in srgb, rgba(0, 0, 0, 0.87) 4%, transparent)',
    );
    expect(dark.backgroundColor).toBe(
      'color-mix(in srgb, #FFFFFF 6%, transparent)',
    );
    expect(light.borderRadius).toBe('6px');
    expect(light.border).toBeUndefined();
  });

  it('makes strong a card from the theme roles', () => {
    const sx = resolve(containerEmphasisSx('strong', false), 'dark');
    expect(sx.backgroundColor).toBe('background.paper');
    expect(sx.border).toBe('1px solid rgba(0, 0, 0, 0.12)');
    expect(sx.boxShadow).toBe('the low shadow');
    expect(sx.borderRadius).toBe('6px');
  });

  it('keeps a background the creator picked', () => {
    expect(containerEmphasisSx('subtle', true).backgroundColor).toBeUndefined();
    const strong = resolve(containerEmphasisSx('strong', true), 'light');
    expect(strong.backgroundColor).toBeUndefined();
    // the card still reads as a card
    expect(strong.border).toBeDefined();
    expect(strong.boxShadow).toBeDefined();
  });
});
