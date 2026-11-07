// Headless: runs before nodes and links are deserialized.
import type {
  SerializedSelection,
  SerializedSocket,
  SerializedNode,
  SerializedLink,
} from '../../utils/interfaces';

const stateTypes: Record<string, string> = {
  state: 'StorageState',
  numberstate: 'StorageNumberState',
  arraystate: 'StorageArrayState',
  objectstate: 'StorageObjectState',
  stateread: 'StorageRead',
  statewrite: 'StorageWrite',
};
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

export function migrateStateNodes<T extends SerializedSelection>(graph: T): T {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const kind = String(node.type).toLowerCase();
      const type = stateTypes[kind];
      if (!type) return node;
      // Leave socket names, ids and links intact, including custom trigger methods.
      // The accumulator adapters retain State as their saved initial value.
      const defaults =
        kind === 'stateread' || kind === 'statewrite'
          ? [
              input('Storage type', 'Session', 'EnumType'),
              input('Location', 'State'),
              input('Non-empty only', false, 'BooleanType'),
            ]
          : [input('State key', node.id)];
      return {
        ...node,
        type,
        socketArray: [
          ...node.socketArray,
          ...defaults.filter(
            (socket) =>
              !node.socketArray.some(
                (existing) =>
                  existing.name === socket.name &&
                  existing.socketType === socket.socketType,
              ),
          ),
        ],
      };
    }),
  };
}

/** Replace fixed socket mutation with explicit reader connections. */
export function migrateCopySocketNodes<T extends SerializedSelection>(
  graph: T,
): T {
  const copies = graph.nodes.filter(
    (node) => String(node.type).toLowerCase() === 'copysocketvalue',
  );
  if (!copies.length) return graph;
  const copyIds = new Set(copies.map((node) => node.id));
  const ids = new Set(graph.nodes.map((node) => node.id));
  const readers = new Map<string, SerializedNode>();
  const writes = new Map<string, SerializedNode>();
  const links: SerializedLink[] = [];
  const additions = new Map<string, string[]>();
  const targetId = (node: string, socket: string) =>
    JSON.stringify([node, socket]);
  const address = (key: string) => [
    input('Storage type', 'Session', 'EnumType'),
    input('Key', key),
  ];
  for (const node of copies) {
    const socketName =
      node.socketArray.find(
        (socket) =>
          socket.socketType === 'in' && socket.name === 'Input Socket',
      )?.data ?? 'Input';
    const destinations = new Map<
      string,
      { node: SerializedNode; socket: string }
    >();
    for (const link of graph.links) {
      if (link.sourceNodeId !== node.id || link.sourceSocketName !== 'Value')
        continue;
      const target = graph.nodes.find(
        (candidate) => candidate.id === link.targetNodeId,
      );
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
    const readerIds: string[] = [];
    for (const [destination, target] of destinations) {
      const key = `Copy/${destination}`;
      keys.push(key);
      let reader = readers.get(destination);
      if (!reader) {
        let id = `${node.id}-read-${readers.size + 1}`;
        while (ids.has(id)) id += '-1';
        ids.add(id);
        const original = target.node.socketArray.find(
          (socket) =>
            socket.socketType === 'in' && socket.name === target.socket,
        );
        reader = {
          ...node,
          id,
          name: undefined,
          type: 'StorageRead',
          x: target.node.x - 220,
          y: target.node.y + readers.size * 40,
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
              dataType:
                original?.dataType ?? input('', null, 'AnyType').dataType,
            },
            { ...input('Value', original?.data, 'AnyType'), socketType: 'out' },
          ],
        };
        readers.set(destination, reader);
        links.push({
          sourceNodeId: id,
          sourceSocketName: 'Value',
          targetNodeId: target.node.id,
          targetSocketName: target.socket,
        });
      }
      readerIds.push(reader.id);
    }
    additions.set(node.id, readerIds);
    writes.set(node.id, {
      ...node,
      type: 'StorageWrite',
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
    });
  }
  return {
    ...graph,
    nodes: [
      ...graph.nodes.map((node) => writes.get(node.id) ?? node),
      ...readers.values(),
    ],
    links: [
      ...graph.links.filter(
        (link) =>
          !copyIds.has(link.sourceNodeId) &&
          !(
            copyIds.has(link.targetNodeId) &&
            link.targetSocketName === 'Input Socket'
          ) &&
          !readers.has(targetId(link.targetNodeId, link.targetSocketName)),
      ),
      ...links,
    ],
    groups: graph.groups?.map((group) => ({
      ...group,
      nodeIds: [
        ...new Set([
          ...group.nodeIds,
          ...group.nodeIds.flatMap((id) => additions.get(id) ?? []),
        ]),
      ],
    })),
  };
}

