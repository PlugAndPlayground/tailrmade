// Keep rendering out of these tests; exercise the real node and socket events.
jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {
    outputs: Record<string, unknown> = {};
    setOutputData(name: string, value: unknown) {
      this.outputs[name] = value;
    }
    getOutputData(name: string) {
      return this.outputs[name];
    }
    executeChildren = jest.fn().mockResolvedValue(undefined);
    getTags() {
      return [];
    }
  },
}));
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {
    constructor(direction, name, type, data) {
      Object.assign(this, { direction, name, type, data });
    }
  },
}));
jest.mock('../../../src/classes/UpdateBehaviourClass', () => ({
  __esModule: true,
  default: class {
    constructor(load, update, interval) {
      Object.assign(this, { load, update, interval });
    }
  },
}));
jest.mock('../../../src/nodes/datatypes/anyType', () => ({
  AnyType: class {},
}));
jest.mock('../../../src/nodes/datatypes/booleanType', () => ({
  BooleanType: class {},
}));
jest.mock('../../../src/nodes/datatypes/stringType', () => ({
  StringType: class {},
}));
jest.mock('../../../src/utils/color', () => ({ TRgba: {} }));
jest.mock('../../../src/utils/constants', () => ({
  NODE_TYPE_COLOR: {},
  SOCKET_TYPE: { IN: 'in', OUT: 'out' },
}));

import { WebSocketNode } from '../../../src/nodes/api/websocket';

class MockWebSocket {
  static CLOSING = 2;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { wasClean: boolean; code: number }) => void) | null = null;
  close = jest.fn(() => {
    this.readyState = 2;
  });
  constructor(public url: string) {
    if (url === 'ws://invalid') throw new Error('Invalid URL');
    MockWebSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}

class TestNode extends WebSocketNode {
  run(URL = 'wss://example.test/live', Enabled = true) {
    return this.onExecute({ URL, Enabled });
  }
  sockets() {
    return this.getDefaultIO();
  }
}

describe('WebSocket node', () => {
  let node: TestNode;
  const originalWebSocket = Object.getOwnPropertyDescriptor(
    globalThis,
    'WebSocket',
  );
  beforeEach(() => {
    MockWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
    node = new TestNode('websocket', {});
  });
  afterEach(() => {
    node.onNodeRemoved();
    if (originalWebSocket) {
      Object.defineProperty(globalThis, 'WebSocket', originalWebSocket);
    } else {
      Reflect.deleteProperty(globalThis, 'WebSocket');
    }
  });

  it('has lean inputs and executes on load and input changes without polling', () => {
    expect(node.sockets().map((s) => s.name)).toEqual([
      'URL',
      'Enabled',
      'Content',
      'Connected',
      'Error',
    ]);
    expect(node.getUpdateBehaviour()).toMatchObject({
      load: true,
      update: true,
      interval: false,
    });
  });

  it('reuses connecting and open connections and publishes connection status', async () => {
    await node.run();
    await node.run();
    const socket = MockWebSocket.instances[0];
    expect(node.getOutputData('Connected')).toBe(false);
    socket.open();
    expect(node.getOutputData('Connected')).toBe(true);
    expect(node.executeChildren).toHaveBeenCalledTimes(1);
    await node.run();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.binaryType).toBe('arraybuffer');
  });

  it.each([
    ['{"value":42}', { value: 42 }],
    ['[1,2]', [1, 2]],
    ['false', false],
    ['0', 0],
    ['null', null],
    ['hello', 'hello'],
    ['{broken', '{broken'],
    ['', ''],
  ])(
    'publishes message %j and executes downstream nodes',
    async (data, expected) => {
      await node.run();
      MockWebSocket.instances[0].onmessage?.({ data });
      expect(node.getOutputData('Content')).toEqual(expected);
      expect(node.executeChildren).toHaveBeenCalledTimes(1);
    },
  );

  it('passes binary data through unchanged', async () => {
    await node.run();
    const data = new Uint8Array([1, 2, 3]).buffer;
    MockWebSocket.instances[0].onmessage?.({ data });
    expect(node.getOutputData('Content')).toBe(data);
  });

  it('replaces the connection when the URL changes and ignores stale events', async () => {
    await node.run();
    const old = MockWebSocket.instances[0];
    const lateMessage = old.onmessage!;
    const lateClose = old.onclose!;
    await node.run('ws://example.test/other');
    const current = MockWebSocket.instances[1];
    current.open();
    lateMessage({ data: 'stale' });
    lateClose({ wasClean: false, code: 1006 });
    expect(old.close).toHaveBeenCalledTimes(1);
    expect(old.onmessage).toBeNull();
    expect(node.getOutputData('Content')).toBeNull();
    expect(node.getOutputData('Connected')).toBe(true);
    expect(node.getOutputData('Error')).toBe('');
  });

  it.each([
    ['', true],
    ['wss://example.test/live', false],
  ])('disconnects for URL=%j Enabled=%j', async (url, enabled) => {
    await node.run();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.onmessage?.({ data: 'old' });
    await node.run(url, enabled);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(node.getOutputData('Connected')).toBe(false);
    expect(node.getOutputData('Content')).toBeNull();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it.each(['https://example.test', 'ws://invalid'])(
    'reports invalid URL %s without throwing',
    async (url) => {
      await expect(node.run(url)).resolves.toBeUndefined();
      expect(node.getOutputData('Error')).toEqual(expect.any(String));
      expect(node.getOutputData('Error')).not.toBe('');
      expect(node.getOutputData('Connected')).toBe(false);
      expect(MockWebSocket.instances).toHaveLength(0);
    },
  );

  it('reports errors and abnormal closure, then reconnects on execution', async () => {
    await node.run();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.onerror?.();
    expect(node.getOutputData('Error')).toBe('WebSocket connection failed.');
    socket.readyState = 3;
    socket.onclose?.({ wasClean: false, code: 1006 });
    expect(node.getOutputData('Connected')).toBe(false);
    expect(node.getOutputData('Error')).toBe('WebSocket closed (1006).');
    expect(node.executeChildren).toHaveBeenCalledTimes(3);
    await node.run();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(node.getOutputData('Error')).toBe('');
  });

  it('keeps the last message on clean closure', async () => {
    await node.run();
    const socket = MockWebSocket.instances[0];
    socket.onmessage?.({ data: 'last' });
    socket.readyState = 3;
    socket.onclose?.({ wasClean: true, code: 1000 });
    expect(node.getOutputData('Content')).toBe('last');
    expect(node.getOutputData('Connected')).toBe(false);
    expect(node.getOutputData('Error')).toBe('');
  });

  it('closes and detaches handlers on removal, even while connecting', async () => {
    await node.run();
    const socket = MockWebSocket.instances[0];
    const lateOpen = socket.onopen!;
    node.onNodeRemoved();
    node.onNodeRemoved();
    lateOpen();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect([
      socket.onopen,
      socket.onmessage,
      socket.onerror,
      socket.onclose,
    ]).toEqual([null, null, null, null]);
    expect(node.executeChildren).not.toHaveBeenCalled();
  });
});
