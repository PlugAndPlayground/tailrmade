import { hri } from 'human-readable-ids';
import {
  SerializedGraph,
  SerializedLink,
  SerializedNode,
  SerializedSocket,
} from './interfaces';
import {
  containerName,
  dashboardLayoutInputName,
  dashboardVisibilitySocketName,
  DynamicWidgetName,
  isDefaultPageSocketName,
  RootName,
  SOCKET_TYPE,
  surfaceElementLayoutSuffix,
  surfaceElementVisibleSuffix,
  surfaceJsonSocketName,
  surfaceRadioGroupSocketName,
  surfaceRouteSocketName,
} from './constants_shared';
// a standalone, import-free utility (safe under this module's isolation
// discipline - see note below) that fixes up pre-v2 widthMode/heightMode
// widget props; legacy layouts.default trees may still carry that format
import { migrateLegacyWidgetProps } from '../components/dashboard/dashboardMigrations';
// elementIds.ts is deliberately free of pixi.js/graph imports (same isolation
// discipline as this module)
import {
  constructSocketId,
  ELEMENT_ID_SEPARATOR,
  parseLegacyElementId,
} from './elementIds';

export const GRAPH_DATA_VERSION = 4;
const LEGACY_GRAPH_DATA_VERSION = 0.1;

type GraphMigration = {
  fromVersion: number;
  toVersion: number;
  migrate: (graphData: SerializedGraph) => SerializedGraph;
};

function shouldMigrateLegacyLoadBehaviourOnGraphLoad(
  graphVersion: number | undefined,
): boolean {
  if (graphVersion === undefined) {
    return true;
  }

  return graphVersion < GRAPH_DATA_VERSION;
}

// Migrate legacy load behaviour on graph load.
function migrateGraphDataV0_1ToV2(graphData: SerializedGraph): SerializedGraph {
  return {
    ...graphData,
    version: 2,
    nodes: graphData.nodes.map((node) => ({
      ...node,
      updateBehaviour: {
        ...node.updateBehaviour,
        load: Boolean(node.updateBehaviour.load || node.updateBehaviour.update),
      },
    })),
  };
}

// --- v2 -> v3: legacy single-dashboard layout -> a UISurfaceNode ---
// The old dashboard stored its CraftJS tree as a JSON blob in layouts.default,
// disconnected from the node graph. This builds an equivalent UISurfaceNode
// (and the links that feed its widgets) directly as serialized data, so it
// flows through the normal node/link deserialization in GraphClass.configure()
// like any other saved node. RootName/containerName/DynamicWidgetName/
// SOCKET_TYPE/isDefaultPageSocketName above come from constants_shared.ts
// rather than surfaceTree.ts/constants.tsx/dynamicLayout.tsx so this module -
// loaded very early by GraphClass.ts and PPStorage.tsx - stays free of those
// modules' node-class/React/pixi.js/MUI/theme imports.
const SURFACE_NODE_ELEMENT_PREFIX = 'NODE_';
const SURFACE_TREE_VERSION = 1;
const REACT_UI_OUTPUT_SOCKET = 'ReactUI';
const pageNameSocketName = 'Page Name';
// mirrors DashboardContainerName from components/dashboard/DashboardContainer.tsx
// (a React/MUI module) - both DashboardContainerNode and DashboardPageNode
// craft items share this single resolvedName
const DASHBOARD_CONTAINER_ITEM_TYPE = 'DashboardContainer';
// registered node-type keys (see allNodes.ts: key.toLowerCase()) used to tell
// a container/page node apart from a modal (which shares the same craft item
// type above but isn't handled by this migration yet - it keeps today's flat
// linking behaviour until a UIModalSurfaceNode-based migration exists)
const DASHBOARD_CONTAINER_NODE_TYPE = 'dashboardcontainernode';
const DASHBOARD_PAGE_NODE_TYPE = 'dashboardpagenode';