/** Flatten the former Local storage / Persistence choice into Storage type. */
export function migrateStorageBackends<T extends SerializedSelection>(
  graph: T,
): T {
  const changed = new Set<string>();
  const nodes = graph.nodes.map((node) => {
    if (
      ![
        'storageread',
        'storagewrite',
        'storageupdate',
        'storagedelete',
        'storagebrowse',
      ].includes(String(node.type).toLowerCase())
    )
      return node;
    const persistence = node.socketArray.find(
      (socket) => socket.socketType === 'in' && socket.name === 'Persistence',
    );
    const backend = node.socketArray.find(
      (socket) => socket.socketType === 'in' && socket.name === 'Storage type',
    );
    if (!persistence && backend?.data !== 'Local storage') return node;
    changed.add(node.id);
    return {
      ...node,
      socketArray: node.socketArray
        .filter((socket) => socket !== persistence)
        .map((socket) =>
          socket === backend && socket.data === 'Local storage'
            ? {
                ...socket,
                data: persistence?.data === 'Session' ? 'Session' : 'IndexedDB',
              }
            : socket,
        ),
    };
  });
  return {
    ...graph,
    nodes,
    links: graph.links.filter(
      (link) =>
        !(
          changed.has(link.targetNodeId) &&
          link.targetSocketName === 'Persistence'
        ),
    ),
  };
}

export function migrateDeprecatedStorageNodes<T extends SerializedSelection>(
  graph: T,
): T {
  const renamed = new Map<string, Record<string, string>>();
  const nodes = graph.nodes.map((node) => {
    const kind = String(node.type).toLowerCase();
    const target = {
      localstoragewrite: 'StorageWrite',
      localstoragedelete: 'StorageDelete',
      localstoragebrowse: 'StorageRead',
      userstoragewrite: 'StorageWrite',
      userstorageread: 'StorageRead',
      userstoragedelete: 'StorageDelete',
      userstoragebrowse: 'StorageBrowse',
    }[kind];
    if (!target) return node;
    const local = kind.startsWith('local');
    const names: Record<string, string> = local
      ? {
          'Local Storage Key': 'Location',
          ...(kind === 'localstoragebrowse'
            ? { Selected: 'Key', 'Fallback Value': 'Fallback value' }
            : { 'Object Key': 'Key' }),
        }
      : {};
    renamed.set(node.id, names);
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
      ...node,
      type: target,
      version: undefined,
      socketArray: [
        ...sockets,
        ...defaults.filter(
          (value) =>
            !sockets.some(
              (socket) =>
                socket.name === value.name &&
                socket.socketType === value.socketType,
            ),
        ),
      ],
    };
  });
  return {
    ...graph,
    nodes,
    links: graph.links.map((link) => ({
      ...link,
      targetSocketName:
        renamed.get(link.targetNodeId)?.[link.targetSocketName] ??
        link.targetSocketName,
    })),
  };
}

/** Normalize legacy types before creating nodes, including clipboard selections. */
export function migrateLegacyStorageNodes<T extends SerializedSelection>(
  graph: T,
): T {
  return migrateStorageBackends(
    migrateDeprecatedStorageNodes(
      migrateCopySocketNodes(migrateStateNodes(graph)),
    ),
  );
}
