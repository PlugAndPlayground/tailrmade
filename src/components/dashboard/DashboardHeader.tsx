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
  isMaximized: boolean;
  toggleMaximized: (action: VISIBILITY_ACTION) => void;
};

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  isEditMode,
  isMaximized,
  toggleMaximized,
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
        containerType: 'inline-size',
        containerName: 'dashboard-header',
      }}
    >
      <Box
        sx={{
          flex: '1 1 0',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Tooltip
          title={
            isMaximized
              ? 'Shrink user interface (M)'
              : 'Maximise user interface (M)'
          }
          placement="bottom-start"
        >
          <IconButton
            data-cy={
              isMaximized ? 'shrink-dashboard-btn' : 'maximise-dashboard-btn'
            }
            size="small"
            sx={{ flex: 'none' }}
            onClick={(event) => {
              event.stopPropagation();
              toggleMaximized(
                isMaximized ? VISIBILITY_ACTION.CLOSE : VISIBILITY_ACTION.OPEN,
              );
            }}
          >
            {isMaximized ? (
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
      </Box>

      <Box
        sx={{
          flex: 'none',
          '@container dashboard-header (max-width: 340px)': {
            display: 'none',
          },
        }}
      >
        <DevicePreviewToggle />
      </Box>

      <Box
        aria-hidden
        sx={{
          flex: '1 1 0',
          minWidth: 0,
          '@container dashboard-header (max-width: 340px)': {
            display: 'none',
          },
        }}
      />
    </Box>
  );
};
