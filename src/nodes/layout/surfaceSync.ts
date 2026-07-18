// Headless sync engine between a UI surface node's graph links and the
// craft tree stored in its "Layout JSON" input socket.
//
// Invariant maintained here: every linked element input socket has a
// corresponding NODE_<sourceNodeId> widget in the tree, and every managed
// (DynamicWidget, NODE_-prefixed) widget has a linked element socket.
// SOCKET_… widgets and static widgets are never touched.
//
// IMPORTANT: keep this module free of React component imports (only node
// classes, datatypes and shared constants) to avoid circular dependencies.
import { v4 as uuid } from 'uuid';
import { NodeExecutionError } from '../../classes/ErrorClass';
import type Socket from '../../classes/SocketClass';
import type PPNode from '../../classes/NodeClass';
import { isLayoutableNode, isSurfaceNode } from '../../utils/interfaces';
import type { UISurfaceNode } from './uiSurface';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import type { WidgetLayoutInterface } from '../datatypes/widgetLayoutType';
import { MAIN_COLOR } from '../../utils/constants';
import {
  dashboardLayoutInputName,
  surfaceJsonSocketName,
  surfaceElementVisibleSuffix,
  surfaceElementLayoutSuffix,
  containerName,
  DynamicWidgetName,
  RootName,
} from '../../utils/constants_shared';
import {
  dynamicWidgetDefaultProps,
  emptyLayout,
  rootProps,
  SerializedCraftItem,
  SerializedCraftTree,
} from '../../utils/surfaceTree';

export const SURFACE_TREE_VERSION = 1;
const NODE_ELEMENT_PREFIX = 'NODE_';

export interface SurfaceTreeEnvelope {
  version: number;
  tree: SerializedCraftTree;
}

export interface StashedWidget {
  // when present, the widget is restored as it was; when absent, the stash
  // only pins the insertion position for a freshly created widget
  item?: SerializedCraftItem;
  parentId: string;
  index: number;
}

// the structural subset of UISurfaceNode used here (avoids an import cycle)
export interface SurfaceLikeNode {
  id: string;
  inputSocketArray: Socket[];
  removedWidgetCache: Map<string, StashedWidget>;
  getInputSocketByName(name: string): Socket | undefined;
  getSurfaceTree(): SerializedCraftTree;
  setSurfaceTree(tree: SerializedCraftTree): void;
}

export function getElementIdForNode(nodeId: string): string {
  return `${NODE_ELEMENT_PREFIX}${nodeId}`;
}

export function isElementSocket(socket: Socket): boolean {
  return (
    socket.isInput() &&
    socket.dataType instanceof DeferredReactType &&
    socket.name !== surfaceJsonSocketName
  );
}

export function getElementSockets(surface: SurfaceLikeNode): Socket[] {
  return surface.inputSocketArray.filter(isElementSocket);
}

export function getLinkedSourceNodeIds(surface: SurfaceLikeNode): Set<string> {
  return new Set(
    getElementSockets(surface).flatMap((socket) =>
      socket.links.map((link) => link.getSource().getNode().id),
    ),
  );
}

// surface B is embedded in surface A when A has an element socket linked to
// B's ReactUI output (and B is itself a surface). Returns the child surface
// node objects (resolved via the links, so no global graph lookup is needed —
// keeps this module free of a GraphClass import / circular dependency).
export function getEmbeddedSurfaceNodes(
  surface: SurfaceLikeNode,
): UISurfaceNode[] {
  return getElementSockets(surface)
    .flatMap((socket) => socket.links.map((link) => link.getSource().getNode()))
    .filter(isSurfaceNode);
}

// every (surface, elementSocket) pair, among the given candidate surfaces,
// whose element socket is linked to targetNodeId's ReactUI output - i.e.
// every place targetNodeId is embedded. Candidates are passed in (rather
// than looked up here) so this stays free of a GraphClass import.
export function findEmbeddingsOf(
  candidateSurfaces: SurfaceLikeNode[],
  targetNodeId: string,
): { surface: SurfaceLikeNode; socket: Socket }[] {
  const matches: { surface: SurfaceLikeNode; socket: Socket }[] = [];
  candidateSurfaces.forEach((surface) => {
    getElementSockets(surface).forEach((socket) => {
      if (
        socket.links.some(
          (link) => link.getSource().getNode().id === targetNodeId,
        )
      ) {
        matches.push({ surface, socket });
      }
    });
  });
  return matches;
}

