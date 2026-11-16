import {
  migrateGraphDataOnLoad,
  GRAPH_DATA_VERSION,
} from '../../../src/utils/graphMigrations';
import type { SerializedGraph } from '../../../src/utils/interfaces';
import { loadWithStubs } from './loadWithStubs';

const socket = (name, data, socketType = 'in') => ({
  name,
  data,
  socketType,
  dataType: JSON.stringify({ class: 'AnyType' }),
  visible: true,
});
const graph = (): SerializedGraph =>
  ({
    version: 7,
    graphSettings: {},
    nodes: [
      {
        id: 'read',
        type: 'StateRead',
        socketArray: [
          socket('Key', 'shared'),
          socket('Fallback value', 42),
          socket('Value', 42, 'out'),
        ],
      },
      {
        id: 'write',
        type: 'statewrite',
        socketArray: [
          socket('Key', 'shared'),
          socket('Value', { a: 1 }),
          socket('Execute', 1, 'trigger'),
        ],
      },
      ...['State', 'NumberState', 'ArrayState', 'ObjectState'].map(
        (type, i) => ({
          id: `state-${i}`,
          type,
          x: 10,
          y: 20,
          updateBehaviour: { load: false, update: true },
          socketArray: [
            socket('State', [5, { n: 1 }]),
            socket('State', null, 'out'),
            socket('Add', 2, 'trigger'),
            socket('Clear', 3, 'trigger'),
            socket('MaxSize', 10),
            socket('Key', 'group'),
          ],
        }),
      ),
      { id: 'unrelated', type: 'Constant', socketArray: [] },
    ],
    links: [
      {
        sourceNodeId: 'read',
        sourceSocketName: 'Value',
        targetNodeId: 'state-0',
        targetSocketName: 'Value',
      },
      {
        sourceNodeId: 'unrelated',
        sourceSocketName: 'Value',
        targetNodeId: 'state-1',
        targetSocketName: 'Add',
      },
      {
        sourceNodeId: 'unrelated',
        sourceSocketName: 'Value',
        targetNodeId: 'state-2',
        targetSocketName: 'State',
      },
      {
        sourceNodeId: 'state-2',
        sourceSocketName: 'State',
        targetNodeId: 'unrelated',
        targetSocketName: 'Value',
      },
    ],
    groups: [{ id: 'group', name: 'states', nodeIds: ['state-0', 'state-1'] }],
  }) as unknown as SerializedGraph;
const data = (node, name) =>
  node.socketArray.find(
    (socket) => socket.name === name && socket.socketType === 'in',
  )?.data;
const load = (graph: SerializedGraph) =>
  loadWithStubs(migrateGraphDataOnLoad(graph));
const linkSet = (links) => links.map((link) => JSON.stringify(link)).sort();

test.each([7, 8, 9, 10, 11])(
  'v%s apps migrate every old state type without changing ids, sockets or wiring',
  (version) => {
    const original = graph();
    original.version = version;
    const snapshot = structuredClone(original);
    const migrated = load(original);
    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(migrated.nodes.map((node) => node.type)).toEqual([
      'StorageRead',
      'StorageWrite',
      'StorageState',
      'StorageNumberState',
      'StorageArrayState',
      'StorageObjectState',
      'Constant',
    ]);
    expect(linkSet(migrated.links)).toEqual(linkSet(original.links));
    expect(migrated.groups).toEqual(original.groups);
    migrated.nodes.forEach((node, i) => {
      expect(node.id).toBe(original.nodes[i].id);
      expect(
        node.socketArray.slice(0, original.nodes[i].socketArray.length),
      ).toEqual(original.nodes[i].socketArray);
      expect(node.updateBehaviour).toEqual(original.nodes[i].updateBehaviour);
      expect(node.version).toBeUndefined();
    });
    expect(original).toEqual(snapshot);
  },
);

test('read/write share session storage; accumulator addresses are isolated', () => {
  const migrated = loadWithStubs(graph());
  for (const node of migrated.nodes.slice(0, 2)) {
    expect(data(node, 'Storage type')).toBe('Session');
    expect(data(node, 'Persistence')).toBeUndefined();
    expect(data(node, 'Location')).toBe('State');
    expect(data(node, 'Key')).toBe('shared');
    expect(data(node, 'Non-empty only')).toBe(false);
  }
  for (const node of migrated.nodes.slice(2, 6)) {
    expect(data(node, 'State key')).toBe(node.id);
    expect(data(node, 'State')).toEqual([5, { n: 1 }]);
    expect(data(node, 'Key')).toBe('group');
  }
});

test('migration is idempotent and preserves explicitly configured addresses', () => {
  const original = graph();
  original.nodes[0].socketArray.push(
    socket('Location', 'custom'),
    socket('Persistence', 'Saved locally'),
  );
  const migrated = loadWithStubs(original);
  expect(data(migrated.nodes[0], 'Location')).toBe('custom');
  // Storage Read's own migrate() drops it once the node exists
  expect(data(migrated.nodes[0], 'Persistence')).toBe('Saved locally');
  expect(loadWithStubs(migrated)).toEqual(migrated);
  const loaded = migrateGraphDataOnLoad(original);
  expect(migrateGraphDataOnLoad(loaded)).toBe(loaded);
});

