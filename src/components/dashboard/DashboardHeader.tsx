import React from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import CloseIcon from '@mui/icons-material/Close';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';
import { StyledButton } from '../StyledButton';
import { SurfaceBreadcrumb } from './SurfaceBreadcrumb';
import { DevicePreviewToggle } from './DevicePreviewToggle';
import { useSurfaceStack } from './surfaceStackStore';
import { toggleToolbox, useToolboxOpen } from './toolboxStore';
import { SHELL_CONSTANTS } from '../../utils/constants';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';

type DashboardHeaderProps = {
  isEditMode: boolean;
  isFullscreen: boolean;
  toggleFullscreen: (action: VISIBILITY_ACTION) => void;
};

// The dashboard's own header row. It lives INSIDE the dashboard's box, which
// is the whole point: a global top bar would push down or cover the app UI,
// this cannot.
//
// Flex discipline: every fixed control is `flex: none` and the breadcrumb is
// the only flexible child. Without that the controls shrink and clip as soon
// as the surface names get long.
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  isEditMode,
  isFullscreen,
  toggleFullscreen,
}) => {
  const surfaceStack = useSurfaceStack();
  const isToolboxOpen = useToolboxOpen();

  return (
    <Box
      data-cy="dashboard-header"
      sx={{
        flex: 'none',
        height: `${SHELL_CONSTANTS.DASHBOARD_HEADER_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <Tooltip
        title={
          isFullscreen
            ? 'Shrink user interface (M)'
            : 'Maximise user interface (M)'
        }
        placement="bottom-start"
      >
        <IconButton
          data-cy={
            isFullscreen ? 'shrink-dashboard-btn' : 'maximise-dashboard-btn'
          }
          size="small"
          sx={{ flex: 'none' }}
          onClick={(event) => {
            event.stopPropagation();
            toggleFullscreen(
              isFullscreen ? VISIBILITY_ACTION.CLOSE : VISIBILITY_ACTION.OPEN,
            );
          }}
        >
          {isFullscreen ? (
            <CloseFullscreenIcon fontSize="small" />
          ) : (
            <OpenInFullIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>

      <Tooltip
        title={
          isEditMode ? 'View user interface (E)' : 'Edit user interface (E)'
        }
        placement="bottom-start"
      >
        <StyledButton
          data-cy="toggle-edit-mode-btn"
          isSelected={isEditMode}
          sx={{ flex: 'none' }}
          onClick={(event) => {
            event.stopPropagation();
            InterfaceController.toggleDashboardInEditMode(
              VISIBILITY_ACTION.TOGGLE,
            );
          }}
        >
          {isEditMode ? <CloseIcon /> : <EditIcon />}
        </StyledButton>
      </Tooltip>

      {/* the toolbox only exists while editing. It is the same button whether
          the toolbox is docked beside the surface or floating over it, so the
          control does not move as the dashboard is resized. */}
      {isEditMode && (
        <Tooltip
          title={isToolboxOpen ? 'Hide widgets' : 'Show widgets'}
          placement="bottom-start"
        >
          <StyledButton
            data-cy="toggle-toolbox-btn"
            isSelected={isToolboxOpen}
            sx={{ flex: 'none' }}
            onClick={(event) => {
              event.stopPropagation();
              toggleToolbox();
            }}
          >
            <DashboardCustomizeIcon />
          </StyledButton>
        </Tooltip>
      )}

      {/* the only flexible child - truncates from the left, so the surface
          you are actually looking at stays readable */}
      <Box
        sx={{
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <SurfaceBreadcrumb
          surfaceStack={surfaceStack}
          appName={PPGraph.currentGraph?.name}
          onAppNameClick={() => InterfaceController.setShowGraphEdit(true)}
        />
      </Box>

      <Box sx={{ flex: 'none' }}>
        <DevicePreviewToggle />
      </Box>
    </Box>
  );
};
