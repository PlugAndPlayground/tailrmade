import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PPGraph from '../classes/GraphClass';
import InterfaceController from '../InterfaceController';
import { Rail } from './Rail';
import LeftRightDrawer from './LeftRightDrawer';
import DashboardColumn from './dashboard/GraphOverlayDashboard';
import { TMIconNoShadow } from '../utils/icons';
import { useResolvedAppTheme } from '../utils/theme/store';
import { useIsSmallScreen } from '../utils/utils';
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
  const { appView, overlayState } = props;
  const appTokens = useResolvedAppTheme().tokens;
  const isDashboardMaximised =
    overlayState[DrawerSide.DASHBOARD].visible &&
    overlayState[DrawerSide.DASHBOARD].maximized;

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
