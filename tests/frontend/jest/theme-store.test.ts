import {
  buildThemeLayers,
  getRuntimeThemeLayer,
  getThemeDocument,
  clearRuntimeThemeLayer,
  resolveAppThemeNow,
  setRuntimeThemeLayer,
  setThemeDocument,
} from '../../../src/utils/theme/store';
import { EMPTY_THEME_DOCUMENT } from '../../../src/utils/theme/document';

afterEach(() => {
  setThemeDocument(EMPTY_THEME_DOCUMENT);
  clearRuntimeThemeLayer();
});

describe('theme store', () => {
  it('puts the saved layer under the runtime layer', () => {
    const layers = buildThemeLayers(
      { presetId: 'slate', override: { radius: 1 } },
      { tokens: { radius: 20 } },
    );
    expect(layers.map((layer) => layer.source)).toEqual(['saved', 'runtime']);
  });

  it('omits the runtime layer entirely when nothing pushed one', () => {
    expect(buildThemeLayers({ presetId: 'slate' })).toHaveLength(1);
  });

  it('resolves outside React for the imperative paths', () => {
    setThemeDocument({ presetId: 'paper', mode: 'light' });
    expect(resolveAppThemeNow(true).presetId).toBe('paper');
    expect(resolveAppThemeNow(true).mode).toBe('light');
  });

  it('leaves the saved document untouched when the runtime layer changes', () => {
    // the property the Theme node depends on: playing with a theme at runtime
    // must never mutate what gets serialized back into the app document
    const saved = { presetId: 'slate', mode: 'dark' as const };
    setThemeDocument(saved);
    setRuntimeThemeLayer({ tokens: { radius: 20 } });

    expect(resolveAppThemeNow(true).tokens.radius).toBe(20);
    expect(getThemeDocument()).toEqual(saved);

    clearRuntimeThemeLayer();
    expect(getRuntimeThemeLayer()).toBeUndefined();
    expect(resolveAppThemeNow(true).tokens.radius).toBe(
      resolveAppThemeNow(true).tokens.radius,
    );
    expect(resolveAppThemeNow(true).provenance.radius).toBeUndefined();
  });
});
