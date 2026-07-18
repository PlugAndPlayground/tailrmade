import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TRgba } from '../../utils/color';
import { Drawer } from '@mui/material';
import {
  useIsSmallScreen,
  percentageToWidth,
  widthToPercentage,
} from '../../utils/utils';
import { DRAWER_CONSTANTS, UNSET_VALUE } from '../../utils/constants';
import { DrawerSide, IOverlay } from '../../utils/interfaces';
import { DashboardEditor } from './DashboardEditor';
import { ResizeHandle } from '../LeftRightDrawer';

type GraphOverlayDashboardProps = {
  randomMainColor: string;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  isEditMode: boolean;
  toggle: boolean;
  setDrawerWidthPercentage: (width: number) => void;
  drawerWidthPercentage: number;
};

export const DASHBOARDPADDINGLEFT = 48;

const GraphOverlayDashboard: React.FunctionComponent<
  GraphOverlayDashboardProps
> = ({
  randomMainColor,
  overlayState,
  updateOverlayState,
  isEditMode,
  toggle,
  setDrawerWidthPercentage,
  drawerWidthPercentage,
}) => {
  const [dashboardLeft, setDashboardLeft] = useState(
    overlayState.leftSide.visible ? overlayState.leftSide.width : 0,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  const smallScreen = useIsSmallScreen();

  const resizeHandler = useRef({
    isResizing: false,
    startWidth: 0,
    startX: 0,
  });

  useEffect(() => {
    if (toggle) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [toggle]);

  useEffect(() => {
    setDashboardLeft(
      overlayState[DrawerSide.LEFT].visible
        ? overlayState[DrawerSide.LEFT].width
        : 0,
    );
  }, [
    overlayState[DrawerSide.LEFT].visible,
    overlayState[DrawerSide.LEFT].width,
    overlayState[DrawerSide.DASHBOARD].visible,
  ]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!resizeHandler.current.isResizing) return;

      // Cancel previous animation frame if it exists
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Request new animation frame
      animationFrameRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - resizeHandler.current.startX;

        const newWidth = Math.max(
          resizeHandler.current.startWidth + delta,
          DRAWER_CONSTANTS.MIN_DRAWER_WIDTH,
        );

        const newWidthPercentage = Math.min(
          widthToPercentage(newWidth),
          DRAWER_CONSTANTS.MAX_DASHBOARD_WIDTH_PERCENTAGE,
        );
        const truncatedWidthPercentage = Math.floor(newWidthPercentage);
        setDrawerWidthPercentage(truncatedWidthPercentage);
      });
    },
    [setDrawerWidthPercentage],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!resizeHandler.current.isResizing) return;

      resizeHandler.current.isResizing = false;
      setIsResizing(false);

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, setDrawerWidthPercentage, drawerWidthPercentage],
  );

  const handleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      resizeHandler.current = {
        isResizing: true,
        startWidth: percentageToWidth(drawerWidthPercentage),
        startX: e.clientX,
      };

      setIsResizing(true);

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, drawerWidthPercentage],
  );

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Calculate padding and width before rendering
  const shouldHavePadding = !(
    (smallScreen ||
      overlayState[DrawerSide.LEFT].visible ||
      overlayState[DrawerSide.DASHBOARD].fullscreen) &&
    !isEditMode
  );
  const paddingLeftValue = `${shouldHavePadding ? DASHBOARDPADDINGLEFT : 0}px`;

  const shouldUseFullWidth =
    smallScreen || overlayState[DrawerSide.DASHBOARD].fullscreen;
  const drawerWidth = `${shouldUseFullWidth ? '100' : drawerWidthPercentage}%`;

  return (
    <Drawer
      anchor={'left'}
      variant="persistent"
      hideBackdrop={true}
      open={isOpen}
      slotProps={{
        paper: {
          elevation: 0,
          style: {
            position: 'absolute',
            marginLeft: `${dashboardLeft}px`,
            paddingLeft: paddingLeftValue,
            zIndex: 5,
            height: '100dvh !important',
            width: drawerWidth,
            background: TRgba.fromString(randomMainColor)
              .darken(0.85)
              .toString(),
            transition: 'margin-left 0.225s ease-in-out',
            // width: '100%',
            border: 0,
            boxShadow: '0 0 24px rgba(0, 0, 0, 0.5)',
            left: UNSET_VALUE,
          },
          ref: drawerRef,
        },
      }}
    >
      {!overlayState[DrawerSide.DASHBOARD].fullscreen && (
        <ResizeHandle isLeft={true} onPointerDown={handleMouseDown} />
      )}
      <DashboardEditor
        isVisible={overlayState[DrawerSide.DASHBOARD].visible}
        isEditMode={isEditMode}
        randomMainColor={randomMainColor}
        overlayState={overlayState}
        updateOverlayState={updateOverlayState}
      />
    </Drawer>
  );
};

export default GraphOverlayDashboard;
