// Runs the real stubs. Their base classes and the graph are mocked here, so a
// test needs nothing of the app beyond the serialized data it loads.
jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/GraphClass', () => ({
  __esModule: true,
  default: {},
}));
// sockets are only built when a stub is added to a graph
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/nodes/datatypes/deferredHtmlType', () => ({
  DeferredReactType: class {},
}));
jest.mock('../../../src/nodes/datatypes/stringType', () => ({
  StringType: class {},
}));
jest.mock('../../../src/nodes/datatypes/numberType', () => ({
  NumberType: class {},
}));
jest.mock('../../../src/nodes/datatypes/triggerType', () => ({
  TriggerType: class {},
}));

import * as deprecatedNodes from '../../../src/nodes/deprecated/deprecatedNodes';
import type {
  NodeReplacement,
  NodeReplacementContext,
  SerializedLink,
  SerializedNode,
  SerializedSelection,
} from '../../../src/utils/interfaces';

type Stub = {
  getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement;
};

// registered the way allNodes.ts does: by export name, lowercased
const stubs: Record<string, Stub> = Object.fromEntries(
  Object.entries(deprecatedNodes).map(([name, Node]) => [
    name.toLowerCase(),
    new (Node as any)(name.toLowerCase()) as Stub,
  ]),
);

// an input holds one link; connecting another replaces it
const connect = (links: SerializedLink[], link: SerializedLink) => [
  ...links.filter(
    (existing) =>
      existing.targetNodeId !== link.targetNodeId ||
      existing.targetSocketName !== link.targetSocketName,
  ),
  link,
];

/**
 * Loads serialized data the way PPGraph.configure does: links are made, then
 * every stub, in order, swaps itself for its replacement
 * (DeprecatedNode.replaceWith).
 */
export function loadWithStubs<T extends SerializedSelection>(graph: T): T {
  let nodes = structuredClone(graph.nodes);
  let links = graph.links.reduce(connect, [] as SerializedLink[]);
  let groups = structuredClone(graph.groups);
  for (const { id, type } of graph.nodes) {
    const stub = stubs[String(type).toLowerCase()];
    if (!stub) continue;
    const node = nodes.find((candidate) => candidate.id === id)!;
    const { nodes: replacements, links: replacementLinks } =
      stub.getReplacement(node, {
        links,
        getNode: (nodeId) => nodes.find((candidate) => candidate.id === nodeId),
      });
    const [main, ...extras] = replacements;
    nodes = [
      ...nodes.map((candidate) => (candidate.id === id ? main : candidate)),
      ...extras,
    ];
    links = replacementLinks.reduce(
      connect,
      links.filter(
        (link) => link.sourceNodeId !== id && link.targetNodeId !== id,
      ),
    );
    groups = groups?.map((group) =>
      group.nodeIds.includes(id)
        ? {
            ...group,
            nodeIds: [...group.nodeIds, ...extras.map((extra) => extra.id)],
          }
        : group,
    );
  }
  return { ...graph, nodes, links, groups };
}
