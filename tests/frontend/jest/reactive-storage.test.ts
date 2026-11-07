jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {
    inputs = {};
    updateBehaviour = { update: true };
    getInputData(name) {
      return this.inputs[name];
    }
    getTags() {
      return [];
    }
    setStatus() {}
    async configure() {}
    setInputData(name, value) {
      this.inputs[name] = value;
    }
    getInputSocketByName() {
      return this.stateSocket ?? { hasLink: () => false };
    }
    async executeOptimizedChain() {
      await this.run();
    }
  },
}));
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {
    name;
    data;
    defaultData;
    visible;
    constructor(direction, name, type, data) {
      Object.assign(this, { name, data, defaultData: data, type });
    }
    static getOptionalVisibilitySocket(direction, name, type, data, visible) {
      const socket = new this(direction, name, type, data);
      socket.visible = visible;
      return socket;
    }
  },
}));
jest.mock('../../../src/classes/GraphClass', () => ({
  __esModule: true,
  default: { currentGraph: { id: 'graph', nodes: {} } },
}));
jest.mock('../../../src/classes/FlowLogic', () => ({
  __esModule: true,
  default: {
    executeOptimizedChainBatch: jest.fn(async (nodes) => {
      for (const node of nodes) await node.run();
    }),
  },
}));
jest.mock('../../../src/classes/UpdateBehaviourClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/ErrorClass', () => ({
  NodeExecutionError: class {},
  NodeExecutionWarning: class {},
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../src/utils/color', () => ({ TRgba: {} }));
jest.mock('../../../src/utils/utils', () => ({
  convertToViewableString: JSON.stringify,
}));
jest.mock('../../../src/utils/indexedDB', () => ({
  GraphDatabase: class {
    values = new Map();
    user_data = {
      get: async (id) => this.values.get(id),
      put: async (entry) => this.values.set(entry.id, entry),
      delete: async (id) => this.values.delete(id),
      toArray: async () => [...this.values.values()],
      where: () => ({
        equals: (location) => ({
          toArray: async () =>
            [...this.values.values()].filter(
              (entry: any) => entry.location === location,
            ),
        }),
      }),
    };
  },
}));
jest.mock('../../../src/services/shared-types', () => ({ CLOUD_MODE: true }));
jest.mock('../../../src/services/BackendGateway', () => ({
  BackendGateway: { getInstance: jest.fn() },
}));
jest.mock('../../../src/utils/constants', () => ({
  SOCKET_TYPE: { IN: 'in', OUT: 'out' },
  NODE_TYPE_COLOR: {},
  TRIGGER_TYPE_OPTIONS: [{ text: 'Always' }],
}));
jest.mock('../../../src/nodes/datatypes/numberType', () => ({
  NumberType: class {
    getDefaultValue() {
      return 0;
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/anyType', () => ({
  AnyType: class {
    getDefaultValue() {
      return null;
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/arrayType', () => ({
  ArrayType: class {
    getDefaultValue() {
      return [];
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/booleanType', () => ({
  BooleanType: class {},
}));
jest.mock('../../../src/nodes/datatypes/enumType', () => ({
  EnumType: class {
    constructor(options) {
      this.options = options;
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/jsonType', () => ({
  JSONType: class {
    getDefaultValue() {
      return {};
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/stringType', () => ({
  StringType: class {},
}));
jest.mock('../../../src/nodes/datatypes/triggerType', () => ({
  TriggerType: class {},
}));

import {
  StorageWrite,
  StorageRead,
  StorageUpdate,
  StorageDelete,
  StorageBrowse,
} from '../../../src/nodes/state/storage';
import PPGraph from '../../../src/classes/GraphClass';
import FlowLogic from '../../../src/classes/FlowLogic';
import { BackendGateway } from '../../../src/services/BackendGateway';

const defaults = {
  'Storage type': 'Session',
  Location: 'test',
  Key: 'key',
  'Non-empty only': false,
};
function node(Type, inputs = {}) {
  const instance = new Type('test') as any;
  instance.inputs = { ...defaults, ...inputs };
  instance.output = {};
  instance.run = () => instance.onExecute(instance.inputs, instance.output);
  return instance;
}
beforeEach(() => {
  PPGraph.currentGraph.nodes = {};
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      key: (index) => [...values.keys()][index],
      get length() {
        return values.size;
      },
    },
  });
  jest.clearAllMocks();
});

test('writes notify matching readers, skip unchanged values, and delete restores fallback', async () => {
  const writer = node(StorageWrite, { Location: 'notifications', Value: 12 });
  const reader = node(StorageRead, {
    Location: 'notifications',
    'Fallback value': 7,
  });
  const other = node(StorageRead, { Location: 'other' });
  PPGraph.currentGraph.nodes = { reader, other };
  await writer.run();
  expect(reader.output.Value).toBe(12);
  expect(other.output).toEqual({});
  (FlowLogic.executeOptimizedChainBatch as jest.Mock).mockClear();
  await writer.run();
  expect(FlowLogic.executeOptimizedChainBatch).not.toHaveBeenCalled();
  await node(StorageDelete, { Location: 'notifications' }).run();
  expect(reader.output.Value).toBe(7);
});

test('Session, IndexedDB and Cloud are separate backends with no Persistence setting', async () => {
  for (const [backend, value] of [
    ['Session', 'session'],
    ['IndexedDB', 'saved'],
  ]) {
    await node(StorageWrite, {
      'Storage type': backend,
      Location: 'isolation',
      Value: value,
    }).run();
    const reader = node(StorageRead, {
      'Storage type': backend,
      Location: 'isolation',
    });
    await reader.run();
    expect(reader.output.Value).toBe(value);
  }
  const session = node(StorageRead, { Location: 'isolation' });
  await session.run();
  expect(session.output.Value).toBe('session');
  const storeObject = jest.fn();
  (BackendGateway.getInstance as jest.Mock).mockReturnValue({
    getObject: async () => undefined,
    storeObject,
  });
  (PPGraph as any).getCurrentGraph = () => ({
    notifyUserDataChanged: jest.fn(),
  });
  await node(StorageWrite, { 'Storage type': 'Cloud', Value: 3 }).run();
  expect(storeObject).toHaveBeenCalledWith(3, 'test', 'key');
  for (const Type of [
    StorageRead,
    StorageWrite,
    StorageUpdate,
    StorageDelete,
    StorageBrowse,
  ]) {
    const sockets = node(Type).getDefaultIO();
    expect(sockets.some((socket) => socket.name === 'Persistence')).toBe(false);
    const backend = sockets.find((socket) => socket.name === 'Storage type');
    // Socket mock stores the datatype so the available choices can be checked.
    expect(backend.type.options.map((option) => option.text)).toEqual([
      'Cloud',
      'IndexedDB',
      'Session',
    ]);
  }
});

test('concurrent updates use the latest value and arrays can become empty', async () => {
  const updates = Array.from({ length: 10 }, () =>
    node(StorageUpdate, {
      Location: 'counter',
      Operation: 'Increment',
      Value: 1,
    }),
  );
  await Promise.all(updates.map((update) => update.run()));
  const reader = node(StorageRead, { Location: 'counter' });
  await reader.run();
  expect(reader.output.Value).toBe(10);
  await node(StorageUpdate, {
    Location: 'array',
    Operation: 'Append',
    Value: 'a',
  }).run();
  await node(StorageUpdate, {
    Location: 'array',
    Operation: 'Remove last',
  }).run();
  const array = node(StorageRead, { Location: 'array' });
  await array.run();
  expect(array.output.Value).toEqual([]);
});

test('merge preserves existing fields and browse includes session values', async () => {
  await node(StorageWrite, { Location: 'merge', Value: { a: 1 } }).run();
  await node(StorageUpdate, {
    Location: 'merge',
    Operation: 'Merge',
    Value: { b: 2 },
  }).run();
  const reader = node(StorageRead, { Location: 'merge' });
  await reader.run();
  expect(reader.output.Value).toEqual({ a: 1, b: 2 });
  const browse = node(StorageBrowse, {
    Location: 'merge',
    'Filter by Location': true,
  });
  await browse.run();
  expect(browse.output.Objects).toEqual([{ location: 'merge', key: 'key' }]);
});

test('feedback writes report an error instead of recursively executing', async () => {
  const writer = node(StorageWrite, { Location: 'feedback', Value: 1 });
  const loop = node(StorageWrite, { Location: 'feedback', Value: 2 });
  PPGraph.currentGraph.nodes = {
    reader: { shouldExecuteOnStorageValueChanged: () => true, run: loop.run },
  } as any;
  await writer.run();
  expect(loop.output.Success).toBe(false);
  expect(loop.output.Error).toContain('feedback loop');
});

import {
  StorageState,
  StorageNumberState,
  StorageArrayState,
  StorageObjectState,
} from '../../../src/nodes/state/storageAccumulator';

test('migrated accumulator reads its saved state, updates shared storage and clears', async () => {
  const accumulator = node(StorageNumberState, {
    Location: 'legacy-number',
    'State key': 'counter',
    State: 4,
    'Add Amount': 3,
    'Remove Amount': 2,
  });
  const reader = node(StorageRead, {
    Location: 'legacy-number',
    Key: 'counter',
  });
  PPGraph.currentGraph.nodes = { reader };
  await accumulator.run();
  expect(accumulator.output.State).toBe(4);
  await accumulator.add();
  expect(reader.output.Value).toBe(7);
  await accumulator.remove();
  expect(reader.output.Value).toBe(5);
  await accumulator.clear();
  expect(reader.output.Value).toBe(0);
  const reloaded = node(StorageNumberState, {
    Location: 'legacy-number',
    'State key': 'counter',
    State: 99,
  });
  await reloaded.run();
  expect(reloaded.output.State).toBe(0);
});

test('migrated arrays and keyed arrays retain limits and trigger operations', async () => {
  const array = node(StorageArrayState, {
    Location: 'legacy-array',
    'State key': 'array',
    State: ['a'],
    Input: 'b',
    MaxSize: 1,
  });
  await array.add();
  expect(array.output.State).toEqual(['b']);
  await array.remove();
  expect(array.output.State).toEqual([]);
  const object = node(StorageObjectState, {
    Location: 'legacy-object',
    'State key': 'object',
    State: { group: ['a'] },
    Key: 'group',
    Input: 'b',
    MaxSize: 1,
  });
  await object.add();
  expect(object.output.State).toEqual({ group: ['b'] });
  await object.remove();
  expect(object.output.State).toEqual({ group: [] });
  await object.clear();
  expect(object.output.State).toEqual({});
});

test('migrated linked State preserves backward propagation', async () => {
  const source = { executeOptimizedChain: jest.fn() };
  const accumulator = node(StorageState, {
    Location: 'legacy-linked',
    'State key': 'state',
    State: 'initial',
    Value: 'next',
  });
  accumulator.stateSocket = {
    hasLink: () => true,
    links: [{ getSource: () => ({ getNode: () => source }) }],
  };
  await accumulator.add();
  expect(accumulator.inputs.State).toBe('next');
  expect(source.executeOptimizedChain).toHaveBeenCalledTimes(1);
});

test('loading a saved storage node replaces obsolete backend enum choices', async () => {
  const reader = node(StorageRead);
  const backend = { dataType: { options: [{ text: 'Local storage' }] } };
  reader.getInputSocketByName = () => backend;
  await reader.configure({});
  expect(backend.dataType.options.map((option) => option.text)).toEqual([
    'Cloud',
    'IndexedDB',
    'Session',
  ]);
});

import { migrateCopySocketNodes } from '../../../src/nodes/state/migrations';

test('migrated overlapping copy triggers update only their own destinations in one batch', async () => {
  const input = (name, data) => ({
    name,
    data,
    socketType: 'in',
    dataType: JSON.stringify({ class: 'AnyType' }),
  });
  const original = {
    nodes: [
      ...['first', 'second'].map((id, i) => ({
        id,
        type: 'CopySocketValue',
        socketArray: [input('Value', i + 1), input('Input Socket', 'Value')],
      })),
      ...['a', 'b', 'c'].map((id) => ({
        id,
        type: 'Constant',
        socketArray: [input('Value', 0)],
      })),
    ],
    links: [
      ['first', 'a'],
      ['first', 'b'],
      ['second', 'b'],
      ['second', 'c'],
    ].map(([sourceNodeId, targetNodeId]) => ({
      sourceNodeId,
      targetNodeId,
      sourceSocketName: 'Value',
      targetSocketName: 'Value',
    })),
  } as any;
  const migrated = migrateCopySocketNodes(original);
  const instances = Object.fromEntries(
    migrated.nodes
      .filter((node) => ['StorageRead', 'StorageWrite'].includes(node.type))
      .map((serialized) => [
        serialized.id,
        node(serialized.type === 'StorageWrite' ? StorageWrite : StorageRead, {
          ...Object.fromEntries(
            serialized.socketArray
              .filter((socket) => socket.socketType === 'in')
              .map((socket) => [socket.name, socket.data]),
          ),
          Location: 'overlapping-copy-runtime',
        }),
      ]),
  );
  PPGraph.currentGraph.nodes = Object.fromEntries(
    Object.entries(instances).filter(
      ([id]) => !['first', 'second'].includes(id),
    ),
  );
  const value = (target) =>
    instances[
      migrated.links.find((link) => link.targetNodeId === target).sourceNodeId
    ].output.Value;
  for (const reader of Object.values(PPGraph.currentGraph.nodes) as any[])
    await reader.run();
  (FlowLogic.executeOptimizedChainBatch as jest.Mock).mockClear();
  await instances.first.run();
  expect([value('a'), value('b'), value('c')]).toEqual([1, 1, 0]);
  expect(FlowLogic.executeOptimizedChainBatch).toHaveBeenCalledTimes(1);
  await instances.second.run();
  expect([value('a'), value('b'), value('c')]).toEqual([1, 2, 2]);
  expect(FlowLogic.executeOptimizedChainBatch).toHaveBeenCalledTimes(2);
});