function copyGraph(): SerializedGraph {
  return {
    version: 8,
    graphSettings: {},
    nodes: [
      {
        id: 'copy',
        type: 'CopySocketValue',
        x: 10,
        y: 20,
        updateBehaviour: { load: false, update: false, interval: false },
        socketArray: [
          socket('Value', 'next'),
          socket('Input Socket', 'Selected'),
          socket('Execute', 4, 'trigger'),
          socket('Value', undefined, 'out'),
        ],
      },
      {
        id: 'target',
        type: 'Table',
        x: 400,
        y: 100,
        socketArray: [
          socket('Selected', 'initial'),
          socket('Input', 'other initial'),
        ],
      },
      {
        id: 'target2',
        type: 'Text',
        x: 400,
        y: 300,
        socketArray: [socket('Selected', 42)],
      },
      {
        id: 'source',
        type: 'Constant',
        socketArray: [socket('Value', 'next', 'out')],
      },
      { id: 'copy-read-1', type: 'Constant', socketArray: [] },
    ],
    links: [
      {
        sourceNodeId: 'source',
        sourceSocketName: 'Value',
        targetNodeId: 'copy',
        targetSocketName: 'Value',
      },
      {
        sourceNodeId: 'source',
        sourceSocketName: 'Value',
        targetNodeId: 'copy',
        targetSocketName: 'Execute',
      },
      {
        sourceNodeId: 'copy',
        sourceSocketName: 'Value',
        targetNodeId: 'target',
        targetSocketName: 'Input',
      },
      {
        sourceNodeId: 'copy',
        sourceSocketName: 'Value',
        targetNodeId: 'target2',
        targetSocketName: 'Selected',
      },
      {
        sourceNodeId: 'source',
        sourceSocketName: 'Value',
        targetNodeId: 'target',
        targetSocketName: 'Selected',
      },
    ],
    groups: [{ id: 'g', name: 'copy group', nodeIds: ['copy'] }],
  } as unknown as SerializedGraph;
}

test('copy migration keeps the writer id, value, trigger and execution settings', () => {
  const original = copyGraph();
  const snapshot = structuredClone(original);
  const migrated = load(original);
  const writer = migrated.nodes.find((node) => node.id === 'copy')!;
  expect(writer.type).toBe('StorageWrite');
  expect(writer.updateBehaviour).toEqual(original.nodes[0].updateBehaviour);
  expect(data(writer, 'Value')).toBe('next');
  expect(data(writer, 'Storage type')).toBe('Session');
  expect(data(writer, 'Non-empty only')).toBe(false);
  expect(
    writer.socketArray.find((socket) => socket.name === 'Execute'),
  ).toEqual(original.nodes[0].socketArray[2]);
  expect(migrated.links.filter((link) => link.targetNodeId === 'copy')).toEqual(
    original.links.slice(0, 2),
  );
  expect(original).toEqual(snapshot);
});

test('copy migration wires readers to fixed inputs and former output destinations', () => {
  const migrated = loadWithStubs(copyGraph());
  const readers = migrated.nodes.filter((node) => node.type === 'StorageRead');
  expect(readers).toHaveLength(3);
  expect(new Set(migrated.nodes.map((node) => node.id)).size).toBe(
    migrated.nodes.length,
  );
  expect(
    migrated.links
      .filter((link) =>
        readers.some((reader) => reader.id === link.sourceNodeId),
      )
      .map((link) => [link.targetNodeId, link.targetSocketName]),
  ).toEqual([
    ['target', 'Selected'],
    ['target', 'Input'],
    ['target2', 'Selected'],
  ]);
  expect(readers.map((node) => data(node, 'Fallback value'))).toEqual([
    'initial',
    'other initial',
    42,
  ]);
  expect(
    readers.every(
      (node) =>
        data(node, 'Storage type') === 'Session' && node.updateBehaviour.update,
    ),
  ).toBe(true);
  expect(migrated.links.some((link) => link.sourceNodeId === 'copy')).toBe(
    false,
  );
  expect(
    migrated.links.filter(
      (link) =>
        link.targetNodeId === 'target' && link.targetSocketName === 'Selected',
    ),
  ).toHaveLength(1);
  expect(migrated.groups![0].nodeIds).toEqual([
    'copy',
    ...readers.map((reader) => reader.id),
  ]);
  expect(loadWithStubs(migrated)).toEqual(migrated);
});

