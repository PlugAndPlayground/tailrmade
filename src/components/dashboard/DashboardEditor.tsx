import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TRgba } from '../../utils/color';
import { v4 as uuid } from 'uuid';
import { Box, Typography } from '@mui/material';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import EditIcon from '@mui/icons-material/Edit';
import { Frame, Element, useEditor } from '@craftjs/core';
import { AppThemeProvider } from './AppThemeProvider';
import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { RootName, VISIBILITY_ACTION } from '../../utils/constants_shared';
import {
  IOverlay,
  isLayoutableNode,
  isSurfaceNode,
  Layoutable,
} from '../../utils/interfaces';
import {
  getLayoutableElement,
  getNodeIdFromElementId,
  perform_action_connectNodeToSocket,
} from '../../utils/utils';
import { draggedWidgetType, Toolbox } from './Toolbox';
import { Container } from './Container';
import { DynamicWidget } from './DynamicWidget';
import { DashboardContainer } from './DashboardContainer';
import {
  isLinkedToNode,
  scrollWidgetIntoView,
  SOCKET_NAME_DASHBOARD_CONTENT,
} from '../../utils/layoutableHelpers';
import { LoadingState } from '../Loading';
import { PlaceholderWidget, PlaceholderWidgetName } from './PlaceholderWidget';
import '../../utils/style.module.css';
import { getDashboardBackground, NODE_SOURCE } from '../../utils/constants';
import {
  emptyLayout,
  rootProps,
  canonicalTreeString,
} from '../../utils/surfaceTree';
import {
  resetSurfaceEditSession,
  surfaceEditSession,
} from './surfaceEditSession';
import { normalizeTreeString } from './surfaceTreeNormalization';
import {
  getLinkedSourceNodeIds,
  SurfaceSync,
} from '../../nodes/layout/surfaceSync';
import type { UISurfaceNode } from '../../nodes/layout/uiSurface';
import { useDevicePreviewWidth, useDisplayedSurfaceLocked } from './hooks';
import { useIsStackLayout } from '../../utils/layoutModel';
import { setSurfaceStack } from './viewState';
import { MAIN_COLOR } from '../../utils/constants';

// example structure of a dashboard item
// {
//   "id": "709e1447-2b6e-4a86-81cf-42f080989dce", // unique id of the dashboard item
//   "_hydrationTimestamp": 1757146319908,
//   "data": {
//     "name": "DynamicWidget", // Widget type
//     "displayName": "DynamicWidget", // Widget name
//     "props": {
//         "flexDirection": "column",
//         "alignItems": "stretch",
//         "justifyContent": "flex-start",
//         "padding": [
//             0,
//             0,
//             0,
//             0
//         ],
//         "background": {
//             "r": 9,
//             "g": 13,
//             "b": 26,
//             "a": 0
//         },
//         "color": {
//             "r": 255,
//             "g": 255,
//             "b": 255,
//             "a": 1
//         },
//         "width": "100%",
//         "height": "80px",
//         "minWidth": "48px",
//         "minHeight": "48px",
//         "showLabel": false,
//         "id": "NODE_serious-frog-61", // elementId (NODE | SOCKET + nodeId) of the layoutable element
//         "index": 0,
//     },
//     "parent": "ROOT", // parent of the widget
//     "isCanvas": false, // whether the widget can nest other widgets
//     "hidden": false,
//     "nodes": [],
//     "linkedNodes": {}
//     },
//   "info": {},
//   "related": {},
//   "events": {
//       "selected": false,
//       "dragged": false,
//       "hovered": false
//   },
//   "rules": {},
//   "dom": null
// }

// craft's selectNode throws if the id was removed (e.g. a deserialize
// replaced the whole tree while a surface auto-creates/loads). Guard any
// async or post-mutation selection against that race.
function safeSelectNode(actions: any, query: any, id: string | null) {
  try {
    if (id === null || query.node(id).get()) {
      actions.selectNode(id);
    }
  } catch (error) {
    // editor is transitioning; selection settles on the next render
    console.log('safeSelectNode: skipped selection for id', id, error);
  }
}

// A container (or page) becomes a canvas DashboardContainer, everything else a
// DynamicWidget - either way carrying the dashboard item's id.
function buildWidgetNodeTree(
  query,
  item: Layoutable,
  itemId: string,
  dashboardItemId: string,
) {
  const element = item.isContainer() ? (
    <Element
      canvas
      is={DashboardContainer}
      id={itemId}
      index={0}
      {...item.getWidgetProps()}
    />
  ) : (
    <DynamicWidget id={itemId} index={0} {...item.getWidgetProps()} />
  );
  return query.parseReactElement(element).toNodeTree((node) => {
    node.id = dashboardItemId;
  });
}

