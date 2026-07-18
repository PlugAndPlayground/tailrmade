import React from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import { useEditor } from '@craftjs/core';
import InterfaceController from '../../InterfaceController';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import { WidgetInspector } from './WidgetInspector';
import { DashboardLayersPanel } from './DashboardLayersPanel';
import { SurfaceListPanel } from './SurfaceListPanel';

export const DashboardInspectorWrapper = () => {
  // Get the edit mode status from the Craft.js editor
  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));

  // Function to exit edit mode
  const exitEditMode = () => {
    InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          // bgcolor: 'background.paper',
          mb: 1,
        }}
      >
        {isEditMode ? (
          <Tooltip title="Exit user interface (E)" placement="top">
            <Button
              variant="contained"
              color="primary"
              onClick={exitEditMode}
              fullWidth
              data-cy="exit-dashboard-editor-btn"
            >
              Exit Edit Mode
            </Button>
          </Tooltip>
        ) : (
          <Tooltip title="Open user interface (2)" placement="top">
            <Button
              variant="outlined"
              color="primary"
              onClick={() =>
                InterfaceController.toggleShowDashboard(
                  VISIBILITY_ACTION.TOGGLE,
                )
              }
              fullWidth
              data-cy="inspector-toggle-dashboard-btn"
            >
              Show/Hide
            </Button>
          </Tooltip>
        )}
      </Box>

      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
          gap: 0.5,
        }}
      >
        {/* All UI surface nodes; select to show/edit, star = default */}
        <Box sx={{ flex: '0 0 auto', maxHeight: '30vh', overflow: 'auto' }}>
          <SurfaceListPanel />
        </Box>

        {/* Layers panel: always visible, read-only when not editing */}
        <Box
          sx={{
            flex: isEditMode ? '0 0 auto' : '1 1 auto',
            maxHeight: isEditMode ? '30vh' : undefined,
            overflow: 'auto',
          }}
        >
          <DashboardLayersPanel />
        </Box>

        {/* Properties: only shown in edit mode. Jumping to the linked graph
            node lives next to each widget's name in DashboardLayersPanel
            above, not duplicated here. */}
        {isEditMode && (
          <Box
            sx={{
              flexGrow: 1,
              overflow: 'auto',
              minHeight: 0,
            }}
          >
            <WidgetInspector />
          </Box>
        )}
      </Box>
    </Box>
  );
};