type SurfaceBuildCtx = {
  surfaceId: string;
  socketArray: SerializedSocket[];
  usedSocketNames: Set<string>;
  // one entry per migrated DashboardPageNode that landed directly on this
  // surface, in encounter order - `socket` is the parent's visible-socket for
  // that page's element (used to replicate "only one page in the group
  // visible at a time", see applyDefaultPageVisibility) and
  // `surfaceSocketArray` is the page's own new surface's sockets (used to tag
  // every page at this level with a shared default Radio Group, see
  // applyDefaultRadioGroup)
  pageVisibilitySockets: {
    socket: SerializedSocket;
    isDefault: boolean;
    surfaceSocketArray: SerializedSocket[];
  }[];
};

// where links that pointed at a consumed container/page node's input socket
// should point after migration: the container's Visible socket lives on as
// the parent surface's "<element> visible" socket, its Layout socket as the
// nested surface's own Layout socket. Keyed by nodeId + socketName; links
// into consumed sockets without an entry (e.g. Collapse Mode) have no
// post-migration equivalent and are dropped.
type LinkRetarget = Pick<SerializedLink, 'targetNodeId' | 'targetSocketName'>;

function retargetKey(nodeId: string, socketName: string): string {
  return `${nodeId}\u0000${socketName}`;
}

function dedupeSocketName(ctx: SurfaceBuildCtx, preferred: string): string {
  let name = preferred;
  let i = 2;
  while (ctx.usedSocketNames.has(name)) {
    name = `${preferred} ${i}`;
    i += 1;
  }
  ctx.usedSocketNames.add(name);
  return name;
}

function addElementSocketAndLink(
  ctx: SurfaceBuildCtx,
  links: SerializedLink[],
  sourceNodeId: string,
  preferredName: string,
): SerializedSocket {
  const elementSocketName = dedupeSocketName(ctx, preferredName);
  const visibleSocket: SerializedSocket = {
    socketType: SOCKET_TYPE.IN,
    name: elementSocketName + surfaceElementVisibleSuffix,
    dataType: defaultSerializedType('BooleanType'),
    data: true,
    visible: false,
    dependentSocketName: elementSocketName,
  };
  ctx.socketArray.push(
    {
      socketType: SOCKET_TYPE.IN,
      name: elementSocketName,
      dataType: defaultSerializedType('DeferredReactType'),
      data: { renderFunction: () => null },
      visible: true,
      dependentSocketName: undefined,
    },
    visibleSocket,
    {
      socketType: SOCKET_TYPE.IN,
      name: elementSocketName + surfaceElementLayoutSuffix,
      dataType: defaultSerializedType('WidgetLayoutType'),
      data: SURFACE_DEFAULT_WIDGET_LAYOUT,
      visible: false,
      dependentSocketName: elementSocketName,
    },
  );
  links.push({
    sourceNodeId,
    sourceSocketName: REACT_UI_OUTPUT_SOCKET,
    targetNodeId: ctx.surfaceId,
    targetSocketName: elementSocketName,
  });
  return visibleSocket;
}

// replicates DashboardPageNode's "only one page per group visible at a time"
// for the migrated children of one surface: the page marked "Is Default
// Page" stays visible and every other page sibling is hidden; if none was
// marked default, all of them are hidden (matching the pre-migration
// behaviour of a group with no active page until the user navigates)
function applyDefaultPageVisibility(ctx: SurfaceBuildCtx): void {
  const pages = ctx.pageVisibilitySockets;
  if (pages.length === 0) {
    return;
  }
  const defaultPage = pages.find((page) => page.isDefault);
  pages.forEach((page) => {
    page.socket.data = page === defaultPage;
  });
}

// DashboardPageNode had no real grouping config of its own (its "Page Group"
// socket was unused) - pages sharing an immediate parent were implicitly
// mutually exclusive. Replicate that with the new explicit Radio Group tag:
// when two or more pages land directly on the same surface, give them all
// one freshly generated shared group so post-migration navigation keeps the
// old "only one visible at a time" behaviour without manual setup. A lone
// page needs no group - there is nothing else to be mutually exclusive with.
function applyDefaultRadioGroup(ctx: SurfaceBuildCtx): void {
  const pages = ctx.pageVisibilitySockets;
  if (pages.length < 2) {
    return;
  }
  const radioGroup = hri.random();
  pages.forEach((page) => {
    const radioGroupSocket = page.surfaceSocketArray.find(
      (s) => s.name === surfaceRadioGroupSocketName,
    );
    if (radioGroupSocket) {
      radioGroupSocket.data = radioGroup;
    }
  });
}