function replacePlaceholderWithActualWidget(
  dashboardItem,
  dashboardItemId: string,
  nodeId: string,
  query,
  actions,
) {
  const linkedNode = PPGraph.currentGraph.nodes[nodeId];
  if (!linkedNode || !isLayoutableNode(linkedNode)) {
    console.error(
      'replacePlaceholderWithActualWidget: node is missing or not layoutable',
      nodeId,
    );
    return;
  }

  // Add actual widget
  const itemId = linkedNode.getDashboardId();
  const nodeToAdd = buildWidgetNodeTree(
    query,
    linkedNode,
    itemId,
    dashboardItemId,
  );

  // Insert at same position as placeholder
  const parent = dashboardItem.data.parent;
  const siblings = query.node(parent).childNodes();
  const index = siblings.indexOf(dashboardItemId);

  // Remove placeholder then add the real widget back at the same index with the same id
  actions.delete(dashboardItemId);
  actions.addNodeTree(nodeToAdd, parent, index);
  safeSelectNode(actions, query, dashboardItemId);
  scrollWidgetIntoView(dashboardItemId, query, 150);
}
function convertWidgetToPlaceholder(
  dashboardItem,
  dashboardItemId: string,
  query,
  actions,
) {
  // Node is missing, convert to placeholder
  console.log(
    'Node missing, converting to placeholder',
    dashboardItem.data.props.id,
  );

  // Get widget name from the widget for the placeholder
  const widgetName = dashboardItem.data.displayName || 'Widget';

  // Create placeholder
  const placeholderNode = query
    .parseReactElement(
      <Element
        is={PlaceholderWidget}
        text={`Missing ${widgetName}...`}
        background={TRgba.fromString(MAIN_COLOR)
          .darken(0.6)
          .setAlpha(0.2)
          .toString()}
        id={dashboardItem.data.props.id}
      />,
    )
    .toNodeTree((node) => {
      // Keep the Craft node id stable (do NOT replace with the NODE_id)
      node.id = dashboardItemId;
    });

  // Insert at same position
  const parent = dashboardItem.data.parent;
  const siblings = query.node(parent).childNodes();
  const index = siblings.indexOf(dashboardItemId);

  // Remove widget then add placeholder at the same index using the same id
  actions.delete(dashboardItemId);

  // Add placeholder
  actions.addNodeTree(placeholderNode, parent, index);
}

export const getWidgetPlacement = ({ query, nest }) => {
  const selected = query.getState().events.selected;
  let selectedNodeId = Array.from(selected)[0] as string;

  // If no node is selected, default to ROOT
  if (!selectedNodeId) {
    selectedNodeId = RootName;
  }

  // Place any widget when ROOT is selected as the last element in ROOT
  if (selectedNodeId === RootName) {
    const rootChildren = query.node(selectedNodeId).childNodes();
    return {
      parentId: selectedNodeId,
      insertIndex: rootChildren.length,
    };
  }

  const selectedNode = query.node(selectedNodeId).get();
  const isContainer = (node) =>
    node.data.displayName === Container.craft.displayName ||
    node.data.displayName === DashboardContainer.craft.displayName;
  const selectedIsContainer = isContainer(selectedNode);

  // Place widgets with nest = true when a container is selected as the last element in the container
  if (nest && selectedIsContainer) {
    const containerChildren = query.node(selectedNodeId).childNodes();
    return {
      parentId: selectedNodeId,
      insertIndex: containerChildren.length,
    };
  } else {
    // Find the closest parent container and place it next to it
    let currentNode = selectedNode;
    let parentNode = query.node(currentNode.data.parent).get();

    while (
      parentNode &&
      !isContainer(parentNode) &&
      parentNode.id !== RootName
    ) {
      currentNode = parentNode;
      parentNode = query.node(currentNode.data.parent).get();
    }

    const parentId = parentNode.id;
    const siblings = query.node(parentId).childNodes();
    const currentIndex = siblings.indexOf(selectedNodeId);

    return {
      parentId,
      insertIndex: currentIndex + 1,
    };
  }
};

export function addNodeWithPlacement(
  query,
  nest: boolean,
  actions,
  nodeToAdd,
  dashboardItemId: any,
) {
  const selectedNodeId = query.getEvent('selected').last();
  const { parentId, insertIndex } = getWidgetPlacement({
    query,
    nest,
  });
  InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.OPEN);
  // Add the new element
  actions.addNodeTree(nodeToAdd, parentId, insertIndex);
  // If a non-container element is selected and we're adding a container
  // move it inside the container
  if (selectedNodeId && !nest) {
    const selectedNode = query.node(selectedNodeId).get();
    const newNode = query.node(dashboardItemId).get();

    if (newNode.data.isCanvas && selectedNode.data.type !== Container) {
      // Only try to nest if the new node is a container that can accept children
      actions.move(selectedNodeId, dashboardItemId, 0);
    }
  }
  requestAnimationFrame(() => {
    // Ensure DOM is ready
    safeSelectNode(actions, query, dashboardItemId);
    scrollWidgetIntoView(dashboardItemId, query, 150);
  });
}

