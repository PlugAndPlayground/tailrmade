import { parseThemeOverrides } from '../../../src/utils/theme/document';

describe('parseThemeOverrides', () => {
  it('reads token names straight off the top level, from an object or a JSON string', () => {
    expect(
      parseThemeOverrides({ primary: '#ff0055', radius: 12 }).tokens,
    ).toEqual({ primary: '#ff0055', radius: 12 });
    expect(parseThemeOverrides('{"radius": 4}').tokens).toEqual({ radius: 4 });
  });

  it('reads per-mode colors from byMode and from the light/dark shorthand', () => {
    const parsed = parseThemeOverrides({
      dark: { primary: '#111111' },
      byMode: { dark: { secondary: '#222222' } },
    });
    expect(parsed.tokensByMode).toEqual({
      dark: { primary: '#111111', secondary: '#222222' },
    });
  });

  // a hand-typed typo has to come back as a message, not as silence
  it('names each key it dropped and why, and keeps the good ones', () => {
    const parsed = parseThemeOverrides({
      radius: 8,
      primry: '#ff0055',
      density: 'XXL',
      dark: { spacingUnit: 4 },
    });
    expect(parsed.tokens).toEqual({ radius: 8 });
    expect(parsed.rejected).toEqual([
      '"primry" is not a theme token',
      '"density" must be XS | S | M | L | XL',
      '"dark.spacingUnit" has no light/dark variant - move it to the top level',
    ]);
  });

  it('reports malformed input instead of throwing', () => {
    expect(parseThemeOverrides('{not json').rejected).toEqual([
      'The overrides are not valid JSON',
    ]);
    expect(parseThemeOverrides([1, 2]).rejected).toEqual([
      '"overrides" must be a JSON object',
    ]);
  });
});

describe('theme strings stay CSS values', () => {
  const { parseThemeDocument } = jest.requireActual(
    '../../../src/utils/theme/document',
  );
  it('keeps ordinary colors and font stacks', () => {
    const override = {
      primary: 'rgba(10, 20, 30, 0.5)',
      fontFamily: "'Courier New', monospace",
    };
    expect(parseThemeDocument({ override }).override).toEqual(override);
  });
  it.each([
    ['primary', 'red; background: blue'],
    ['primary', 'url(https://example.com/a.png)'],
    ['fontFamily', 'Roboto"; } body { display: none'],
    ['fontFamily', 'Roboto" , x'],
  ])('drops %s: %s', (key, value) => {
    expect(parseThemeDocument({ override: { [key]: value } }).override).toBe(
      undefined,
    );
  });
});
