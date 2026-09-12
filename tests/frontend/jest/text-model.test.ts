import {
  bakeTokens,
  createTextContent,
  normalizeTextContent,
  normalizeTextProps,
  resolveTextElementStyle,
  textContentToPlain,
  textDefaultProps,
} from '../../../src/text/model';
import { renderTokenSource } from '../../../src/text/tokens';

describe('text content', () => {
  it('builds paragraphs from plain text', () => {
    expect(createTextContent('one\n\ntwo')).toEqual({
      version: 1,
      paragraphs: [
        { runs: [{ type: 'text', text: 'one' }] },
        { runs: [] },
        { runs: [{ type: 'text', text: 'two' }] },
      ],
    });
  });

  it('sanitizes stored content', () => {
    const content = normalizeTextContent({
      paragraphs: [
        {
          runs: [
            { type: 'text', text: 'a', marks: { strong: true, color: 'red' } },
            { type: 'text', text: 'b', marks: { strong: true } },
            { type: 'text', text: '' },
            {
              type: 'text',
              text: 'c',
              marks: { tone: 'loud', link: 'javascript:x' },
            },
            {
              type: 'text',
              text: 'd',
              marks: { tone: 'accent', nowrap: true },
            },
            { type: 'token', source: '{{x}}', marks: { emphasis: true } },
            { type: 'image', src: 'x' },
            'nope',
          ],
        },
      ],
    });
    expect(content.paragraphs[0].runs).toEqual([
      { type: 'text', text: 'ab', marks: { strong: true } },
      { type: 'text', text: 'c' },
      { type: 'text', text: 'd', marks: { nowrap: true, tone: 'accent' } },
      { type: 'token', source: '{{x}}', marks: { emphasis: true } },
    ]);
    expect(normalizeTextContent(42)).toEqual(createTextContent(''));
    expect(normalizeTextContent('hi')).toEqual(createTextContent('hi'));
  });

  it('renders plain text with resolved tokens and never raw sources', () => {
    const content = normalizeTextContent({
      paragraphs: [
        {
          runs: [
            { type: 'text', text: 'T: ' },
            { type: 'token', source: '{{d.temp}}' },
            { type: 'break' },
            { type: 'token', source: '{{missing}}' },
          ],
        },
        { runs: [{ type: 'text', text: 'end' }] },
      ],
    });
    const inputs = { d: { temp: 20.04 } };
    expect(
      textContentToPlain(content, (source) =>
        renderTokenSource(source, inputs),
      ),
    ).toBe('T: 20.04\n\nend');
    expect(textContentToPlain(content)).toBe('T: \n\nend');
  });

  it('bakes tokens into text while keeping their marks', () => {
    const content = normalizeTextContent({
      paragraphs: [
        {
          runs: [
            { type: 'text', text: 'Hi ', marks: { strong: true } },
            { type: 'token', source: '{{name}}', marks: { strong: true } },
          ],
        },
      ],
    });
    expect(bakeTokens(content, () => 'Ada').paragraphs[0].runs).toEqual([
      { type: 'text', text: 'Hi Ada', marks: { strong: true } },
    ]);
  });
});

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
      tone: 'accent' as const,
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
