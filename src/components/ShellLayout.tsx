import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PPGraph from '../classes/GraphClass';
import InterfaceController from '../InterfaceController';
import { Rail } from './Rail';
import LeftRightDrawer from './LeftRightDrawer';
import DashboardColumn from './dashboard/GraphOverlayDashboard';
import { TRgba } from '../utils/color';
import { TMIconNoShadow } from '../utils/icons';
import { useIsSmallScreen } from '../utils/utils';
import { DrawerSide, IOverlay } from '../utils/interfaces';
import { SHELL_CONSTANTS } from '../utils/constants';
import { VISIBILITY_ACTION } from '../utils/constants_shared';

type ShellLayoutProps = {
  randomMainColor: string;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  isEditMode: boolean;
  appView: boolean;
  toggleAppView: (action: VISIBILITY_ACTION) => void;
  toggleFullscreen: (action: VISIBILITY_ACTION) => void;
  setDashboardWidthPercentage: (percentage: number) => void;
  setContextMenuPosition: React.Dispatch<React.SetStateAction<number[]>>;
  setIsGraphContextMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentGraph: PPGraph;
};

// The docked shell. Rail, menu panel, dashboard, canvas strip and inspector
// are siblings in one flex row over the (untouched, full-screen) pixi canvas,
// so opening a panel narrows its neighbours instead of covering them.
//
// Every column stays mounted in every state - app view only restyles them.
// That is what lets the dashboard keep its DOM node across the transition, so
// widget state, timers and running nodes survive it.
const ShellLayout: React.FunctionComponent<ShellLayoutProps> = (props) => {
  const smallScreen = useIsSmallScreen();
  const { appView, overlayState } = props;
  const isDashboardMaximised =
    overlayState[DrawerSide.DASHBOARD].visible &&
    overlayState[DrawerSide.DASHBOARD].fullscreen;

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
      <Box
        sx={{
          display: appView ? 'none' : 'flex',
          flex: 'none',
          // on small screens the panels still cover the row rather than
          // sharing it, so the rail has to stay on top of them
          position: 'relative',
          zIndex: 30,
        }}
      >
        <Rail
          randomMainColor={props.randomMainColor}
          overlayState={overlayState}
          setContextMenuPosition={props.setContextMenuPosition}
          setIsGraphContextMenuOpen={props.setIsGraphContextMenuOpen}
          isEditMode={props.isEditMode}
          toggleAppView={props.toggleAppView}
        />
      </Box>

      <LeftRightDrawer
        isLeft={true}
        hidden={appView}
        randomMainColor={props.randomMainColor}
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
      />

      <DashboardColumn
        randomMainColor={props.randomMainColor}
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
        isEditMode={props.isEditMode}
        appView={appView}
        toggleFullscreen={props.toggleFullscreen}
        setDashboardWidthPercentage={props.setDashboardWidthPercentage}
      />

      {/* the canvas strip: no background and no pointer events, it is just
          the gap the panels leave for the graph canvas to show through */}
      <Box
        data-cy="canvas-strip"
        sx={{
          // Maximising and app view leave no canvas to show, so the strip is
          // removed rather than shrunk. Merely zeroing its minimum is not
          // enough: it and the maximised dashboard both grow, so they would
          // split the free space between them and reopen the gap.
          display: appView || isDashboardMaximised ? 'none' : 'block',
          flex: '1 1 0',
          // the strip's minimum only guards DRAGGING
          minWidth: smallScreen
            ? 0
            : `${SHELL_CONSTANTS.MIN_CANVAS_STRIP_WIDTH}px`,
          position: 'relative',
          pointerEvents: 'none',
        }}
      >
        {/* the app name sits here while the dashboard is hidden; once the
            dashboard is open its breadcrumb owns the name instead */}
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
        randomMainColor={props.randomMainColor}
        overlayState={overlayState}
        updateOverlayState={props.updateOverlayState}
      />

      {/* app view is zero chrome except this - the logo is the way back out */}
      {appView && (
        <Tooltip title="Edit app (P)" placement="right">
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
              // app view is the running app, which fills the viewport with the
              // dashboard's dark background - so the logo is white here, and
              // hovering flips it the same way the rail's logo does
              '--svg-fill-color': TRgba.white().hex(),
              '& path': { transition: 'fill 0.15s ease-in-out' },
              '&:hover': {
                opacity: 1,
                backgroundColor: 'transparent',
                '--svg-fill-color': TRgba.fromString(
                  props.randomMainColor,
                ).hex(),
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
