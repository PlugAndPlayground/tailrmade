import React, { useState } from 'react';
import { useEditor } from '@craftjs/core';
import {
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  Popover,
  Button,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import BugReportIcon from '@mui/icons-material/BugReport';
import { getNodeIdFromElementId } from '../../utils/utils';
import { RootName } from '../../utils/constants_shared';
import { emptyLayout } from '../../utils/surfaceTree';

// Props debugger component for displaying dashboardItem properties
const PropsDebugger = ({ dashboardItem }) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  // Format all dashboardItem data for display
  const formatNodeData = () => {
    try {
      // Get nodeId if it exists
      const nodeId = dashboardItem.data.props.id
        ? getNodeIdFromElementId(dashboardItem.data.props.id)
        : null;

      if (!dashboardItem.data) {
        return 'Error: Node is missing data structure';
      }

      // Extract important dashboardItem metadata without circular refs
      const safeNodeData = {
        id: dashboardItem.id,
        type: dashboardItem.data.type,
        name: dashboardItem.data.name,
        displayName: dashboardItem.data.displayName,
        hidden: dashboardItem.data.hidden,
        isCanvas: dashboardItem.data.isCanvas,
        parent: dashboardItem.data.parent,
        nodes: dashboardItem.data.nodes,
        linkedNodes: dashboardItem.data.linkedNodes,
      };

      return (
        <Box sx={{ p: 1, maxWidth: 400, maxHeight: 400, overflow: 'auto' }}>
          {nodeId && (
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Node ID: {nodeId}
            </Typography>
          )}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Element ID: {dashboardItem.data.props.id || ''}
          </Typography>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Dashboard ID: {dashboardItem.id}
          </Typography>
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            Properties
          </Typography>
          <pre style={{ margin: 0, fontSize: '12px' }}>
            {JSON.stringify(dashboardItem.data.props, null, 2)}
          </pre>
          <Typography variant="body2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
            Custom
          </Typography>
          <pre style={{ margin: 0, fontSize: '12px' }}>
            {JSON.stringify(dashboardItem.data.custom || {}, null, 2)}
          </pre>
          <Typography variant="body2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
            Node Metadata
          </Typography>
          <pre style={{ margin: 0, fontSize: '12px' }}>
            {JSON.stringify(safeNodeData, null, 2)}
          </pre>
        </Box>
      );
    } catch (err) {
      return `Error displaying dashboardItem data: ${err.message}`;
    }
  };

  return (
    <>
      <Button
        size="small"
        startIcon={<BugReportIcon />}
        onClick={handleClick}
        variant="outlined"
        sx={{ mt: 1, width: '100%' }}
        data-cy="debug-node-props-btn"
      >
        Debug Node Properties
      </Button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {formatNodeData()}
      </Popover>
    </>
  );
};

export const WidgetInspector = () => {
  const { actions, query, selected, isEnabled, isRoot } = useEditor(
    (state, query) => {
      let [currentDashboardId] = state.events.selected;
      const isRoot = currentDashboardId === RootName;
      let selected = null;

      if (currentDashboardId) {
        const currentNode = state.nodes[currentDashboardId];
        if (currentNode) {
          selected = {
            id: currentDashboardId,
            name: currentNode.data.name,
            displayName: currentNode.data.displayName,
            settings: currentNode.related?.settings,
            isDeletable: query.node(currentDashboardId).isDeletable(),
            parent: currentNode.data.parent,
          };
        }
      }

      return {
        selected,
        isEnabled: state.options.enabled,
        isRoot,
        fullNodeData: currentDashboardId
          ? state.nodes[currentDashboardId]
          : null,
      };
    },
  );

  return isEnabled && selected ? (
    <Stack
      direction="column"
      spacing={0}
      sx={{
        p: 1,
        bgcolor: 'background.medium',
      }}
      data-cy="settings-panel"
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        data-cy="settings-panel-header"
      >
        <Typography
          variant="subtitle1"
          title={selected.id}
          data-cy="selected-node-name"
        >
          {isRoot ? 'Root container' : selected.displayName}
        </Typography>
        {isRoot && (
          <Tooltip title="Delete all">
            <IconButton
              size="small"
              onClick={() => {
                actions.deserialize(JSON.stringify(emptyLayout));
                const rootNode = query.node(RootName).get();
                const rootChildren = rootNode.data.nodes;
                rootChildren.forEach((childId) => actions.delete(childId));
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {selected.isDeletable && (
          <Tooltip title="Delete widget">
            <IconButton
              size="small"
              onClick={() => {
                actions.delete(selected.id);
              }}
              data-cy="settings-delete-widget-btn"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {selected.settings && React.createElement(selected.settings)}
      <PropsDebugger dashboardItem={query.node(selected.id).get()} />
    </Stack>
  ) : (
    <Box sx={{ p: 1, bgcolor: 'background.medium' }}>
      <Typography variant="subtitle2" sx={{ mr: 1 }}>
        Select a widget to edit its properties
      </Typography>
    </Box>
  );
};
