import React, { useEffect, useReducer } from 'react';
import { Box } from '@mui/material';
import {
  getDashboardWidth,
  getShellAvailableWidth,
  useIsSmallScreen,
  widthToPercentage,
} from '../../utils/utils';
import {
  DRAWER_CONSTANTS,
  getDashboardBackground,
} from '../../utils/constants';
import { DrawerSide, IOverlay } from '../../utils/interfaces';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import { DashboardEditor } from './DashboardEditor';
import { DashboardHeader } from './DashboardHeader';
import { ResizeHandle } from '../LeftRightDrawer';
import { useDragResize } from '../useDragResize';

type DashboardColumnProps = {
  randomMainColor: string;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  isEditMode: boolean;
  appView: boolean;
  toggleFullscreen: (action: VISIBILITY_ACTION) => void;
  setDashboardWidthPercentage: (percentage: number) => void;
};

// The dashboard as a docked, resizable column of the shell - no longer a
// panel floating over its neighbours. Dragging its inner edge sets the width;
// the canvas behind shows through whatever is left.
//
// The column is ALWAYS mounted, in every state: hidden collapses it to zero
// width and app view stretches it to the full viewport, but neither swaps the
// tree. That is what keeps widget state, timers and running nodes alive
// across the app view transition.
const DashboardColumn: React.FunctionComponent<DashboardColumnProps> = ({
  randomMainColor,
  overlayState,
  updateOverlayState,
  isEditMode,
  appView,
  toggleFullscreen,
  setDashboardWidthPercentage,
}) => {
  const smallScreen = useIsSmallScreen();

  // the column's width is derived from window.innerWidth, so a window resize
  // has to re-render it - unlike the percentage width it replaced, the
  // browser cannot recompute this one on its own
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', forceUpdate);
    return () => window.removeEventListener('resize', forceUpdate);
  }, []);

  const isVisible = overlayState[DrawerSide.DASHBOARD].visible;
  const isFullscreen = overlayState[DrawerSide.DASHBOARD].fullscreen;

  const handleMouseDown = useDragResize({
    isLeft: true,
    getStartWidth: () => getDashboardWidth(overlayState),
    onWidth: (width) => {
      const newWidth = Math.max(width, DRAWER_CONSTANTS.MIN_DRAWER_WIDTH);
      // the stored percentage is of the space the dashboard shares with the
      // canvas strip, so a drag means the same split on any screen size
      const newWidthPercentage = Math.min(
        widthToPercentage(newWidth, getShellAvailableWidth(overlayState)),
        DRAWER_CONSTANTS.MAX_DASHBOARD_WIDTH_PERCENTAGE,
      );
      setDashboardWidthPercentage(Math.floor(newWidthPercentage));
    },
  });

  // maximised: let flex hand over everything the row has left, rather than
  // computing it from window.innerWidth - that measurement disagrees with the
  // row's own width whenever a classic scrollbar is present, and the
  // difference shows up as a strip of canvas that should not be there
  const isMaximised = isVisible && isFullscreen && !appView && !smallScreen;

  // app view takes the whole viewport (the rail is gone there, so there is no
  // column left of it); otherwise the column is as wide as the clamped share
  // of the shell's available space, or zero while hidden
  const columnWidth = appView
    ? '100vw'
    : !isVisible
      ? 0
      : smallScreen
        ? '100%'
        : `${getDashboardWidth(overlayState)}px`;

  // what the content is laid out at, whether or not the column currently
  // shows it
  const contentWidth =
    appView || isMaximised
      ? '100%'
      : smallScreen
        ? '100vw'
        : `${getDashboardWidth(overlayState)}px`;

  // small screens keep the pre-dock behaviour: the dashboard covers
  // everything rather than taking a share of the row
  const overlayOnSmallScreen = smallScreen && isVisible && !appView;

  return (
    <Box
      data-cy="dashboard-column"
      sx={{
        flex: isMaximised ? '1 1 auto' : 'none',
        width: isMaximised ? 'auto' : columnWidth,
        height: '100dvh',
        position: overlayOnSmallScreen || appView ? 'absolute' : 'relative',
        ...(overlayOnSmallScreen || appView
          ? { top: 0, left: 0, zIndex: appView ? 20 : 8 }
          : {}),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background:
          isVisible || appView
            ? getDashboardBackground(randomMainColor).toString()
            : 'transparent',
        boxShadow:
          isVisible && !appView ? '0 0 24px rgba(0, 0, 0, 0.5)' : 'none',
        pointerEvents: isVisible || appView ? 'auto' : 'none',
        transition: 'width 0.225s cubic-bezier(0, 0, 0.2, 1)',
      }}
    >
      {/* the drag handle sits on the dashboard's inner edge; maximised and
          app view have no width to drag */}
      {isVisible && !isFullscreen && !appView && !smallScreen && (
        <ResizeHandle isLeft={true} onPointerDown={handleMouseDown} />
      )}

      {/* The content keeps its real width even while the column is collapsed
          to zero, so hiding the dashboard clips it instead of reflowing every
          widget down to 0px and back. */}
      <Box
        sx={{
          width: contentWidth,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* zero chrome in app view - the app is the whole thing there */}
        {!appView && (
          <DashboardHeader
            isEditMode={isEditMode}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
          />
        )}

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <DashboardEditor
            isVisible={isVisible || appView}
            isEditMode={isEditMode}
            appView={appView}
            randomMainColor={randomMainColor}
            overlayState={overlayState}
            updateOverlayState={updateOverlayState}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default DashboardColumn;
