import {
  canMerge,
  diffSnapshots,
  GraphSnapshot,
  MAX_RECORDED_VALUE_LENGTH,
  NodeDefaults,
} from '../../../src/services/replayRecording';
import type { SerializedNode } from '../../../src/utils/interfaces';

const behaviour = {
  load: false,
  update: true,
  interval: false,
  intervalFrequency: undefined,
};

const defaults: Record<string, NodeDefaults> = {
  constant: {
    name: 'Constant',
    inputs: { In: 0 },
    updateBehaviour: behaviour,
  },
  label: {
    name: 'Label',
    inputs: { Input: '', 'Font size': 32 },
    updateBehaviour: behaviour,
  },
};
const getDefaults = (type: string) => defaults[type];

function node(
  id: string,
  type: string,
  inputs: Record<string, unknown>,
  overrides: Partial<SerializedNode> = {},
): SerializedNode {
  return {
    id,
    type,
    name: undefined,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    socketArray: Object.entries(inputs).map(([name, data]) => ({
      socketType: 'in',
      name,
      dataType: '{}',
      data,
      visible: undefined,
      dependentSocketName: undefined,
    })),
    updateBehaviour: behaviour,
    version: undefined,
    ...overrides,
  };
}

function snapshot(
  nodes: SerializedNode[],
  rest: Partial<GraphSnapshot> = {},
): GraphSnapshot {
  return {
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    links: [],
    groups: [],
    defaultSurfaceId: undefined,
    ...rest,
  };
}

const link = {
  sourceNodeId: 'a',
  sourceSocketName: 'Out',
  targetNodeId: 'b',
  targetSocketName: 'Input',
};

describe('diffSnapshots', () => {
  it('adds a node where it is, and only sets what differs from its defaults', () => {
    const { steps, warnings } = diffSnapshots(
      snapshot([]),
      snapshot([
        node('a', 'constant', { In: 7 }, { x: 10, y: 20, name: 'City' }),
      ]),
      getDefaults,
    );
    expect(warnings).toEqual([]);
    expect(steps).toEqual([
      {
        tool: 'add_node',
        input: { node_type: 'constant', node_id: 'a', x: 10, y: 20 },
      },
      {
        tool: 'set_socket_value',
        input: { node_id: 'a', socket_name: 'In', value: 7 },
      },
      { tool: 'set_node_name', input: { node_id: 'a', name: 'City' } },
    ]);
  });

  it('connects before it sets values, and does not set a value a link supplies', () => {
    const before = snapshot([
      node('a', 'constant', { In: 1 }),
      node('b', 'label', { Input: 'x', 'Font size': 32 }),
    ]);
    const after = snapshot(
      [
        node('a', 'constant', { In: 1 }),
        // a linked input serializes without data
        node('b', 'label', { Input: undefined, 'Font size': 40 }),
      ],
      { links: [link] },
    );
    expect(diffSnapshots(before, after, getDefaults).steps).toEqual([
      {
        tool: 'connect_sockets',
        input: {
          from_node: 'a',
          from_socket: 'Out',
          to_node: 'b',
          to_socket: 'Input',
        },
      },
      {
        tool: 'set_socket_value',
        input: { node_id: 'b', socket_name: 'Font size', value: 40 },
      },
    ]);
  });

  it('disconnects without restating the value the input falls back to', () => {
    const before = snapshot(
      [
        node('a', 'constant', { In: 1 }),
        node('b', 'label', { Input: undefined }),
      ],
      { links: [link] },
    );
    const after = snapshot([
      node('a', 'constant', { In: 1 }),
      node('b', 'label', { Input: 'restored' }),
    ]);
    expect(diffSnapshots(before, after, getDefaults).steps).toEqual([
      {
        tool: 'disconnect_sockets',
        input: { from_node: 'a', to_node: 'b', to_socket: 'Input' },
      },
    ]);
  });

  it('records removals, moves and the inverse of an undo the same way', () => {
    const before = snapshot([
      node('a', 'constant', { In: 1 }),
      node('b', 'constant', { In: 1 }),
    ]);
    const after = snapshot([node('a', 'constant', { In: 1 }, { x: 50 })]);
    expect(diffSnapshots(before, after, getDefaults).steps).toEqual([
      { tool: 'remove_node', input: { node_id: 'b' } },
      {
        tool: 'move_nodes',
        input: { nodes: [{ node_id: 'a', x: 50, y: 0 }] },
      },
    ]);
  });

  it('creates groups with their recorded id, and edits them in place', () => {
    const nodes = [node('a', 'constant', {}), node('b', 'constant', {})];
    const group = { id: 'g', name: 'Fetch', color: '#fff', nodeIds: ['a'] };
    const created = diffSnapshots(
      snapshot(nodes),
      snapshot(nodes, { groups: [group] }),
      getDefaults,
    ).steps;
    expect(created).toEqual([
      {
        tool: 'group_nodes',
        input: { node_ids: ['a'], name: 'Fetch', color: '#fff', group_id: 'g' },
      },
    ]);

    const edited = diffSnapshots(
      snapshot(nodes, { groups: [group] }),
      snapshot(nodes, {
        groups: [{ ...group, name: 'Weather', nodeIds: ['a', 'b'] }],
      }),
      getDefaults,
    ).steps;
    expect(edited.map((step) => step.tool)).toEqual([
      'add_to_group',
      'update_group',
    ]);
  });

  it('warns instead of recording what it cannot replay', () => {
    const { steps, warnings } = diffSnapshots(
      snapshot([node('a', 'constant', { In: 1 })]),
      snapshot([
        node(
          'a',
          'constant',
          { In: 'x'.repeat(MAX_RECORDED_VALUE_LENGTH + 1) },
          { width: 400 },
        ),
        node('b', 'mystery', {}),
      ]),
      getDefaults,
    );
    expect(steps.map((step) => step.tool)).toEqual(['add_node']);
    expect(warnings).toEqual([
      'b: unknown node type mystery',
      'a: "In" is too large to record',
      'Resizing nodes is not recorded',
    ]);
  });
});

describe('canMerge', () => {
  const setValue = (socket: string, value: unknown) => ({
    tool: 'set_socket_value',
    input: { node_id: 'a', socket_name: socket, value },
  });

  it('merges repeated edits of one value, not of different ones', () => {
    expect(canMerge(setValue('In', 1), setValue('In', 2))).toBe(true);
    expect(canMerge(setValue('In', 1), setValue('Other', 2))).toBe(false);
  });

  it('merges a drag of the same nodes', () => {
    const move = (x: number) => ({
      tool: 'move_nodes',
      input: { nodes: [{ node_id: 'a', x, y: 0 }] },
    });
    expect(canMerge(move(1), move(2))).toBe(true);
  });
});
