// Headless: runs before nodes and links are deserialized.
import type {
  SerializedGraph,
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

export function migrateStateNodes(graph: SerializedGraph): SerializedGraph {
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
export function migrateCopySocketNodes(
  graph: SerializedGraph,
): SerializedGraph {
  const nodes: SerializedNode[] = [];
  const readers: SerializedNode[] = [];
  const links: SerializedLink[] = [];
  const removed = new Set<string>();
  const occupied = new Set<string>();
  const ids = new Set(graph.nodes.map((node) => node.id));
  const additions = new Map<string, string[]>();
  const targetId = (node: string, socket: string) =>
    JSON.stringify([node, socket]);
  const plans = graph.nodes
    .filter((node) => String(node.type).toLowerCase() === 'copysocketvalue')
    .map((node) => {
      const configured =
        node.socketArray.find(
          (socket) =>
            socket.name === 'Input Socket' && socket.socketType === 'in',
        )?.data ?? 'Input';
      // Dynamic socket selection was never part of the replacement contract.
      const socketName = typeof configured === 'string' ? configured : 'Input';
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
        // The old node set the named input, then also propagated Value along its wire.
        for (const name of new Set([socketName, link.targetSocketName])) {
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
      return {
        node,
        destinations,
        signature: JSON.stringify([...destinations.keys()].sort()),
      };
    });
  const shared = new Map<string, { key: string; readers: string[] }>();
  for (const node of graph.nodes) {
    const plan = plans.find((plan) => plan.node.id === node.id);
    // Partial overlaps cannot use a single key without changing the other targets.
    // Keep those uncommon graphs on the compatibility node instead of losing links.
    if (
      !plan ||
      plans.some(
        (other) =>
          other !== plan &&
          other.signature !== plan.signature &&
          [...other.destinations.keys()].some((key) =>
            plan.destinations.has(key),
          ),
      )
    ) {
      nodes.push(node);
      continue;
    }
    const { destinations, signature } = plan;
    removed.add(node.id);
    const existing = shared.get(signature);
    const key = existing?.key ?? `Copy/${node.id}`;
    const address = [
      input('Storage type', 'Session', 'EnumType'),
      input('Key', key),
    ];
    nodes.push({
      ...node,
      type: 'StorageWrite',
      socketArray: [
        ...node.socketArray.filter(
          (socket) =>
            socket.name === 'Execute' ||
            (socket.name === 'Value' && socket.socketType === 'in'),
        ),
        ...address,
        input('Non-empty only', false, 'BooleanType'),
      ],
    });
    if (existing) {
      additions.set(node.id, existing.readers);
      continue;
    }
    const readerIds: string[] = [];
    shared.set(signature, { key, readers: readerIds });
    for (const [destination, target] of destinations) {
      let id = `${node.id}-read-${readers.length + 1}`;
      while (ids.has(id)) id += '-1';
      ids.add(id);
      const original = target.node.socketArray.find(
        (socket) => socket.socketType === 'in' && socket.name === target.socket,
      );
      const fallback = {
        ...input('Fallback value', original?.data, 'AnyType'),
        dataType: original?.dataType ?? input('', null, 'AnyType').dataType,
      };
      readers.push({
        ...node,
        id,
        name: undefined,
        type: 'StorageRead',
        x: target.node.x - 220,
        y: target.node.y + readers.length * 40,
        updateBehaviour: {
          ...node.updateBehaviour,
          load: true,
          update: true,
          interval: false,
        },
        socketArray: [
          ...address,
          fallback,
          { ...input('Value', original?.data, 'AnyType'), socketType: 'out' },
        ],
      });
      occupied.add(destination);
      links.push({
        sourceNodeId: id,
        sourceSocketName: 'Value',
        targetNodeId: target.node.id,
        targetSocketName: target.socket,
      });
      readerIds.push(id);
      additions.set(node.id, readerIds);
    }
  }
  if (!removed.size) return graph;
  return {
    ...graph,
    nodes: [...nodes, ...readers],
    links: [
      ...graph.links.filter(
        (link) =>
          !removed.has(link.sourceNodeId) &&
          !(
            removed.has(link.targetNodeId) &&
            link.targetSocketName === 'Input Socket'
          ) &&
          !occupied.has(targetId(link.targetNodeId, link.targetSocketName)),
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
export function migrateStorageBackends(
  graph: SerializedGraph,
): SerializedGraph {
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