// breadcrumb of dived-into surfaces; first entry is the top-level selected
// surface, last entry is always the currently displayed one. 'dive' pushes
// onto the existing path, 'crumb' truncates back to a clicked ancestor,
// anything else ('select', a fresh InterfaceController.showSurface call,
// etc.) starts a new path at the given surface.
function nextSurfaceBreadcrumb(
  prev: string[],
  nodeId: string | null,
  source?: string,
): string[] {
  if (!nodeId) {
    return [];
  }
  if (source === 'dive') {
    return [...prev, nodeId];
  }
  if (source === 'crumb') {
    const index = prev.indexOf(nodeId);
    return index >= 0 ? prev.slice(0, index + 1) : [nodeId];
  }
  return [nodeId];
}

interface DashboardEditorProps {
  isVisible: boolean;
  isEditMode: boolean;
  appView: boolean;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
}

export const DashboardEditor: React.FC<DashboardEditorProps> = ({
  isVisible,
  isEditMode,
  appView,
  overlayState,
  updateOverlayState,
}) => {
  const { actions, query, rootLength } = useEditor((state) => {
    const rootNode = state.nodes[RootName];
    return { rootLength: rootNode?.data.nodes.length };
  });

  const [isEmpty, setIsEmpty] = React.useState(true);
  const [isGraphLoading, setIsGraphLoading] = React.useState(true);
  const [isDashboardLocked, setIsDashboardLocked] = useState(
    overlayState.dashboard.locked,
  );
  const autoCreatedSurfaceRef = useRef(false);
  const isSurfaceLocked = useDisplayedSurfaceLocked();
  const devicePreviewWidth = useDevicePreviewWidth();
  const isDevicePreview = devicePreviewWidth !== null;
  const isEditModeRef = useRef(isEditMode);
  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  const getDisplayTreeString = useCallback((surface: UISurfaceNode): string => {
    const rawTree = surface.getSurfaceTree();
    const tree = isEditModeRef.current
      ? rawTree
      : SurfaceSync.applyRuntimeOverrides(surface, rawTree);
    return canonicalTreeString(tree);
  }, []);

  // true when this tree differs from the one currently loaded in the craft editor
  // guards deserializeTree so an unchanged layout doesn't remount every widget
  const hasLayoutChanged = useCallback(
    (treeString: string): boolean =>
      normalizeTreeString(query, treeString) !==
      surfaceEditSession.lastSyncedTreeString,
    [query],
  );

  const deserializeTree = useCallback(
    (treeString: string) => {
      // the deserialize replaces every craft node, so a selection referencing
      // a now-removed id must be cleared - but if the selected id is still
      // present in the incoming tree (e.g. a disconnect-driven re-sync right
      // after deleting an unrelated sibling widget), clearing it would discard
      // selection state the user never actually changed
      const previouslySelected = Array.from(query.getEvent('selected').all());
      const selectedId =
        previouslySelected.length === 1
          ? (previouslySelected[0] as string)
          : null;
      let stillExists = false;
      if (selectedId) {
        try {
          stillExists = selectedId in JSON.parse(treeString);
        } catch {
          stillExists = false;
        }
      }
      if (!stillExists) {
        safeSelectNode(actions, query, null);
      }
      actions.history.ignore().deserialize(treeString);
      if (stillExists) {
        safeSelectNode(actions, query, selectedId);
      }
      // store craft's own normalization (key-order canonicalized, see
      // canonicalTreeString) as echo guard for the save handler
      surfaceEditSession.lastSyncedTreeString = canonicalTreeString(
        JSON.parse(query.serialize()),
      );

      // After deserializing, get all nodes and notify for each one
      const nodes = query.getNodes();
      Object.entries(nodes).forEach(([dashboardItemId, node]) => {
        // Skip the ROOT node
        if (dashboardItemId === RootName) return;

        // Only notify items that come from the canvas
        if (isLinkedToNode(nodes, node.id)) {
          InterfaceController.notifyListeners(ListenEvent.DashboardItemAdded, {
            dashboardId: node.data.props.id,
          });
        }
      });
    },
    [query],
  );

  const getDisplayedSurface = useCallback((): UISurfaceNode | undefined => {
    const surfaceId = InterfaceController.displayedSurfaceNodeId;
    const node = surfaceId
      ? PPGraph.currentGraph.getNodeById(surfaceId)
      : undefined;
    return node && isSurfaceNode(node) ? node : undefined;
  }, []);

  // creates a UI surface node and makes it the app-load default and the
  // displayed/edited surface. showSurface() synchronously notifies this
  // component's own DisplayedSurfaceChanged listener, which loads the new
  // (empty) surface's tree into the editor before this returns.
  const createDefaultSurface = useCallback(async (): Promise<UISurfaceNode> => {
    autoCreatedSurfaceRef.current = true;
    const center = PPGraph.currentGraph.viewport?.center;
    const added = (await PPGraph.currentGraph.addNewNode(
      'UISurfaceNode',
      { nodePosX: center?.x ?? 0, nodePosY: center?.y ?? 0 },
      NODE_SOURCE.NEW_DASHBOARD,
    )) as UISurfaceNode;
    if (!added) {
      throw new Error('Failed to create default UI surface node');
    }
    added.deOverlap(new PIXI.Point(200, 0));
    PPGraph.currentGraph.defaultUISurfaceNodeId = added.id;
    InterfaceController.showSurface(added.id);
    return added;
  }, []);

  // Flush the live craft-editor tree into the surface's socket and update the
  // save-echo guard (canonicalTreeString) in one step. Callers do this before
  // triggering a connect-driven sync (or right after a tree mutation) so the
  // sync engine and the debounced editor->socket save build on the current
  // editor state instead of racing a stale tree.
  const flushEditorTreeToSurface = useCallback(
    (surface: UISurfaceNode) => {
      const liveTreeString = query.serialize();
      surfaceEditSession.lastSyncedTreeString = canonicalTreeString(
        JSON.parse(liveTreeString),
      );
      surface.setSurfaceTree(JSON.parse(liveTreeString));
    },
    [query],
  );

  // there is no surface to display yet (a freshly loaded/empty graph) - the
  // auto-create effect below creates one shortly after this runs
  const loadEmptyLayout = useCallback(() => {
    resetSurfaceEditSession();
    deserializeTree(JSON.stringify(emptyLayout));
  }, [deserializeTree]);

  // load a UI surface node's layout into the editor, or an empty layout
  // when nodeId is null / not a surface
  const loadSurface = useCallback(
    (nodeId: string | null) => {
      const surface = nodeId ? PPGraph.currentGraph.getNodeById(nodeId) : null;
      if (surface && isSurfaceNode(surface)) {
        resetSurfaceEditSession();
        try {
          deserializeTree(getDisplayTreeString(surface));
          return;
        } catch (error) {
          console.error('Failed to load UI surface layout', error);
        }
      }
      loadEmptyLayout();
    },
    [deserializeTree, loadEmptyLayout, getDisplayTreeString],
  );

  // on graph load: show the default surface, else the first surface,
  // else show an empty layout
  const resolveInitialSurface = useCallback(() => {
    // a freshly loaded graph may auto-create its surface again
    autoCreatedSurfaceRef.current = false;
    const surfaces = Object.values(PPGraph.currentGraph.nodes).filter(
      isSurfaceNode,
    );
    const defaultId = PPGraph.currentGraph.defaultUISurfaceNodeId;
    const initial =
      surfaces.find((node) => node.id === defaultId) ?? surfaces[0];

    // force showSurface to notify even if `initial` is the surface that was
    // already displayed before this graph (re)load
    InterfaceController.displayedSurfaceNodeId = null;
    if (initial) {
      InterfaceController.showSurface(initial.id);
    } else {
      setSurfaceStack([]);
      loadEmptyLayout();
    }
  }, [loadEmptyLayout]);

  useEffect(() => {
    const listenIds = [
      InterfaceController.addListener(ListenEvent.GraphConfigured, () => {
        setIsGraphLoading(false);
        resolveInitialSurface();
      }),
      InterfaceController.addListener(
        ListenEvent.DisplayedSurfaceChanged,
        ({ nodeId, source }: { nodeId: string | null; source?: string }) => {
          setSurfaceStack((prev) =>
            nextSurfaceBreadcrumb(prev, nodeId, source),
          );
          loadSurface(nodeId);
        },
      ),
      InterfaceController.addListener(
        ListenEvent.SurfaceLayoutChanged,
        ({ nodeId }: { nodeId: string }) => {
          if (nodeId !== InterfaceController.displayedSurfaceNodeId) {
            return;
          }
          const surface = getDisplayedSurface();
          if (!surface) {
            return;
          }
          const treeString = getDisplayTreeString(surface);
          // when the edit was made in the editor itself, this event is just
          // its own save echoing back - nothing to reload then
          if (hasLayoutChanged(treeString)) {
            deserializeTree(treeString);
          }
        },
      ),
      // in view/app mode, re-apply runtime overrides (visible/layout) when the
      // displayed surface's override sockets change
      InterfaceController.addListener(
        ListenEvent.SurfaceRuntimeChanged,
        ({ nodeId }: { nodeId: string }) => {
          if (
            isEditModeRef.current ||
            nodeId !== InterfaceController.displayedSurfaceNodeId
          ) {
            return;
          }
          const surface = getDisplayedSurface();
          if (!surface) {
            return;
          }
          const treeString = getDisplayTreeString(surface);
          if (hasLayoutChanged(treeString)) {
            deserializeTree(treeString);
          }
        },
      ),
    ];

    return () => {
      listenIds.forEach((id) => InterfaceController.removeListener(id));
    };
  }, [
    resolveInitialSurface,
    loadSurface,
    deserializeTree,
    getDisplayedSurface,
    getDisplayTreeString,
    hasLayoutChanged,
  ]);

  // toggling edit/view mode flips between the raw tree and the
  // runtime-overridden tree, so reload the displayed surface
  useEffect(() => {
    const surface = getDisplayedSurface();
    if (surface) {
      loadSurface(surface.id);
    }
  }, [isEditMode, getDisplayedSurface, loadSurface]);

  // Initial load
  useEffect(() => {
    resolveInitialSurface();
  }, [resolveInitialSurface]);

  // Poll if dashboard items still exist
  const pollDashboardItems = useCallback(() => {
    const DASHBOARD_ITEMS = query.getNodes();
    const displayedSurface = getDisplayedSurface();

    Object.entries(DASHBOARD_ITEMS).forEach(
      ([dashboardItemId, dashboardItem]) => {
        const isRoot = dashboardItemId === RootName;
        if (isRoot) return; // ignore ROOT

        // Case 1: Check for placeholder widgets
        const isPlaceholder = dashboardItem.data.name === PlaceholderWidgetName;

        if (isPlaceholder) {
          const nodeId = getNodeIdFromElementId(dashboardItem.data.props.id);

          if (nodeId && PPGraph.currentGraph.nodes[nodeId]) {
            if (displayedSurface && !displayedSurface.isLayoutLocked()) {
              // surface mode: replace the placeholder with a connection —
              // stash its position so the synced widget lands there
              const parentId = dashboardItem.data.parent ?? RootName;
              const siblings = query.node(parentId).childNodes();
              displayedSurface.removedWidgetCache.set(nodeId, {
                parentId,
                index: Math.max(siblings.indexOf(dashboardItemId), 0),
              });
              actions.delete(dashboardItemId);
              flushEditorTreeToSurface(displayedSurface);
              const sourceNode = PPGraph.currentGraph.nodes[nodeId];
              void perform_action_connectNodeToSocket(
                sourceNode.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT),
                displayedSurface,
              );
            } else {
              replacePlaceholderWithActualWidget(
                dashboardItem,
                dashboardItemId,
                nodeId,
                query,
                actions,
              );
            }
          }
          // If node doesn't exist yet, keep the placeholder
        }
        // Case 2: Regular widget - check if node is missing and convert to placeholder if needed
        else if (isLinkedToNode(DASHBOARD_ITEMS, dashboardItemId)) {
          const elementId = dashboardItem.data.props.id;
          // surface mode: NODE_ widgets are managed by the link sync — the
          // widget is removed together with the link when the node goes away
          if (displayedSurface && elementId?.startsWith('NODE_')) {
            return;
          }
          const layoutableElement = getLayoutableElement(elementId);

          if (!layoutableElement) {
            convertWidgetToPlaceholder(
              dashboardItem,
              dashboardItemId,
              query,
              actions,
            );
          }
        }
      },
    );
  }, [query, actions, getDisplayedSurface, flushEditorTreeToSurface]);

  useEffect(() => {
    const pollInterval = setInterval(pollDashboardItems, 1000);
    return () => clearInterval(pollInterval);
  }, [pollDashboardItems]);

  // Check if graph is configured and ready
  useEffect(() => {
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      setIsGraphLoading(false);
    } else {
      setIsGraphLoading(true);
    }
  }, [PPGraph.currentGraph.graphConfiguredAndReady]);

  const addToDashboard = useCallback(
    async (itemToAdd: Layoutable) => {
      const itemId = itemToAdd.getDashboardId();

      // nothing to add it to yet - create a surface first so the widget
      // (or, for a non-NODE_ item below, the craft-tree edit itself) lands
      // somewhere that actually gets persisted, instead of an orphaned tree
      let displayedSurface = getDisplayedSurface();
      if (!displayedSurface) {
        displayedSurface = await createDefaultSurface();
      }

      // in surface mode, node widgets are added by connecting their ReactUI
      // output to the surface — the link is the source of truth, the sync
      // engine inserts the widget into the surface's tree
      if (itemId.startsWith('NODE_')) {
        if (displayedSurface.isLayoutLocked()) {
          InterfaceController.showSnackBar(
            'This UI is controlled by the graph (Layout JSON is wired) and cannot be edited',
          );
          return;
        }
        const relatedNode = itemToAdd.getRelatedNode();
        if (relatedNode.id === displayedSurface.id) {
          InterfaceController.showSnackBar("Can't add a UI surface to itself");
          return;
        }
        // already wired into this surface - the widget-sync layer dedupes by
        // source node id (only one widget is ever shown per source), so
        // connecting again would just add an inert extra socket/link; show
        // the existing widget instead (use a nested surface for a second
        // visible instance of the same node)
        if (getLinkedSourceNodeIds(displayedSurface).has(relatedNode.id)) {
          InterfaceController.showSnackBar('Already on this UI — selecting it');
          InterfaceController.openDashboardInEditMode();
          InterfaceController.selectDashboardItemByElementId(itemId);
          return;
        }
        try {
          // preserve the insertion position via a placement stash
          const { parentId, insertIndex } = getWidgetPlacement({
            query,
            nest: !itemToAdd.isContainer(),
          });
          displayedSurface.removedWidgetCache.set(relatedNode.id, {
            parentId,
            index: insertIndex,
          });
          flushEditorTreeToSurface(displayedSurface);
          InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.OPEN);
          void perform_action_connectNodeToSocket(
            relatedNode.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT),
            displayedSurface,
          ).then(() => {
            setTimeout(() => {
              InterfaceController.selectDashboardItemByElementId(itemId);
            }, 100);
          });
        } catch (e) {
          console.error(e);
          InterfaceController.showSnackBar(
            'Failed to add widget to user interface',
          );
          return;
        }
        InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
        InterfaceController.notifyListeners(ListenEvent.DashboardItemAdded, {
          dashboardId: itemId,
        });
        return;
      }

      const dashboardItemId = uuid();
      const nodeToAdd = buildWidgetNodeTree(
        query,
        itemToAdd,
        itemId,
        dashboardItemId,
      );
      try {
        addNodeWithPlacement(
          query,
          !itemToAdd.isContainer(),
          actions,
          nodeToAdd,
          dashboardItemId,
        );
      } catch (e) {
        console.error(e);
        InterfaceController.showSnackBar(
          'Failed to add widget to user interface',
        );
        return;
      }
      flushEditorTreeToSurface(displayedSurface);
      InterfaceController.showSnackBar(
        'Added dynamic widget to user interface',
      );
      InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
      InterfaceController.notifyListeners(ListenEvent.DashboardItemAdded, {
        dashboardItemId,
      });
    },
    [
      overlayState.dashboard,
      updateOverlayState,
      getDisplayedSurface,
      createDefaultSurface,
      flushEditorTreeToSurface,
    ],
  );

  const removeFromDashboard = useCallback(
    (itemId: string) => {
      // Save references to siblings before deletion
      const selectedNode = query.node(itemId).get();
      if (!selectedNode) {
        return;
      }
      const elementId = selectedNode.data.props?.id as string | undefined;
      const parent = selectedNode.data.parent;

      if (parent) {
        const siblings = query.node(parent).childNodes();
        const currentIndex = siblings.indexOf(itemId);

        actions.delete(itemId);
        // Select next node after deletion
        // Try to select the next sibling if available
        if (currentIndex < siblings.length - 1) {
          safeSelectNode(actions, query, siblings[currentIndex + 1]);
        }
        // Otherwise try to select the previous sibling
        else if (currentIndex > 0) {
          safeSelectNode(actions, query, siblings[currentIndex - 1]);
        }
        // If no siblings remain, select the parent
        else {
          safeSelectNode(actions, query, parent);
        }
      } else {
        // If no parent, just delete without selecting anything
        actions.delete(itemId);
      }

      // keep the surface's persisted tree in sync with this deletion *now* -
      // the live->persisted sync is otherwise debounced by 100ms, and an
      // edit-mode toggle (open or close) within that window reloads the
      // displayed surface from its still-stale persisted tree, resurrecting
      // the widget that was just deleted here.
      // NODE_ widgets are link-derived: deleting one must go through the
      // natural debounced handleNodesChange -> diffTreeAgainstLinks ->
      // DISCONNECT_SOCKETS flow instead, which relies on the echo guard
      // (lastSyncedTreeString) still differing from the post-delete tree to
      // detect the missing widget and sever the link. Pre-syncing here would
      // satisfy that echo guard early and skip the disconnect entirely,
      // leaving the link intact so syncWidgetsToLinks re-inserts the widget.
      const isLinkDerived = elementId?.startsWith('NODE_');
      const displayedSurface = isLinkDerived
        ? undefined
        : getDisplayedSurface();
      if (displayedSurface) {
        flushEditorTreeToSurface(displayedSurface);
      }
    },
    [getDisplayedSurface, flushEditorTreeToSurface],
  );

  // Register add and remove functions
  useEffect(() => {
    const addListenerId = InterfaceController.addListener(
      ListenEvent.AddToDashboard,
      addToDashboard,
    );
    const removeListenerId = InterfaceController.addListener(
      ListenEvent.RemoveFromDashboard,
      removeFromDashboard,
    );

    return () => {
      InterfaceController.removeListener(addListenerId);
      InterfaceController.removeListener(removeListenerId);
    };
  }, [addToDashboard, removeFromDashboard]);

  useEffect(() => {
    setIsEmpty(rootLength === 0);
  }, [rootLength]);

  useEffect(() => {
    const isLocked = overlayState.dashboard.locked;
    setIsDashboardLocked(isLocked);
    if (isLocked) {
      InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
    }
  }, [overlayState.dashboard.locked]);

  const handleDrop = useCallback(async (event) => {
    event.preventDefault();

    try {
      const data = event.dataTransfer.getData('application/json');
      if (!data) return;

      const parsedData = JSON.parse(data);
      if (parsedData.type !== draggedWidgetType) return;

      // Extract nodeId directly from the drag data
      const nodeId = getNodeIdFromElementId(parsedData.widgetId);
      const nodeType = parsedData.nodeType;

      if (!nodeId || !nodeType) {
        console.error(
          'Invalid drag data: missing nodeId or nodeType',
          parsedData,
        );
        return;
      }

      // Create the actual node on the canvas with the predefined ID
      const addedNode = await PPGraph.currentGraph.addNewNode(
        nodeType,
        {
          nodePosX: 0,
          nodePosY: 0,
          overrideId: nodeId,
        },
        NODE_SOURCE.NEW_DASHBOARD,
      );

      if (addedNode) {
        addedNode.deOverlap();
        // Notify that a dashboard item placeholder was dropped/added so the toolbox can rotate the widget ID
        InterfaceController.notifyListeners(ListenEvent.DashboardItemAdded, {
          dashboardId: parsedData.widgetId,
        });
        // The pollPlaceholders function will handle replacing the placeholder
      }
    } catch (error) {
      console.error('Error handling widget drop:', error);
    }
  }, []);

  useEffect(() => {
    // Auto-select the ROOT node when in edit mode and the dashboard is empty.
    // Guard against the editor being mid-deserialize (e.g. while a surface is
    // auto-created and loaded), where selectNode would hit a craft invariant.
    if (isEditMode && PPGraph.currentGraph.graphConfiguredAndReady) {
      try {
        const rootNode = query.node(RootName).get();
        if (rootNode && rootNode.data.nodes.length === 0) {
          actions.selectNode(RootName);
        }
      } catch (error) {
        // editor is transitioning; selection will settle on the next render
      }
    }
  }, [
    isEditMode,
    isEmpty,
    PPGraph.currentGraph.graphConfiguredAndReady,
    actions,
  ]);

  // UI only exists inside UI surface nodes. When the dashboard is opened for
  // editing while genuinely empty (no surface nodes and no legacy layout
  // content), auto-create a surface so added widgets have somewhere to live.
  // Runs at most once per graph session, so deleting/undoing it won't recreate.
  useEffect(() => {
    if (
      !isEditMode ||
      !isEmpty ||
      !PPGraph.currentGraph.graphConfiguredAndReady ||
      autoCreatedSurfaceRef.current
    ) {
      return;
    }
    const hasSurface = Object.values(PPGraph.currentGraph.nodes).some((node) =>
      node.isSurface(),
    );
    // read the live craft tree, not the lagged isEmpty state, so we never
    // auto-create (and deserialize-wipe) while widgets are mid-add
    const liveRoot = query.node(RootName).get();
    const liveEmpty = (liveRoot?.data?.nodes?.length ?? 0) === 0;
    if (hasSurface || getDisplayedSurface() || !liveEmpty) {
      return;
    }
    void createDefaultSurface();
  }, [isEditMode, isEmpty, getDisplayedSurface, createDefaultSurface]);

  return (
    <Box
      className="page-container"
      data-cy="dashboard"
      sx={{
        // fills whatever the dashboard column has left below its header,
        // rather than claiming the full viewport height
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflowY: 'auto',
        // a scroll that runs out here must not hand the rest of the gesture to
        // the page: on iOS that is the rubber-band/pull-to-refresh that makes a
        // full-screen app feel like a web page rather than an app
        overscrollBehavior: 'contain',
        background: `${getDashboardBackground()}`,
        position: 'relative',
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Toolbox as a sidebar */}
        {isVisible &&
          isEditMode &&
          PPGraph.currentGraph.graphConfiguredAndReady && (
            <Toolbox addToDashboard={addToDashboard} />
          )}

        {/* Dashboard content */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minWidth: isEditMode ? '400px' : undefined,
          }}
        >
          {isEditMode && isSurfaceLocked && (
            <Box
              data-cy="surface-locked-banner"
              sx={{
                px: 2,
                py: 0.75,
                flexShrink: 0,
                bgcolor: 'warning.dark',
                color: 'warning.contrastText',
                fontSize: '13px',
              }}
            >
              Read-only — this layout is controlled by the graph (the{' '}
              <CodeSpan>Layout JSON</CodeSpan> input is connected)
            </Box>
          )}
          <Box
            sx={{
              display: isVisible && (!isEmpty || isEditMode) ? 'flex' : 'none',
              justifyContent: 'center',
              alignItems: 'flex-start',
              width: '100%',
              flex: 1,
              minHeight: 0,
              my: isEditMode && isDevicePreview ? 2 : 0,
            }}
          >
            <Box
              data-cy="device-preview-frame"
              sx={{
                alignSelf: 'stretch',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                ...(isDevicePreview
                  ? {
                      boxSizing: 'content-box',
                      width: `${devicePreviewWidth}px`,
                      maxWidth: 'calc(100% - 28px)',
                      minWidth: 0,
                      border: '10px solid #111111',
                      borderRadius: '18px',
                      boxShadow: '0 0 24px rgba(0, 0, 0, 0.5)',
                      overflow: 'auto',
                    }
                  : {
                      width: '100%',
                    }),
              }}
            >
              <AppThemeProvider>
                {/* the app's own ground. The root container paints a
                    translucent tint over this, so without it a preset or mode
                    change would only show up on controls, not on the surface
                    they sit on */}
                <Box
                  data-cy="app-theme-surface"
                  sx={{
                    flex: '1 0 auto',
                    width: '100%',
                    minWidth: 0,
                    bgcolor: 'background.default',
                    color: 'text.primary',
                    // no 300ms wait before a tap becomes a click, and no grey
                    // flash box around every widget the finger lands on
                    touchAction: 'manipulation',
                    WebkitTapHighlightColor: 'transparent',
                    // app view is the only layout that reaches the physical
                    // edges of the screen (see viewport-fit=cover in
                    // template.html), so it is the only one that has to keep
                    // content out from under the notch and home indicator.
                    // Padding rather than margin: the app's own background
                    // still paints into the inset, only the widgets move.
                    ...(appView && {
                      pt: 'env(safe-area-inset-top)',
                      pb: 'env(safe-area-inset-bottom)',
                      pl: 'env(safe-area-inset-left)',
                      pr: 'env(safe-area-inset-right)',
                    }),
                  }}
                >
                  <Frame>
                    <Element is={Container} canvas {...rootProps}></Element>
                  </Frame>
                </Box>
              </AppThemeProvider>
            </Box>
          </Box>
          {isGraphLoading && !isEditMode && (
            <LoadingState title="Loading user interface" />
          )}
          {!isGraphLoading && isEmpty && !isEditMode && (
            <EmptyState appView={appView} />
          )}
        </Box>
      </Box>
    </Box>
  );
};

