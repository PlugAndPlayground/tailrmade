import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TRgba } from '../utils/color';
import { Box, Drawer, IconButton, Tooltip } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { LeftsideContainer } from '../containers/LeftsideContainer';
import { RightSideContainer } from '../containers/RightSideContainer';
import { useIsSmallScreen } from '../utils/utils';
import {
  DRAWER_CONSTANTS,
  DrawerView,
  LeftDrawerView,
  RightDrawerView,
} from '../utils/constants';
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
  drawerWidth: number;
  setDrawerWidth: (width: number) => void;
  toggle: boolean;
  // the active sub-view for this drawer, read from overlay state
  activeView?: DrawerView;
  randomMainColor: string;
}

// Main Component
const LeftRightDrawer: React.FC<LeftRightDrawerProps> = ({
  isLeft,
  drawerWidth,
  setDrawerWidth,
  toggle,
  activeView,
  randomMainColor,
}) => {
  // State
  const [nodeFilter, setNodeFilter] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState('nodes');
  const [graphFilterText, setGraphFilterText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState(
    PPGraph?.currentGraph?.selection?.selectedNodes || [],
  );

  // Refs
  const drawerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // Hooks
  const smallScreen = useIsSmallScreen();

  const resizeHandler = useRef({
    isResizing: false,
    startWidth: 0,
    startX: 0,
  });

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!resizeHandler.current.isResizing) return;

      // Cancel previous animation frame if it exists
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Request new animation frame
      animationFrameRef.current = requestAnimationFrame(() => {
        const delta = isLeft
          ? e.clientX - resizeHandler.current.startX
          : resizeHandler.current.startX - e.clientX;

        const newWidth = Math.min(
          Math.max(
            resizeHandler.current.startWidth + delta,
            DRAWER_CONSTANTS.MIN_DRAWER_WIDTH,
          ),
          DRAWER_CONSTANTS.MAX_DRAWER_WIDTH,
        );

        const truncatedWidth = Math.floor(newWidth);
        setDrawerWidth(truncatedWidth);
      });
    },
    [isLeft, setDrawerWidth],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!resizeHandler.current.isResizing) return;

      resizeHandler.current.isResizing = false;
      setIsResizing(false);

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, setDrawerWidth, drawerWidth],
  );

  const handleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      resizeHandler.current = {
        isResizing: true,
        startWidth: drawerWidth,
        startX: e.clientX,
      };

      setIsResizing(true);

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [handlePointerMove, handlePointerUp, drawerWidth],
  );

  // Use cleanup effect for safety
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

  useEffect(() => {
    if (toggle) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [toggle]);

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
        rightDrawerView={(activeView as RightDrawerView) ?? RightDrawerView.GRAPH}
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

  const backgroundColor = TRgba.fromString(randomMainColor).darken(0.8);
  return (
    <>
      <Drawer
        anchor={isLeft ? 'left' : 'right'}
        variant="persistent"
        hideBackdrop={true}
        open={isOpen}
        ModalProps={{
          keepMounted: true,
        }}
        slotProps={{
          paper: {
            elevation: 0,
            style: {
              zIndex: isLeft ? 10 : 4,
              width: smallScreen ? '100%' : drawerWidth,
              border: 0,
              background: backgroundColor.toString(),
              height: '100dvh',
              paddingLeft: !isLeft && smallScreen ? '40px' : undefined,
            },
            ref: drawerRef,
          },
        }}
      >
        <ResizeHandle isLeft={isLeft} onPointerDown={handleMouseDown} />
        {isOpen && renderDrawerContent()}
      </Drawer>

      {!isLeft && !smallScreen && (
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
              '&:hover': {
                backgroundColor: TRgba.fromString(randomMainColor)
                  .darken(0.7)
                  .toString(),
              },
              transition: 'right 0.225s cubic-bezier(0, 0, 0.2, 1)', // transform 225ms cubic-bezier(0, 0, 0.2, 1)
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

export default React.memo(LeftRightDrawer, (prevProps, nextProps) => {
  return (
    prevProps.drawerWidth === nextProps.drawerWidth &&
    prevProps.toggle === nextProps.toggle &&
    prevProps.activeView === nextProps.activeView
  );
});
