import type {
  SerializedGraph,
  SerializedLink,
  SerializedNode,
  SerializedSocket,
} from '../../../src/utils/interfaces';
import { getManifestHash, scanGraph } from '../../../src/utils/scanGraph';

const socket = (
  name: string,
  data: unknown,
  typeClass = 'StringType',
  socketType: 'in' | 'out' = 'in',
): SerializedSocket => ({
  socketType,
  name,
  dataType: JSON.stringify({ class: typeClass, type: {} }),
  data,
  visible: undefined,
  dependentSocketName: undefined,
});

const node = (
  type: string,
  id: string,
  sockets: SerializedSocket[] = [],
  overrides: Partial<SerializedNode> = {},
): SerializedNode => ({
  type,
  id,
  name: type,
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  socketArray: sockets,
  updateBehaviour: {
    load: true,
    update: true,
    interval: false,
    intervalFrequency: 1000,
  },
  version: 1,
  ...overrides,
});

const link = (
  targetNodeId: string,
  targetSocketName: string,
  sourceNodeId = 'source',
): SerializedLink => ({
  sourceNodeId,
  sourceSocketName: 'Out',
  targetNodeId,
  targetSocketName,
});

const graph = (
  nodes: SerializedNode[],
  links: SerializedLink[] = [],
): SerializedGraph =>
  ({
    version: 1,
    graphSettings: {},
    overlay: {},
    nodes,
    links,
  }) as unknown as SerializedGraph;

const httpNode = (
  id: string,
  url: unknown,
  overrides: SerializedSocket[] = [],
) => {
  const overridden = new Set(overrides.map((each) => each.name));
  const defaults = [
    socket('URL', url),
    socket('Headers', {}, 'JSONType'),
    socket('Send Through Companion', false, 'BooleanType'),
  ].filter((each) => !overridden.has(each.name));
  return node('HTTPNode', id, [...defaults, ...overrides]);
};

const emptyManifest = {
  fullAccess: [],
  keys: [],
  hosts: [],
  runtimeHostNodeIds: [],
  companionNodeIds: [],
  storage: [],
  aiNodeIds: [],
  intervalNodeIds: [],
  fastestIntervalMs: undefined,
};

describe('scanGraph fixtures', () => {
  it('finds nothing in a clean app', () => {
    const clean = graph(
      [
        node('Constant', 'a', [socket('In', 2, 'NumberType')]),
        node('Add', 'b', [socket('Addend', 3, 'NumberType')]),
        node('Label', 'c', [socket('Input', 'Hello', 'StringType')]),
      ],
      [link('b', 'Augend', 'a')],
    );
    expect(scanGraph(clean)).toEqual(emptyManifest);
  });

  it('lists only the host for an app that only connects to the outside', () => {
    const app = graph([httpNode('fetch', 'https://api.example.com/v1/items')]);
    expect(scanGraph(app)).toEqual({
      ...emptyManifest,
      hosts: [{ host: 'api.example.com', nodeIds: ['fetch'] }],
    });
  });

  it('lists every capability of an invoice scanner style app', () => {
    const app = graph([
      httpNode('ocr', 'https://ocr.example.com/scan', [
        socket(
          'Headers',
          { Authorization: 'Bearer $TM_KEY{OCR_KEY}' },
          'JSONType',
        ),
        socket('Send Through Companion', true, 'BooleanType'),
      ]),
      node('AINode', 'extract', [socket('Data', 'Extract the total')]),
      node('CustomFunction', 'parse', [
        socket('Code', '(invoice) => invoice.total', 'CodeType'),
        socket('Main Thread', false, 'BooleanType'),
      ]),
      node('StorageWrite', 'save', [
        socket('Storage type', 'Cloud', 'EnumType'),
        socket('Location', 'invoices'),
      ]),
      node('IFrameRenderer', 'preview', [
        socket('Header', '', 'CodeType'),
        socket('Html', '<div>{{total}}</div>', 'HtmlType'),
        socket('Sanitize input', false, 'BooleanType'),
      ]),
      node('Constant', 'poll', [socket('In', 1, 'NumberType')], {
        updateBehaviour: {
          load: true,
          update: true,
          interval: true,
          intervalFrequency: 5000,
        },
      }),
    ]);

    expect(scanGraph(app)).toEqual({
      fullAccess: [
        { reason: 'code', nodeIds: ['parse'] },
        { reason: 'html', nodeIds: ['preview'] },
      ],
      keys: [{ name: 'OCR_KEY', hosts: ['ocr.example.com'], nodeIds: ['ocr'] }],
      hosts: [{ host: 'ocr.example.com', nodeIds: ['ocr'] }],
      runtimeHostNodeIds: [],
      companionNodeIds: ['ocr'],
      storage: [{ backend: 'Cloud', location: 'invoices', nodeIds: ['save'] }],
      aiNodeIds: ['extract'],
      intervalNodeIds: ['poll'],
      fastestIntervalMs: 5000,
    });
  });

  it('finds a key nested in JSON, but leaves a key assembled at runtime to enforcement', () => {
    const app = graph(
      [
        node('Constant', 'prefix', [socket('In', '$TM_')]),
        node('Constant', 'suffix', [socket('In', 'KEY{SPLIT_KEY}')]),
        node('Concatenate', 'join'),
        httpNode('split', 'https://split.example.com', [
          socket('Headers', undefined, 'JSONType'),
        ]),
        httpNode('nested', 'https://nested.example.com', [
          socket(
            'Body',
            { auth: { token: '$TM_KEY{NESTED_KEY}' } },
            'JSONType',
          ),
        ]),
      ],
      [
        link('join', 'String 1', 'prefix'),
        link('join', 'String 2', 'suffix'),
        link('split', 'Headers', 'join'),
      ],
    );

    const manifest = scanGraph(app);
    expect(manifest.keys).toEqual([
      {
        name: 'NESTED_KEY',
        hosts: ['nested.example.com'],
        nodeIds: ['nested'],
      },
    ]);
    expect(manifest.hosts.map((item) => item.host)).toEqual([
      'nested.example.com',
      'split.example.com',
    ]);
  });
});