function createBaseSurfaceSockets(
  tree: Record<string, any>,
): SerializedSocket[] {
  return [
    {
      socketType: SOCKET_TYPE.IN,
      name: surfaceJsonSocketName,
      dataType: defaultSerializedType('JSONType'),
      data: { version: SURFACE_TREE_VERSION, tree },
      visible: false,
      dependentSocketName: undefined,
    },
    {
      socketType: SOCKET_TYPE.IN,
      name: surfaceRouteSocketName,
      dataType: defaultSerializedType('StringType'),
      data: '',
      visible: false,
      dependentSocketName: undefined,
    },
    {
      socketType: SOCKET_TYPE.IN,
      name: surfaceRadioGroupSocketName,
      dataType: defaultSerializedType('StringType'),
      data: '',
      visible: false,
      dependentSocketName: undefined,
    },
    {
      socketType: SOCKET_TYPE.IN,
      name: dashboardLayoutInputName,
      dataType: defaultSerializedType('WidgetLayoutType'),
      data: SURFACE_DEFAULT_WIDGET_LAYOUT,
      visible: true,
      dependentSocketName: undefined,
    },
  ];
}

// resolves the NODE_<id> element id a craft item's props carry (see
// SURFACE_NODE_ELEMENT_PREFIX above) back to the graph node it references,
// shared by getTransformableContainerInfo and tryAddElementSocketForItem
// below since both start from that same item -> nodeId -> sourceNode lookup
function resolveElementSourceNode(
  item: any,
  nodes: SerializedNode[],
): { nodeId: string; sourceNode: SerializedNode } | undefined {
  const elementId = item?.props?.id;
  if (
    typeof elementId !== 'string' ||
    !elementId.startsWith(SURFACE_NODE_ELEMENT_PREFIX)
  ) {
    return undefined;
  }
  const nodeId = elementId.slice(SURFACE_NODE_ELEMENT_PREFIX.length);
  const sourceNode = nodes.find((n) => n.id === nodeId);
  if (!sourceNode) {
    return undefined;
  }
  return { nodeId, sourceNode };
}

// a DashboardContainer item references a DashboardContainerNode/DashboardPageNode
// (not a ModalDialogNode, which shares the same craft item type but isn't
// transformed by this migration)
function getTransformableContainerInfo(
  item: any,
  nodes: SerializedNode[],
): { nodeId: string; sourceNode: SerializedNode; isPage: boolean } | undefined {
  if (item?.type?.resolvedName !== DASHBOARD_CONTAINER_ITEM_TYPE) {
    return undefined;
  }
  const resolved = resolveElementSourceNode(item, nodes);
  if (!resolved) {
    return undefined;
  }
  const typeKey = String(resolved.sourceNode.type ?? '').toLowerCase();
  if (
    typeKey !== DASHBOARD_CONTAINER_NODE_TYPE &&
    typeKey !== DASHBOARD_PAGE_NODE_TYPE
  ) {
    return undefined;
  }
  return {
    ...resolved,
    isPage: typeKey === DASHBOARD_PAGE_NODE_TYPE,
  };
}

function tryAddElementSocketForItem(
  item: any,
  nodes: SerializedNode[],
  ctx: SurfaceBuildCtx,
  links: SerializedLink[],
): void {
  const resolved = resolveElementSourceNode(item, nodes);
  if (!resolved) {
    return;
  }
  const { nodeId, sourceNode } = resolved;
  addElementSocketAndLink(
    ctx,
    links,
    nodeId,
    sourceNode.name ?? sourceNode.type,
  );
}

// gathers every item reachable from rootKeys via .nodes/.linkedNodes - the
// legacy craft tree is a flat id->item map, so "descendants of a container"
// has to be computed by walking these references rather than JS nesting
function collectDescendantKeys(
  tree: Record<string, any>,
  rootKeys: string[],
): string[] {
  const result: string[] = [];
  const queue: string[] = [...rootKeys];
  while (queue.length > 0) {
    const key = queue.shift()!;
    if (result.includes(key)) continue;
    result.push(key);
    const item = tree[key];
    if (Array.isArray(item?.nodes)) {
      queue.push(...item.nodes);
    }
    if (item?.linkedNodes) {
      queue.push(...(Object.values(item.linkedNodes) as string[]));
    }
  }
  return result;
}

