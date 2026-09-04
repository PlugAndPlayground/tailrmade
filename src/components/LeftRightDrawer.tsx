import React, { useState, useEffect } from 'react';
import { TRgba } from '../utils/color';
import {
  Box,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { LeftsideContainer } from '../containers/LeftsideContainer';
import { RightSideContainer } from '../containers/RightSideContainer';
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
import { MAIN_COLOR } from '../utils/constants';

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

// How much of the screen a sheet takes, as a fraction of the window - a
// fraction rather than a pixel height so it survives a rotation, and so the
// grabber's drag has something resolution-independent to move.
//
// The two snap positions are what the grabber TAPS between; dragging it puts
// the sheet anywhere in [MIN, MAX]. Both are needed: the panels are lists and
// forms read top-down, so "show me more" is usually a tap - but how much more
// depends on the panel, the phone and the row you are looking at, which only a
// drag can express.
const clampSheet = (fraction: number): number =>
  Math.min(SHEET_MAX, Math.max(SHEET_MIN, fraction));

const SHEET_PEEK = 0.62;
const SHEET_EXPANDED = 0.88;
const SHEET_MIN = 0.25;
const SHEET_MAX = 0.92;

// The two panels want different heights - a node list is worth more of the
// screen than an inspector you are reading against the canvas - and which is
// right depends on the phone, so the dragged height is remembered per side.
// Session, not local: it belongs to this sitting, like the device preview mode.
const sheetHeightKey = (isLeft: boolean): string =>
  `tm-sheet-height-${isLeft ? 'left' : 'right'}`;

const loadSheetFraction = (isLeft: boolean): number => {
  try {
    const stored = Number(sessionStorage.getItem(sheetHeightKey(isLeft)));
    if (Number.isFinite(stored) && stored > 0) {
      return clampSheet(stored);
    }
  } catch {
    // sessionStorage unavailable - fall through to the default
  }
  return SHEET_PEEK;
};

const saveSheetFraction = (isLeft: boolean, fraction: number): void => {
  try {
    sessionStorage.setItem(sheetHeightKey(isLeft), String(fraction));
  } catch {
    // non-fatal - the height just won't survive a reload
  }
};

// below this the press was a tap, not a drag - a finger on a grabber wanders
const SHEET_TAP_SLOP_PX = 4;

/**
 * Whether the side panels should render as bottom sheets rather than columns.
 *
 * Below md the docked layout stops working. A panel has a 240px minimum, so on
 * a 768px tablet one open panel leaves a canvas strip barely wider than a node
 * and two leave nothing at all; on a phone the panel simply covered the canvas,
 * which is no better - you cannot inspect a node you cannot see. A sheet keeps
 * both on screen at once, which is the whole point of an inspector.
 *
 * md rather than sm because this is about the SHAPE of the window, not about
 * being a phone: a portrait tablet has the same problem as a phone here, and it
 * is exactly the device this is meant to be comfortable on.
 */
export const useBottomSheetPanels = (): boolean => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
};

// Types
interface LeftRightDrawerProps {
  isLeft: boolean;
  // app view hides every panel; kept mounted so nothing remounts on the way
  // back out
  hidden: boolean;
  overlayState: IOverlay;
  updateOverlayState: (newState: Partial<IOverlay>) => void;
}

