import React from 'react';
import {
  Box,
  CircularProgress,
  Typography,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useEditor, useNode } from '@craftjs/core';
import InterfaceController, { ListenEvent } from '../../InterfaceController';

export const PlaceholderWidgetName = 'PlaceholderWidget';

export const PlaceholderWidget = ({
  text = 'Loading widget...',
  background = 'rgba(0,0,0,0.1)',
}) => {
  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));
  const {
    connectors: { connect, drag },
    actions: { setProp },
    id,
  } = useNode((node) => ({
    dragged: node.events.dragged,
  }));

  // const [editable, setEditable] = useState(isEditMode);

  const handleDelete = (e) => {
    e.stopPropagation();
    InterfaceController.notifyListeners(ListenEvent.RemoveFromDashboard, id);
  };

  return (
    <Box
      ref={(ref) => connect(drag(ref))}
      sx={{
        width: '100%',
        height: '120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background,
        borderRadius: 1,
        padding: 2,
        position: 'relative',
      }}
    >
      <Tooltip title="Remove placeholder">
        <IconButton
          size="small"
          onClick={handleDelete}
          data-cy="remove-placeholder-btn"
          sx={{
            display: isEditMode ? 'none' : 'block',
            position: 'absolute',
            top: 8,
            right: 8,
            color: 'action.active',
            '&:hover': {
              color: 'error.main',
              bgcolor: 'rgba(255, 0, 0, 0.04)',
            },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <CircularProgress size={24} sx={{ mb: 1 }} />
      <Typography variant="body2">{text}</Typography>
    </Box>
  );
};

// Define Craft.js configuration
PlaceholderWidget.craft = {
  displayName: PlaceholderWidgetName,
  props: {
    text: 'Loading...',
    background: 'rgba(0,0,0,0.1)',
  },
  related: {},
};
