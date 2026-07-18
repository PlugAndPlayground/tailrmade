import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TRgba } from '../utils/color';
import { Editor } from '@craftjs/core';
import debounce from 'lodash/debounce';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  styled,
  useTheme,
  Avatar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShareIcon from '@mui/icons-material/Share';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import HistoryIcon from '@mui/icons-material/History';
import MenuIcon from '@mui/icons-material/Menu';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import CloseIcon from '@mui/icons-material/Close';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import PPStorage from './../PPStorage';
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
import GraphOverlayDrawer from './GraphOverlayDrawer';
import GraphOverlayDashboard from './dashboard/GraphOverlayDashboard';
import { useIsSmallScreen } from '../utils/utils';
import { DrawerSide, IOverlay, isSurfaceNode } from '../utils/interfaces';
import {
  CONTEXTMENU_GRAPH_HEIGHT,
  CONTEXTMENU_WIDTH,
  DASHBOARD_DEFAULT,
  DrawerView,
  LeftDrawerView,
  RightDrawerView,
} from '../utils/constants';
import {
  saveDrawerStateToSession,
  loadDrawerStateFromSession,
} from '../utils/sessionStorageHandler';
import { TMIconNoShadow } from '../utils/icons';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import SocialIcons from '../components/SocialIcons';
import ShareContextMenu from './contextmenus/ShareContextMenu';
import Authentication from './../firebase/Authentication';
import { BackendGateway } from '../services/BackendGateway';
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
import { CLOUD_MODE } from '../services/shared-types';
import { getTMBuildTooltip } from '../buildInfo';

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

    // Handle ticker stopping/starting based on dashboard state
    if (
      overlayState?.dashboard?.fullscreen &&
      overlayState.dashboard?.visible &&
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
  }, [overlayState]);

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

  const setDashboardWidthPercentage = useCallback(
    (percentage: number) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          widthPercentage: percentage,
        },
      });
    },
    [
      overlayState.dashboard.widthPercentage,
      overlayState.dashboard.visible,
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
    (width: number) => {
      updateOverlayState({
        dashboard: {
          ...overlayState.dashboard,
          fullscreen: false,
          visible: true,
          widthPercentage: width,
        },
      });
    },
    [updateOverlayState],
  );

  return (
    PPGraph.currentGraph && (
      <>
        <AppButtonGroup
          setContextMenuPosition={props.setContextMenuPosition}
          setIsGraphContextMenuOpen={props.setIsGraphContextMenuOpen}
          randomMainColor={props.randomMainColor}
          overlayState={overlayState}
          toggleFullscreen={toggleFullscreen}
          setDashboardWidthPercentage={setDashboardWidthPercentage}
          isEditMode={isEditMode}
          currentGraph={PPGraph.currentGraph}
        />
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
            <GraphOverlayDrawer
              randomMainColor={props.randomMainColor}
              overlayState={overlayState}
              updateOverlayState={updateOverlayState}
              disableHoverOpen={isEditMode}
            />
            <GraphOverlayDashboard
              randomMainColor={props.randomMainColor}
              overlayState={overlayState}
              updateOverlayState={updateOverlayState}
              isEditMode={isEditMode}
              toggle={overlayState[DrawerSide.DASHBOARD].visible}
              setDrawerWidthPercentage={updateDrawerWidth}
              drawerWidthPercentage={overlayState.dashboard.widthPercentage}
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

export const StyledButton = styled(Button, {
  shouldForwardProp: (prop) => !['isSelected'].includes(prop as string),
})<{ isSelected?: boolean }>(({ theme, isSelected }) => ({
  minWidth: 0,
  padding: theme.spacing(0.5),
  backgroundColor: isSelected
    ? theme.palette.primary.main
    : theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: isSelected
      ? theme.palette.primary.dark
      : theme.palette.grey[200],
  },
  width: 32,
  height: 32,
  '& .MuiSvgIcon-root': {
    color: isSelected ? theme.palette.common.white : 'inherit',
  },
  '--svg-fill-color': isSelected
    ? theme.palette.common.white
    : theme.palette.primary.main,
}));

type AppButtonGroupProps = {
  randomMainColor: string;
  setContextMenuPosition: React.Dispatch<React.SetStateAction<number[]>>;
  setIsGraphContextMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  overlayState: IOverlay;
  toggleFullscreen: (open: VISIBILITY_ACTION) => void;
  setDashboardWidthPercentage: (percentage: number) => void;
  isEditMode: boolean;
  currentGraph: PPGraph;
};

const AppButtonGroup: React.FunctionComponent<AppButtonGroupProps> = React.memo(
  (props) => {
    const theme = useTheme();
    const smallScreen = useIsSmallScreen();

    const [isCollapsed, setIsCollapsed] = useState(
      smallScreen ||
        (props.overlayState.dashboard.visible &&
          props.overlayState.dashboard.fullscreen),
    );

    const [isCreatingNewGraph, setIsCreatingNewGraph] = useState(false);
    const [isGraphContextMenuOpenInternal, setIsGraphContextMenuOpenInternal] =
      useState(false);
    const [shareMenuAnchor, setShareMenuAnchor] = useState<{
      hasClick: boolean;
      top: number;
      left: number;
    }>({
      hasClick: false,
      top: 0,
      left: 0,
    });
    const [authDialogOpen, setAuthDialogOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(
      CLOUD_MODE ? BackendGateway.getInstance().getCurrentUser() : null,
    );

    const posX = smallScreen
      ? 8
      : window.innerWidth / 2 - CONTEXTMENU_WIDTH / 2;
    const posY = smallScreen
      ? 8
      : window.innerHeight - CONTEXTMENU_GRAPH_HEIGHT - 88;

    const openDashboardClick = (
      event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    ): void => {
      event.stopPropagation();
      InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.TOGGLE);
      if (props.isEditMode) {
        InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
      }
      if (smallScreen) {
        InterfaceController.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
      }
    };

    const handleCreateNewClick = async () => {
      if (isCreatingNewGraph) return;

      setIsCreatingNewGraph(true);
      await PPStorage.getInstance().createNewGraph();
      setIsCreatingNewGraph(false);
    };

    const wasDashboardVisibleRef = useRef(props.overlayState.dashboard.visible);
    useEffect(() => {
      const { visible, fullscreen } = props.overlayState.dashboard;
      const wasVisible = wasDashboardVisibleRef.current;
      wasDashboardVisibleRef.current = visible;

      if (!visible) {
        setIsCollapsed(smallScreen);
      } else if (smallScreen || (fullscreen && !wasVisible)) {
        setIsCollapsed(true);
      }
    }, [
      props.overlayState.dashboard.visible,
      props.overlayState.dashboard.fullscreen,
      smallScreen,
    ]);

    useEffect(() => {
      if (!CLOUD_MODE) {
        return;
      }
      // Listen for auth state changes
      const handleAuthChange = (isLoggedIn) => {
        if (isLoggedIn) {
          setCurrentUser(BackendGateway.getInstance().getCurrentUser());
        } else {
          setCurrentUser(null);
        }
      };

      const listenerId = InterfaceController.addListener(
        ListenEvent.UserIsLoggedIn,
        handleAuthChange,
      );

      // Cleanup
      return () => {
        InterfaceController.removeListener(listenerId);
      };
    }, []);

    return (
      <>
        {props.currentGraph &&
          !(
            props.overlayState.leftSide.visible ||
            props.overlayState.dashboard.visible ||
            props.overlayState.rightSide.visible ||
            isGraphContextMenuOpenInternal
          ) && (
            <Box
              sx={{
                position: 'absolute',
                top: '13px',
                left: isCollapsed ? '48px' : '88px',
                color: theme.palette.primary.main,
                fontSize: '14px',
                fontWeight: 500,
                zIndex: '1300',
                userSelect: 'none',
                cursor: 'pointer',
              }}
              onClick={() => {
                InterfaceController.setShowGraphEdit(true);
              }}
            >
              {props.currentGraph.name}
            </Box>
          )}
        <Box
          id="app-button-group"
          sx={{
            '--svg-fill-color': TRgba.fromString(props.randomMainColor).hex(),
            position: 'fixed',
            top: '4px',
            left: '8px',
            zIndex: '1310',
            maxHeight: 'calc(100dvh - 16px)',
            overflowY: 'auto',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            display: 'flex',
            pointerEvents: 'none',
          }}
        >
          <Stack spacing={0.5} alignItems="left" sx={{ pointerEvents: 'auto' }}>
            <Tooltip title={getTMBuildTooltip()} placement="right">
              <IconButton
                data-cy="toggle-app-button"
                size="small"
                onClick={() => {
                  setIsCollapsed((prev) => !prev);
                }}
                sx={{
                  padding: 0,
                  width: '32px',
                  '--svg-fill-color':
                    props.overlayState.leftSide.visible ||
                    props.overlayState.dashboard.visible
                      ? TRgba.white().hex()
                      : TRgba.fromString(props.randomMainColor).hex(),
                }}
              >
                <TMIconNoShadow />
              </IconButton>
            </Tooltip>

            {!isCollapsed && (
              <>
                {CLOUD_MODE && (
                  <>
                    <Tooltip title="My account" placement="right">
                      <StyledButton
                        data-cy="auth-button"
                        onClick={() => setAuthDialogOpen(true)}
                        isSelected={currentUser === null}
                        sx={{
                          borderRadius: 0,
                        }}
                      >
                        {currentUser !== null ? (
                          <Avatar
                            src={currentUser.photoURL || ''}
                            alt={
                              currentUser.displayName ||
                              currentUser.email ||
                              'User'
                            }
                            sx={{
                              width: 28,
                              height: 28,
                              bgcolor: theme.palette.primary.main,
                              color: theme.palette.common.white,
                              fontWeight: 'bold',
                              fontSize: '12px',
                            }}
                          >
                            {currentUser.displayName
                              ? currentUser.displayName[0].toUpperCase()
                              : currentUser.email
                                ? currentUser.email[0].toUpperCase()
                                : 'U'}
                          </Avatar>
                        ) : (
                          <PersonIcon />
                        )}
                      </StyledButton>
                    </Tooltip>
                    <Divider sx={{ width: '32px', my: 0.5 }} />
                  </>
                )}
                <Tooltip title="Open apps list (1)" placement="right">
                  <StyledButton
                    isSelected={
                      props.overlayState.leftSide.visible &&
                      props.overlayState.leftSide.activeView ===
                        LeftDrawerView.GRAPHS
                    }
                    onClick={() =>
                      InterfaceController.toggleLeftSideDrawer(
                        VISIBILITY_ACTION.OPEN,
                        LeftDrawerView.GRAPHS,
                      )
                    }
                  >
                    <MenuIcon />
                  </StyledButton>
                </Tooltip>
                <Divider sx={{ width: '32px', my: 0.5 }} />
                {smallScreen ? (
                  <>
                    <StyledButton
                      data-cy="toggle-context-menu-btn"
                      isSelected={isGraphContextMenuOpenInternal}
                      onClick={(event) => {
                        event.stopPropagation();

                        props.setContextMenuPosition([posX, posY]);
                        props.setIsGraphContextMenuOpen((isOpen) => {
                          setIsGraphContextMenuOpenInternal(!isOpen);
                          return !isOpen;
                        });
                      }}
                    >
                      <MoreVertIcon />
                    </StyledButton>
                  </>
                ) : (
                  <>
                    <Tooltip title="Open AI assistant" placement="right">
                      <StyledButton
                        data-cy="aiButton"
                        isSelected={
                          props.overlayState.leftSide.visible &&
                          props.overlayState.leftSide.activeView ===
                            LeftDrawerView.AI
                        }
                        onClick={() => {
                          InterfaceController.toggleLeftSideDrawer(
                            VISIBILITY_ACTION.OPEN,
                            LeftDrawerView.AI,
                          );
                        }}
                      >
                        <AutoAwesomeIcon />
                      </StyledButton>
                    </Tooltip>
                    <Tooltip title="Open action history" placement="right">
                      <StyledButton
                        data-cy="actionsButton"
                        isSelected={
                          props.overlayState.leftSide.visible &&
                          props.overlayState.leftSide.activeView ===
                            LeftDrawerView.ACTIONS
                        }
                        onClick={() => {
                          InterfaceController.toggleLeftSideDrawer(
                            VISIBILITY_ACTION.OPEN,
                            LeftDrawerView.ACTIONS,
                          );
                        }}
                      >
                        <HistoryIcon />
                      </StyledButton>
                    </Tooltip>
                    <Divider sx={{ width: '32px', my: 0.5 }} />
                    <Tooltip title="Open help" placement="right">
                      <StyledButton
                        data-cy="helpButton"
                        onClick={() => {
                          window.open('https://tailrmade.app/help', '_blank');
                        }}
                      >
                        <QuestionMarkIcon />
                      </StyledButton>
                    </Tooltip>
                    <Divider sx={{ width: '32px', my: 0.5 }} />
                    <Tooltip title="Share this app" placement="right">
                      <StyledButton
                        data-cy="shareCurrentButton"
                        onClick={(
                          event: React.MouseEvent<HTMLButtonElement>,
                        ) => {
                          event.stopPropagation();
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          setShareMenuAnchor({
                            hasClick: true,
                            top: rect.top - 4,
                            left: rect.left + rect.width + 4,
                          });
                        }}
                      >
                        <ShareIcon />
                      </StyledButton>
                    </Tooltip>
                    {shareMenuAnchor.hasClick && (
                      <>
                        <Box
                          sx={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 1300,
                          }}
                          onClick={() =>
                            setShareMenuAnchor((state) => ({
                              ...state,
                              hasClick: false,
                            }))
                          }
                        />
                        <ShareContextMenu
                          anchorPosition={shareMenuAnchor}
                          onClose={() =>
                            setShareMenuAnchor((state) => ({
                              ...state,
                              hasClick: false,
                            }))
                          }
                        />
                      </>
                    )}
                    <Divider sx={{ width: '32px', my: 0.5 }} />
                    <Tooltip title="Create new app" placement="right">
                      <StyledButton
                        data-cy="createNewAppButton"
                        disabled={isCreatingNewGraph}
                        onClick={handleCreateNewClick}
                      >
                        {isCreatingNewGraph ? (
                          <CircularProgress size={20} />
                        ) : (
                          <AddIcon />
                        )}
                      </StyledButton>
                    </Tooltip>
                  </>
                )}
              </>
            )}
          </Stack>

          {!isCollapsed && (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                ml: 1,
                mt: 0.5,
                alignItems: 'center',
                height: '32px',
                pointerEvents: 'auto',
              }}
            >
              <Tooltip title="Open user interface (2)" placement="bottom">
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <StyledButton
                    data-cy="toggle-dashboard-btn"
                    isSelected={props.overlayState.dashboard.visible}
                    onClick={openDashboardClick}
                  >
                    <DashboardIcon />
                  </StyledButton>
                </Box>
              </Tooltip>

              {!smallScreen && props.overlayState.dashboard.visible && (
                <Tooltip
                  title={
                    props.isEditMode
                      ? 'View user interface (E)'
                      : 'Edit user interface (E)'
                  }
                  placement="bottom-start"
                >
                  <StyledButton
                    data-cy="toggle-edit-mode-btn"
                    isSelected={props.overlayState.dashboard.visible}
                    onClick={(event) => {
                      event.stopPropagation();
                      InterfaceController.toggleDashboardInEditMode(
                        VISIBILITY_ACTION.TOGGLE,
                      );
                    }}
                  >
                    {props.isEditMode ? <CloseIcon /> : <EditIcon />}
                  </StyledButton>
                </Tooltip>
              )}

              {!smallScreen &&
                props.overlayState.dashboard.visible &&
                (props.overlayState.dashboard.fullscreen ? (
                  <Tooltip title="Shrink user interface (M)" placement="bottom">
                    <StyledButton
                      data-cy="shrink-dashboard-btn"
                      isSelected={props.overlayState.dashboard.visible}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.toggleFullscreen(VISIBILITY_ACTION.CLOSE);
                      }}
                    >
                      <CloseFullscreenIcon />
                    </StyledButton>
                  </Tooltip>
                ) : (
                  <Tooltip
                    title="Maximise user interface (M)"
                    placement="bottom"
                  >
                    <StyledButton
                      data-cy="maximise-dashboard-btn"
                      isSelected={props.overlayState.dashboard.visible}
                      onClick={(event) => {
                        event.stopPropagation();
                        props.toggleFullscreen(VISIBILITY_ACTION.OPEN);
                      }}
                    >
                      <OpenInFullIcon />
                    </StyledButton>
                  </Tooltip>
                ))}
            </Stack>
          )}
        </Box>
        {!isCollapsed && (
          <Box
            id="app-button-group"
            sx={{
              position: 'fixed',
              bottom: '8px',
              left: '8px',
              zIndex: '1300',
            }}
          >
            <SocialIcons randomMainColor={props.randomMainColor} />
          </Box>
        )}

        {/* Authentication Dialog */}
        {CLOUD_MODE && authDialogOpen && (
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setAuthDialogOpen(false)}
          >
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                width: '100%',
                maxWidth: '500px',
                maxHeight: '90dvh',
                overflowY: 'auto',
                position: 'relative',
              }}
            >
              <IconButton
                aria-label="close"
                onClick={() => setAuthDialogOpen(false)}
                sx={{
                  position: 'absolute',
                  top: 48,
                  right: 32,
                  padding: 1,
                  bgcolor: 'transparent',
                  zIndex: 1,
                  '& svg': {
                    fontSize: '18px',
                  },
                }}
                data-cy="close-auth-modal-button"
              >
                <CloseIcon />
              </IconButton>
              <Authentication />
            </Box>
          </Box>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    const { overlayState: prev } = prevProps;
    const { overlayState: next } = nextProps;

    return (
      prevProps.randomMainColor === nextProps.randomMainColor &&
      prevProps.isEditMode === nextProps.isEditMode &&
      prevProps.currentGraph?.id === nextProps.currentGraph?.id &&
      prevProps.currentGraph?.name === nextProps.currentGraph?.name &&
      compareOverlayProps(prev.dashboard, next.dashboard, [
        'visible',
        'fullscreen',
        'locked',
        'widthPercentage',
      ]) &&
      compareOverlayProps(prev.leftSide, next.leftSide, [
        'visible',
        'activeView',
      ]) &&
      compareOverlayProps(prev.rightSide, next.rightSide, ['visible'])
    );
  },
);

const compareOverlayProps = (
  prev: Record<string, any>,
  next: Record<string, any>,
  propsToCompare: string[] = [],
) => {
  return propsToCompare.every((prop) => prev[prop] === next[prop]);
};