const SURFACE_DEFAULT_WIDGET_LAYOUT = {
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  width: '100%',
  height: 'auto',
  padding: [0, 0, 0, 0],
  minWidth: '80px',
  minHeight: '80px',
  maxWidth: 'unset',
  maxHeight: 'unset',
  gap: 0,
  background: { r: 0, g: 0, b: 0, a: 0 },
  color: { r: 51, g: 51, b: 51, a: 1 },
  mobileBehavior: 'row',
  customStyles: {},
};

// mirrors typehelper.ts's serializeType() output for a freshly constructed,
// unconfigured datatype instance (no custom state -> "type" field is omitted)
function defaultSerializedType(className: string): string {
  return JSON.stringify({ class: className });
}

// Transforms a DashboardContainer item (referencing a DashboardContainerNode
// or DashboardPageNode) into its own nested UISurfaceNode: the item's former
// children move into that surface's own tree (recursively, so containers
// nested inside containers each get their own surface), and - in the tree
// that's currently being built - the item itself is rewritten in place into
// a DynamicWidget element referencing the new surface, wired via an element
// socket on `ctx`'s surface exactly like an ordinary widget connection.
function transformContainerItem(
  tree: Record<string, any>,
  key: string,
  item: any,
  sourceNode: SerializedNode,
  isPage: boolean,
  nodes: SerializedNode[],
  ctx: SurfaceBuildCtx,
  links: SerializedLink[],
  extraSurfaceNodes: SerializedNode[],
  consumedNodeIds: Set<string>,
  linkRetargets: Map<string, LinkRetarget>,
): void {
  const nestedSurfaceId = hri.random();
  const nestedTree: Record<string, any> = {};
  const nestedSocketArray = createBaseSurfaceSockets(nestedTree);
  const nestedCtx: SurfaceBuildCtx = {
    surfaceId: nestedSurfaceId,
    socketArray: nestedSocketArray,
    usedSocketNames: new Set([
      surfaceJsonSocketName,
      surfaceRouteSocketName,
      surfaceRadioGroupSocketName,
      dashboardLayoutInputName,
    ]),
    pageVisibilitySockets: [],
  };

  // carry the container/page's own Layout socket data over to the new
  // surface's equivalent (same name, same WidgetLayoutType) socket
  const layoutSocket = sourceNode.socketArray.find(
    (s) => s.name === dashboardLayoutInputName,
  );
  if (layoutSocket?.data !== undefined) {
    const nestedLayoutSocket = nestedSocketArray.find(
      (s) => s.name === dashboardLayoutInputName,
    );
    if (nestedLayoutSocket) {
      nestedLayoutSocket.data = layoutSocket.data;
    }
  }

  // a DashboardPageNode's navigable identity was its "Page Name" socket
  // (what NavigateToPage matched against), not the node's own top-level
  // name - carry that over so post-migration NavigateToPage/route-slug
  // lookups (which match a UISurfaceNode's name) keep working
  const resolvedSurfaceName = isPage
    ? (sourceNode.socketArray.find((s) => s.name === pageNameSocketName)
        ?.data as string | undefined) || sourceNode.name
    : sourceNode.name;

  const directChildren: string[] = Array.isArray(item.nodes)
    ? [...item.nodes]
    : [];
  const descendantKeys = collectDescendantKeys(tree, directChildren);
  descendantKeys.forEach((childKey) => {
    if (tree[childKey]) {
      nestedTree[childKey] = tree[childKey];
      delete tree[childKey];
    }
  });
  // the direct children's .parent still points at the old container's tree
  // key, which doesn't exist in this new tree - repoint them at this
  // surface's own ROOT, or craft's isLinkedNode() throws on the dangling
  // reference when the surface is entered for editing
  directChildren.forEach((childKey) => {
    if (nestedTree[childKey]) {
      nestedTree[childKey] = { ...nestedTree[childKey], parent: RootName };
    }
  });

  processChildren(
    directChildren,
    nestedTree,
    nodes,
    nestedCtx,
    links,
    extraSurfaceNodes,
    consumedNodeIds,
    linkRetargets,
  );
  // every page that landed directly on this nested surface (i.e. shares this
  // surface as its implicit page group) is now known - reconcile which one,
  // if any, stays visible, and tag them all with a shared default Radio Group
  applyDefaultPageVisibility(nestedCtx);
  applyDefaultRadioGroup(nestedCtx);

  nestedTree[RootName] = {
    type: { resolvedName: containerName },
    // craft always normalizes ROOT's displayName to its resolver name
    // ("Container") on deserialize/serialize, never the literal id - match
    // that here so the migrated tree doesn't permanently diverge from what
    // the editor itself will produce, see surfaceTree.ts's emptyLayout.
    displayName: containerName,
    isCanvas: true,
    custom: {},
    hidden: false,
    props: { ...item.props, id: undefined },
    nodes: directChildren,
    linkedNodes: {},
  };

  extraSurfaceNodes.push({
    type: 'UISurfaceNode',
    id: nestedSurfaceId,
    name: resolvedSurfaceName,
    x: sourceNode.x,
    y: sourceNode.y,
    width: sourceNode.width,
    height: sourceNode.height,
    socketArray: nestedSocketArray,
    updateBehaviour: {
      load: true,
      update: true,
      interval: false,
      intervalFrequency: undefined,
    },
    version: undefined,
  });

  // rewrite the container item in place into a plain element reference, so
  // anything still pointing at this tree key via parent/nodes stays valid
  tree[key] = {
    type: { resolvedName: DynamicWidgetName },
    props: { id: `${SURFACE_NODE_ELEMENT_PREFIX}${nestedSurfaceId}` },
    parent: item.parent,
    nodes: [],
    linkedNodes: {},
  };

  const visibleSocket = addElementSocketAndLink(
    ctx,
    links,
    nestedSurfaceId,
    resolvedSurfaceName ?? sourceNode.type,
  );
  // the container's own Visible socket is gone after migration - carry its
  // static value over to the parent surface's element visible socket, and
  // remember where links into it (e.g. a Switch driving container
  // visibility) must be rewired to
  const visibleData = sourceNode.socketArray.find(
    (s) => s.name === dashboardVisibilitySocketName,
  )?.data;
  if (typeof visibleData === 'boolean') {
    visibleSocket.data = visibleData;
  }
  linkRetargets.set(retargetKey(sourceNode.id, dashboardVisibilitySocketName), {
    targetNodeId: ctx.surfaceId,
    targetSocketName: visibleSocket.name,
  });
  linkRetargets.set(retargetKey(sourceNode.id, dashboardLayoutInputName), {
    targetNodeId: nestedSurfaceId,
    targetSocketName: dashboardLayoutInputName,
  });
  if (isPage) {
    const isDefault =
      sourceNode.socketArray.find((s) => s.name === isDefaultPageSocketName)
        ?.data === true;
    ctx.pageVisibilitySockets.push({
      socket: visibleSocket,
      isDefault,
      surfaceSocketArray: nestedSocketArray,
    });
  }
}

