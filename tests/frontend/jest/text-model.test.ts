import {
  normalizeTextProps,
  resolveTextElementStyle,
  textDefaultProps,
} from '../../../src/text/model';

describe('text props', () => {
  it('normalizes unknown values back to defaults', () => {
    expect(
      normalizeTextProps({
        variant: 'huge',
        tone: 'loud',
        alignment: 'middle',
        customStyles: 'nope',
      }),
    ).toEqual({ ...textDefaultProps, content: '' });
  });

  it('applies custom styles over the variant, tone and alignment', () => {
    const base = {
      variant: 'h1' as const,
      tone: 'primary' as const,
      alignment: 'center' as const,
      customStyles: {},
    };
    expect(resolveTextElementStyle(base)).toMatchObject({
      fontSize: '32px',
      fontWeight: 700,
      color: 'primary.main',
      textAlign: 'center',
    });
    expect(resolveTextElementStyle({ ...base, tone: 'default' }).color).toBe(
      'inherit',
    );
    expect(
      resolveTextElementStyle({
        ...base,
        customStyles: { fontSize: '9px', color: 'red' },
      }),
    ).toMatchObject({ fontSize: '9px', fontWeight: 700, color: 'red' });
  });
});