// A docked column of the shell: the menu panel (left) or the inspector
// (right). Both narrow their neighbours rather than overlaying them.
//
// Below the md breakpoint they stop being columns at all and become bottom
// sheets - see useBottomSheetPanels.
const LeftRightDrawer: React.FC<LeftRightDrawerProps> = ({
  isLeft,
  hidden,
  overlayState,
  updateOverlayState,
}) => {
  // State
  const [nodeFilter, setNodeFilter] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState('nodes');
  const [graphFilterText, setGraphFilterText] = useState('');
  const [selectedNodes, setSelectedNodes] = useState(
    PPGraph?.currentGraph?.selection?.selectedNodes || [],
  );

  // Hooks
  const bottomSheet = useBottomSheetPanels();
  // a sheet is short and the panels below it are long, so how tall it should be
  // is the user's call, not a constant
  const [sheetFraction, setSheetFraction] = useState(() =>
    loadSheetFraction(isLeft),
  );
  const [sheetDragging, setSheetDragging] = useState(false);

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
        />
      );
    }

    return (
      <RightSideContainer
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

  const backgroundColor = getDrawerBackground();

  const asSheet = bottomSheet && isOpen;
  const sheetHeight = `${(sheetFraction * 100).toFixed(2)}dvh`;

  // Drag the grabber to size the sheet; a press that does not travel is a tap,
  // which snaps between the two presets. One handler for both because on a
  // touch screen they are the same gesture until the finger moves.
  const handleSheetPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const startY = event.clientY;
    const startFraction = sheetFraction;
    const windowHeight = window.innerHeight;
    let travelled = false;

    const onMove = (moveEvent: PointerEvent) => {
      // up is taller, so the delta is inverted
      const dy = startY - moveEvent.clientY;
      if (Math.abs(dy) > SHEET_TAP_SLOP_PX) {
        travelled = true;
        setSheetDragging(true);
      }
      setSheetFraction(clampSheet(startFraction + dy / windowHeight));
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      setSheetDragging(false);
      setSheetFraction((current) => {
        const next = travelled
          ? current
          : current > (SHEET_PEEK + SHEET_EXPANDED) / 2
            ? SHEET_PEEK
            : SHEET_EXPANDED;
        saveSheetFraction(isLeft, next);
        return next;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  return (
    <>
      <Box
        data-cy={isLeft ? 'menu-panel-column' : 'inspector-column'}
        data-panel-layout={asSheet ? 'sheet' : 'column'}
        sx={{
          display: hidden ? 'none' : 'flex',
          flexDirection: 'column',
          flex: 'none',
          width: isOpen && !bottomSheet ? `${drawerWidth}px` : 0,
          height: '100dvh',
          position: asSheet ? 'absolute' : 'relative',
          ...(asSheet
            ? {
                // Anchored to the bottom and started clear of the rail (which
                // draws at zIndex 30 and would otherwise sit on top of the
                // panel's own content), so the canvas stays visible and usable
                // above it instead of being covered outright.
                top: 'auto',
                bottom: 0,
                left: `${SHELL_CONSTANTS.RAIL_WIDTH}px`,
                right: 0,
                width: 'auto',
                height: sheetHeight,
                zIndex: 10,
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.5)',
                // the sheet reaches the bottom edge of the screen, which on a
                // phone is where the home indicator lives
                paddingBottom: 'env(safe-area-inset-bottom)',
                // an eased height would lag a finger that is setting it
                transition: sheetDragging
                  ? 'none'
                  : 'height 0.225s cubic-bezier(0, 0, 0.2, 1)',
              }
            : { transition: 'width 0.225s cubic-bezier(0, 0, 0.2, 1)' }),
          boxSizing: 'border-box',
          background: isOpen ? backgroundColor.toString() : 'transparent',
          overflow: 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {isOpen && (
          <>
            {/* a sheet has no neighbour to steal width from, so there is
                nothing for a col-resize handle to do */}
            {!bottomSheet && (
              <ResizeHandle isLeft={isLeft} onPointerDown={handleMouseDown} />
            )}
            {asSheet && (
              <Box
                data-cy="panel-sheet-handle"
                role="separator"
                aria-label="Resize panel"
                aria-orientation="horizontal"
                aria-valuenow={Math.round(sheetFraction * 100)}
                onPointerDown={handleSheetPointerDown}
                sx={{
                  flex: 'none',
                  // the sheet's own control, so it gets the same touch floor
                  // the app theme puts on every other one
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'ns-resize',
                  // the browser must not scroll anything while the finger is
                  // sizing the sheet
                  touchAction: 'none',
                }}
              >
                <Box
                  sx={{
                    width: '36px',
                    height: '4px',
                    borderRadius: '2px',
                    bgcolor: sheetDragging
                      ? 'rgba(255, 255, 255, 0.75)'
                      : 'rgba(255, 255, 255, 0.4)',
                  }}
                />
              </Box>
            )}
            {/* pinned to the panel's own width so the content does not reflow
                while the column animates open or closed */}
            <Box
              sx={{
                width: bottomSheet ? '100%' : `${drawerWidth}px`,
                flex: 1,
                minHeight: 0,
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

      {/* The only way to open the inspector, so it has to survive the switch
          to a sheet - the rail has no button for it. As a column it hangs off
          the panel's right edge; as a sheet there is no right edge to hang
          off, so it rides just above the sheet instead and comes down with it
          when it closes. */}
      {!isLeft && !hidden && (
        <Tooltip
          title={isOpen ? 'Close inspector (3)' : 'Open inspector (3)'}
          placement={bottomSheet ? 'top' : 'top-end'}
        >
          <IconButton
            data-cy="right-drawer-toggle-btn"
            onClick={() =>
              InterfaceController.toggleRightSideDrawer(
                VISIBILITY_ACTION.TOGGLE,
              )
            }
            sx={{
              position: 'fixed',
              zIndex: 5,
              backgroundColor: backgroundColor.toString(),
              pointerEvents: 'auto',
              '&:hover': {
                backgroundColor: TRgba.fromString(MAIN_COLOR)
                  .darken(0.7)
                  .toString(),
              },
              ...(bottomSheet
                ? {
                    right: '12px',
                    bottom: `calc(${
                      isOpen ? sheetHeight : '0px'
                    } + env(safe-area-inset-bottom) + 12px)`,
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    boxShadow: '0px 2px 8px rgba(0,0,0,0.4)',
                    transition: 'bottom 0.225s cubic-bezier(0, 0, 0.2, 1)',
                  }
                : {
                    right: isOpen ? `${drawerWidth}px` : '0',
                    top: '144px',
                    transform: 'translateY(-50%)',
                    width: isOpen ? '24px' : '32px',
                    borderRadius: '4px 0 0 4px',
                    boxShadow: '0px 2px 4px rgba(0,0,0,0.2)',
                    transition: 'right 0.225s cubic-bezier(0, 0, 0.2, 1)',
                  }),
            }}
            size="small"
          >
            {!isOpen ? (
              <TuneIcon />
            ) : bottomSheet ? (
              <KeyboardArrowDownIcon />
            ) : (
              <ChevronRightIcon />
            )}
          </IconButton>
        </Tooltip>
      )}
    </>
  );
};

export default React.memo(LeftRightDrawer);