// walks a level of the (mutable) flat craft tree starting at childKeys,
// transforming any DashboardContainer/Page item it finds into its own
// nested surface and wiring every plain widget reference into `ctx`'s surface
function processChildren(
  childKeys: string[],
  tree: Record<string, any>,
  nodes: SerializedNode[],
  ctx: SurfaceBuildCtx,
  links: SerializedLink[],
  extraSurfaceNodes: SerializedNode[],
  consumedNodeIds: Set<string>,
  linkRetargets: Map<string, LinkRetarget>,
): void {
  for (const key of childKeys) {
    const item = tree[key];
    if (!item) continue;

    const containerInfo = getTransformableContainerInfo(item, nodes);
    if (containerInfo) {
      consumedNodeIds.add(containerInfo.nodeId);
      transformContainerItem(
        tree,
        key,
        item,
        containerInfo.sourceNode,
        containerInfo.isPage,
        nodes,
        ctx,
        links,
        extraSurfaceNodes,
        consumedNodeIds,
        linkRetargets,
      );
      continue;
    }

    tryAddElementSocketForItem(item, nodes, ctx, links);
    if (Array.isArray(item.nodes) && item.nodes.length > 0) {
      processChildren(
        item.nodes,
        tree,
        nodes,
        ctx,
        links,
        extraSurfaceNodes,
        consumedNodeIds,
        linkRetargets,
      );
    }
  }
}

