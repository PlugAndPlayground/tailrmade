import {
  expandEntries,
  isInsideCollapsed,
  readCollapsed,
  setAtPaths,
  toEntries,
  toggleCollapsed,
} from '../../../src/nodes/layout/templateEntries';

const settings = {
  theme: { dark: true, accent: '#f80' },
  name: 'app',
  ports: [80, 443],
  retries: 3,
  extra: null,
};

describe('toEntries', () => {
  it('lists arrays by index, objects by key and a scalar as one entry', () => {
    expect(toEntries(['a', 'b'])).toEqual([
      ['0', 'a'],
      ['1', 'b'],
    ]);
    expect(toEntries({ x: 1 })).toEqual([['x', 1]]);
    expect(toEntries(5)).toEqual([['0', 5]]);
    expect(toEntries(null)).toEqual([]);
  });
});

describe('expandEntries', () => {
  it('lists values before groups and walks into each group', () => {
    const rows = expandEntries(settings);
    expect(rows.map((row) => row.path)).toEqual([
      ['name'],
      ['retries'],
      ['extra'],
      ['theme'],
      ['theme', 'dark'],
      ['theme', 'accent'],
      ['ports'],
      ['ports', 0],
      ['ports', 1],
    ]);
  });

  it('marks groups, keys and depths', () => {
    const rows = expandEntries(settings);
    const theme = rows.find((row) => row.key === 'theme');
    expect(theme).toMatchObject({ group: true, depth: 0 });
    expect(rows.find((row) => row.key === 'dark')).toMatchObject({
      group: false,
      depth: 1,
      value: true,
    });
    // list keys are strings, the path keeps the index a number
    expect(rows.find((row) => row.key === '1')).toMatchObject({
      path: ['ports', 1],
      value: 443,
    });
    expect(rows.find((row) => row.key === 'extra')).toMatchObject({
      group: false,
      value: null,
    });
  });

  it('still shows an empty group as a heading', () => {
    expect(expandEntries({ a: {}, b: [] })).toEqual([
      { key: 'a', path: ['a'], depth: 0, group: true, value: {} },
      { key: 'b', path: ['b'], depth: 0, group: true, value: [] },
    ]);
  });

  it('shows a scalar as one row', () => {
    expect(expandEntries('hi')).toEqual([
      { key: '0', path: ['0'], depth: 0, group: false, value: 'hi' },
    ]);
  });
});

describe('setAtPaths', () => {
  it('writes values back into a copy, keeping everything else', () => {
    const edited = setAtPaths(settings, [
      [['theme', 'dark'], false],
      [['ports', 1], 8443],
    ]);
    expect(edited).toEqual({
      ...settings,
      theme: { dark: false, accent: '#f80' },
      ports: [80, 8443],
    });
    expect(Object.keys(edited as object)).toEqual(Object.keys(settings));
    // the source is untouched
    expect(settings.theme.dark).toBe(true);
  });

  it('skips undefined values and paths that lead nowhere', () => {
    expect(
      setAtPaths({ a: 1 }, [
        [['a'], undefined],
        [['missing', 'deeper'], 2],
        [['b'], 3],
      ]),
    ).toEqual({ a: 1 });
  });

  it('round-trips an expanded tree unchanged', () => {
    const rows = expandEntries(settings);
    expect(
      setAtPaths(
        settings,
        rows.filter((row) => !row.group).map((row) => [row.path, row.value]),
      ),
    ).toEqual(settings);
  });

  it('replaces a scalar source with its single row', () => {
    expect(setAtPaths('hi', [[['0'], 'bye']])).toBe('bye');
    expect(setAtPaths('hi', [])).toBe('hi');
  });
});

describe('collapsed groups', () => {
  it('hides everything below a folded group, but not the group itself', () => {
    const collapsed = [['theme'], ['ports']];
    const shown = expandEntries(settings)
      .filter((row) => !isInsideCollapsed(row.path, collapsed))
      .map((row) => row.path);
    expect(shown).toEqual([
      ['name'],
      ['retries'],
      ['extra'],
      ['theme'],
      ['ports'],
    ]);
  });

  it('matches list indexes whether stored as numbers or strings', () => {
    expect(isInsideCollapsed(['servers', 0, 'host'], [['servers', '0']])).toBe(
      true,
    );
    expect(isInsideCollapsed(['servers', 1, 'host'], [['servers', 0]])).toBe(
      false,
    );
  });

  it('folds and unfolds a group, and reads only valid paths back', () => {
    const folded = toggleCollapsed([], ['db']);
    expect(folded).toEqual([['db']]);
    expect(toggleCollapsed(folded, ['db'])).toEqual([]);
    expect(readCollapsed([['db'], 'db', [], [{}], ['a', 1]])).toEqual([
      ['db'],
      ['a', 1],
    ]);
    expect(readCollapsed('nope')).toEqual([]);
  });
});
