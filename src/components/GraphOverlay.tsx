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
import InterfaceController, { ListenEvent } from '../InterfaceController';
import ShellLayout from './ShellLayout';
import { getAppView, setAppView, useAppView } from './appViewStore';
import { DrawerSide, IOverlay, isSurfaceNode } from '../utils/interfaces';
import {
  DASHBOARD_DEFAULT,
  DrawerView,
  LeftDrawerView,
  RightDrawerView,
  URL_PARAMETER_NAME,
} from '../utils/constants';
import {
  saveDrawerStateToSession,
  loadDrawerStateFromSession,
} from '../utils/sessionStorageHandler';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { EmptyState } from './dashboard/DashboardEditor';
import { ModalHost } from './dashboard/ModalHost';
import { Container } from './dashboard/Container';
import { DashboardStateProvider } from './dashboard/DashboardStateProvider';
import { Text } from './dashboard/Text';
import { RenderNode } from './dashboard/RenderNode';
import { DynamicWidget } from './dashboard/DynamicWidget';
import { DashboardContainer } from './dashboard/DashboardContainer';
import { PlaceholderWidget } from './dashboard/PlaceholderWidget';
import { useDisplayedSurfaceLocked } from './dashboard/hooks';

// app view lives in the URL rather than in the saved graph, so a shared link
// can open straight into the running app
const setAppViewUrlParameter = (enabled: boolean): void => {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set(URL_PARAMETER_NAME.APPVIEW, 'true');
  } else {
    url.searchParams.delete(URL_PARAMETER_NAME.APPVIEW);
  }
  window.history.replaceState(null, '', url.toString());
};

type GraphOverlayProps = {
  randomMainColor: string;
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
  // App view: zero chrome, forced Live, the app UI is the whole window. It is
  // deliberately NOT part of overlayState - that object is serialized with the
  // graph, and app view belongs to the URL, not to the saved app. It lives in
  // appViewStore rather than in a useState here because the width hooks deep
  // inside the dashboard have to subscribe to it too.
  const appView = useAppView();
  // what the shell looked like before app view, so leaving it puts every
  // panel back exactly where the user had it
  const preAppViewStateRef = useRef<{
    overlay: IOverlay;
    isEditMode: boolean;
  } | null>(null);

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

    // Handle ticker stopping/starting based on dashboard state. App view
    // covers the canvas completely, so it stops the ticker for the same
    // reason maximising does.
    if (
      (appView ||
        (overlayState?.dashboard?.fullscreen &&
          overlayState.dashboard?.visible)) &&
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

      // Close if the requested view is already showing
      const shouldClose =
        content != null &&
        content === overlayState[side].activeView &&
        overlayState[side].visible;

      updateOverlayState({
        [side]: {
          ...overlayState[side],
          visible: shouldClose
            ? false
            : action === VISIBILITY_ACTION.TOGGLE
              ? !overlayState[side].visible
              : action === VISIBILITY_ACTION.OPEN,
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

  const toggleDashboard = useCallback(
    (action: VISIBILITY_ACTION) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          visible:
            action === VISIBILITY_ACTION.TOGGLE
              ? !overlayState.dashboard.visible
              : action === VISIBILITY_ACTION.OPEN,
        },
      });
    },
    [overlayState.dashboard, updateOverlayState],
  );

  const openDashboardInEditMode = useCallback(() => {
    toggleDashboard(VISIBILITY_ACTION.OPEN);
    setIsDashboardInEditMode(VISIBILITY_ACTION.OPEN);
  }, [setIsDashboardInEditMode, toggleDashboard]);

  // read through refs so toggleAppView stays stable and always sees the
  // latest shell state without re-subscribing every listener that holds it
  const overlayStateRef = useRef(overlayState);
  const isEditModeRef = useRef(isEditMode);
  useEffect(() => {
    overlayStateRef.current = overlayState;
    isEditModeRef.current = isEditMode;
  }, [overlayState, isEditMode]);

  const toggleAppView = useCallback(
    (action: VISIBILITY_ACTION) => {
      const wasInAppView = getAppView();
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
            visible: true,
          },
        }));
      } else {
        // put the shell back the way the user had left it. Only the three
        // visibility flags app view touched are restored - loading a graph
        // while in app view rewrites the dashboard's own state (widths,
        // maximised), and that newer state has to survive the way out.
        const snapshot = preAppViewStateRef.current;
        if (snapshot) {
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
              visible: snapshot.overlay[DrawerSide.DASHBOARD].visible,
            },
          }));
          setIsDashboardInEditMode(
            snapshot.isEditMode
              ? VISIBILITY_ACTION.OPEN
              : VISIBILITY_ACTION.CLOSE,
          );
          preAppViewStateRef.current = null;
        }
      }

      setAppView(goToAppView);
      // app links open straight into app view
      setAppViewUrlParameter(goToAppView);
    },
    [setIsDashboardInEditMode],
  );

  useEffect(() => {
    InterfaceController.toggleAppView = toggleAppView;
    InterfaceController.isInAppView = getAppView;
    return () => {
      InterfaceController.toggleAppView = () => {};
      InterfaceController.isInAppView = () => false;
    };
  }, [toggleAppView]);

  // an app link (?appView=true) opens straight into app view
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get(URL_PARAMETER_NAME.APPVIEW) === 'true') {
      toggleAppView(VISIBILITY_ACTION.OPEN);
    }
    // only on mount - later changes go through toggleAppView itself
  }, []);

  // the store outlives this component, so hand it back its default rather than
  // leaving a remounted shell in an app view nothing can be restored from
  useEffect(() => () => setAppView(false), []);

  useEffect(() => {
    InterfaceController.toggleDashboardInEditMode = setIsDashboardInEditMode;
    InterfaceController.openDashboardInEditMode = openDashboardInEditMode;

    return () => {
      InterfaceController.openDashboardInEditMode = () => {};
    };
  }, [openDashboardInEditMode, setIsDashboardInEditMode]);

  const toggleFullscreen = useCallback(
    (action: VISIBILITY_ACTION) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          fullscreen:
            action === VISIBILITY_ACTION.TOGGLE
              ? !overlayState.dashboard.fullscreen
              : action === VISIBILITY_ACTION.OPEN,
        },
      });
    },
    [
      overlayState.dashboard,
      overlayState.dashboard.fullscreen,
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

    InterfaceController.getOverlayState = () => overlayState;
    InterfaceController.updateOverlayState = updateOverlayState;

    const listenerId = InterfaceController.addListeners(
      [ListenEvent.GraphChanged, ListenEvent.DashboardLoaded],
      setCurrentGraph,
    );

    return () => InterfaceController.removeListener(listenerId);
  }, [
    overlayState,
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
          fullscreen: false,
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
        >
          <DashboardStateProvider>
            <ShellLayout
              randomMainColor={props.randomMainColor}
              overlayState={overlayState}
              updateOverlayState={updateOverlayState}
              isEditMode={isEditMode}
              appView={appView}
              toggleAppView={toggleAppView}
              toggleFullscreen={toggleFullscreen}
              setDashboardWidthPercentage={updateDrawerWidth}
              setContextMenuPosition={props.setContextMenuPosition}
              setIsGraphContextMenuOpen={props.setIsGraphContextMenuOpen}
              currentGraph={PPGraph.currentGraph}
            />
          </DashboardStateProvider>
        </Editor>
        {/* open UI modal dialogs render globally, independent of embedding */}
        <ModalHost />
      </>
    )
  );
};

export default GraphOverlay;