describe('scanGraph full access', () => {
  it('matches node types case-insensitively and sees through placeholders', () => {
    const app = graph([
      node('customfunction', 'lowercase'),
      node('Placeholder', 'smuggled', [], { name: 'CustomFunction' }),
      node('LOADNPM', 'npm', [socket('Package Name', 'left-pad')]),
    ]);
    expect(scanGraph(app).fullAccess).toEqual([
      { reason: 'code', nodeIds: ['lowercase', 'smuggled'] },
      { reason: 'npm', nodeIds: ['npm'] },
    ]);
  });

  it('flags code nodes even when their socket type is forged', () => {
    const app = graph([
      node('MapNode', 'map', [socket('Code', '(a) => a', 'StringType')]),
    ]);
    expect(scanGraph(app).fullAccess).toEqual([
      { reason: 'code', nodeIds: ['map'] },
    ]);
  });

  it('flags unknown nodes with code inputs, but not shaders', () => {
    const app = graph([
      node('FutureCodeNode', 'future', [socket('Script', 'x', 'CodeType')]),
      node('Shader', 'shader', [
        socket('Fragment', 'void main(){}', 'CodeType'),
      ]),
      node('TextEditor2', 'text', [socket('Html', '<p/>', 'CodeType', 'out')]),
    ]);
    expect(scanGraph(app).fullAccess).toEqual([
      { reason: 'code', nodeIds: ['future'] },
    ]);
  });

  it('treats HTML as full access unless it is sanitised', () => {
    const app = graph(
      [
        node('HtmlRenderer', 'sanitised', [
          socket('Sanitize input', true, 'BooleanType'),
        ]),
        node('HtmlRenderer', 'defaultSanitised'),
        node('HtmlRenderer', 'raw', [
          socket('Sanitize input', false, 'BooleanType'),
        ]),
        node('IFrameRenderer', 'linkedSanitize', [
          socket('Sanitize input', undefined, 'BooleanType'),
        ]),
        node('IFrameRendererDiv', 'defaultIFrame'),
        node('Slideshow', 'slides'),
      ],
      [link('linkedSanitize', 'Sanitize input')],
    );
    expect(scanGraph(app).fullAccess).toEqual([
      {
        reason: 'html',
        nodeIds: ['raw', 'linkedSanitize', 'defaultIFrame', 'slides'],
      },
    ]);
  });
});