// An input holds one link, so two copies only meet through the input they
// copy into by name: both copy into target's Selected here.
function twoCopiesGraph(): SerializedGraph {
  const original = copyGraph();
  original.nodes[1].socketArray.push(socket('Other', 'other'));
  original.nodes.push({ ...original.nodes[0], id: 'copy2' });
  original.links.push({
    sourceNodeId: 'copy2',
    sourceSocketName: 'Value',
    targetNodeId: 'target',
    targetSocketName: 'Other',
  });
  return original;
}

test('copies into the same input share its reader and storage key', () => {
  const migrated = loadWithStubs(twoCopiesGraph());
  const keys = (id) => {
    const node = migrated.nodes.find((candidate) => candidate.id === id)!;
    return [data(node, 'Key'), ...(data(node, 'Additional keys') ?? [])];
  };
  const shared = 'Copy/["target","Selected"]';
  expect(keys('copy')).toContain(shared);
  expect(keys('copy2')).toEqual([shared, 'Copy/["target","Other"]']);
  const readers = migrated.nodes.filter((node) => node.type === 'StorageRead');
  expect(readers).toHaveLength(4);
  expect(
    migrated.links.filter(
      (link) =>
        link.targetNodeId === 'target' && link.targetSocketName === 'Selected',
    ),
  ).toEqual([
    {
      sourceNodeId: readers.find((reader) => data(reader, 'Key') === shared)!
        .id,
      sourceSocketName: 'Value',
      targetNodeId: 'target',
      targetSocketName: 'Selected',
    },
  ]);
});

test('a v10 app saved with copies still loads them as storage nodes', () => {
  const original = twoCopiesGraph();
  original.version = 10;
  const migrated = load(original);
  expect(migrated.version).toBe(GRAPH_DATA_VERSION);
  expect(
    migrated.nodes.some(
      (node) => node.type.toLowerCase() === 'copysocketvalue',
    ),
  ).toBe(false);
  expect(loadWithStubs(migrated)).toEqual(migrated);
});

test('v9 apps keep Storage node sockets for the nodes to migrate', () => {
  const original = {
    version: 9,
    nodes: [
      {
        id: '0',
        type: 'StorageRead',
        socketArray: [
          socket('Storage type', 'Local storage'),
          socket('Persistence', 'Session'),
        ],
      },
    ],
    links: [],
  } as unknown as SerializedGraph;
  const migrated = migrateGraphDataOnLoad(original);
  expect(migrated.version).toBe(GRAPH_DATA_VERSION);
  expect(migrated.nodes).toEqual(original.nodes);
});

test('legacy local/cloud classes migrate as data, preserving renamed inputs and wiring', () => {
  const types = [
    'LocalStorageWrite',
    'LocalStorageDelete',
    'LocalStorageBrowse',
    'UserStorageWrite',
    'UserStorageRead',
    'UserStorageDelete',
    'UserStorageBrowse',
  ];
  const original = {
    version: 11,
    nodes: types.map((type, i) => ({
      id: String(i),
      type,
      version: 2,
      socketArray: [
        socket('Local Storage Key', 'namespace'),
        socket('Object Key', 'item'),
        socket('Selected', 'chosen'),
        socket('Fallback Value', 'fallback'),
        socket('Value', 'value'),
        socket('Show Toast Notification', true),
        socket('Filter by Location', true),
      ],
    })),
    links: [
      {
        sourceNodeId: '3',
        sourceSocketName: 'Value',
        targetNodeId: '0',
        targetSocketName: 'Object Key',
      },
      {
        sourceNodeId: '3',
        sourceSocketName: 'Value',
        targetNodeId: '2',
        targetSocketName: 'Selected',
      },
    ],
  } as any;
  const snapshot = structuredClone(original);
  const migrated = loadWithStubs(original);
  expect(migrated.nodes.map((node) => node.type)).toEqual([
    'StorageWrite',
    'StorageDelete',
    'StorageRead',
    'StorageWrite',
    'StorageRead',
    'StorageDelete',
    'StorageBrowse',
  ]);
  expect(migrated.nodes.map((node) => data(node, 'Storage type'))).toEqual([
    'IndexedDB',
    'IndexedDB',
    'IndexedDB',
    'Cloud',
    'Cloud',
    'Cloud',
    'Cloud',
  ]);
  expect(data(migrated.nodes[0], 'Location')).toBe('namespace');
  expect(data(migrated.nodes[0], 'Key')).toBe('item');
  expect(data(migrated.nodes[2], 'Key')).toBe('chosen');
  expect(data(migrated.nodes[2], 'Fallback value')).toBe('fallback');
  expect(data(migrated.nodes[0], 'Non-empty only')).toBe(false);
  expect(data(migrated.nodes[3], 'Show Toast Notification')).toBe(true);
  expect(data(migrated.nodes[6], 'Filter by Location')).toBe(true);
  expect(migrated.links.map((link) => link.targetSocketName)).toEqual([
    'Key',
    'Key',
  ]);
  expect(migrated.nodes.every((node) => node.version === undefined)).toBe(true);
  expect(loadWithStubs(migrated)).toEqual(migrated);
  expect(original).toEqual(snapshot);
});
