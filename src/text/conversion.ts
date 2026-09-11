// Static Text item <-> dynamic Text node, each as one undo entry. The surface
// tree item keeps its key, parent and index, so it stays the same element.
import { hri } from 'human-readable-ids';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
} from '../classes/Action';
import type { UISurfaceNode } from '../nodes/layout/uiSurface';
import {
  findEmbeddingsOf,
  getElementIdForNode,
  SurfaceSync,
} from '../nodes/layout/surfaceSync';
import { NODE_SOURCE } from '../utils/constants';
import { isSurfaceNode } from '../utils/interfaces';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../utils/layoutableHelpers';
import type {
  SerializedCraftItem,
  SerializedCraftTree,
} from '../utils/surfaceTree';
import { textContentToMarkdown } from './inlineMarkdown';
import { markdownToTextContent } from './lexical/markdown';
import { bakeTokens, normalizeTextProps } from './model';
import { getTokenInputs } from './nodeInputs';
import {
  TEXT_NODE_TYPE,
  textPropsFromSocketValues,
  textPropsToSocketValues,
} from './nodeSockets';
import { STATIC_TEXT_ITEM_TYPE } from './migrations';
import { renderTokenSource } from './tokens';

// new nodes go left of the surface they feed
const NODE_OFFSET_X = -360;

export type StaticConversionGuard =
  | { allowed: true; surface: UISurfaceNode }
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
  return { allowed: true, surface: placements[0].surface as UISurfaceNode };
}

function getSurface(surfaceId: string): UISurfaceNode {
  return PPGraph.currentGraph.nodes[surfaceId] as UISurfaceNode;
}

function detach(tree: SerializedCraftTree, itemId: string): void {
  const parent = tree[tree[itemId].parent!];
  parent.nodes = parent.nodes.filter((id) => id !== itemId);
  delete tree[itemId];
}

/**
 * @param treeJSON the surface tree as the editor has it right now, which may
 * be ahead of the surface's socket
 */
export function convertStaticTextToDynamic(
  surfaceId: string,
  itemId: string,
  treeJSON: string,
): Promise<void> {
  const nodeId = hri.random();
  const item: SerializedCraftItem = JSON.parse(treeJSON)[itemId];
  const socketValues = textPropsToSocketValues(normalizeTextProps(item.props));

  const action = async () => {
    const graph = PPGraph.currentGraph;
    const surface = getSurface(surfaceId);
    surface.setSurfaceTree(JSON.parse(treeJSON));
    const node = await graph.addNewNode(
      TEXT_NODE_TYPE,
      {
        overrideId: nodeId,
        nodePosX: surface.x + NODE_OFFSET_X,
        nodePosY: surface.y,
        defaultArguments: socketValues,
      },
      NODE_SOURCE.NEW_DASHBOARD,
    );
    node.deOverlap();

    // connecting inserts the widget; it then takes the static item's place
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
    )!;
    const widget = tree[insertedId];
    detach(tree, insertedId);
    tree[itemId] = { ...widget, parent: item.parent, hidden: item.hidden };
    surface.setSurfaceTree(tree);
  };

  const undoAction = () => {
    const surface = getSurface(surfaceId);
    // removing the node unlinks it, which also drops its widget
    PPGraph.currentGraph.removeNode(PPGraph.currentGraph.nodes[nodeId]);
    surface.removedWidgetCache.delete(nodeId);
    surface.setSurfaceTree(JSON.parse(treeJSON));
    return Promise.resolve();
  };

  return ActionHandler.performRawAction(
    new BakedAction(
      new SerializableAction(action, undoAction, 'Convert to dynamic text'),
    ),
  );
}

/**
 * Callers check getStaticConversionGuard first; the UI disables otherwise.
 * Takes an id: undo/redo recreate the node, so a held instance can be stale.
 */
export function convertDynamicTextToStatic(nodeId: string): Promise<void> {
  const node = PPGraph.currentGraph.nodes[nodeId];
  const guard = getStaticConversionGuard(node) as {
    surface: UISurfaceNode;
  };
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
  const staticProps = {
    ...textProps,
    content: textContentToMarkdown(
      bakeTokens(markdownToTextContent(textProps.content, true), (source) =>
        renderTokenSource(source, inputs),
      ),
    ),
  };

  const action = () => {
    const graph = PPGraph.currentGraph;
    const surface = getSurface(surfaceId);
    const before = surface.getSurfaceTree();
    const itemId = SurfaceSync.findWidgetItemId(
      before,
      getElementIdForNode(nodeId),
    )!;
    const { parent, hidden } = before[itemId];
    const index = before[parent!].nodes.indexOf(itemId);

    graph.removeNode(graph.nodes[nodeId]);
    surface.removedWidgetCache.delete(nodeId);

    const tree = surface.getSurfaceTree();
    tree[itemId] = {
      type: { resolvedName: STATIC_TEXT_ITEM_TYPE },
      displayName: STATIC_TEXT_ITEM_TYPE,
      isCanvas: false,
      props: staticProps,
      custom: {},
      hidden,
      parent,
      nodes: [],
      linkedNodes: {},
    };
    tree[parent!].nodes.splice(index, 0, itemId);
    surface.setSurfaceTree(tree);
    return Promise.resolve();
  };

  const undoAction = async () => {
    const graph = PPGraph.currentGraph;
    const restored = await graph.addSerializedNode(serializedNode, {
      overrideId: nodeId,
    });
    // links first: the restored tree's widget must find its link in place
    links.forEach((link) => {
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
    getSurface(surfaceId).setSurfaceTree(JSON.parse(previousTreeJSON));
    await restored.executeOptimizedChain();
  };

  return ActionHandler.performRawAction(
    new BakedAction(
      new SerializableAction(action, undoAction, 'Convert to static text'),
    ),
  );
}
