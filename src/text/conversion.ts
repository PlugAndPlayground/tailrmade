// Static Text item <-> dynamic Text node, each as one undo entry. The surface
// tree item keeps its key, parent and index, so it stays the same element.
import { hri } from 'human-readable-ids';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import {
  PNPAction,
  SerializableAction,
  SerializableActionHandler,
} from '../classes/Action';
import type { UISurfaceNode } from '../nodes/layout/uiSurface';
import {
  findEmbeddingsOf,
  getElementIdForNode,
  SurfaceSync,
} from '../nodes/layout/surfaceSync';
import { NODE_SOURCE } from '../utils/constants';
import {
  isSurfaceNode,
  SerializedLink,
  SerializedNode,
} from '../utils/interfaces';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../utils/layoutableHelpers';
import type { SerializedCraftTree } from '../utils/surfaceTree';
import { bakeMarkdownTokens } from './lexical/markdown';
import { normalizeTextProps } from './model';
import { getTokenInputs } from './nodeInputs';
import {
  TEXT_NODE_TYPE,
  textPropsFromSocketValues,
  textPropsToSocketValues,
} from './nodeSockets';
import { STATIC_TEXT_ITEM_TYPE } from './migrations';
import {
  getDynamicWidgetPlacementProps,
  getStaticTextPlacementProps,
} from './staticLayout';
import { renderTokenSource } from './tokens';

// new nodes go left of the surface they feed
const NODE_OFFSET_X = -360;

export type StaticConversionGuard =
  | { allowed: true; surface: UISurfaceNode; itemId: string }
  | { allowed: false; reason: string };

export function getStaticConversionGuard(node: PPNode): StaticConversionGuard {
  const surfaces = Object.values(PPGraph.currentGraph.nodes).filter(
    isSurfaceNode,
  );
  const placements = findEmbeddingsOf(surfaces, node.id);
  if (placements.length !== 1) {
    return {
      allowed: false,
      reason:
        placements.length === 0
          ? 'This text is not placed on a UI surface.'
          : 'This text is placed on more than one UI surface.',
    };
  }
  const hasOtherConsumers = node.outputSocketArray.some((socket) =>
    socket.links.some((link) => !link.getTarget().getNode().isSurface()),
  );
  if (hasOtherConsumers) {
    return {
      allowed: false,
      reason: 'Other nodes use this text node, so it has to stay a node.',
    };
  }
  const surface = placements[0].surface as UISurfaceNode;
  const itemId = SurfaceSync.findWidgetItemId(
    surface.getSurfaceTree(),
    getElementIdForNode(node.id),
  );
  if (!itemId) {
    return {
      allowed: false,
      reason: 'This text placement is missing from its UI surface.',
    };
  }
  const placement = surface.getSurfaceTree()[itemId];
  if (placement.props.showLabel || placement.props.collapsible) {
    return {
      allowed: false,
      reason:
        'Remove the placement label or collapsible setting before converting it.',
    };
  }
  return { allowed: true, surface, itemId };
}

function getSurface(surfaceId: string): UISurfaceNode {
  return PPGraph.currentGraph.nodes[surfaceId] as UISurfaceNode;
}

function detach(tree: SerializedCraftTree, itemId: string): void {
  const item = tree[itemId];
  const parent = item?.parent ? tree[item.parent] : undefined;
  if (!item || !parent) {
    throw new Error(`Cannot detach missing surface item "${itemId}"`);
  }
  parent.nodes = parent.nodes.filter((id) => id !== itemId);
  delete tree[itemId];
}

export const TEXT_CONVERSION_ACTIONS = {
  staticToDynamic: 'ConvertStaticTextToDynamicAction',
  dynamicToStatic: 'ConvertDynamicTextToStaticAction',
} as const;

type StaticToDynamicActionArgs = {
  surfaceId: string;
  itemId: string;
  treeJSON: string;
  nodeId: string;
};

type DynamicToStaticActionArgs = {
  surfaceId: string;
  nodeId: string;
  serializedNode: SerializedNode;
  links: SerializedLink[];
  previousTreeJSON: string;
  staticProps: Record<string, unknown>;
};

async function applyStaticToDynamic(args: StaticToDynamicActionArgs) {
  const graph = PPGraph.currentGraph;
  const surface = getSurface(args.surfaceId);
  const originalTree = JSON.parse(args.treeJSON) as SerializedCraftTree;
  const item = originalTree[args.itemId];
  if (!item) {
    throw new Error(`Static text item "${args.itemId}" no longer exists`);
  }
  const socketValues = textPropsToSocketValues(normalizeTextProps(item.props));
  const placementProps = getStaticTextPlacementProps(item.props);

  surface.setSurfaceTree(originalTree);
  const node = await graph.addNewNode(
    TEXT_NODE_TYPE,
    {
      overrideId: args.nodeId,
      nodePosX: surface.x + NODE_OFFSET_X,
      nodePosY: surface.y,
      defaultArguments: socketValues,
    },
    NODE_SOURCE.NEW_DASHBOARD,
  );
  node.deOverlap();

  await graph.linkConnect(
    node.id,
    SOCKET_NAME_DASHBOARD_CONTENT,
    surface.id,
    surface.getSocketForNewConnection(
      node.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT),
    ).name,
    true,
  );
  const tree = surface.getSurfaceTree();
  const insertedId = SurfaceSync.findWidgetItemId(
    tree,
    getElementIdForNode(node.id),
  );
  if (!insertedId) {
    throw new Error('The converted text widget was not added to its surface');
  }
  const widget = tree[insertedId];
  detach(tree, insertedId);
  tree[args.itemId] = {
    ...widget,
    props: { ...widget.props, ...placementProps, id: widget.props.id },
    custom: item.custom,
    parent: item.parent,
    hidden: item.hidden,
  };
  surface.setSurfaceTree(tree);
}

