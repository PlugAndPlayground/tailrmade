import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryIcon from '@mui/icons-material/History';
import MenuIcon from '@mui/icons-material/Menu';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonIcon from '@mui/icons-material/Person';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';
import ShareIcon from '@mui/icons-material/Share';
import PPStorage from '../PPStorage';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import Authentication from '../firebase/Authentication';
import SocialIcons from './SocialIcons';
import ShareContextMenu from './contextmenus/ShareContextMenu';
import { StyledButton } from './StyledButton';
import { BackendGateway } from '../services/BackendGateway';
import { CLOUD_MODE } from '../services/shared-types';
import { TRgba } from '../utils/color';
import { TMIconNoShadow } from '../utils/icons';
import { useIsSmallScreen } from '../utils/utils';
import { IOverlay } from '../utils/interfaces';
import {
  CONTEXTMENU_GRAPH_HEIGHT,
  CONTEXTMENU_WIDTH,
  getDashboardBackground,
  getDrawerBackground,
  LeftDrawerView,
  SHELL_CONSTANTS,
} from '../utils/constants';
import { VISIBILITY_ACTION } from '../utils/constants_shared';

type RailProps = {
  randomMainColor: string;
  overlayState: IOverlay;
  setContextMenuPosition: React.Dispatch<React.SetStateAction<number[]>>;
  setIsGraphContextMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isEditMode: boolean;
  toggleAppView: (action: VISIBILITY_ACTION) => void;
};

// The rail is the leftmost docked column. It never overlaps its neighbours,
// so everything it owns has to fit inside RAIL_WIDTH.
export const Rail: React.FunctionComponent<RailProps> = React.memo((props) => {
  const theme = useTheme();
  const smallScreen = useIsSmallScreen();

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

  // The rail has no colour of its own: it takes the background of whichever
  // panel is docked beside it, so the two columns read as one surface rather
  // than as a strip laid over the canvas. The menu panel wins when both are
  // open - it is the one physically adjacent (the dashboard is a column
  // further right), and the two use slightly different darkenings.
  const railBackground = props.overlayState.leftSide.visible
    ? getDrawerBackground(props.randomMainColor)
    : props.overlayState.dashboard.visible
      ? getDashboardBackground(props.randomMainColor)
      : null;

  // On that dark background the icons that have no background of their own -
  // the logo and the social links - would be primary-on-near-black, so they
  // flip to white. The square buttons bring their own white background and
  // stay legible either way, which is why they are left alone.
  const iconColor = railBackground
    ? TRgba.white().hex()
    : TRgba.fromString(props.randomMainColor).hex();

  // Hovering the logo shows the other of those two colours, so the feedback is
  // the logo itself flipping rather than a box appearing behind it. Same idea
  // in app view - see ShellLayout's exit button.
  const logoHoverColor = railBackground
    ? TRgba.fromString(props.randomMainColor).hex()
    : TRgba.fromString(props.randomMainColor).darken(0.6).toString();

  const posX = smallScreen ? 8 : window.innerWidth / 2 - CONTEXTMENU_WIDTH / 2;
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

    return () => {
      InterfaceController.removeListener(listenerId);
    };
  }, []);

  return (
    <>
      <Box
        data-cy="shell-rail"
        sx={{
          '--svg-fill-color': iconColor,
          flex: 'none',
          width: `${SHELL_CONSTANTS.RAIL_WIDTH}px`,
          height: '100dvh',
          pt: '4px',
          pl: '8px',
          boxSizing: 'border-box',
          background: railBackground?.toString() ?? 'transparent',
          transition: 'background 0.225s cubic-bezier(0, 0, 0.2, 1)',
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
        }}
      >
        <Stack spacing={0.5} alignItems="left">
          {/* the logo is the way into and back out of app view */}
          <Tooltip
            title="Open app view (T)"
            placement="right"
            disableInteractive
          >
            <IconButton
              data-cy="toggle-app-button"
              size="small"
              onClick={() => props.toggleAppView(VISIBILITY_ACTION.TOGGLE)}
              sx={{
                padding: 0,
                width: '32px',
                borderRadius: '4px',
                '--svg-fill-color': iconColor,
                '& path': { transition: 'fill 0.15s ease-in-out' },
                '&:hover': {
                  // the logo flipping colour IS the hover state, so nothing
                  // appears behind it
                  backgroundColor: 'transparent',
                  '--svg-fill-color': logoHoverColor,
                },
              }}
            >
              <TMIconNoShadow />
            </IconButton>
          </Tooltip>

          {/* show/hide the dashboard - stays reachable while it is hidden,
              which is why it lives here and not in the dashboard's header */}
          <Tooltip title="Show/hide user interface (2)" placement="right">
            <StyledButton
              data-cy="toggle-dashboard-btn"
              isSelected={props.overlayState.dashboard.visible}
              onClick={openDashboardClick}
            >
              <DashboardIcon />
            </StyledButton>
          </Tooltip>
          <Divider sx={{ width: '32px', my: 0.5 }} />

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
                        currentUser.displayName || currentUser.email || 'User'
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
                props.overlayState.leftSide.activeView === LeftDrawerView.GRAPHS
              }
              onClick={() =>
                InterfaceController.toggleLeftSideDrawer(
                  VISIBILITY_ACTION.TOGGLE,
                  LeftDrawerView.GRAPHS,
                )
              }
            >
              <MenuIcon />
            </StyledButton>
          </Tooltip>
          <Divider sx={{ width: '32px', my: 0.5 }} />
          {smallScreen ? (
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
          ) : (
            <>
              <Tooltip title="Open AI assistant" placement="right">
                <StyledButton
                  data-cy="aiButton"
                  isSelected={
                    props.overlayState.leftSide.visible &&
                    props.overlayState.leftSide.activeView === LeftDrawerView.AI
                  }
                  onClick={() => {
                    InterfaceController.toggleLeftSideDrawer(
                      VISIBILITY_ACTION.TOGGLE,
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
                      VISIBILITY_ACTION.TOGGLE,
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
                  onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
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
        </Stack>

        {!smallScreen && (
          <Box sx={{ mt: 'auto', pb: 1 }}>
            <SocialIcons
              randomMainColor={props.randomMainColor}
              iconColor={iconColor}
            />
          </Box>
        )}
      </Box>

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
            pointerEvents: 'auto',
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
});

Rail.displayName = 'Rail';
