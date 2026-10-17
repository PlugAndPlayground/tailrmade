import { doWithTestController, openNewGraph } from '../helpers';

describe('restricted custom function workers', () => {
  before(() => {
    openNewGraph();
    doWithTestController(async (controller) => {
      await controller.addNode('CustomFunction', 'Sandbox');
    });
  });

  const blocked = {
    fetch: 'await fetch(url)',
    xhr: 'const request = new XMLHttpRequest(); request.open("GET", url, false); request.send()',
    indexedDB: 'indexedDB.open("GraphDatabase")',
    cache: 'await caches.open("app-cache")',
    importScripts: 'importScripts(url)',
    dynamicImport: 'await import(url)',
    networkWorker: 'new Worker(url)',
    websocket:
      'await new Promise((resolve, reject) => { const socket = new WebSocket(url.replace("http", "ws")); socket.onopen = () => { socket.close(); resolve(); }; socket.onerror = reject; })',
    eventSource:
      'await new Promise((resolve, reject) => { const stream = new EventSource(url); stream.onopen = () => { stream.close(); resolve(); }; stream.onerror = () => { stream.close(); reject(); }; })',
    nestedWorker: `await new Promise((resolve, reject) => {
      const childSource = 'onmessage = async e => { try { await fetch(e.data); postMessage("allowed"); } catch { postMessage("blocked"); } };';
      const child = new Worker(URL.createObjectURL(new Blob([childSource], { type: 'text/javascript' })));
      child.onmessage = e => { child.terminate(); e.data === 'blocked' ? reject() : resolve(); };
      child.onerror = () => { child.terminate(); reject(); };
      child.postMessage(url);
    })`,
    macro: 'await macro("AnyMacro")',
    constructorEscape:
      'globalThis.constructor.constructor("return fetch")()(url)',
    hostMessages: 'postMessage({ type: "macro-call", macroName: "AnyMacro" })',
  };

  for (const [name, operation] of Object.entries(blocked)) {
    it(`blocks ${name}`, () => {
      const requests: string[] = [];
      cy.intercept('**/__sandbox_probe*', (request) => {
        requests.push(request.url);
        request.reply('unexpected network access');
      });
      doWithTestController(async (controller) => {
        await controller.setNodeInputValue(
          'Sandbox',
          'Code',
          `(url) => { try { ${operation}; return "allowed"; } catch { return "blocked"; } }`,
        );
        await controller.executeNodeByID('Sandbox');
        await controller.setNodeInputValue(
          'Sandbox',
          'url',
          `${Cypress.env('pnpBaseUrl') || 'http://localhost:8080'}/__sandbox_probe`,
        );
        await controller.executeNodeByID('Sandbox');
        expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.eq(
          'blocked',
        );
        expect(requests).to.have.length(0);
      });
    });
  }

  it('reuses a warm worker and isolates globals between different functions', () => {
    doWithTestController(async (controller) => {
      await controller.setNodeInputValue(
        'Sandbox',
        'Code',
        '() => { globalThis.sandboxCounter = (globalThis.sandboxCounter || 0) + 1; return globalThis.sandboxCounter; }',
      );
      await controller.executeNodeByID('Sandbox');
      const initial = controller.getNodeOutputValue(
        'Sandbox',
        'OutData',
      ) as number;
      for (let i = 0; i < 50; i++) await controller.executeNodeByID('Sandbox');
      expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.eq(
        initial + 50,
      );
      await controller.setNodeInputValue(
        'Sandbox',
        'Code',
        '() => { return [typeof self, typeof globalThis.sandboxCounter]; }',
      );
      await controller.executeNodeByID('Sandbox');
      expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.deep.eq([
        'undefined',
        'undefined',
      ]);
    });
  });

  it('supports promises, editable input objects, and non-JSON primitives', () => {
    doWithTestController(async (controller) => {
      await controller.setNodeInputValue(
        'Sandbox',
        'Code',
        '(data) => { data.count += 1; return await Promise.resolve(data); }',
      );
      await controller.executeNodeByID('Sandbox');
      const data = {
        count: 1,
        missing: undefined,
        number: NaN,
        infinity: Infinity,
        large: 42n,
        array: [1, undefined, 3],
      };
      await controller.setNodeInputValue('Sandbox', 'data', data);
      await controller.executeNodeByID('Sandbox');
      expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.deep.eq({
        ...data,
        count: 2,
      });
    });
  });

  const failures = {
    'complex result': {
      code: '() => { return new Date(); }',
      message: /primitives, arrays, and plain data objects/,
    },
    'cyclic result': {
      code: '() => { const a = {}; a.self = a; return a; }',
      message: /cyclic|nesting/,
    },
    'unsettled promise': {
      code: '() => { return new Promise(() => {}); }',
      message: /did not settle/,
    },
    'memory exhaustion': {
      code: '() => { return Array(20000000).fill(1); }',
      message: /out of memory/,
    },
    'stack exhaustion': {
      code: '() => { function recurse() { return 1 + recurse(); } return recurse(); }',
      message: /stack/,
    },
  };

  it('evicts compiled contexts without breaking later calls', () => {
    doWithTestController(async (controller) => {
      for (let i = 0; i < 40; i++) {
        await controller.setNodeInputValue(
          'Sandbox',
          'Code',
          `() => { return ${i}; }`,
        );
        await controller.executeNodeByID('Sandbox');
        expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.eq(i);
      }
    });
  });

  for (const [name, { code, message }] of Object.entries(failures)) {
    it(`reports ${name} and recovers for the next call`, () => {
      doWithTestController(async (controller) => {
        await controller.setNodeInputValue('Sandbox', 'Code', code);
        await controller.executeNodeByID('Sandbox');
        expect(controller.getNodeByID('Sandbox').status.node.message).to.match(
          message,
        );
        await controller.setNodeInputValue(
          'Sandbox',
          'Code',
          '() => { return 42; }',
        );
        await controller.executeNodeByID('Sandbox');
        expect(controller.getNodeOutputValue('Sandbox', 'OutData')).to.eq(42);
      });
    });
  }
});
