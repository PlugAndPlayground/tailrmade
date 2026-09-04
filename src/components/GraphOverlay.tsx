import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from '@craftjs/core';
import debounce from 'lodash/debounce';
import { Box, Typography } from '@mui/material';
import PPGraph from '../classes/GraphClass';
import {
  ACTIONS,
  ConnectSocketsActionArgs,
  PNPAction,
  SetUISurfaceLayoutActionArgs,
} from '../classes/Action';
import { SurfaceSync } from '../nodes/layout/surfaceSync';
import { surfaceEditSession } from './dashboard/surfaceEditSession';
import { canonicalTreeString } from '../utils/surfaceTree';
import { nextDrawerVisibility } from '../utils/drawerVisibility';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import ShellLayout from './ShellLayout';
import { DrawerSide, IOverlay, isSurfaceNode } from '../utils/interfaces';
import {
  DASHBOARD_DEFAULT,
  DrawerView,
  LeftDrawerView,
  RightDrawerView,
} from '../utils/constants';
import {
  saveDrawerStateToSession,
  loadDrawerStateFromSession,
} from '../utils/sessionStorageHandler';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { EmptyState } from './dashboard/DashboardEditor';
import { ModalHost } from './dashboard/ModalHost';
import {
  createAxisAwareHandlers,
  DashboardDropIndicator,
  dropIndicatorOptions,
} from './dashboard/DropIndicator';
import { Container } from './dashboard/Container';
import { DashboardStateProvider } from './dashboard/DashboardStateProvider';
import { Text } from './dashboard/Text';
import { RenderNode } from './dashboard/RenderNode';
import { DynamicWidget } from './dashboard/DynamicWidget';
import { DashboardContainer } from './dashboard/DashboardContainer';
import { PlaceholderWidget } from './dashboard/PlaceholderWidget';
import { useDisplayedSurfaceLocked } from './dashboard/hooks';