export const EmptyState: React.FC<{ appView?: boolean }> = ({
  appView = false,
}) => {
  const stackLayout = useIsStackLayout();
  return (
    <AppThemeProvider>
      <Box
        data-cy="dashboard-empty-state"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          textAlign: 'left',
          userSelect: 'none',
          p: 4,
          lineHeight: 1.5,
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        {appView ? (
          <>
            <Typography variant="h5" gutterBottom>
              {stackLayout ? 'No user interface yet' : 'Nothing to show'}
            </Typography>
            {/* On a phone the desktop version of this is worse than nothing: it
              names a logo that is not on screen and a keyboard shortcut there
              is no keyboard for. So it says what is missing, where it gets
              built, and what there is to do here in the meantime. */}
            <Typography variant="body1" color="text.secondary">
              {stackLayout ? (
                <>
                  This app doesn&apos;t have one yet, and building one needs a
                  desktop.
                  <br />
                  To see how the app works, open the Graph tab.
                </>
              ) : (
                <>
                  This Tailrmade app has no user interface yet.
                  <br />
                  To build one, click the logo on the top left or press{' '}
                  <em>T</em>.
                </>
              )}
            </Typography>
          </>
        ) : (
          <EmptyStateBuildSteps />
        )}
      </Box>
    </AppThemeProvider>
  );
};

const EmptyStateBuildSteps: React.FC = () => (
  <>
    <Typography variant="h5" gutterBottom>
      Create user interface
    </Typography>
    <Typography variant="body1" color="text.secondary">
      1. Click <em>Edit user interface</em> (
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          mx: 0.5,
          verticalAlign: 'middle',
        }}
      >
        <EditIcon fontSize="small" />
      </Box>
      ) on the top left
      <br />
      2. Drag new or existing widgets into it
      <br />
      3. Nest UI surfaces to build pages, containers and dialogs
      <br />
      4. Style them all at once with <em>App theme</em> (press 5)
      <br />
      <em>Tip: Add sockets of nodes by </em>Shift+Clicking
      <em>
        {' '}
        them
        <br /> or by clicking
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            mx: 0.5,
            verticalAlign: 'middle',
          }}
        >
          <DashboardCustomizeIcon fontSize="small" />
        </Box>
        in the inspector
      </em>
    </Typography>
  </>
);

const CodeSpan = ({ children }) => (
  <span
    style={{
      fontFamily: 'monospace',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      padding: '2px 4px',
      borderRadius: '3px',
      fontSize: '0.9em',
    }}
  >
    {children}
  </span>
);