// ids of all surfaces (transitively) embedded inside the given surface
export function getDescendantSurfaceIds(surface: PPNode): Set<string> {
  const descendants = new Set<string>();
  const queue: PPNode[] = [surface];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!current.isSurface()) {
      continue;
    }
    getEmbeddedSurfaceNodes(current as unknown as SurfaceLikeNode).forEach(
      (child) => {
        if (!descendants.has(child.id)) {
          descendants.add(child.id);
          queue.push(child);
        }
      },
    );
  }
  return descendants;
}

// Connecting sourceNode's ReactUI output into targetNode would embed source
// inside target. That creates a loop if they are the same surface, or if
// source already (transitively) contains target.
export function wouldCreateSurfaceEmbeddingLoop(
  sourceNode: PPNode,
  targetNode: PPNode,
): boolean {
  if (!sourceNode.isSurface() || !targetNode.isSurface()) {
    return false;
  }
  if (sourceNode.id === targetNode.id) {
    return true;
  }
  return getDescendantSurfaceIds(sourceNode).has(targetNode.id);
}

// strict parser for the Layout JSON socket value; always returns a clone
export function coerceSurfaceTree(value: any): SerializedCraftTree {
  let candidate = value;
  if (candidate == null) {
    return structuredClone(emptyLayout) as SerializedCraftTree;
  }
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      throw new NodeExecutionError(
        `Layout JSON is not valid JSON: ${(error as Error).message}`,
      );
    }
  }
  if (candidate && typeof candidate === 'object') {
    if (candidate.tree && candidate.tree[RootName]) {
      candidate = candidate.tree;
    }
    if (candidate[RootName]) {
      const tree = structuredClone(candidate) as SerializedCraftTree;
      // self-heal surfaces saved before the ROOT item's displayName/custom
      // were corrected to match what craft's own deserialize/serialize
      // round-trip always normalizes ROOT to - otherwise a stored tree's
      // ROOT item permanently diverges from the editor's serialized tree,
      // making every tree comparison report "changed" forever.
      tree[RootName].displayName = containerName;
      tree[RootName].custom ??= {};
      // self-heal surfaces saved before rootProps included every key in
      // Container.craft.props - any key missing here gets silently filled
      // in by craft's component defaults on deserialize (same divergence).
      tree[RootName].props = { ...rootProps, ...tree[RootName].props };
      return tree;
    }
  }
  throw new NodeExecutionError(
    'Layout JSON has an unexpected shape - expected a serialized craft tree ' +
      `with a "${RootName}" item, or a { version, tree } envelope around one`,
  );
}

// tolerant variant for rendering/inspection paths, where a malformed stored
// layout must not crash the UI - the strict coerceSurfaceTree in the node's
// execute path is what surfaces the error on the node itself
export function coerceSurfaceTreeOrEmpty(value: any): SerializedCraftTree {
  try {
    return coerceSurfaceTree(value);
  } catch (error) {
    console.error(
      'coerceSurfaceTreeOrEmpty: malformed layout, showing empty layout',
      error,
      value,
    );
    return structuredClone(emptyLayout) as SerializedCraftTree;
  }
}

export function wrapSurfaceTree(
  tree: SerializedCraftTree,
): SurfaceTreeEnvelope {
  return { version: SURFACE_TREE_VERSION, tree };
}

export class SurfaceSync {
  static findWidgetItemId(
    tree: SerializedCraftTree,
    elementId: string,
  ): string | undefined {
    return Object.keys(tree).find(
      (itemId) => tree[itemId].props.id === elementId,
    );
  }