type GraphOverlayProps = {
  setContextMenuPosition: React.Dispatch<React.SetStateAction<number[]>>;
  setIsGraphContextMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const GraphOverlay: React.FunctionComponent<GraphOverlayProps> = (props) => {
  // Initialize overlay state with session storage for drawer state
  const [currentGraph, setCurrentGraph] = useState(PPGraph.currentGraph);

  const [overlayState, setOverlayState] = useState<IOverlay>(() => {
    const sessionDrawerState = loadDrawerStateFromSession();
    return {
      ...sessionDrawerState,
      rightSide: {
        ...sessionDrawerState.rightSide,
        activeView: RightDrawerView.GRAPH,
      },
      dashboard: DASHBOARD_DEFAULT,
    };
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const appView = overlayState[DrawerSide.DASHBOARD].fullscreen;
  const preAppViewStateRef = useRef<{
    overlay: IOverlay;
    isEditMode: boolean;
  }>({ overlay: overlayState, isEditMode });
  const appliedAppViewRef = useRef(false);

  const setIsDashboardInEditMode = useCallback(
    (action: VISIBILITY_ACTION) => {
      if (action === VISIBILITY_ACTION.TOGGLE) {
        setIsEditMode((edit) => {
          InterfaceController.isDashboardInEditMode = !edit;
          return !edit;
        });
      } else {
        const newVal = action === VISIBILITY_ACTION.OPEN;
        InterfaceController.isDashboardInEditMode = newVal;
        setIsEditMode(newVal);
      }
    },
    [setIsEditMode],
  );

  const updateOverlayState = useCallback((newState: Partial<IOverlay>) => {
    setOverlayState((prevState) => {
      const state = { ...prevState, ...newState };
      return state;
    });
  }, []);

  // Handle side effects after state updates
  useEffect(() => {
    InterfaceController.getOverlayState = () => overlayState;

    if (!PPGraph.currentGraph) return;

    // Notify listeners about overlay state changes
    InterfaceController.notifyListeners(
      ListenEvent.OverlayStateChanged,
      overlayState,
    );

    // Save drawer state to session storage if drawer state changed
    saveDrawerStateToSession({
      leftSide: overlayState.leftSide,
      rightSide: overlayState.rightSide,
    });

    if (
      (appView ||
        (overlayState.dashboard.maximized && overlayState.dashboard.visible)) &&
      PPGraph.currentGraph.app.ticker.started
    ) {
      PPGraph.currentGraph.app.ticker.stop();
      console.log('stopped main app ticker');
    } else if (!PPGraph.currentGraph.app.ticker.started) {
      PPGraph.currentGraph.app.ticker.start();
      // without this we had a problem with hybrid nodes that might not have been rendered yet
      Object.values(PPGraph.currentGraph.nodes).forEach((node) => {
        node.fullScreenDashboardClosed();
      });
      console.log('started main app ticker');
    }
  }, [overlayState, appView]);

  const toggleDrawer = useCallback(
    (
      side: DrawerSide,
      action: VISIBILITY_ACTION,
      // the sub-view this drawer should switch to (a left or right drawer view)
      content?: DrawerView,
    ) => {
      if (side === DrawerSide.DASHBOARD) {
        return;
      }

      const drawer = overlayState[side];

      updateOverlayState({
        [side]: {
          ...drawer,
          visible: nextDrawerVisibility({
            action,
            isVisible: drawer.visible,
            requestedView: content,
            activeView: drawer.activeView,
          }),
          ...(content != null && { activeView: content }),
        },
      });
    },
    [overlayState, updateOverlayState],
  );

  const toggleLeftSideDrawer = useCallback(
    (action: VISIBILITY_ACTION, content?: LeftDrawerView) =>
      toggleDrawer(DrawerSide.LEFT, action, content),
    [toggleDrawer],
  );

  const toggleRightSideDrawer = useCallback(
    (action: VISIBILITY_ACTION, view?: RightDrawerView) =>
      toggleDrawer(DrawerSide.RIGHT, action, view),
    [toggleDrawer],
  );

  // Set the active right drawer tab without changing the drawer's visibility
  const setRightDrawerView = useCallback(
    (view: RightDrawerView) => {
      updateOverlayState({
        rightSide: { ...overlayState.rightSide, activeView: view },
      });
    },
    [overlayState.rightSide, updateOverlayState],
  );

  const toggleDashboard = useCallback((action: VISIBILITY_ACTION) => {
    setOverlayState((state) => ({
      ...state,
      [DrawerSide.DASHBOARD]: {
        ...state[DrawerSide.DASHBOARD],
        visible:
          action === VISIBILITY_ACTION.TOGGLE
            ? !state[DrawerSide.DASHBOARD].visible
            : action === VISIBILITY_ACTION.OPEN,
      },
    }));
  }, []);

  const openDashboardInEditMode = useCallback(() => {
    toggleDashboard(VISIBILITY_ACTION.OPEN);
    setIsDashboardInEditMode(VISIBILITY_ACTION.OPEN);
  }, [setIsDashboardInEditMode, toggleDashboard]);

  const overlayStateRef = useRef(overlayState);
  const isEditModeRef = useRef(isEditMode);
  useEffect(() => {
    overlayStateRef.current = overlayState;
    isEditModeRef.current = isEditMode;
  }, [overlayState, isEditMode]);

  const toggleAppView = useCallback(
    (action: VISIBILITY_ACTION) => {
      const wasInAppView = appliedAppViewRef.current;
      const goToAppView =
        action === VISIBILITY_ACTION.TOGGLE
          ? !wasInAppView
          : action === VISIBILITY_ACTION.OPEN;
      if (goToAppView === wasInAppView) {
        return;
      }

      if (goToAppView) {
        preAppViewStateRef.current = {
          overlay: overlayStateRef.current,
          isEditMode: isEditModeRef.current,
        };
        // app view is the real app: always live, never editing
        setIsDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
        setOverlayState((state) => ({
          ...state,
          [DrawerSide.LEFT]: { ...state[DrawerSide.LEFT], visible: false },
          [DrawerSide.RIGHT]: { ...state[DrawerSide.RIGHT], visible: false },
          [DrawerSide.DASHBOARD]: {
            ...state[DrawerSide.DASHBOARD],
            fullscreen: true,
          },
        }));
      } else {
        const snapshot = preAppViewStateRef.current;
        setOverlayState((state) => ({
          ...state,
          [DrawerSide.LEFT]: {
            ...state[DrawerSide.LEFT],
            visible: snapshot.overlay[DrawerSide.LEFT].visible,
          },
          [DrawerSide.RIGHT]: {
            ...state[DrawerSide.RIGHT],
            visible: snapshot.overlay[DrawerSide.RIGHT].visible,
          },
          [DrawerSide.DASHBOARD]: {
            ...state[DrawerSide.DASHBOARD],
            fullscreen: false,
          },
        }));
        setIsDashboardInEditMode(
          snapshot.isEditMode
            ? VISIBILITY_ACTION.OPEN
            : VISIBILITY_ACTION.CLOSE,
        );
      }

      appliedAppViewRef.current = goToAppView;
    },
    [setIsDashboardInEditMode],
  );

  useEffect(() => {
    InterfaceController.toggleAppView = toggleAppView;
    return () => {
      InterfaceController.toggleAppView = () => {};
    };
  }, [toggleAppView]);

  const dashboardFullscreen = overlayState[DrawerSide.DASHBOARD].fullscreen;
  useEffect(() => {
    toggleAppView(
      dashboardFullscreen ? VISIBILITY_ACTION.OPEN : VISIBILITY_ACTION.CLOSE,
    );
  }, [dashboardFullscreen, toggleAppView]);

  useEffect(() => {
    InterfaceController.toggleDashboardInEditMode = setIsDashboardInEditMode;
    InterfaceController.openDashboardInEditMode = openDashboardInEditMode;

    return () => {
      InterfaceController.openDashboardInEditMode = () => {};
    };
  }, [openDashboardInEditMode, setIsDashboardInEditMode]);

  const toggleMaximized = useCallback(
    (action: VISIBILITY_ACTION) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          maximized:
            action === VISIBILITY_ACTION.TOGGLE
              ? !overlayState.dashboard.maximized
              : action === VISIBILITY_ACTION.OPEN,
        },
      });
    },
    [
      overlayState.dashboard,
      overlayState.dashboard.maximized,
      updateOverlayState,
    ],
  );

  const handleNodesChange = useCallback(
    debounce((query) => {
      if (!PPGraph.currentGraph.graphConfiguredAndReady) {
        return;
      }

      // no surface displayed yet (e.g. before the auto-create effect runs
      // on a genuinely empty graph) - nothing to sync
      const surfaceId = InterfaceController.displayedSurfaceNodeId;
      if (!surfaceId) {
        return;
      }

      const surface = PPGraph.currentGraph.getNodeById(surfaceId);
      if (!surface || !isSurfaceNode(surface)) {
        console.error(
          'handleNodesChange: displayed surface id does not resolve to a UI surface node',
          surfaceId,
        );
        return;
      }

      // the graph owns the layout while the Layout JSON socket is wired —
      // the editor is read-only then, so ignore any change echoes
      if (surface.isLayoutLocked()) {
        return;
      }

      const newTreeString = query.serialize();
      // canonicalized (key-order independent) for comparison against the
      // echo guard - see canonicalTreeString for why a raw string compare
      // against getDisplayTreeString's output would never match
      const newCanonicalTreeString = canonicalTreeString(
        JSON.parse(newTreeString),
      );
      if (newCanonicalTreeString === surfaceEditSession.lastSyncedTreeString) {
        return;
      }

      // widgets deleted in the editor are expressed as disconnect actions;
      // the tree update is then derived by the surface's sync engine
      const removedSockets = SurfaceSync.diffTreeAgainstLinks(
        surface,
        JSON.parse(newTreeString),
      );
      if (removedSockets.length > 0) {
        removedSockets.forEach((socket) => {
          const link = socket.links[0];
          const connectArgs = new ConnectSocketsActionArgs(
            link.getSource().getNode().id,
            link.getSource().name,
            surface.id,
            socket.name,
          );
          void PNPAction(ACTIONS.DISCONNECT_SOCKETS, connectArgs, connectArgs);
        });
        return;
      }

      // rapid consecutive edits (e.g. a drag) share this checksum, so the
      // action handler groups them into one undo entry; the merge keeps the
      // first edit's undoArgs, i.e. the tree from before the whole burst
      const previousTreeString =
        surfaceEditSession.lastSyncedTreeString ||
        JSON.stringify(surface.getSurfaceTree());
      surfaceEditSession.lastSyncedTreeString = newCanonicalTreeString;

      void PNPAction(
        ACTIONS.SET_UI_SURFACE_LAYOUT,
        new SetUISurfaceLayoutActionArgs(surface.id, newTreeString),
        new SetUISurfaceLayoutActionArgs(surface.id, previousTreeString),
        `surface-layout-${surface.id}`,
      );
    }, 100),
    [],
  );

  // editor becomes read-only when the displayed surface's Layout JSON
  // socket is wired (the graph owns the layout then)
  const activeSurfaceLocked = useDisplayedSurfaceLocked();

  useEffect(() => {
    // Update InterfaceController methods
    InterfaceController.toggleLeftSideDrawer = toggleLeftSideDrawer;
    InterfaceController.toggleShowDashboard = toggleDashboard;
    InterfaceController.toggleRightSideDrawer = toggleRightSideDrawer;
    InterfaceController.setRightDrawerView = setRightDrawerView;

    InterfaceController.updateOverlayState = updateOverlayState;

    const listenerId = InterfaceController.addListeners(
      [ListenEvent.GraphChanged, ListenEvent.DashboardLoaded],
      setCurrentGraph,
    );

    return () => InterfaceController.removeListener(listenerId);
  }, [
    toggleLeftSideDrawer,
    toggleDashboard,
    toggleRightSideDrawer,
    setRightDrawerView,
    updateOverlayState,
  ]);

  const updateDrawerWidth = useCallback(
    (percentage: number) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          maximized: false,
          visible: true,
          widthPercentage: percentage,
        },
      });
    },
    [overlayState.dashboard, updateOverlayState],
  );

  return (
    PPGraph.currentGraph && (
      <>
        <Editor
          resolver={{
            Box,
            Text,
            DynamicWidget,
            Container,
            DashboardContainer,
            Typography,
            EmptyState,
            PlaceholderWidget,
          }}
          enabled={isEditMode && !activeSurfaceLocked}
          onNodesChange={handleNodesChange}
          onRender={RenderNode}
          handlers={createAxisAwareHandlers}
          indicator={dropIndicatorOptions}
        >
          <DashboardStateProvider>
            <ShellLayout
              overlayState={overlayState}
              updateOverlayState={updateOverlayState}
              isEditMode={isEditMode}
              appView={appView}
              toggleAppView={toggleAppView}
              toggleMaximized={toggleMaximized}
              setDashboardWidthPercentage={updateDrawerWidth}
              setContextMenuPosition={props.setContextMenuPosition}
              setIsGraphContextMenuOpen={props.setIsGraphContextMenuOpen}
              currentGraph={PPGraph.currentGraph}
            />
            <DashboardDropIndicator />
          </DashboardStateProvider>
        </Editor>
        {/* open UI modal dialogs render globally, independent of embedding */}
        <ModalHost />
      </>
    )
  );
};

export default GraphOverlay;
