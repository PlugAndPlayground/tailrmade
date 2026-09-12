import type {
  SerializedGraph,
  SerializedNode,
  SerializedSocket,
} from './interfaces';

export type FullAccessReason = 'code' | 'npm' | 'html';

export interface Manifest {
  fullAccess: { reason: FullAccessReason; nodeIds: string[] }[];
  keys: { name: string; hosts: string[]; nodeIds: string[] }[];
  hosts: { host: string; nodeIds: string[] }[];
  runtimeHostNodeIds: string[];
  companionNodeIds: string[];
  // undefined backend or location: decided at runtime, or any location
  storage: {
    backend: string | undefined;
    location: string | undefined;
    nodeIds: string[];
  }[];
  aiNodeIds: string[];
  intervalNodeIds: string[];
  fastestIntervalMs: number | undefined;
}

// GraphClass matches node types case-insensitively, so every list here is
// lowercase
const lowercase = (types: string[]) =>
  new Set(types.map((type) => type.toLowerCase()));

const CODE_TYPES = lowercase([
  'CustomFunction',
  'ArrayMethod',
  'MapNode',
  'Filter',
  'ArrayFind',
  'Reduce',
  'ExtendMap',
]);
const NPM_TYPES = lowercase(['LoadNPM']);
const HTML_TYPES = lowercase([
  'HtmlRenderer',
  'IFrameRenderer',
  'IFrameRendererDiv',
  'IFrameRendererCanvas',
  'EmbedWebsite',
  'Slideshow',
]);
// Code sockets on these hold shaders or editor text, not JavaScript
const NON_JS_CODE_TYPES = lowercase([
  'Shader',
  'ImageShader',
  'CodeEditor',
  'JSONEditor',
  'TestDataTypes',
]);
const AI_TYPES = lowercase(['AINode', 'ClaudeNode', 'GeminiNode']);
const COMPANION_TYPES = lowercase(['HTTPNode']);
const URL_SOCKET_BY_TYPE = new Map(
  Object.entries({
    HTTPNode: 'URL',
    PixotopeGatewayGet: 'URL',
    PixotopeGatewaySet: 'URL',
    PixotopeGatewayCall: 'URL',
    WebSocketNode: 'URL',
    SqliteReader: 'Resource URL',
  }).map(([type, socketName]) => [type.toLowerCase(), socketName]),
);
// null: the node has a "Storage type" socket
const STORAGE_BACKEND_BY_TYPE = new Map<string, string | null>(
  Object.entries({
    StorageWrite: null,
    StorageRead: null,
    StorageDelete: null,
    StorageBrowse: null,
    LocalStorageWrite: 'Local storage',
    LocalStorageDelete: 'Local storage',
    LocalStorageBrowse: 'Local storage',
    UserStorageWrite: 'Cloud',
    UserStorageRead: 'Cloud',
    UserStorageDelete: 'Cloud',
    UserStorageBrowse: 'Cloud',
  }).map(([type, backend]) => [type.toLowerCase(), backend]),
);
const BROWSE_TYPES = lowercase([
  'StorageBrowse',
  'LocalStorageBrowse',
  'UserStorageBrowse',
]);

const KEY_PATTERN = /\$TM_KEY\{([^}]+)\}/g;
const RUNTIME = Symbol('runtime');

// The HTTP node's default headers reference this placeholder, so nearly every
// HTTP node carries it without using a key
const PLACEHOLDER_KEY_NAME = 'YOUR_ENVIRONMENTAL_COMPANION_VARIABLE_HERE';

export const getKeyNames = (text: string): string[] =>
  [...text.matchAll(KEY_PATTERN)]
    .map(([, name]) => name)
    .filter((name) => name !== PLACEHOLDER_KEY_NAME);

const isInput = (socket: SerializedSocket) => socket.socketType !== 'out';

const inputKey = (nodeId: string, socketName: string) =>
  JSON.stringify([nodeId, socketName]);

const getDataTypeClass = (socket: SerializedSocket): string | undefined => {
  try {
    return JSON.parse(socket.dataType).class;
  } catch {
    return undefined;
  }
};

// A placeholder turns into the node type named in its name once that type
// exists, so a file can use one to smuggle in any node
const getEffectiveType = (node: SerializedNode) => {
  const type = node.type.toLowerCase();
  return type === 'placeholder' ? node.name.toLowerCase() : type;
};

export const getHost = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
};

const toText = (data: unknown): string =>
  typeof data === 'string' ? data : (JSON.stringify(data) ?? '');

const pushTo = <K>(map: Map<K, string[]>, key: K, nodeId: string) => {
  map.set(key, [...(map.get(key) ?? []), nodeId]);
};

// Also checked on live nodes, which are blocked while full access is off. HTML
// is sanitised instead of blocked, so it is left out here.
export const runsCode = (type: string, hasCodeInput: boolean): boolean => {
  const lowercaseType = type.toLowerCase();
  if (CODE_TYPES.has(lowercaseType) || NPM_TYPES.has(lowercaseType)) {
    return true;
  }
  return (
    hasCodeInput &&
    !NON_JS_CODE_TYPES.has(lowercaseType) &&
    !HTML_TYPES.has(lowercaseType)
  );
};

const getFullAccessReason = (
  type: string,
  node: SerializedNode,
  input: (name: string, fallback?: unknown) => unknown,
): FullAccessReason | undefined => {
  if (NPM_TYPES.has(type)) return 'npm';
  if (HTML_TYPES.has(type)) {
    const sanitizedByDefault = type === 'htmlrenderer';
    return input('Sanitize input', sanitizedByDefault) === true
      ? undefined
      : 'html';
  }
  const hasCodeInput = node.socketArray.some(
    (socket) => isInput(socket) && getDataTypeClass(socket) === 'CodeType',
  );
  return runsCode(type, hasCodeInput) ? 'code' : undefined;
};

