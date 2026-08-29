import React, { useEffect, useRef } from 'react';
import {
  Box,
  IconButton,
  Stack,
  TextField,
  Typography,
  Tooltip,
  Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import PPGraph from '../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { PropertyArrayContainer } from './PropertyArrayContainer';
import { TRgba } from '../utils/color';
import { useEditor } from '@craftjs/core';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { RightDrawerView } from '../utils/constants';
import PPNode from '../classes/NodeClass';
import { ACTIONS, PNPAction, SetCommentActionArgs } from '../classes/Action';
import { SurfaceSync } from '../nodes/layout/surfaceSync';
import { isSurfaceNode } from '../utils/interfaces';
import type { UISurfaceNode } from '../nodes/layout/uiSurface';
import { MAIN_COLOR } from '../utils/constants';

function InspectorHeader(props) {
  const [nodeName, setNodeName] = React.useState('');
  const textInput = useRef(null);
  const isEditable = props.isEditable;
  const selectedNode = props.selectedNodes[0];
  const originalName = selectedNode.getName();

  const [comment, setComment] = React.useState(selectedNode?.comment || '');
  const previousCommentRef = useRef(selectedNode?.comment || '');

  useEffect(() => {
    setNodeName(props.selectedNodes?.[0]?.name);
  }, [props.selectedNodes]);

  useEffect(() => {
    const newComment = selectedNode?.comment || '';
    setComment(newComment);
    previousCommentRef.current = newComment;
  }, [selectedNode]);

  const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const oldComment = previousCommentRef.current;
    setComment(value);
    void PNPAction(
      ACTIONS.SET_COMMENT,
      new SetCommentActionArgs(selectedNode.id, value),
      new SetCommentActionArgs(selectedNode.id, oldComment),
      selectedNode.id + '_comment',
    );
    previousCommentRef.current = value;
  };

  const handleAddToDashboard = () => {
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
    InterfaceController.notifyListeners(
      ListenEvent.AddToDashboard,
      props.selectedNodes[0],
    );
  };

  const isLayoutable = props.selectedNodes[0].isLayoutable();

  return (
    <Box
      id={isEditable ? 'inspector-header' : 'inspector-header-readonly'}
      sx={{
        p: 1,
        bgcolor: 'background.paper',
        color: `${TRgba.fromString(MAIN_COLOR).getContrastTextColor()}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {isLayoutable && props.selectedNodes.length === 1 && (
          <Tooltip title="Add node to user interface">
            <IconButton
              size="small"
              onClick={handleAddToDashboard}
              sx={{
                borderRadius: 0,
              }}
            >
              <DashboardCustomizeIcon sx={{ fontSize: '16px' }} />
            </IconButton>
          </Tooltip>
        )}

        {props.isEditable ? (
          <>
            <TextField
              title={`id: ${props.selectedNodes[0].id}
name: ${props.selectedNodes[0].name}
type: ${props.selectedNodes[0].type}`}
              hiddenLabel
              inputRef={textInput}
              disabled={props.selectedNodes.length !== 1}
              onChange={(event) => {
                const value = event.target.value;
                props.selectedNodes[0].setNodeName(value);
                setNodeName(value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  textInput.current.blur();
                }
              }}
              value={nodeName}
              sx={{
                width: '100%',
                '&& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    border: 0,
                  },
                  '& input': {
                    color: `${TRgba.fromString(MAIN_COLOR).getContrastTextColor()}`,
                    padding: '4px 8px',
                    lineHeight: 1.2,
                  },
                  '& input:hover': {
                    backgroundColor: TRgba.fromString(MAIN_COLOR)
                      .setAlpha(0.5)
                      .hexa(),
                  },
                  '& input:focus': {
                    boxShadow: `0 0 0 1px ${MAIN_COLOR}`,
                    backgroundColor: TRgba.fromString(MAIN_COLOR)
                      .setAlpha(0.5)
                      .hexa(),
                  },
                },
              }}
            />
            <IconButton
              title="Edit node name"
              color="secondary"
              size="small"
              sx={{
                color: `${TRgba.fromString(MAIN_COLOR).getContrastTextColor()}`,
              }}
              onClick={() => {
                setTimeout(() => {
                  textInput.current.focus();
                }, 100);
              }}
            >
              <EditIcon fontSize="inherit" />
            </IconButton>
          </>
        ) : (
          <Typography
            sx={{
              pl: 1,
              py: 0.5,
              width: '100%',
            }}
          >
            {`${props.selectedNodes.length} nodes selected`}
          </Typography>
        )}
      </Box>
      {props.isEditable && originalName !== nodeName && (
        <Typography
          sx={{
            opacity: 0.5,
            fontSize: '10px',
            wordBreak: 'break-all',
            pl: 1,
            lineHeight: 1.2,
          }}
        >
          {originalName}
        </Typography>
      )}
      {props.isEditable && (
        <TextField
          variant="filled"
          multiline
          minRows={1}
          maxRows={4}
          fullWidth
          size="small"
          value={comment}
          onChange={handleCommentChange}
          placeholder="Add a comment..."
          sx={{
            px: 1,
            mt: 1,
            '& .MuiFilledInput-root': {
              fontSize: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              '&:before, &:after': {
                borderBottom: 'none',
              },
              '&:hover:before': {
                borderBottom: 'none',
              },
            },
          }}
        />
      )}
    </Box>
  );
}

function LinkedWidgets({ selectedNode }) {
  const elementId = selectedNode ? `NODE_${selectedNode.id}` : null;

  const { linkedWidgetIds, actions } = useEditor((state) => {
    if (!elementId) return { linkedWidgetIds: [] };

    const linkedWidgetIds = Object.entries(state.nodes)
      .filter(([_, node]) => node.data.props.id === elementId)
      .map(([id]) => id);

    return { linkedWidgetIds };
  });

  const [hoveredWidgetId, setHoveredWidgetId] = React.useState<string | null>(
    null,
  );

  const displayedSurfaceId = InterfaceController.displayedSurfaceNodeId;
  const displayedSurface = displayedSurfaceId
    ? (PPGraph.currentGraph.getNodeById(displayedSurfaceId) as UISurfaceNode)
    : null;
  const displayedSurfaceName = displayedSurface
    ? displayedSurface.getDashboardName()
    : 'dashboard';

  // widgets of this node living in OTHER UI surfaces than the displayed one
  const otherSurfaceMatches: UISurfaceNode[] = elementId
    ? Object.values(PPGraph.currentGraph.nodes)
        .filter(isSurfaceNode)
        .filter(
          (node) =>
            node.id !== displayedSurfaceId &&
            SurfaceSync.findWidgetItemId(node.getSurfaceTree(), elementId) !==
              undefined,
        )
    : [];

  const handleSelectWidgetInSurface = (surfaceNodeId: string) => {
    InterfaceController.openDashboardInEditMode();
    InterfaceController.setRightDrawerView(RightDrawerView.INTERFACE);
    InterfaceController.showSurface(surfaceNodeId);
    if (elementId) {
      InterfaceController.selectDashboardItemByElementId(elementId);
    }
  };

  useEffect(() => {
    return () => {
      if (hoveredWidgetId) {
        const widgetElement = document.querySelector(
          `[id="${hoveredWidgetId}"]`,
        );
        if (widgetElement) {
          widgetElement.classList.remove('componentHover');
        }
      }
    };
  }, [hoveredWidgetId]);

  if (linkedWidgetIds.length === 0 && otherSurfaceMatches.length === 0) {
    return null;
  }

  const handleSelectWidget = (widgetId: string) => {
    InterfaceController.openDashboardInEditMode();
    InterfaceController.setRightDrawerView(RightDrawerView.INTERFACE);
    actions.selectNode(widgetId);
  };

  const handleWidgetHover = (
    craftWidgetId: string | null,
    isHovering: boolean,
  ) => {
    setHoveredWidgetId(isHovering ? craftWidgetId : null);
    if (!craftWidgetId) return;
    const widgetElement = document.querySelector(`[id="${craftWidgetId}"]`);
    if (widgetElement) {
      widgetElement.classList[isHovering ? 'add' : 'remove']('componentHover');
    }
  };

  // every location this node's widget shows up in - the currently
  // displayed surface, plus any other surface that embeds it
  const usageLocations = [
    ...linkedWidgetIds.map((widgetId) => ({
      key: widgetId,
      widgetId,
      surfaceNode: displayedSurface,
      surfaceName: displayedSurfaceName,
      onSelect: () => handleSelectWidget(widgetId),
    })),
    ...otherSurfaceMatches.map((surface) => ({
      key: surface.id,
      widgetId: null as string | null,
      surfaceNode: surface,
      surfaceName: surface.getDashboardName(),
      onSelect: () => handleSelectWidgetInSurface(surface.id),
    })),
  ];

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        bgcolor: 'background.medium',
        px: 1,
        py: 0.25,
        pl: 2,
      }}
    >
      <Typography variant="caption" color="text.secondary" noWrap>
        Used in:
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
        {usageLocations.map((location) => (
          <Tooltip key={location.key} title={location.surfaceName}>
            <IconButton
              size="small"
              onClick={location.onSelect}
              onMouseEnter={() => {
                if (location.surfaceNode) {
                  PPGraph.currentGraph.selection.drawSingleFocus(
                    location.surfaceNode,
                  );
                }
                handleWidgetHover(location.widgetId, true);
              }}
              onMouseLeave={() => {
                PPGraph.currentGraph.selection.clearFocus();
                handleWidgetHover(location.widgetId, false);
              }}
              data-cy={`select-dashboard-widget-${location.key}`}
              sx={{
                p: 0.25,
                bgcolor:
                  location.widgetId && hoveredWidgetId === location.widgetId
                    ? 'action.selected'
                    : 'transparent',
              }}
            >
              <DashboardIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

type InspectorContainerProps = {
  selectedNodes: PPNode[];
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
};

const NodeInspectorContainer: React.FunctionComponent<
  InspectorContainerProps
> = (props) => {
  const isSingleNodeSelected = props.selectedNodes.length === 1;

  return (
    <Box
      id="inspector-container-node"
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
          mb: 1,
        }}
      >
        <Tooltip title="Back to node list" placement="top">
          <Button
            variant="text"
            color="primary"
            startIcon={<ArrowBackIcon />}
            onClick={() => {
              PPGraph.currentGraph.selection.deselectAllNodes();
            }}
            data-cy="back-to-node-list-btn"
          >
            Back to node list
          </Button>
        </Tooltip>
      </Box>

      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Stack spacing={1}>
          <InspectorHeader
            isEditable={isSingleNodeSelected}
            selectedNodes={props.selectedNodes}
          />

          {isSingleNodeSelected && (
            <LinkedWidgets selectedNode={props.selectedNodes[0]} />
          )}

          <PropertyArrayContainer
            filter={props.filter}
            setFilter={props.setFilter}
          />
        </Stack>
      </Box>
    </Box>
  );
};

export default NodeInspectorContainer;
