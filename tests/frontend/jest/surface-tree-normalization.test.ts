import {
  QueryMethods,
  createTestState,
  editorInitialState,
} from '@craftjs/core';
import { normalizeTreeString } from '../../../src/components/dashboard/surfaceTreeNormalization';
import { canonicalTreeString } from '../../../src/utils/surfaceTree';

// stand-ins for Container/DynamicWidget: what matters here is only that they
// declare craft defaults, exactly like the real dashboard components do
const Container = () => null;
(Container as any).craft = {
  displayName: 'Container',
  props: { flexDirection: 'column', padding: [0, 0, 0, 0], gap: 0 },
  isCanvas: true,
};

const DynamicWidget = () => null;
(DynamicWidget as any).craft = {
  displayName: 'DynamicWidget',
  props: { width: '100%', height: 'auto', showLabel: false, index: 0 },
};

const resolver = { Container, DynamicWidget };

// an empty craft state that only carries the resolver - parseSerializedNode
// needs nothing else
const makeQuery = () =>
  QueryMethods(
    createTestState({
      options: { ...editorInitialState.options, resolver },
    } as any),
  );

// a v2 -> v3 migrated surface writes items like this: no displayName, no
// isCanvas/custom/hidden, and only the props the migration knows about
const sparseTree = {
  ROOT: {
    type: { resolvedName: 'Container' },
    nodes: ['widget-1'],
    props: {},
    linkedNodes: {},
  },
  'widget-1': {
    type: { resolvedName: 'DynamicWidget' },
    props: { id: 'NODE_yellow-baboon-23' },
    parent: 'ROOT',
    nodes: [],
    linkedNodes: {},
  },
};

// what the craft editor holds after deserializing the tree above and
// serializing it back out (query.serialize()), i.e. with every craft default
// filled in
const craftSerializedTree = {
  ROOT: {
    type: { resolvedName: 'Container' },
    isCanvas: true,
    props: { flexDirection: 'column', padding: [0, 0, 0, 0], gap: 0 },
    displayName: 'Container',
    custom: {},
    hidden: false,
    nodes: ['widget-1'],
    linkedNodes: {},
  },
  'widget-1': {
    type: { resolvedName: 'DynamicWidget' },
    isCanvas: false,
    props: {
      width: '100%',
      height: 'auto',
      showLabel: false,
      index: 0,
      id: 'NODE_yellow-baboon-23',
    },
    displayName: 'DynamicWidget',
    custom: {},
    parent: 'ROOT',
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
};

describe('normalizeTreeString', () => {
  it('makes an unnormalized stored tree comparable to craft serialization', () => {
    // the bug this guards: comparing the two directly always reports a change,
    // so every execution of the surface node reloaded (and remounted) the
    // whole UI
    expect(canonicalTreeString(sparseTree)).not.toEqual(
      canonicalTreeString(craftSerializedTree),
    );

    expect(
      normalizeTreeString(makeQuery(), JSON.stringify(sparseTree)),
    ).toEqual(canonicalTreeString(craftSerializedTree));
  });

  it('is idempotent on an already normalized tree', () => {
    const query = makeQuery();
    const once = normalizeTreeString(
      query,
      JSON.stringify(craftSerializedTree),
    );
    expect(normalizeTreeString(query, once)).toEqual(once);
  });

  it('still reports a real change (a hidden element) as different', () => {
    const query = makeQuery();
    const hidden = {
      ...sparseTree,
      'widget-1': { ...sparseTree['widget-1'], hidden: true },
    };
    expect(normalizeTreeString(query, JSON.stringify(hidden))).not.toEqual(
      normalizeTreeString(query, JSON.stringify(sparseTree)),
    );
  });

  it('falls back to the raw string when an item type is not resolvable', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const query = makeQuery();
    const unknown = JSON.stringify({
      ROOT: { type: { resolvedName: 'NotInResolver' }, nodes: [], props: {} },
    });
    expect(normalizeTreeString(query, unknown)).toEqual(unknown);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