export const scanGraph = (graph: SerializedGraph): Manifest => {
  const linkedInputs = new Set(
    graph.links.map((link) =>
      inputKey(link.targetNodeId, link.targetSocketName),
    ),
  );
  const fullAccess = new Map<FullAccessReason, string[]>();
  const keys = new Map<string, { hosts: Set<string>; nodeIds: string[] }>();
  const hosts = new Map<string, string[]>();
  const storage = new Map<string, Manifest['storage'][number]>();
  const manifest: Manifest = {
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

  graph.nodes.forEach((node) => {
    const type = getEffectiveType(node);
    // Linked inputs are only known at runtime, and absent ones fall back to
    // the node's default
    const input = (name: string, fallback: unknown = RUNTIME): unknown => {
      const sockets = node.socketArray.filter(
        (candidate) => isInput(candidate) && candidate.name === name,
      );
      // A repeated socket could show the scanner one value and the node another
      if (linkedInputs.has(inputKey(node.id, name)) || sockets.length > 1) {
        return RUNTIME;
      }
      return sockets.length === 1 ? sockets[0].data : fallback;
    };

    const reason = getFullAccessReason(type, node, input);
    if (reason) pushTo(fullAccess, reason, node.id);

    const urlSocketName = URL_SOCKET_BY_TYPE.get(type);
    const url = urlSocketName ? input(urlSocketName) : undefined;
    const host = getHost(url);
    if (host) {
      pushTo(hosts, host, node.id);
    } else if (url === RUNTIME) {
      manifest.runtimeHostNodeIds.push(node.id);
    }

    node.socketArray.filter(isInput).forEach((socket) => {
      for (const name of getKeyNames(toText(socket.data))) {
        const key = keys.get(name) ?? { hosts: new Set<string>(), nodeIds: [] };
        if (host) key.hosts.add(host);
        if (!key.nodeIds.includes(node.id)) key.nodeIds.push(node.id);
        keys.set(name, key);
      }
    });

    if (COMPANION_TYPES.has(type)) {
      const companion = input('Send Through Companion', false);
      if (companion === true || companion === RUNTIME) {
        manifest.companionNodeIds.push(node.id);
      }
    }

    if (STORAGE_BACKEND_BY_TYPE.has(type)) {
      const backendInput =
        STORAGE_BACKEND_BY_TYPE.get(type) ?? input('Storage type', 'IndexedDB');
      const backend =
        typeof backendInput === 'string' ? backendInput : undefined;
      const browsesEverything =
        BROWSE_TYPES.has(type) && input('Filter by Location', false) !== true;
      const location = browsesEverything
        ? undefined
        : [input('Location'), input('Local Storage Key')].find(
            (value): value is string => typeof value === 'string',
          );
      const storageKey = JSON.stringify([backend ?? null, location ?? null]);
      const entry = storage.get(storageKey) ?? {
        backend,
        location,
        nodeIds: [],
      };
      entry.nodeIds.push(node.id);
      storage.set(storageKey, entry);
    }

    if (AI_TYPES.has(type)) manifest.aiNodeIds.push(node.id);

    if (node.updateBehaviour?.interval) {
      manifest.intervalNodeIds.push(node.id);
      manifest.fastestIntervalMs = Math.min(
        manifest.fastestIntervalMs ?? Infinity,
        node.updateBehaviour.intervalFrequency,
      );
    }
  });

  manifest.fullAccess = [...fullAccess].map(([reason, nodeIds]) => ({
    reason,
    nodeIds,
  }));
  manifest.keys = [...keys]
    .map(([name, key]) => ({
      name,
      hosts: [...key.hosts].sort(),
      nodeIds: key.nodeIds,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  manifest.hosts = [...hosts]
    .map(([host, nodeIds]) => ({ host, nodeIds }))
    .sort((a, b) => a.host.localeCompare(b.host));
  manifest.storage = [...storage.values()].sort((a, b) =>
    `${a.backend}/${a.location}`.localeCompare(`${b.backend}/${b.location}`),
  );
  return manifest;
};

// Grants are stored against this, so it must change whenever what the app can
// do changes: the code it runs as well as the categories. Node ids and table
// data are left out so copying an app or editing its data keeps the grants.
export const getManifestHash = async (
  graph: SerializedGraph,
): Promise<string> => {
  const manifest = scanGraph(graph);
  const fullAccessNodeIds = new Set(
    manifest.fullAccess.flatMap((item) => item.nodeIds),
  );
  const code = graph.nodes
    .filter((node) => fullAccessNodeIds.has(node.id))
    .map((node) =>
      JSON.stringify([
        getEffectiveType(node),
        node.socketArray
          .filter(
            (socket) =>
              isInput(socket) &&
              ['string', 'boolean'].includes(typeof socket.data),
          )
          .map((socket) => [socket.name, socket.data]),
      ]),
    )
    .sort();
  const capabilities = JSON.stringify({
    fullAccess: manifest.fullAccess.map((item) => item.reason).sort(),
    code,
    keys: manifest.keys.map(({ name, hosts }) => [name, hosts]),
    hosts: manifest.hosts.map((item) => item.host),
    runtimeHosts: manifest.runtimeHostNodeIds.length > 0,
    companion: manifest.companionNodeIds.length > 0,
    storage: manifest.storage.map(({ backend, location }) => [
      backend ?? null,
      location ?? null,
    ]),
    ai: manifest.aiNodeIds.length > 0,
    fastestIntervalMs: manifest.fastestIntervalMs ?? null,
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(capabilities),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};
