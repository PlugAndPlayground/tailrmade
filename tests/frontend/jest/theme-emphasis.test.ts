import { containerEmphasisSx } from '../../../src/utils/theme/emphasis';

const themeIn = (mode: 'light' | 'dark') =>
  ({
    shape: { borderRadius: 6 },
    shadows: ['none', 'low', 'the low shadow'],
    palette: {
      mode,
      divider: '#dddddd',
      primary: { main: '#b8325a' },
      secondary: { main: '#3c54ab' },
      background: { paper: '#ffffff' },
      text: { primary: mode === 'light' ? '#000000' : '#ffffff' },
    },
  }) as any;

// resolves the theme callbacks the way MUI's sx would
const resolve = (
  sx: Record<string, unknown>,
  mode: 'light' | 'dark' = 'light',
) =>
  Object.fromEntries(
    Object.entries(sx).map(([key, value]) => [
      key,
      typeof value === 'function' ? value(themeIn(mode)) : value,
    ]),
  );

describe('container emphasis', () => {
  it('paints nothing without an emphasis, whatever the tone', () => {
    expect(containerEmphasisSx('none', 'primary', false)).toEqual({});
  });

  // one stored level, a tint that flips with the mode
  it('tints subtle with the text color of whichever mode is on', () => {
    const sx = containerEmphasisSx('subtle', 'neutral', false);
    expect(resolve(sx, 'light').backgroundColor).toBe(
      'color-mix(in srgb, #000000 4%, transparent)',
    );
    expect(resolve(sx, 'dark').backgroundColor).toBe(
      'color-mix(in srgb, #ffffff 6%, transparent)',
    );
  });

  it('makes strong a card from paper and divider, or tinted in a tone', () => {
    const neutral = resolve(containerEmphasisSx('strong', 'neutral', false));
    expect(neutral).toMatchObject({
      backgroundColor: '#ffffff',
      border: '1px solid #dddddd',
      boxShadow: 'the low shadow',
      borderRadius: '6px',
    });
    const primary = resolve(containerEmphasisSx('strong', 'primary', false));
    expect(primary.backgroundColor).toBe(
      'color-mix(in srgb, #b8325a 16%, transparent)',
    );
    expect(primary.border).toBe(
      '1px solid color-mix(in srgb, #b8325a 50%, transparent)',
    );
  });

  it('keeps a background the creator picked, and still draws the card', () => {
    const sx = resolve(containerEmphasisSx('strong', 'secondary', true));
    expect(sx.backgroundColor).toBeUndefined();
    expect(sx.border).toBe(
      '1px solid color-mix(in srgb, #3c54ab 50%, transparent)',
    );
  });
});