describe('scanGraph connections and storage', () => {
  it('records hosts computed at runtime', () => {
    const app = graph(
      [
        httpNode('linked', undefined),
        node('WebSocketNode', 'missingUrl'),
        node('SqliteReader', 'localResource', [
          socket('Resource URL', 'local-resource-id'),
        ]),
      ],
      [link('linked', 'URL')],
    );
    const manifest = scanGraph(app);
    expect(manifest.runtimeHostNodeIds).toEqual(['linked', 'missingUrl']);
    expect(manifest.hosts).toEqual([]);
  });

  it('records the companion when it is on or decided at runtime', () => {
    const app = graph(
      [
        httpNode('on', 'https://a.example.com', [
          socket('Send Through Companion', true, 'BooleanType'),
        ]),
        httpNode('linked', 'https://b.example.com'),
        httpNode('off', 'https://c.example.com'),
      ],
      [link('linked', 'Send Through Companion')],
    );
    expect(scanGraph(app).companionNodeIds).toEqual(['on', 'linked']);
  });

  it('treats a repeated socket as unknown, since the node may read the other copy', () => {
    const app = graph([
      node('HTTPNode', 'twice', [
        socket('URL', 'https://a.example.com'),
        socket('Send Through Companion', false, 'BooleanType'),
        socket('Send Through Companion', true, 'BooleanType'),
      ]),
      node('HtmlRenderer', 'html', [
        socket('Sanitize input', true, 'BooleanType'),
        socket('Sanitize input', false, 'BooleanType'),
      ]),
    ]);
    const manifest = scanGraph(app);
    expect(manifest.companionNodeIds).toEqual(['twice']);
    expect(manifest.fullAccess).toEqual([
      { reason: 'html', nodeIds: ['html'] },
    ]);
  });

  it('groups storage by backend and location', () => {
    const app = graph(
      [
        node('StorageRead', 'readDefault', [socket('Location', 'notes')]),
        node('StorageWrite', 'writeDefault', [socket('Location', 'notes')]),
        node('StorageBrowse', 'browseAll', [
          socket('Filter by Location', false, 'BooleanType'),
          socket('Location', 'ignored'),
        ]),
        node('LocalStorageWrite', 'legacy', [
          socket('Local Storage Key', 'settings'),
        ]),
        node('StorageDelete', 'linkedLocation', [
          socket('Location', undefined),
        ]),
      ],
      [link('linkedLocation', 'Location')],
    );
    expect(scanGraph(app).storage).toEqual([
      {
        backend: 'IndexedDB',
        location: 'notes',
        nodeIds: ['readDefault', 'writeDefault'],
      },
      {
        backend: 'IndexedDB',
        location: undefined,
        nodeIds: ['browseAll', 'linkedLocation'],
      },
      { backend: 'Local storage', location: 'settings', nodeIds: ['legacy'] },
    ]);
  });
});

describe('getManifestHash', () => {
  const app = (code: string, url: string, rows: number[]) =>
    graph([
      node('CustomFunction', 'fn', [
        socket('Code', code, 'CodeType'),
        socket('Rows', rows, 'ArrayType'),
      ]),
      httpNode('fetch', url),
    ]);
  const base = app('(a) => a', 'https://api.example.com', [1, 2]);

  it('is stable when only node ids, positions or table data change', async () => {
    const moved = structuredClone(base);
    moved.nodes.forEach((each, index) => {
      each.id = `copy-${index}`;
      each.x += 500;
    });
    const newData = app('(a) => a', 'https://api.example.com', [3, 4, 5]);

    const hash = await getManifestHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await getManifestHash(moved)).toBe(hash);
    expect(await getManifestHash(newData)).toBe(hash);
  });

  it('changes when the code or a host changes', async () => {
    const hash = await getManifestHash(base);
    expect(
      await getManifestHash(
        app('(a) => fetch(a)', 'https://api.example.com', [1, 2]),
      ),
    ).not.toBe(hash);
    expect(
      await getManifestHash(
        app('(a) => a', 'https://other.example.com', [1, 2]),
      ),
    ).not.toBe(hash);
  });
});
