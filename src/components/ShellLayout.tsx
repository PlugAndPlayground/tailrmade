import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PPGraph from '../classes/GraphClass';
import InterfaceController from '../InterfaceController';
import { Rail } from './Rail';
import LeftRightDrawer from './LeftRightDrawer';
import DashboardColumn from './dashboard/GraphOverlayDashboard';
import { TMIconNoShadow } from '../utils/icons';
import { useResolvedAppTheme } from '../utils/theme/store';
import { useIsSmallScreen } from '../utils/utils';
import { useIsStackLayout, useStackView } from '../utils/layoutModel';
import { BottomBar, BOTTOM_BAR_HEIGHT } from './BottomBar';
import AuthDialog from './AuthDialog';
import { LeftsideContainer } from '../containers/LeftsideContainer';
import { DashboardEditor } from './dashboard/DashboardEditor';
import { getDashboardBackground, LeftDrawerView } from '../utils/constants';
import { DrawerSide, IOverlay } from '../utils/interfaces';
import { SHELL_CONSTANTS } from '../utils/constants';
import { VISIBILITY_ACTION } from '../utils/constants_shared';

type ShellLayoutProps = {
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  isEditMode: boolean;
  appView: boolean;
  toggleAppView: (action: VISIBILITY_ACTION) => void;
  toggleMaximized: (action: VISIBILITY_ACTION) => void;
  setDashboardWidthPercentage: (percentage: number) => void;
  setContextMenuPosition: React.Dispatch<React.SetStateAction<number[]>>;
  setIsGraphContextMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentGraph: PPGraph;
};

const ShellLayout: React.FunctionComponent<ShellLayoutProps> = (props) => {
  const smallScreen = useIsSmallScreen();
  const stackLayout = useIsStackLayout();
  const stackView = useStackView();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const { appView, overlayState } = props;
  const appTokens = useResolvedAppTheme().tokens;
  const isDashboardMaximised =
    overlayState[DrawerSide.DASHBOARD].visible &&
    overlayState[DrawerSide.DASHBOARD].maximized;

  // ---- stack layout -------------------------------------------------------
  // One full-screen view at a time above a bottom bar. The rail, both drawers
  // and the dashboard column are all absent - not hidden, not narrowed, not
  // turned into sheets. Nothing overlaps, so nothing needs to negotiate.
  //
  // 'canvas' renders nothing at all: the pixi canvas is behind the whole shell
  // already, so showing it is a matter of putting nothing in front of it.
  if (stackLayout) {
    return (
      <>
        {stackView !== 'canvas' && (
          <Box
            data-cy="stack-view"
            data-stack-view={stackView}
            sx={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: 0,
              // clears the bar, so a view never renders under its own
              // navigation
              bottom: `calc(${BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: getDashboardBackground().toString(),
              pointerEvents: 'auto',
            }}
          >
            {stackView === 'ui' && (
              <DashboardEditor
                isVisible
                isEditMode={false}
                // the phone's UI view IS app view - there is no editor chrome
                // to keep, so the distinction stops existing below the line
                appView
                overlayState={overlayState}
                updateOverlayState={props.updateOverlayState}
              />
            )}
            {stackView === 'ai' && (
              <LeftsideContainer activeView={LeftDrawerView.AI} />
            )}
            {stackView === 'apps' && (
              <LeftsideContainer activeView={LeftDrawerView.GRAPHS} />
            )}
          </Box>
        )}

        <BottomBar onRequestSignIn={() => setAuthDialogOpen(true)} />
        <AuthDialog
          open={authDialogOpen}
          onClose={() => setAuthDialogOpen(false)}
        />
      </>
    );
  }

  // the row must not swallow pointer events - the canvas behind it has to
  // stay interactive through the canvas strip
  return (
    <Box
      data-cy="shell-layout"
      sx={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'stretch',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {!appView && (
        <Box
          sx={{
            display: 'flex',
            flex: 'none',
            position: 'relative',
            zIndex: 30,
          }}
        >
          <Rail
            overlayState={overlayState}
            setContextMenuPosition={props.setContextMenuPosition}
            setIsGraphContextMenuOpen={props.setIsGraphContextMenuOpen}
            isEditMode={props.isEditMode}
            toggleAppView={props.toggleAppView}
          />
        </Box>
      )}

      <LeftRightDrawer
        isLeft={true}
        hidden={appView}
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
      />

      <DashboardColumn
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
        isEditMode={props.isEditMode}
        appView={appView}
        toggleMaximized={props.toggleMaximized}
        setDashboardWidthPercentage={props.setDashboardWidthPercentage}
      />

      <Box
        data-cy="canvas-strip"
        sx={{
          display: appView || isDashboardMaximised ? 'none' : 'block',
          flex: '1 1 0',
          minWidth: smallScreen
            ? 0
            : `${SHELL_CONSTANTS.MIN_CANVAS_STRIP_WIDTH}px`,
          position: 'relative',
          pointerEvents: 'none',
        }}
      >
        {props.currentGraph && !overlayState[DrawerSide.DASHBOARD].visible && (
          <Box
            data-cy="shell-app-name"
            sx={{
              position: 'absolute',
              top: '13px',
              left: '8px',
              color: 'primary.main',
              fontSize: '14px',
              fontWeight: 500,
              userSelect: 'none',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            onClick={() => {
              InterfaceController.setShowGraphEdit(true);
            }}
          >
            {props.currentGraph.name}
          </Box>
        )}
      </Box>

      <LeftRightDrawer
        isLeft={false}
        hidden={appView}
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
      />

      {appView && (
        <Tooltip title="Back to Build view (T)" placement="right">
          <IconButton
            data-cy="app-view-exit-button"
            size="small"
            onClick={() => props.toggleAppView(VISIBILITY_ACTION.CLOSE)}
            sx={{
              position: 'fixed',
              top: '4px',
              left: '8px',
              zIndex: 1310,
              padding: 0,
              width: '32px',
              borderRadius: '4px',
              pointerEvents: 'auto',
              transition: 'opacity 0.15s ease-in-out',
              '--svg-fill-color': appTokens['text.primary'],
              '& path': { transition: 'fill 0.15s ease-in-out' },
              '&:hover': {
                opacity: 1,
                backgroundColor: 'transparent',
                '--svg-fill-color': appTokens.primary,
              },
            }}
          >
            <TMIconNoShadow />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default ShellLayout;
