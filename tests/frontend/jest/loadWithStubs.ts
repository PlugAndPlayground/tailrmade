import {
  replaceCopySocketValue,
  replaceLegacyStorageNode,
  replaceStateNode,
} from '../../../src/nodes/state/migrations';
import { replaceLabelNode } from '../../../src/text/nodeMigrations';
import type {
  NodeReplacement,
  NodeReplacementContext,
  SerializedLink,
  SerializedNode,
  SerializedSelection,
} from '../../../src/utils/interfaces';

// what each stub in src/nodes/deprecated replaces itself with
const stubs: Record<
  string,
  (node: SerializedNode, context: NodeReplacementContext) => NodeReplacement
> = {
  label: replaceLabelNode,
  state: replaceStateNode,
  numberstate: replaceStateNode,
  arraystate: replaceStateNode,
  objectstate: replaceStateNode,
  stateread: replaceStateNode,
  statewrite: replaceStateNode,
  copysocketvalue: replaceCopySocketValue,
  localstoragewrite: replaceLegacyStorageNode,
  localstoragedelete: replaceLegacyStorageNode,
  localstoragebrowse: replaceLegacyStorageNode,
  userstoragewrite: replaceLegacyStorageNode,
  userstorageread: replaceLegacyStorageNode,
  userstoragedelete: replaceLegacyStorageNode,
  userstoragebrowse: replaceLegacyStorageNode,
};

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
 * (PPGraph.replaceNodeInPlace).
 */
export function loadWithStubs<T extends SerializedSelection>(graph: T): T {
  let nodes = structuredClone(graph.nodes);
  let links = graph.links.reduce(connect, [] as SerializedLink[]);
  let groups = structuredClone(graph.groups);
  for (const { id, type } of graph.nodes) {
    const replace = stubs[String(type).toLowerCase()];
    if (!replace) continue;
    const node = nodes.find((candidate) => candidate.id === id)!;
    const { nodes: replacements, links: replacementLinks } = replace(node, {
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
