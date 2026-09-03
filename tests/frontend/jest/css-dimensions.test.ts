import {
  asCssDimension,
  isCssDimension,
  normalizeDimension,
  normalizeDimensionProps,
} from '../../../src/utils/cssDimensions';

describe('isCssDimension', () => {
  it.each([
    'auto',
    '100%',
    '240px',
    '1.5rem',
    '0',
    'min-content',
    'calc(100% - 8px)',
    'unset',
  ])('accepts %s', (value) => expect(isCssDimension(value)).toBe(true));

  it.each([200, '200', '', 'tall', null, undefined, {}, ['100%']])(
    'rejects %p',
    (value) => expect(isCssDimension(value)).toBe(false),
  );
});

describe('asCssDimension', () => {
  it('reads a bare number as pixels', () => {
    expect(asCssDimension(200)).toBe('200px');
    expect(asCssDimension('200')).toBe('200px');
  });

  it('falls back rather than letting junk reach the renderer', () => {
    // the crash this guards: getBasicLayoutStyles called height.endsWith
    expect(asCssDimension(null)).toBe('auto');
    expect(asCssDimension({})).toBe('auto');
    expect(asCssDimension('tall')).toBe('auto');
  });

  it('always returns something .endsWith can be called on', () => {
    for (const value of [200, null, undefined, {}, [], 'auto', NaN, Infinity]) {
      expect(typeof asCssDimension(value)).toBe('string');
    }
  });

  it('passes valid values through untouched', () => {
    expect(asCssDimension('100%')).toBe('100%');
    expect(asCssDimension(' 240px ')).toBe('240px');
  });

  // unitless zero is legal css; rewriting it to "0px" would mean warning
  // about a value that was already correct
  it('leaves a unitless zero alone', () => {
    expect(asCssDimension('0')).toBe('0');
    expect(normalizeDimension('0', 'height')).toEqual({ value: '0' });
  });
});

describe('normalizeDimension', () => {
  it('corrects a number and says so', () => {
    const result = normalizeDimension(240, 'height');

    expect(result.value).toBe('240px');
    expect(result.warning).toContain('height');
    expect(result.warning).toContain('240px');
  });

  it('drops what it cannot salvage', () => {
    const result = normalizeDimension('tall', 'height');

    expect(result.value).toBeUndefined();
    expect(result.warning).toContain('ignored');
  });

  it('stays quiet on a valid value', () => {
    expect(normalizeDimension('100%', 'width')).toEqual({ value: '100%' });
  });
});

describe('normalizeDimensionProps', () => {
  it('corrects every dimension key and leaves the rest alone', () => {
    const warnings: string[] = [];
    const props = normalizeDimensionProps(
      { width: '100%', height: 240, minHeight: 'tall', gap: 8 },
      'widget "ai-node-1"',
      warnings,
    );

    expect(props).toEqual({ width: '100%', height: '240px', gap: 8 });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('widget "ai-node-1" "height"');
  });

  it('returns the same object when nothing needed fixing', () => {
    const warnings: string[] = [];
    const input = { width: '100%', height: 'auto' };

    expect(normalizeDimensionProps(input, 'container', warnings)).toBe(input);
    expect(warnings).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    const warnings: string[] = [];
    const input = { height: 240 };
    normalizeDimensionProps(input, 'container', warnings);

    expect(input).toEqual({ height: 240 });
  });
});
