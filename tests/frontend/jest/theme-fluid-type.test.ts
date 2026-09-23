import {
  FLUID_MAX_WIDTH_PX,
  FLUID_MIN_WIDTH_PX,
  TEXT_VARIANTS,
  VARIANT_STYLES,
  resolveTextElementStyle,
  variantFontSize,
} from '../../../src/text/model';
import { FONT_SCALAR_VAR } from '../../../src/utils/theme/tokens';

const FLUID = ['display', 'h1', 'h2', 'stat'] as const;
const FIXED = ['h3', 'body', 'caption', 'label'] as const;

const ROOT_PX = 16;

/**
 * What the browser would compute for a clamp() emitted by variantFontSize, at
 * a given app-surface width and type scalar. Reimplements just enough CSS to
 * assert on sizes in px, which is the only unit anyone reasons about here.
 */
const computePx = (css: string, widthPx: number, scalar = 1): number => {
  const parts = css.startsWith('clamp(')
    ? splitTopLevel(css.slice('clamp('.length, -1))
    : [css];
  const evaluate = (expression: string): number => {
    const rem = /(-?[\d.]+)rem/.exec(expression);
    const cqi = /(-?[\d.]+)cqi/.exec(expression);
    const base =
      (rem ? Number(rem[1]) * ROOT_PX : 0) +
      (cqi ? (Number(cqi[1]) * widthPx) / 100 : 0);
    return base * scalar;
  };
  const values = parts.map(evaluate);
  return values.length === 1
    ? values[0]
    : Math.min(Math.max(values[1], values[0]), values[2]);
};

const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
};

describe('fluid type scale', () => {
  it('emits a clamp for headings and a single size for body copy', () => {
    FLUID.forEach((variant) => {
      expect(variantFontSize(variant)).toContain('clamp(');
      expect(variantFontSize(variant)).toContain('cqi');
    });
    FIXED.forEach((variant) => {
      expect(variantFontSize(variant)).not.toContain('clamp(');
      expect(variantFontSize(variant)).not.toContain('cqi');
    });
  });

  it('applies the type scalar to every variant, fluid or not', () => {
    TEXT_VARIANTS.forEach((variant) => {
      expect(variantFontSize(variant)).toContain(`var(${FONT_SCALAR_VAR}, 1)`);
    });
  });

  it('hits the authored size exactly at each end of the range', () => {
    FLUID.forEach((variant) => {
      const { fontSize, fontSizeMax } = VARIANT_STYLES[variant];
      const css = variantFontSize(variant);
      expect(computePx(css, FLUID_MIN_WIDTH_PX)).toBeCloseTo(fontSize, 1);
      expect(computePx(css, FLUID_MAX_WIDTH_PX)).toBeCloseTo(fontSizeMax!, 1);
    });
  });

  it('holds the end sizes outside the range instead of running away', () => {
    const display = variantFontSize('display');
    expect(computePx(display, 200)).toBeCloseTo(32, 1);
    expect(computePx(display, 2400)).toBeCloseTo(48, 1);
  });

  // the acceptance numbers from the TODO
  it('reads 32 and 26 in the 375px device preview, 48 and 32 on a desktop', () => {
    expect(computePx(variantFontSize('display'), 375)).toBeCloseTo(32, 0);
    expect(computePx(variantFontSize('h1'), 375)).toBeCloseTo(26, 0);
    expect(computePx(variantFontSize('display'), 1440)).toBeCloseTo(48, 0);
    expect(computePx(variantFontSize('h1'), 1440)).toBeCloseTo(32, 0);
  });

  it('scales the whole range when fontSizeScalar moves', () => {
    const display = variantFontSize('display');
    // at the pinned widths, where the size is exactly the authored one
    expect(computePx(display, FLUID_MIN_WIDTH_PX, 1.5)).toBeCloseTo(
      32 * 1.5,
      1,
    );
    expect(computePx(display, FLUID_MAX_WIDTH_PX, 1.5)).toBeCloseTo(
      48 * 1.5,
      1,
    );
    expect(computePx(variantFontSize('body'), 375, 1.5)).toBeCloseTo(24, 1);
  });

  // iOS zooms into an input whose text is under 16px, and there is no version
  // of "smaller body text" anyone wants
  it('never takes body text below 16px on a phone', () => {
    [320, 360, 375, 414].forEach((width) => {
      expect(computePx(variantFontSize('body'), width)).toBeGreaterThanOrEqual(
        16,
      );
    });
  });

  it('keeps every variant ordered by size at both ends', () => {
    const at = (width: number) =>
      TEXT_VARIANTS.map((variant) =>
        computePx(variantFontSize(variant), width),
      );
    // display is the largest and caption the smallest, whatever the width
    [FLUID_MIN_WIDTH_PX, FLUID_MAX_WIDTH_PX].forEach((width) => {
      const sizes = at(width);
      const display = sizes[TEXT_VARIANTS.indexOf('display')];
      const body = sizes[TEXT_VARIANTS.indexOf('body')];
      const h3 = sizes[TEXT_VARIANTS.indexOf('h3')];
      const caption = sizes[TEXT_VARIANTS.indexOf('caption')];
      expect(display).toBeGreaterThan(h3);
      expect(h3).toBeGreaterThanOrEqual(body);
      expect(body).toBeGreaterThan(caption);
    });
  });
});

describe('h3', () => {
  it('sits between h2 and body, and after h2 in the dropdown order', () => {
    expect(TEXT_VARIANTS.indexOf('h3')).toBe(TEXT_VARIANTS.indexOf('h2') + 1);
    expect(VARIANT_STYLES.h3).toMatchObject({
      fontSize: 20,
      fontWeight: 600,
      lineHeight: 1.3,
    });
    expect(VARIANT_STYLES.h3.fontSizeMax).toBeUndefined();
  });
});

describe('resolveTextElementStyle', () => {
  it('carries the fluid size and drops the raw numbers', () => {
    const style = resolveTextElementStyle({
      variant: 'display',
      tone: 'default',
      alignment: 'left',
      customStyles: {},
    });
    expect(style.fontSize).toContain('clamp(');
    expect(style).not.toHaveProperty('fontSizeMax');
    expect(style.lineHeight).toBe(1.1);
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
