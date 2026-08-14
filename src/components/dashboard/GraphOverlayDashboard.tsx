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
  toggleMaximized: (action: VISIBILITY_ACTION) => void;
  setDashboardWidthPercentage: (percentage: number) => void;
};

const DashboardColumn: React.FunctionComponent<DashboardColumnProps> = ({
  randomMainColor,
  overlayState,
  updateOverlayState,
  isEditMode,
  appView,
  toggleMaximized,
  setDashboardWidthPercentage,
}) => {
  const smallScreen = useIsSmallScreen();

  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    window.addEventListener('resize', forceUpdate);
    return () => window.removeEventListener('resize', forceUpdate);
  }, []);

  const isVisible = overlayState[DrawerSide.DASHBOARD].visible;
  const isMaximized = overlayState[DrawerSide.DASHBOARD].maximized;

  const handleMouseDown = useDragResize({
    isLeft: true,
    getStartWidth: () => getDashboardWidth(overlayState),
    onWidth: (width) => {
      const newWidth = Math.max(width, DRAWER_CONSTANTS.MIN_DRAWER_WIDTH);
      const newWidthPercentage = Math.min(
        widthToPercentage(newWidth, getShellAvailableWidth(overlayState)),
        DRAWER_CONSTANTS.MAX_DASHBOARD_WIDTH_PERCENTAGE,
      );
      setDashboardWidthPercentage(Math.floor(newWidthPercentage));
    },
  });

  const isMaximised = isVisible && isMaximized && !appView && !smallScreen;

  const columnWidth = appView
    ? '100vw'
    : !isVisible
      ? 0
      : smallScreen
        ? '100%'
        : `${getDashboardWidth(overlayState)}px`;

  const contentWidth =
    appView || isMaximised
      ? '100%'
      : smallScreen
        ? '100vw'
        : `${getDashboardWidth(overlayState)}px`;

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
      {isVisible && !isMaximized && !appView && !smallScreen && (
        <ResizeHandle isLeft={true} onPointerDown={handleMouseDown} />
      )}

      <Box
        sx={{
          width: contentWidth,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {!appView && (
          <DashboardHeader
            isEditMode={isEditMode}
            isMaximized={isMaximized}
            toggleMaximized={toggleMaximized}
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
