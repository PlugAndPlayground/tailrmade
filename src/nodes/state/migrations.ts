// Headless: what each removed state and storage node turns into. The stubs in
// nodes/deprecated apply these when a graph with them loads.
import type {
  NodeReplacement,
  NodeReplacementContext,
  SerializedLink,
  SerializedNode,
  SerializedSocket,
} from '../../utils/interfaces';

const input = (
  name: string,
  data: unknown,
  type = 'StringType',
): SerializedSocket => ({
  socketType: 'in',
  name,
  data,
  dataType: JSON.stringify({ class: type }),
  visible: false,
  dependentSocketName: undefined,
});

// sockets the node already has keep their value
const withDefaults = (
  sockets: SerializedSocket[],
  defaults: SerializedSocket[],
): SerializedSocket[] => [
  ...sockets,
  ...defaults.filter(
    (socket) =>
      !sockets.some(
        (existing) =>
          existing.name === socket.name &&
          existing.socketType === socket.socketType,
      ),
  ),
];

const linksOf = (node: SerializedNode, links: SerializedLink[]) =>
  links.filter(
    (link) => link.sourceNodeId === node.id || link.targetNodeId === node.id,
  );

const kindOf = (node: SerializedNode) => String(node.type).toLowerCase();

const stateTypes: Record<string, string> = {
  state: 'StorageState',
  numberstate: 'StorageNumberState',
  arraystate: 'StorageArrayState',
  objectstate: 'StorageObjectState',
  stateread: 'StorageRead',
  statewrite: 'StorageWrite',
};

// Socket names, the id and links stay, including custom trigger methods. The
// accumulators keep State as their saved initial value.
export function replaceStateNode(
  node: SerializedNode,
  { links }: NodeReplacementContext,
): NodeReplacement {
  const kind = kindOf(node);
  const defaults =
    kind === 'stateread' || kind === 'statewrite'
      ? [
          input('Storage type', 'Session', 'EnumType'),
          input('Location', 'State'),
          input('Non-empty only', false, 'BooleanType'),
        ]
      : [input('State key', node.id)];
  return {
    nodes: [
      {
        ...node,
        type: stateTypes[kind],
        version: undefined,
        socketArray: withDefaults(node.socketArray, defaults),
      },
    ],
    links: linksOf(node, links),
  };
}

const targetId = (node: string, socket: string) =>
  JSON.stringify([node, socket]);
const address = (key: string) => [
  input('Storage type', 'Session', 'EnumType'),
  input('Key', key),
];

const readsKey = (node: SerializedNode | undefined, key: string) =>
  node !== undefined &&
  kindOf(node) === 'storageread' &&
  node.socketArray.some(
    (socket) =>
      socket.socketType === 'in' &&
      socket.name === 'Key' &&
      socket.data === key,
  );

/**
 * Copy Socket Value pushed its value into a fixed input. It becomes a Storage
 * Write under the same id, plus a Storage Read wired into each input it fed.
 * Copies into the same input share one reader.
 */
