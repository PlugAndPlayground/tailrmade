// What a "UI template list" repeats over: the entries of an array or object,
// either as they are or expanded into one row per value at any depth. Kept free
// of node code so it can be tested on its own.

export type EntryPath = (string | number)[];

export interface ExpandedEntry {
  // the entry's own key: an object key, or a list index as a string
  key: string;
  // keys from the top down to this entry
  path: EntryPath;
  // 0 for the top level
  depth: number;
  // an object or list, shown as a heading over its own rows
  group: boolean;
  value: unknown;
}

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGroup = (value: unknown): value is object =>
  Array.isArray(value) || isPlainObject(value);

/** The entries to repeat over, as [key, value] pairs, for arrays and objects. */
export function toEntries(items: unknown): [string, unknown][] {
  if (Array.isArray(items)) {
    return items.map((value, index) => [String(index), value]);
  }
  if (isPlainObject(items)) {
    return Object.entries(items);
  }
  if (items === undefined || items === null || items === '') {
    return [];
  }
  // a single scalar is a one-row repeat, which beats rendering nothing
  return [['0', items]];
}

/**
 * One row per value at any depth, plus a heading row before each nested object
 * or list. Within a level the plain values come first: a value listed after a
 * group's rows would read as part of that group.
 */
export function expandEntries(items: unknown): ExpandedEntry[] {
  if (!isGroup(items)) {
    return toEntries(items).map(([key, value]) => ({
      key,
      path: [key],
      depth: 0,
      group: false,
      value,
    }));
  }
  const rows: ExpandedEntry[] = [];
  const walk = (node: object, path: EntryPath): void => {
    const entries: [string | number, unknown][] = Array.isArray(node)
      ? node.map((value, index) => [index, value])
      : Object.entries(node);
    const toRow = ([key, value]: [
      string | number,
      unknown,
    ]): ExpandedEntry => ({
      key: String(key),
      path: [...path, key],
      depth: path.length,
      group: isGroup(value),
      value,
    });
    entries
      .filter(([, value]) => !isGroup(value))
      .forEach((entry) => rows.push(toRow(entry)));
    entries
      .filter(([, value]) => isGroup(value))
      .forEach((entry) => {
        const row = toRow(entry);
        rows.push(row);
        walk(row.value as object, row.path);
      });
  };
  walk(items, []);
  return rows;
}

/**
 * A copy of the source with each value written at its path. Starting from the
 * source keeps key order, empty groups and anything no row covered (rows past
 * a cap, say). A path that no longer leads anywhere is skipped.
 */
export function setAtPaths(
  source: unknown,
  values: [EntryPath, unknown][],
): unknown {
  if (!isGroup(source)) {
    // a scalar source was shown as a single row
    const own = values.find(([path]) => path.length === 1);
    return own === undefined ? source : own[1];
  }
  const copy = JSON.parse(JSON.stringify(source));
  values.forEach(([path, value]) => {
    if (path.length === 0 || value === undefined) {
      return;
    }
    let target: unknown = copy;
    for (let i = 0; i < path.length - 1; i++) {
      if (!isGroup(target)) {
        return;
      }
      target = (target as Record<string | number, unknown>)[path[i]];
    }
    const last = path[path.length - 1];
    if (isGroup(target) && last in target) {
      (target as Record<string | number, unknown>)[last] = value;
    }
  });
  return copy;
}

const samePath = (a: EntryPath, b: EntryPath): boolean =>
  a.length === b.length && a.every((key, i) => String(key) === String(b[i]));

/** Whether a path lies inside one of the collapsed groups, below it. */
export function isInsideCollapsed(
  path: EntryPath,
  collapsed: EntryPath[],
): boolean {
  return collapsed.some(
    (group) =>
      group.length < path.length &&
      samePath(group, path.slice(0, group.length)),
  );
}

/** The collapsed groups with this one folded or unfolded. */
export function toggleCollapsed(
  collapsed: EntryPath[],
  path: EntryPath,
): EntryPath[] {
  return collapsed.some((group) => samePath(group, path))
    ? collapsed.filter((group) => !samePath(group, path))
    : [...collapsed, path];
}

/** Collapsed groups as stored: paths, dropping anything that is not one. */
export function readCollapsed(stored: unknown): EntryPath[] {
  return Array.isArray(stored)
    ? stored.filter(
        (path): path is EntryPath =>
          Array.isArray(path) &&
          path.length > 0 &&
          path.every(
            (key) => typeof key === 'string' || typeof key === 'number',
          ),
      )
    : [];
}
