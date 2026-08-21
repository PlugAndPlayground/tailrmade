import React, { useState, useEffect } from 'react';
import { TRgba } from '../utils/color';
import { Box, IconButton, Tooltip } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { LeftsideContainer } from '../containers/LeftsideContainer';
import { RightSideContainer } from '../containers/RightSideContainer';
import { useIsSmallScreen } from '../utils/utils';
import {
  DRAWER_CONSTANTS,
  getDrawerBackground,
  LeftDrawerView,
  RightDrawerView,
  SHELL_CONSTANTS,
} from '../utils/constants';
import { DrawerSide, IOverlay } from '../utils/interfaces';
import { useDragResize } from './useDragResize';
import PPGraph from '../classes/GraphClass';
import * as styles from '../utils/style.module.css';

export const ResizeHandle = ({ isLeft, onPointerDown }) => {
  return (
    <Box
      onPointerDown={onPointerDown}
      className={`${styles.dragger} ${isLeft ? styles.draggerLeft : styles.draggerRight}`}
      sx={{
        cursor: 'col-resize',
        '&:hover': {
          backgroundColor: 'rgba(255,255,255,0.2)',
        },
      }}
    />
  );
};

// Types
interface LeftRightDrawerProps {
  isLeft: boolean;
  // app view hides every panel; kept mounted so nothing remounts on the way
  // back out
  hidden: boolean;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
  randomMainColor: string;
}

// A docked column of the shell: the menu panel (left) or the inspector
// (right). Both narrow their neighbours rather than overlaying them - only
// on small screens do they still take over the whole width, as before.
const LeftRightDrawer: React.FC<LeftRightDrawerProps> = ({
  isLeft,
  hidden,
  overlayState,
  updateOverlayState,
  randomMainColor,
}) => {
  // State
  const [nodeFilter, setNodeFilter] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState('nodes');
  const [graphFilterText, setGraphFilterText] = useState('');
  const [selectedNodes, setSelectedNodes] = useState(
    PPGraph?.currentGraph?.selection?.selectedNodes || [],
  );

  // Hooks
  const smallScreen = useIsSmallScreen();

  const side = isLeft ? DrawerSide.LEFT : DrawerSide.RIGHT;
  const drawerWidth = overlayState[side].width;
  const activeView = overlayState[side].activeView;
  const isOpen = overlayState[side].visible;

  const handleMouseDown = useDragResize({
    isLeft,
    getStartWidth: () => drawerWidth,
    onWidth: (width) => {
      const newWidth = Math.min(
        Math.max(width, DRAWER_CONSTANTS.MIN_DRAWER_WIDTH),
        DRAWER_CONSTANTS.MAX_DRAWER_WIDTH,
      );
      updateOverlayState({
        [side]: {
          ...overlayState[side],
          visible: true,
          width: Math.floor(newWidth),
        },
      });
    },
  });

  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.SelectionChanged,
      setSelectedNodes,
    );

    return () => {
      InterfaceController.removeListener(listenerId);
    };
  }, []);

  // Render drawer content based on the view
  const renderDrawerContent = () => {
    if (isLeft) {
      return (
        <LeftsideContainer
          activeView={(activeView as LeftDrawerView) ?? LeftDrawerView.GRAPHS}
          randomMainColor={randomMainColor}
        />
      );
    }

    return (
      <RightSideContainer
        randomMainColor={randomMainColor}
        rightDrawerView={
          (activeView as RightDrawerView) ?? RightDrawerView.GRAPH
        }
        setRightDrawerView={(view) =>
          InterfaceController.setRightDrawerView(view)
        }
        selectedNodes={selectedNodes}
        nodeFilter={nodeFilter}
        setNodeFilter={setNodeFilter}
        graphFilter={graphFilter}
        setGraphFilter={setGraphFilter}
        graphFilterText={graphFilterText}
        setGraphFilterText={setGraphFilterText}
      />
    );
  };

  const backgroundColor = getDrawerBackground(randomMainColor);

  // small screens keep the pre-dock behaviour: the panel covers everything
  // instead of taking a share of the row
  const overlayOnSmallScreen = smallScreen && isOpen;

  return (
    <>
      <Box
        data-cy={isLeft ? 'menu-panel-column' : 'inspector-column'}
        sx={{
          display: hidden ? 'none' : 'block',
          flex: 'none',
          width: isOpen ? (smallScreen ? '100%' : `${drawerWidth}px`) : 0,
          height: '100dvh',
          position: overlayOnSmallScreen ? 'absolute' : 'relative',
          ...(overlayOnSmallScreen
            ? { top: 0, left: 0, right: 0, zIndex: 10 }
            : {}),
          // While the panel is docked the rail is its neighbour and takes its
          // own width out of the row. Overlaying, the panel spans the whole
          // row and the rail (zIndex 30) draws on top of it, so the content
          // has to be pushed clear of it by hand.
          boxSizing: 'border-box',
          paddingLeft: overlayOnSmallScreen
            ? `${SHELL_CONSTANTS.RAIL_WIDTH}px`
            : 0,
          background: isOpen ? backgroundColor.toString() : 'transparent',
          overflow: 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'width 0.225s cubic-bezier(0, 0, 0.2, 1)',
        }}
      >
        {isOpen && (
          <>
            <ResizeHandle isLeft={isLeft} onPointerDown={handleMouseDown} />
            {/* pinned to the panel's own width so the content does not reflow
                while the column animates open or closed */}
            <Box
              sx={{
                width: smallScreen ? '100%' : `${drawerWidth}px`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {renderDrawerContent()}
            </Box>
          </>
        )}
      </Box>

      {!isLeft && !smallScreen && !hidden && (
        <Tooltip title="Open inspector (3)" placement="top-end">
          <IconButton
            data-cy="right-drawer-toggle-btn"
            onClick={() =>
              InterfaceController.toggleRightSideDrawer(
                VISIBILITY_ACTION.TOGGLE,
              )
            }
            sx={{
              position: 'fixed',
              right: isOpen ? `${drawerWidth}px` : '0',
              top: '144px',
              transform: 'translateY(-50%)',
              zIndex: 5,
              width: isOpen ? '24px' : '32px',
              backgroundColor: backgroundColor.toString(),
              borderRadius: '4px 0 0 4px',
              boxShadow: '0px 2px 4px rgba(0,0,0,0.2)',
              pointerEvents: 'auto',
              '&:hover': {
                backgroundColor: TRgba.fromString(randomMainColor)
                  .darken(0.7)
                  .toString(),
              },
              transition: 'right 0.225s cubic-bezier(0, 0, 0.2, 1)',
            }}
            size="small"
          >
            {isOpen ? <ChevronRightIcon /> : <TuneIcon />}
          </IconButton>
        </Tooltip>
      )}
    </>
  );
};

export default React.memo(LeftRightDrawer);