  private static isManagedNodeWidget(item: SerializedCraftItem): boolean {
    return (
      item.type.resolvedName === DynamicWidgetName &&
      typeof item.props.id === 'string' &&
      item.props.id.startsWith(NODE_ELEMENT_PREFIX)
    );
  }

  private static insertWidgetForNode(
    surface: SurfaceLikeNode,
    tree: SerializedCraftTree,
    sourceNode: PPNode,
  ): void {
    const elementId = getElementIdForNode(sourceNode.id);
    const stashed = surface.removedWidgetCache.get(sourceNode.id);
    surface.removedWidgetCache.delete(sourceNode.id);

    const itemId = uuid();
    const item: SerializedCraftItem = stashed?.item
      ? { ...structuredClone(stashed.item), nodes: [], linkedNodes: {} }
      : {
          type: { resolvedName: DynamicWidgetName },
          isCanvas: false,
          props: {
            ...dynamicWidgetDefaultProps,
            ...(isLayoutableNode(sourceNode)
              ? sourceNode.getWidgetProps()
              : {}),
            id: elementId,
            index: 0,
            randomMainColor: MAIN_COLOR,
          },
          displayName: DynamicWidgetName,
          custom: {},
          hidden: false,
          nodes: [],
          linkedNodes: {},
        };

    let parentId =
      stashed && tree[stashed.parentId] ? stashed.parentId : RootName;
    if (!tree[parentId]) {
      parentId = RootName;
    }
    const parent = tree[parentId];
    const index = stashed
      ? Math.min(stashed.index, parent.nodes.length)
      : parent.nodes.length;

    item.parent = parentId;
    tree[itemId] = item;
    parent.nodes.splice(index, 0, itemId);
  }

  private static removeWidgetItem(
    surface: SurfaceLikeNode,
    tree: SerializedCraftTree,
    itemId: string,
  ): void {
    const item = tree[itemId];
    if (!item) {
      console.error(
        'removeWidgetItem: item is not in the surface tree',
        itemId,
      );
      return;
    }

    // stash for placement-preserving restore (e.g. undo of a disconnect)
    const parentId = item.parent ?? RootName; // non-root items always have a parent
    const index = tree[parentId].nodes.indexOf(itemId);
    const sourceNodeId = String(item.props.id ?? '').replace(
      NODE_ELEMENT_PREFIX,
      '',
    );
    if (sourceNodeId) {
      surface.removedWidgetCache.set(sourceNodeId, {
        item: structuredClone(item),
        parentId,
        index: Math.max(index, 0),
      });
    }

    // remove the item and all of its descendants
    const removeRecursively = (id: string) => {
      const current = tree[id];
      if (!current) return;
      (current.nodes ?? []).forEach(removeRecursively);
      delete tree[id];
    };
    removeRecursively(itemId);

    const parent = tree[parentId];
    if (parent?.nodes) {
      parent.nodes = parent.nodes.filter((childId) => childId !== itemId);
    }
  }

  /**
   * Idempotent reconciliation of the surface tree against the surface's
   * element-socket links:
   * - inserts a widget for every linked source node that has none
   * - removes managed NODE_ widgets whose source node is no longer linked
   * Called from inputPlugged/inputUnplugged of the surface node; no-ops
   * (does not write the socket) when nothing changed.
   */
  static syncWidgetsToLinks(surface: SurfaceLikeNode): void {
    const tree = surface.getSurfaceTree();
    let changed = false;

    // collect linked source nodes (deduped by node id)
    const linkedNodesById = new Map<string, PPNode>();
    getElementSockets(surface).forEach((socket) => {
      socket.links.forEach((link) => {
        const node = link.getSource().getNode();
        linkedNodesById.set(node.id, node);
      });
    });

    linkedNodesById.forEach((node, nodeId) => {
      if (!SurfaceSync.findWidgetItemId(tree, getElementIdForNode(nodeId))) {
        SurfaceSync.insertWidgetForNode(surface, tree, node);
        changed = true;
      }
    });

    Object.keys(tree).forEach((itemId) => {
      const item = tree[itemId];
      if (!SurfaceSync.isManagedNodeWidget(item)) {
        return;
      }
      const nodeId = item.props.id.replace(NODE_ELEMENT_PREFIX, '');
      if (!linkedNodesById.has(nodeId)) {
        SurfaceSync.removeWidgetItem(surface, tree, itemId);
        changed = true;
      }
    });

    if (changed) {
      surface.setSurfaceTree(tree);
    }
  }