function migrateLayoutsToSurfaceNode(
  graphData: SerializedGraph,
): SerializedGraph {
  // older saved graphs carry a legacy layouts.default field that the
  // SerializedGraph type no longer declares - read it loosely here, and
  // strip it (via this destructure) so it never reaches the returned,
  // now layouts-free graph data
  const { layouts: legacyLayouts, ...rest } = graphData as SerializedGraph & {
    layouts?: Record<string, string>;
  };
  const raw = legacyLayouts?.default;
  if (!raw) {
    return { ...rest, version: 3 };
  }

  let tree: Record<string, any>;
  try {
    tree = migrateLegacyWidgetProps(JSON.parse(raw)).layout;
  } catch (error) {
    return { ...rest, version: 3 };
  }
  if (!tree[RootName]) {
    return { ...rest, version: 3 };
  }

  // place the new surface node to the right of everything else
  let maxX = 0;
  let avgY = 0;
  graphData.nodes.forEach((n) => {
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    avgY += n.y;
  });
  if (graphData.nodes.length > 0) {
    avgY /= graphData.nodes.length;
  }

  const surfaceNodeId = hri.random();
  const socketArray = createBaseSurfaceSockets(tree);
  const ctx: SurfaceBuildCtx = {
    surfaceId: surfaceNodeId,
    socketArray,
    usedSocketNames: new Set([
      surfaceJsonSocketName,
      surfaceRouteSocketName,
      surfaceRadioGroupSocketName,
      dashboardLayoutInputName,
    ]),
    pageVisibilitySockets: [],
  };

  const links: SerializedLink[] = [];
  const extraSurfaceNodes: SerializedNode[] = [];
  const consumedNodeIds = new Set<string>();
  const linkRetargets = new Map<string, LinkRetarget>();

  const rootChildren: string[] = Array.isArray(tree[RootName]?.nodes)
    ? [...tree[RootName].nodes]
    : [];
  processChildren(
    rootChildren,
    tree,
    graphData.nodes,
    ctx,
    links,
    extraSurfaceNodes,
    consumedNodeIds,
    linkRetargets,
  );
  applyDefaultPageVisibility(ctx);
  applyDefaultRadioGroup(ctx);

  const surfaceNode: SerializedNode = {
    type: 'UISurfaceNode',
    id: surfaceNodeId,
    name: undefined,
    x: maxX + 200,
    y: avgY,
    width: 400,
    height: 400,
    socketArray,
    updateBehaviour: {
      load: true,
      update: true,
      interval: false,
      intervalFrequency: undefined,
    },
    version: undefined,
  };

  return {
    ...rest,
    version: 3,
    nodes: [
      ...graphData.nodes.filter((n) => !consumedNodeIds.has(n.id)),
      surfaceNode,
      ...extraSurfaceNodes,
    ],
    links: [
      ...graphData.links.flatMap((l) => {
        if (consumedNodeIds.has(l.sourceNodeId)) {
          return [];
        }
        if (!consumedNodeIds.has(l.targetNodeId)) {
          return [l];
        }
        const retarget = linkRetargets.get(
          retargetKey(l.targetNodeId, l.targetSocketName),
        );
        return retarget ? [{ ...l, ...retarget }] : [];
      }),
      ...links,
    ],
    graphSettings: {
      ...graphData.graphSettings,
      defaultUISurfaceNodeId:
        graphData.graphSettings.defaultUISurfaceNodeId ?? surfaceNodeId,
    },
  };
}