async function undoStaticToDynamic(args: StaticToDynamicActionArgs) {
  const surface = getSurface(args.surfaceId);
  PPGraph.currentGraph.removeNode(PPGraph.currentGraph.nodes[args.nodeId]);
  surface.removedWidgetCache.delete(args.nodeId);
  surface.setSurfaceTree(JSON.parse(args.treeJSON));
}

async function applyDynamicToStatic(args: DynamicToStaticActionArgs) {
  const graph = PPGraph.currentGraph;
  const surface = getSurface(args.surfaceId);
  const before = surface.getSurfaceTree();
  const itemId = SurfaceSync.findWidgetItemId(
    before,
    getElementIdForNode(args.nodeId),
  );
  const item = itemId ? before[itemId] : undefined;
  const parent = item?.parent;
  if (!itemId || !item || !parent || !before[parent]) {
    throw new Error('The dynamic text placement no longer exists');
  }
  const index = before[parent].nodes.indexOf(itemId);

  graph.removeNode(graph.nodes[args.nodeId]);
  surface.removedWidgetCache.delete(args.nodeId);

  const tree = surface.getSurfaceTree();
  tree[itemId] = {
    type: { resolvedName: STATIC_TEXT_ITEM_TYPE },
    displayName: STATIC_TEXT_ITEM_TYPE,
    isCanvas: false,
    props: args.staticProps,
    custom: item.custom,
    hidden: item.hidden,
    parent,
    nodes: [],
    linkedNodes: {},
  };
  tree[parent].nodes.splice(Math.max(index, 0), 0, itemId);
  surface.setSurfaceTree(tree);
}

async function undoDynamicToStatic(args: DynamicToStaticActionArgs) {
  const graph = PPGraph.currentGraph;
  const restored = await graph.addSerializedNode(args.serializedNode, {
    overrideId: args.nodeId,
  });
  args.links.forEach((link) => {
    const source = graph.nodes[link.sourceNodeId].getOutputSocketByName(
      link.sourceSocketName,
    );
    graph.connect(
      source,
      graph.resolveInputSocketForLink(
        graph.nodes[link.targetNodeId],
        link.targetSocketName,
        source,
      ),
      false,
    );
  });
  getSurface(args.surfaceId).setSurfaceTree(JSON.parse(args.previousTreeJSON));
  await restored.executeOptimizedChain();
}

function registerTextConversionActions(): void {
  const handler = SerializableActionHandler.getInstance();
  handler.registerAction(
    TEXT_CONVERSION_ACTIONS.staticToDynamic,
    new SerializableAction(
      applyStaticToDynamic,
      undoStaticToDynamic,
      'Convert to dynamic text',
    ),
  );
  handler.registerAction(
    TEXT_CONVERSION_ACTIONS.dynamicToStatic,
    new SerializableAction(
      applyDynamicToStatic,
      undoDynamicToStatic,
      'Convert to static text',
    ),
  );
}

registerTextConversionActions();

/**
 * @param treeJSON the surface tree as the editor has it right now, which may
 * be ahead of the surface's socket
 */
export function convertStaticTextToDynamic(
  surfaceId: string,
  itemId: string,
  treeJSON: string,
): Promise<boolean> {
  const args: StaticToDynamicActionArgs = {
    surfaceId,
    itemId,
    treeJSON,
    nodeId: hri.random(),
  };
  return PNPAction(TEXT_CONVERSION_ACTIONS.staticToDynamic, args, args);
}

/**
 * Callers check getStaticConversionGuard first; the UI disables otherwise.
 * Takes an id: undo/redo recreate the node, so a held instance can be stale.
 */
export function convertDynamicTextToStatic(nodeId: string): Promise<boolean> {
  const node = PPGraph.currentGraph.nodes[nodeId];
  if (!node) {
    return Promise.reject(new Error(`Text node "${nodeId}" no longer exists`));
  }
  const guard = getStaticConversionGuard(node);
  if (!guard.allowed) {
    return Promise.reject(new Error(guard.reason));
  }
  const surfaceId = guard.surface.id;
  const serializedNode = node.serialize();
  const links = node
    .getAllSockets()
    .flatMap((socket) => socket.links.map((link) => link.serialize()));
  const previousTreeJSON = JSON.stringify(guard.surface.getSurfaceTree());
  const inputs = getTokenInputs(node);
  const textProps = textPropsFromSocketValues(
    PPNode.remapInput(node.inputSocketArray),
  );
  const placement = guard.surface.getSurfaceTree()[guard.itemId];
  const staticProps: Record<string, unknown> = {
    ...getDynamicWidgetPlacementProps(placement.props),
    ...textProps,
    content: bakeMarkdownTokens(textProps.content, (source) =>
      renderTokenSource(source, inputs),
    ),
  };

  const args: DynamicToStaticActionArgs = {
    surfaceId,
    nodeId,
    serializedNode,
    links,
    previousTreeJSON,
    staticProps,
  };
  return PNPAction(TEXT_CONVERSION_ACTIONS.dynamicToStatic, args, args);
}
