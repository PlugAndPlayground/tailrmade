import {
  formatToken,
  migrateLegacyMentions,
  parseToken,
  renderTokenSource,
  resolveTokenPath,
  scanTokenSpans,
  tokenValueToText,
  validateInputName,
} from '../../../src/text/tokens';

describe('parseToken', () => {
  it('reads plain path tokens', () => {
    expect(parseToken('{{name}}')).toEqual({ path: ['name'] });
    expect(parseToken('{{d.temp}}')).toEqual({ path: ['d', 'temp'] });
    expect(parseToken('{{ name }}')).toEqual({ path: ['name'] });
    expect(parseToken('{{[Input 2]}}')).toEqual({ path: ['Input 2'] });
  });

  it.each([
    '{{#if x}}y{{/if}}',
    '{{{x}}}',
    '{{~x~}}',
    '{{this}}',
    '{{this.x}}',
    '{{@root.x}}',
    '{{../x}}',
    '{{true}}',
    '{{123}}',
    '{{"str"}}',
    '{{x y}}',
    '{{macro "name"}}',
    '{{format d.temp}}',
    '{{format d decimals=1 suffix=" °C"}}',
    '{{d key=1}}',
    '{{!-- comment --}}',
    '{{> partial}}',
    '{{a}}{{b}}',
    '{{name}} and text',
    '{{',
  ])('rejects %s', (source) => {
    expect(parseToken(source)).toBeUndefined();
  });
});

describe('formatToken', () => {
  it('writes canonical sources that parse back to the same token', () => {
    [{ path: ['name'] }, { path: ['d', 'temp'] }, { path: ['Input 2'] }].forEach(
      (token) => {
        expect(parseToken(formatToken(token))).toEqual(token);
      },
    );
    expect(formatToken({ path: ['Input 2'] })).toBe('{{[Input 2]}}');
    expect(formatToken({ path: ['d', 'temp'] })).toBe('{{d.temp}}');
  });
});

describe('scanTokenSpans', () => {
  it('finds valid tokens and leaves everything else as text', () => {
    const text = 'a {{x}} b {{#if y}} c {{{z}}} d \\{{w}} e {{format t}} f {{t}}';
    const spans = scanTokenSpans(text);
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual([
      '{{x}}',
      '{{t}}',
    ]);
    expect(spans[1].token).toEqual({ path: ['t'] });
  });

  it('recovers after an unterminated or invalid span', () => {
    expect(scanTokenSpans('{{bad thing}} {{ok}}').map((s) => s.token)).toEqual([
      { path: ['ok'] },
    ]);
    expect(scanTokenSpans('{{never closed')).toEqual([]);
  });
});

describe('resolveTokenPath', () => {
  const inputs = {
    name: 'Ada',
    zero: 0,
    no: false,
    empty: '',
    nothing: null,
    missing: undefined,
    d: { temp: 21.456, nested: { deep: 'yes' }, list: ['first', null] },
  };

  it('resolves scalar and object paths', () => {
    expect(resolveTokenPath(['name'], inputs)).toEqual({
      resolved: true,
      value: 'Ada',
    });
    expect(resolveTokenPath(['d', 'nested', 'deep'], inputs)).toEqual({
      resolved: true,
      value: 'yes',
    });
    expect(resolveTokenPath(['d', 'list', '0'], inputs)).toEqual({
      resolved: true,
      value: 'first',
    });
  });

  it('treats 0, false and the empty string as resolved', () => {
    ['zero', 'no', 'empty'].forEach((name) => {
      expect(resolveTokenPath([name], inputs).resolved).toBe(true);
    });
  });

  it('treats missing, undefined and null as unresolved', () => {
    [['nothing'], ['missing'], ['absent'], ['d', 'absent'], ['d', 'list', '1']]
      .concat([
        ['name', 'length'],
        ['zero', 'toFixed'],
      ])
      .forEach((path) => {
        expect(resolveTokenPath(path, inputs)).toEqual({ resolved: false });
      });
  });

  it('never follows prototype properties', () => {
    [
      ['constructor'],
      ['__proto__'],
      ['toString'],
      ['d', 'constructor'],
      ['d', '__proto__', 'polluted'],
      ['d', 'list', 'map'],
      ['d', 'hasOwnProperty'],
    ].forEach((path) => {
      expect(resolveTokenPath(path, inputs)).toEqual({ resolved: false });
    });
  });
});

describe('tokenValueToText', () => {
  const resolved = (value: unknown) => ({ resolved: true as const, value });

  it('shows nothing for an unresolved value', () => {
    expect(tokenValueToText({ resolved: false })).toBe('');
  });

  it('shows values as they are, objects as JSON', () => {
    expect(tokenValueToText(resolved('Ada'))).toBe('Ada');
    expect(tokenValueToText(resolved(21.456))).toBe('21.456');
    expect(tokenValueToText(resolved(0))).toBe('0');
    expect(tokenValueToText(resolved(false))).toBe('false');
    expect(tokenValueToText(resolved({ a: 1 }))).toBe('{"a":1}');
  });
});

describe('renderTokenSource', () => {
  it('never shows raw source to an end user', () => {
    expect(renderTokenSource('{{#if x}}', { x: 1 })).toBe('');
    expect(renderTokenSource('{{format x}}', { x: 1 })).toBe('');
    expect(renderTokenSource('{{gone}}', {})).toBe('');
    expect(renderTokenSource('{{d.temp}}', { d: { temp: 4 } })).toBe('4');
  });
});

describe('validateInputName', () => {
  it('accepts simple names', () => {
    expect(validateInputName('temp', ['Other'])).toBeUndefined();
    expect(validateInputName('my_value-2', [])).toBeUndefined();
    expect(validateInputName('format', [])).toBeUndefined();
  });

  it.each([
    ['', 'needs a name'],
    ['  ', 'needs a name'],
    ['temp', 'already exists'],
    ['this', 'reserved'],
    ['true', 'reserved'],
    ['d.temp', 'not a valid'],
    ['two words', 'not a valid'],
    ['42', 'not a valid'],
    ['@root', 'not a valid'],
    ['a}}b', 'not a valid'],
  ])('rejects %p', (name, reason) => {
    expect(validateInputName(name, ['temp'])).toContain(reason);
  });
});

describe('migrateLegacyMentions', () => {
  it('rewrites mentions to Handlebars outside code fences', () => {
    const markdown = [
      '# @[42](socket:Input)',
      'value @[old](socket:Input 2) here',
      '```',
      '@[x](socket:Input)',
      '```',
    ].join('\n');
    expect(migrateLegacyMentions(markdown)).toBe(
      [
        '# {{Input}}',
        'value {{[Input 2]}} here',
        '```',
        '@[x](socket:Input)',
        '```',
      ].join('\n'),
    );
  });
});
