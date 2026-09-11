import {
  formatToken,
  formatTokenValue,
  migrateLegacyMentions,
  parseToken,
  renderTokenSource,
  resolveTokenPath,
  scanTokenSpans,
  validateInputName,
} from '../../../src/text/tokens';

describe('parseToken', () => {
  it('reads plain path tokens', () => {
    expect(parseToken('{{name}}')).toEqual({ path: ['name'] });
    expect(parseToken('{{d.temp}}')).toEqual({ path: ['d', 'temp'] });
    expect(parseToken('{{ name }}')).toEqual({ path: ['name'] });
    expect(parseToken('{{[Input 2]}}')).toEqual({ path: ['Input 2'] });
  });

  it('reads the format helper and its supported fields', () => {
    expect(
      parseToken('{{format d.temp decimals=1 suffix=" °C" fallback="—"}}'),
    ).toEqual({
      path: ['d', 'temp'],
      format: { decimals: 1, suffix: ' °C', fallback: '—' },
    });
    expect(parseToken('{{format when dateFormat="YYYY-MM-DD"}}')).toEqual({
      path: ['when'],
      format: { dateFormat: 'YYYY-MM-DD' },
    });
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
    '{{format (lookup d x)}}',
    '{{format}}',
    '{{format d decimals="1"}}',
    '{{format d decimals=1.5}}',
    '{{format d color="red"}}',
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
    const tokens = [
      { path: ['name'] },
      { path: ['d', 'temp'] },
      { path: ['Input 2'] },
      {
        path: ['d', 'temp'],
        format: { decimals: 1, suffix: ' °C', fallback: '—' },
      },
      { path: ['d'], format: { dateFormat: 'HH:mm', suffix: '"' } },
    ];
    tokens.forEach((token) => {
      expect(parseToken(formatToken(token))).toEqual(token);
    });
    expect(formatToken({ path: ['Input 2'] })).toBe('{{[Input 2]}}');
    expect(
      formatToken({
        path: ['d', 'temp'],
        format: { decimals: 1, suffix: ' °C' },
      }),
    ).toBe('{{format d.temp decimals=1 suffix=" °C"}}');
  });
});

describe('scanTokenSpans', () => {
  it('finds valid tokens and leaves everything else as text', () => {
    const text =
      'a {{x}} b {{#if y}} c {{{z}}} d \\{{w}} e {{format t suffix="}}"}} f';
    const spans = scanTokenSpans(text);
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual([
      '{{x}}',
      '{{format t suffix="}}"}}',
    ]);
    expect(spans[1].token).toEqual({ path: ['t'], format: { suffix: '}}' } });
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

describe('formatTokenValue', () => {
  const resolved = (value: unknown) => ({ resolved: true as const, value });
  const unresolved = { resolved: false as const };

  it('uses the fallback for null values and nothing otherwise', () => {
    expect(formatTokenValue(unresolved, { fallback: '—', suffix: ' °C' })).toBe(
      '—',
    );
    expect(formatTokenValue(unresolved, { suffix: ' °C' })).toBe('');
  });

  it('applies decimals, then the suffix', () => {
    expect(
      formatTokenValue(resolved(21.456), { decimals: 1, suffix: ' °C' }),
    ).toBe('21.5 °C');
    expect(formatTokenValue(resolved('3'), { decimals: 2 })).toBe('3.00');
    expect(formatTokenValue(resolved(0), { decimals: 0, suffix: '%' })).toBe(
      '0%',
    );
    expect(formatTokenValue(resolved('n/a'), { decimals: 2 })).toBe('n/a');
  });

  it('formats dates with a pattern', () => {
    const date = new Date(2026, 8, 5, 7, 3, 9);
    expect(
      formatTokenValue(resolved(date), { dateFormat: 'YYYY-MM-DD HH:mm:ss' }),
    ).toBe('2026-09-05 07:03:09');
    expect(
      formatTokenValue(resolved(date.getTime()), {
        dateFormat: 'D.M.YY',
        suffix: '!',
      }),
    ).toBe('5.9.26!');
    expect(
      formatTokenValue(resolved('not a date'), { dateFormat: 'YYYY' }),
    ).toBe('not a date');
  });

  it('stringifies booleans and objects', () => {
    expect(formatTokenValue(resolved(false))).toBe('false');
    expect(formatTokenValue(resolved({ a: 1 }))).toBe('{"a":1}');
  });
});

describe('renderTokenSource', () => {
  it('never shows raw source to an end user', () => {
    expect(renderTokenSource('{{#if x}}', { x: 1 })).toBe('');
    expect(renderTokenSource('{{gone}}', {})).toBe('');
    expect(renderTokenSource('{{format gone fallback="?"}}', {})).toBe('?');
    expect(renderTokenSource('{{d.temp}}', { d: { temp: 4 } })).toBe('4');
  });
});

describe('validateInputName', () => {
  it('accepts simple names', () => {
    expect(validateInputName('temp', ['Other'])).toBeUndefined();
    expect(validateInputName('my_value-2', [])).toBeUndefined();
  });

  it.each([
    ['', 'needs a name'],
    ['  ', 'needs a name'],
    ['temp', 'already exists'],
    ['this', 'reserved'],
    ['format', 'reserved'],
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
