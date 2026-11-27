import { matchCase, parseCases } from '../../../src/nodes/logic/selectCases';

describe('parseCases', () => {
  it('splits on commas and new lines and trims', () => {
    expect(parseCases('String, Number,\nBoolean ')).toEqual([
      'String',
      'Number',
      'Boolean',
    ]);
  });

  it('drops empty, repeated and reserved names', () => {
    expect(parseCases('a,, A, key, Default, cases, b')).toEqual(['a', 'b']);
    expect(parseCases(undefined)).toEqual([]);
  });
});

describe('matchCase', () => {
  const cases = ['String', 'Number'];

  it('ignores upper and lower case and spaces', () => {
    expect(matchCase(cases, ' number ')).toBe('Number');
  });

  it('matches nothing for an unknown or missing key', () => {
    expect(matchCase(cases, 'Boolean')).toBeUndefined();
    expect(matchCase(cases, undefined)).toBeUndefined();
  });
});