// --- v3 -> v4: legacy "-"-separated socket element ids -> "::"-separated ---
// SOCKET_ element ids inside persisted craft trees used "-" as the separator
// with human-readable-id-shaped node ids (the shape made the regex split
// unambiguous). constructSocketId now uses the reserved "::" separator so
// node ids can be arbitrary strings (see elementIds.ts); this rewrites every
// stored tree's socket item props.id via that exact legacy regex. Ids the
// regex rejects never resolved (or rendered) under the old regime either -
// they are left untouched and keep rendering the missing-widget placeholder.
function migrateSocketElementIdsInTree(
  tree: Record<string, any>,
): Record<string, any> {
  const migrated: Record<string, any> = {};
  Object.entries(tree).forEach(([key, item]) => {
    const elementId = item?.props?.id;
    if (
      typeof elementId === 'string' &&
      elementId.startsWith('SOCKET_') &&
      !elementId.includes(ELEMENT_ID_SEPARATOR)
    ) {
      const parsed = parseLegacyElementId(elementId);
      if (parsed?.kind === 'socket') {
        migrated[key] = {
          ...item,
          props: {
            ...item.props,
            id: constructSocketId(
              parsed.nodeId,
              parsed.socketType,
              parsed.socketName,
            ),
          },
        };
        return;
      }
    }
    migrated[key] = item;
  });
  return migrated;
}

function migrateSocketElementIdsV3ToV4(
  graphData: SerializedGraph,
): SerializedGraph {
  return {
    ...graphData,
    version: 4,
    nodes: graphData.nodes.map((node) => {
      const socketArray = node.socketArray.map((socket) => {
        if (socket.name !== surfaceJsonSocketName || socket.data == null) {
          return socket;
        }
        // the Layout JSON socket stores the tree as a {version, tree}
        // envelope, a bare tree object, or a JSON string of either (see
        // coerceSurfaceTree in surfaceSync.ts) - rewrite in place, keeping
        // the encoding, and leave malformed data exactly as it is (the
        // tolerant runtime parser handles it)
        try {
          const wasString = typeof socket.data === 'string';
          const decoded = wasString ? JSON.parse(socket.data) : socket.data;
          const isEnvelope =
            decoded &&
            typeof decoded === 'object' &&
            decoded.tree &&
            typeof decoded.tree === 'object';
          const tree = isEnvelope ? decoded.tree : decoded;
          if (!tree || typeof tree !== 'object') {
            return socket;
          }
          const migratedTree = migrateSocketElementIdsInTree(tree);
          const reEncoded = isEnvelope
            ? { ...decoded, tree: migratedTree }
            : migratedTree;
          return {
            ...socket,
            data: wasString ? JSON.stringify(reEncoded) : reEncoded,
          };
        } catch (error) {
          return socket;
        }
      });
      return { ...node, socketArray };
    }),
  };
}

const GRAPH_MIGRATIONS: GraphMigration[] = [
  {
    fromVersion: LEGACY_GRAPH_DATA_VERSION,
    toVersion: 2,
    migrate: migrateGraphDataV0_1ToV2,
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: migrateLayoutsToSurfaceNode,
  },
  {
    fromVersion: 3,
    toVersion: 4,
    migrate: migrateSocketElementIdsV3ToV4,
  },
];

function getGraphDataVersion(graphData: SerializedGraph): number {
  return graphData.version ?? LEGACY_GRAPH_DATA_VERSION;
}

export function migrateGraphDataOnLoad(
  graphData: SerializedGraph,
): SerializedGraph {
  if (!shouldMigrateLegacyLoadBehaviourOnGraphLoad(graphData.version)) {
    return graphData;
  }

  let migratedGraphData = {
    ...graphData,
    version: getGraphDataVersion(graphData),
  };

  while (true) {
    const currentVersion = getGraphDataVersion(migratedGraphData);
    const nextMigration = GRAPH_MIGRATIONS.find(
      (migration) => migration.fromVersion === currentVersion,
    );

    if (!nextMigration) {
      return migratedGraphData;
    }

    console.log(
      `Migrating graph data from v${nextMigration.fromVersion} to v${nextMigration.toVersion}`,
    );

    migratedGraphData = nextMigration.migrate(migratedGraphData);
  }
}
