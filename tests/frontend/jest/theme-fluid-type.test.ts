import {
  FLUID_MAX_WIDTH_PX,
  FLUID_MIN_WIDTH_PX,
  VARIANT_STYLES,
  resolveTextElementStyle,
  variantFontSize,
} from '../../../src/text/model';
import { FONT_SCALAR_VAR } from '../../../src/utils/theme/tokens';

const FLUID = ['display', 'h1', 'h2', 'stat'] as const;

// the preferred (middle) term of the clamp, `(Xrem + Ycqi)`, in px at a width
const preferredPx = (css: string, widthPx: number): number => {
  const [, rem, cqi] = /\((-?[\d.]+)rem \+ (-?[\d.]+)cqi\)/.exec(css)!;
  return Number(rem) * 16 + (Number(cqi) * widthPx) / 100;
};

describe('fluid type scale', () => {
  it('clamps headings and keeps body copy one size, all under the type scalar', () => {
    FLUID.forEach((variant) => {
      expect(variantFontSize(variant)).toContain('clamp(');
    });
    expect(variantFontSize('body')).not.toContain('clamp(');
    expect(variantFontSize('body')).toContain(`var(${FONT_SCALAR_VAR}, 1)`);
  });

  it('hits the authored size exactly at each end of the range', () => {
    FLUID.forEach((variant) => {
      const { fontSize, fontSizeMax } = VARIANT_STYLES[variant];
      const css = variantFontSize(variant);
      expect(preferredPx(css, FLUID_MIN_WIDTH_PX)).toBeCloseTo(fontSize, 1);
      expect(preferredPx(css, FLUID_MAX_WIDTH_PX)).toBeCloseTo(fontSizeMax!, 1);
    });
  });

  it('still lets a hand-typed size win over the whole scale', () => {
    const style = resolveTextElementStyle({
      variant: 'display',
      tone: 'default',
      alignment: 'left',
      customStyles: { fontSize: '9px' },
    });
    expect(style.fontSize).toBe('9px');
  });
});