  /**
   * Returns the element sockets whose widget is missing from the given tree
   * (i.e. the widget was deleted in the editor and the link should go too).
   */
  static diffTreeAgainstLinks(
    surface: SurfaceLikeNode,
    newTree: SerializedCraftTree,
  ): Socket[] {
    return getElementSockets(surface).filter((socket) => {
      if (socket.links.length === 0) {
        return false;
      }
      const sourceNodeId = socket.links[0].getSource().getNode().id;
      return (
        SurfaceSync.findWidgetItemId(
          newTree,
          getElementIdForNode(sourceNodeId),
        ) === undefined
      );
    });
  }

  // data of a wired layout socket, or undefined if unwired/malformed
  private static getWiredLayoutData(
    socket: Socket | undefined,
    context: string,
  ): Partial<WidgetLayoutInterface> | undefined {
    if (!socket?.hasLink()) {
      return undefined;
    }
    if (typeof socket.data !== 'object') {
      console.error(
        `applyRuntimeOverrides: ${context} socket data is not an object`,
        socket.data,
      );
      return undefined;
    }
    return socket.data as Partial<WidgetLayoutInterface>;
  }

  /**
   * Merges wired per-element "<name> visible"/"<name> layout" socket values
   * and (when wired) the surface's own root Layout socket over the
   * craft-stored props. Mutates and returns the given tree (callers pass a
   * clone from getSurfaceTree/coerceSurfaceTree).
   */
  static applyRuntimeOverrides(
    surface: SurfaceLikeNode,
    tree: SerializedCraftTree,
  ): SerializedCraftTree {
    getElementSockets(surface).forEach((socket) => {
      if (socket.links.length === 0) {
        return;
      }
      const sourceNodeId = socket.links[0].getSource().getNode().id;
      const itemId = SurfaceSync.findWidgetItemId(
        tree,
        getElementIdForNode(sourceNodeId),
      );
      if (!itemId) {
        console.warn(
          'applyRuntimeOverrides: linked socket has no widget in tree',
          socket.name,
          sourceNodeId,
        );
        return;
      }

      // the "visible" socket is the source of truth for the element's
      // visibility whether it is wired or just set in the inspector (a wired
      // boolean simply drives the same value)
      const visibleSocket = surface.getInputSocketByName(
        socket.name + surfaceElementVisibleSuffix,
      );
      if (visibleSocket) {
        tree[itemId].hidden = !visibleSocket.data;
      }

      const layoutSocket = surface.getInputSocketByName(
        socket.name + surfaceElementLayoutSuffix,
      );
      const elementLayout = SurfaceSync.getWiredLayoutData(
        layoutSocket,
        'layout',
      );
      if (elementLayout) {
        tree[itemId].props = { ...tree[itemId].props, ...elementLayout };
      }
    });

    // wired root Layout socket overrides the ROOT container props
    const rootLayoutSocket = surface.getInputSocketByName(
      dashboardLayoutInputName,
    );
    const rootLayout = SurfaceSync.getWiredLayoutData(
      rootLayoutSocket,
      'root layout',
    );
    if (rootLayout) {
      if (!tree[RootName]) {
        console.error('applyRuntimeOverrides: ROOT missing from tree');
      } else {
        const rootKeys: (keyof WidgetLayoutInterface)[] = [
          'flexDirection',
          'alignItems',
          'justifyContent',
          'gap',
          'padding',
          'background',
          'color',
        ];
        rootKeys.forEach((key) => {
          if (rootLayout[key] !== undefined) {
            tree[RootName].props[key] = rootLayout[key];
          }
        });
      }
    }

    return tree;
  }
}