export function replaceCopySocketValue(
  node: SerializedNode,
  { links, getNode }: NodeReplacementContext,
): NodeReplacement {
  const socketName =
    node.socketArray.find(
      (socket) => socket.socketType === 'in' && socket.name === 'Input Socket',
    )?.data ?? 'Input';
  const destinations = new Map<
    string,
    { node: SerializedNode; socket: string }
  >();
  for (const link of links) {
    if (link.sourceNodeId !== node.id || link.sourceSocketName !== 'Value')
      continue;
    const target = getNode(link.targetNodeId);
    if (!target) continue;
    // Preserve both the explicitly copied input and normal output propagation.
    for (const name of new Set([String(socketName), link.targetSocketName])) {
      if (
        name !== link.targetSocketName &&
        !target.socketArray.some(
          (socket) => socket.socketType === 'in' && socket.name === name,
        )
      )
        continue;
      destinations.set(targetId(target.id, name), {
        node: target,
        socket: name,
      });
    }
  }

  const keys: string[] = [];
  const readers: SerializedNode[] = [];
  const readerLinks: SerializedLink[] = [];
  for (const [destination, target] of destinations) {
    const key = `Copy/${destination}`;
    keys.push(key);
    const feeding = links.find(
      (link) =>
        link.targetNodeId === target.node.id &&
        link.targetSocketName === target.socket,
    );
    const feeder = feeding && getNode(feeding.sourceNodeId);
    // its reader is there already, or the copy feeding it adds it on migrating
    if (
      feeder &&
      feeder.id !== node.id &&
      (readsKey(feeder, key) || kindOf(feeder) === 'copysocketvalue')
    )
      continue;

    let id = `${node.id}-read-${readers.length + 1}`;
    while (getNode(id) || readers.some((reader) => reader.id === id))
      id += '-1';
    const original = target.node.socketArray.find(
      (socket) => socket.socketType === 'in' && socket.name === target.socket,
    );
    readers.push({
      ...node,
      id,
      name: undefined,
      type: 'StorageRead',
      version: undefined,
      x: target.node.x - 220,
      y: target.node.y + readers.length * 40,
      updateBehaviour: {
        ...node.updateBehaviour,
        load: true,
        update: true,
        interval: false,
      },
      socketArray: [
        ...address(key),
        {
          ...input('Fallback value', original?.data, 'AnyType'),
          dataType: original?.dataType ?? input('', null, 'AnyType').dataType,
        },
        { ...input('Value', original?.data, 'AnyType'), socketType: 'out' },
      ],
    });
    readerLinks.push({
      sourceNodeId: id,
      sourceSocketName: 'Value',
      targetNodeId: target.node.id,
      targetSocketName: target.socket,
    });
  }

  const writer: SerializedNode = {
    ...node,
    type: 'StorageWrite',
    version: undefined,
    socketArray: [
      ...node.socketArray.filter(
        (socket) =>
          socket.name === 'Execute' ||
          (socket.name === 'Value' && socket.socketType === 'in'),
      ),
      ...address(keys[0] ?? `Copy/${node.id}`),
      input('Non-empty only', false, 'BooleanType'),
      // Hidden migration input lets one old trigger update several independent keys.
      ...(keys.length > 1
        ? [input('Additional keys', keys.slice(1), 'ArrayType')]
        : []),
    ],
  };
  return {
    nodes: [writer, ...readers],
    links: [
      ...links.filter(
        (link) =>
          link.targetNodeId === node.id &&
          link.targetSocketName !== 'Input Socket',
      ),
      ...readerLinks,
    ],
  };
}

const legacyStorageTypes: Record<string, string> = {
  localstoragewrite: 'StorageWrite',
  localstoragedelete: 'StorageDelete',
  localstoragebrowse: 'StorageRead',
  userstoragewrite: 'StorageWrite',
  userstorageread: 'StorageRead',
  userstoragedelete: 'StorageDelete',
  userstoragebrowse: 'StorageBrowse',
};

// Local Storage and User Storage nodes become Storage nodes on IndexedDB and
// Cloud, with their renamed inputs and wiring.
export function replaceLegacyStorageNode(
  node: SerializedNode,
  { links }: NodeReplacementContext,
): NodeReplacement {
  const kind = kindOf(node);
  const target = legacyStorageTypes[kind];
  const local = kind.startsWith('local');
  const names: Record<string, string> = local
    ? {
        'Local Storage Key': 'Location',
        ...(kind === 'localstoragebrowse'
          ? { Selected: 'Key', 'Fallback Value': 'Fallback value' }
          : { 'Object Key': 'Key' }),
      }
    : {};
  const sockets = node.socketArray.map((socket) => ({
    ...socket,
    name:
      socket.socketType === 'out'
        ? socket.name
        : (names[socket.name] ?? socket.name),
  }));
  const defaults = [
    input('Storage type', local ? 'IndexedDB' : 'Cloud', 'EnumType'),
  ];
  if (local || kind === 'userstorageread')
    defaults.push(input('Show Toast Notification', false, 'BooleanType'));
  if (target === 'StorageWrite')
    defaults.push(
      input('Non-empty only', false, 'BooleanType'),
      input('Insert only', false, 'BooleanType'),
    );
  return {
    nodes: [
      {
        ...node,
        type: target,
        version: undefined,
        socketArray: withDefaults(sockets, defaults),
      },
    ],
    links: linksOf(node, links).map((link) =>
      link.targetNodeId === node.id
        ? {
            ...link,
            targetSocketName:
              names[link.targetSocketName] ?? link.targetSocketName,
          }
        : link,
    ),
  };
}
