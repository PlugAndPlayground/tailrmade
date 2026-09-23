import { parseThemeOverrides } from '../../../src/utils/theme/document';
import { resolveTheme } from '../../../src/utils/theme/resolve';

const resolveWith = (overrides: unknown, prefersDark = false) => {
  const { tokens, tokensByMode } = parseThemeOverrides(overrides);
  return resolveTheme(
    [{ source: 'runtime', mode: 'light', tokens, tokensByMode }],
    { prefersDark },
  );
};

describe('parseThemeOverrides', () => {
  it('reads token names straight off the top level', () => {
    const parsed = parseThemeOverrides({ primary: '#ff0055', radius: 12 });
    expect(parsed.tokens).toEqual({ primary: '#ff0055', radius: 12 });
    expect(parsed.tokensByMode).toBeUndefined();
    expect(parsed.rejected).toEqual([]);
  });

  it('accepts a JSON string, since a JSON socket can be fed either', () => {
    expect(parseThemeOverrides('{"radius": 4}').tokens).toEqual({ radius: 4 });
  });

  it('treats an empty or absent value as no overrides at all', () => {
    [undefined, null, '', {}].forEach((value) => {
      const parsed = parseThemeOverrides(value);
      expect(parsed.tokens).toBeUndefined();
      expect(parsed.tokensByMode).toBeUndefined();
      expect(parsed.rejected).toEqual([]);
    });
  });

  it('reads per-mode colors from byMode and from the light/dark shorthand', () => {
    const viaByMode = parseThemeOverrides({
      byMode: { dark: { 'background.paper': '#121212' } },
    });
    const viaShorthand = parseThemeOverrides({
      dark: { 'background.paper': '#121212' },
    });
    expect(viaByMode.tokensByMode).toEqual({
      dark: { 'background.paper': '#121212' },
    });
    expect(viaShorthand.tokensByMode).toEqual(viaByMode.tokensByMode);
  });

  it('merges the shorthand and byMode when both name the same mode', () => {
    const parsed = parseThemeOverrides({
      dark: { primary: '#111111' },
      byMode: { dark: { secondary: '#222222' } },
    });
    expect(parsed.tokensByMode?.dark).toEqual({
      primary: '#111111',
      secondary: '#222222',
    });
  });

  // the point of parsing a hand-typed object rather than a stored one: a typo
  // has to come back as a message, not as silence
  it('names the key it dropped and why', () => {
    const parsed = parseThemeOverrides({
      primry: '#ff0055',
      radius: 'twelve',
      density: 'XXL',
    });
    expect(parsed.tokens).toBeUndefined();
    expect(parsed.rejected).toEqual([
      '"primry" is not a theme token',
      '"radius" must be a number of 0 or more',
      '"density" must be XS | S | M | L | XL',
    ]);
  });

  it('keeps the good keys when another one is bad', () => {
    const parsed = parseThemeOverrides({ radius: 8, nonsense: true });
    expect(parsed.tokens).toEqual({ radius: 8 });
    expect(parsed.rejected).toHaveLength(1);
  });

  it('rejects a shape token nested under a mode, where it would do nothing', () => {
    const parsed = parseThemeOverrides({ dark: { radius: 8 } });
    expect(parsed.tokensByMode).toBeUndefined();
    expect(parsed.rejected).toEqual([
      '"dark.radius" has no light/dark variant - move it to the top level',
    ]);
  });

  it('reports malformed input instead of throwing', () => {
    expect(parseThemeOverrides('{not json').rejected).toEqual([
      'The overrides are not valid JSON',
    ]);
    expect(parseThemeOverrides([1, 2]).rejected).toEqual([
      '"overrides" must be a JSON object',
    ]);
    expect(parseThemeOverrides({ byMode: 'dark' }).rejected).toEqual([
      '"byMode" must be a JSON object',
    ]);
  });
});

describe('overrides through the resolver', () => {
  it('layers parsed overrides over the preset', () => {
    const resolved = resolveWith({ primary: '#ff0055' });
    expect(resolved.tokens.primary).toBe('#ff0055');
    expect(resolved.provenance.primary).toBe('runtime');
  });

  it('lets a per-mode color win over a flat one for the same role', () => {
    const resolved = resolveWith({
      primary: '#111111',
      byMode: { light: { primary: '#222222' } },
    });
    expect(resolved.tokens.primary).toBe('#222222');
  });

  it('leaves the other mode resolving from the preset', () => {
    const { tokensByMode } = parseThemeOverrides({
      dark: { primary: '#222222' },
    });
    const light = resolveTheme(
      [{ source: 'runtime', mode: 'light', tokensByMode }],
      { prefersDark: false },
    );
    expect(light.tokens.primary).not.toBe('#222222');
    expect(light.provenance.primary).toBeUndefined();
  });
});
