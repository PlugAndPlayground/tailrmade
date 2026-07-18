import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import LeftRightDrawer from './LeftRightDrawer';
import { DrawerSide, IOverlay } from '../utils/interfaces';

type GraphOverlayDrawerProps = {
  randomMainColor: string;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  disableHoverOpen: boolean;
};

type DrawerState = {
  width: number;
  visible: boolean;
};

const GraphOverlayDrawer: React.FC<GraphOverlayDrawerProps> = ({
  randomMainColor,
  overlayState,
  updateOverlayState,
  disableHoverOpen,
}) => {
  const [drawerStates, setDrawerStates] = useState<[DrawerState, DrawerState]>([
    {
      width: overlayState.leftSide.width,
      visible: overlayState.leftSide.visible,
    },
    {
      width: overlayState.rightSide.width,
      visible: overlayState.rightSide.visible,
    },
  ]);

  useEffect(() => {
    setDrawerStates([
      {
        width: overlayState.leftSide.width,
        visible: overlayState.leftSide.visible,
      },
      {
        width: overlayState.rightSide.width,
        visible: overlayState.rightSide.visible,
      },
    ]);
  }, [overlayState]);

  const updateDrawerWidth = useCallback(
    (isLeft: boolean) => (width: number) => {
      const side = isLeft ? DrawerSide.LEFT : DrawerSide.RIGHT;
      updateOverlayState({
        [side]: {
          ...overlayState[side],
          visible: true,
          width,
        },
      });
    },
    [overlayState, updateOverlayState],
  );

  return (
    <Box>
      {[true, false].map((isLeft, index) => (
        <LeftRightDrawer
          key={isLeft ? 'left' : 'right'}
          isLeft={isLeft}
          drawerWidth={drawerStates[index].width}
          setDrawerWidth={updateDrawerWidth(isLeft)}
          toggle={drawerStates[index].visible}
          activeView={
            isLeft
              ? overlayState.leftSide.activeView
              : overlayState.rightSide.activeView
          }
          randomMainColor={randomMainColor}
        />
      ))}
    </Box>
  );
};

export default GraphOverlayDrawer;
