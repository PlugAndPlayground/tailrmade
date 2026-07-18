import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Tooltip, Divider, Typography, Fab } from '@mui/material';
import { Element, useEditor } from '@craftjs/core';
import { v4 as uuid } from 'uuid';
import { hri } from 'human-readable-ids';
import { Container } from './Container';
import { Text } from './Text';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import CloseIcon from '@mui/icons-material/Close';
import PPGraph from './../../classes/GraphClass';
import { addNodeWithPlacement } from './DashboardEditor';
import { TRgba } from '../../utils/color';
import { ensureVisible } from '../../pixi/utils-pixi';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { getDefaultContainerBackground } from '../../nodes/datatypes/widgetLayoutType';
import { NodeListOptionType } from '../Search';
import { getAllNodeTypes } from '../../nodes/allNodes';
import { PlaceholderWidget } from './PlaceholderWidget';
import { NODE_SOURCE } from '../../utils/constants';

export const draggedWidgetType = 'widget-node';

export const Toolbox = ({ randomMainColor, addToDashboard }) => {
  const { actions, connectors, query } = useEditor();
  const [widgetNodes, setWidgetNodes] = useState([]);
  const [layoutableNodes, setLayoutableNodes] = useState([]);
  const nodeIdMapRef = useRef(new Map());
  // Used to force re-render after regenerating IDs so connectors.create picks up new placeholder IDs
  const [idRefreshCounter, setIdRefreshCounter] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const regenerateWidgetId = useCallback((key: string) => {
    nodeIdMapRef.current.set(key, `NODE_${hri.random()}`);
    // Trigger re-render so the placeholder element re-attaches with the new ID
    setIdRefreshCounter((c) => c + 1);
  }, []);

  // Detect when dashboard width changes and auto-collapse/expand toolbox
  useEffect(() => {
    const checkWidth = () => {
      // Use wrapperRef which is always rendered
      const wrapper = wrapperRef.current;
      if (wrapper) {
        const dashboardWidth = wrapper.parentElement?.clientWidth || 0;
        // If dashboard width with toolbox is less than 500px, collapse the toolbox
        // If dashboard width is more than 500px, expand the toolbox
        if (dashboardWidth < 500 && !isCollapsed) {
          setIsCollapsed(true);
          setIsDrawerOpen(false);
        } else if (dashboardWidth >= 500 && isCollapsed) {
          setIsCollapsed(false);
          setIsDrawerOpen(false);
        }
      }
    };

    const resizeObserver = new ResizeObserver(checkWidth);
    const wrapper = wrapperRef.current;
    const parentElement = wrapper?.parentElement;

    // Check on mount
    checkWidth();

    if (parentElement) {
      resizeObserver.observe(parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [isCollapsed]);

  // Load widget nodes
  useEffect(() => {
    // Get all widget nodes
    const allNodeTypes = getAllNodeTypes();
    const widgets = Object.entries(allNodeTypes)
      .filter(([_, nodeType]) => nodeType.tags?.includes('Widget'))
      .map(([title, obj]) => ({
        title,
        name: obj.name,
        key: title,
        description: obj.description,
        hasInputs: obj.hasInputs,
        tags: obj.tags,
        hasExample: obj.hasExample,
        group: obj.tags?.[0],
        optionType: NodeListOptionType.NODE,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
      );

    setWidgetNodes(widgets);

    // Generate IDs for each widget
    widgets.forEach((node) => {
      if (!nodeIdMapRef.current.has(node.key)) {
        nodeIdMapRef.current.set(node.key, `NODE_${hri.random()}`);
      }
    });
  }, []);

  // Load layoutable nodes
  const updateNodesAndInfo = useCallback(() => {
    const currentGraph = PPGraph.currentGraph;
    if (currentGraph) {
      const nodes = Object.entries(currentGraph.nodes)
        .filter(([_, node]) => node.isLayoutable())
        .sort((a, b) => {
          const nameA = a[1].name || '';
          const nameB = b[1].name || '';
          return nameA.localeCompare(nameB);
        });

      if (nodes) {
        setLayoutableNodes(nodes);
      }
    }
  }, [PPGraph.currentGraph]);

  useEffect(() => {
    const ids = [];
    ids.push(
      InterfaceController.addListener(ListenEvent.GraphChanged, () => {
        updateNodesAndInfo();
      }),
    );

    updateNodesAndInfo();

    return () => {
      InterfaceController.removeListeners(ids);
    };
  }, [updateNodesAndInfo]);

  useEffect(() => {
    updateNodesAndInfo();
  }, [
    PPGraph.currentGraph.nodes,
    Object.keys(PPGraph.currentGraph.nodes).length,
    updateNodesAndInfo,
  ]);

  // After a drop, DashboardEditor notifies DashboardItemAdded with the dashboardId (widgetId).
  // When that happens for one of our placeholder IDs, rotate the ID for that widget type.
  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.DashboardItemAdded,
      (data: { dashboardId?: string }) => {
        const droppedId = data?.dashboardId;
        if (!droppedId) return;
        // Find matching widget type key in our map
        for (const [key, value] of nodeIdMapRef.current.entries()) {
          if (value === droppedId) {
            regenerateWidgetId(key);
            break;
          }
        }
      },
    );
    return () => InterfaceController.removeListener(listenerId);
  }, [regenerateWidgetId]);

  // Widget Node Button
  const WidgetNodeButton = ({ node }) => {
    // Get the stored ID
    if (!nodeIdMapRef.current.has(node.key)) {
      nodeIdMapRef.current.set(node.key, `NODE_${hri.random()}`);
    }
    const widgetId = nodeIdMapRef.current.get(node.key);

    const handleNodeSelection = async () => {
      try {
        const addedNode = await PPGraph.currentGraph.addNewNode(
          node.title,
          {
            nodePosX: 0,
            nodePosY: 0,
          },
          NODE_SOURCE.NEW_DASHBOARD,
        );
        addedNode.deOverlap();
        await addToDashboard(addedNode);
        // After successful creation, generate a fresh ID for the next widget of this type
        regenerateWidgetId(node.key);
      } catch (error) {
        console.error('Error adding widget node:', error);
      }
    };

    const handleDragStart = (event: React.DragEvent) => {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: draggedWidgetType,
          nodeType: node.title,
          widgetId: widgetId,
        }),
      );
      event.dataTransfer.effectAllowed = 'copy';
    };

    return (
      <Tooltip title={node.description || node.name} placement="right">
        <Box
          ref={(ref) => {
            const placeholderElement = (
              <Element
                is={PlaceholderWidget}
                text={`Loading ${node.name}...`}
                background={TRgba.fromString(randomMainColor)
                  .darken(0.6)
                  .setAlpha(0.2)
                  .toString()}
                id={widgetId}
              />
            );
            connectors.create(ref, placeholderElement);
          }}
          onClick={handleNodeSelection}
          draggable={true}
          onDragStart={handleDragStart}
          data-cy={`widget-node-${node.key}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'grab',
            '&:active': { cursor: 'grabbing' },
            padding: '4px 8px',
            marginBottom: '2px',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            width: '100%',
          }}
        >
          <DashboardCustomizeIcon fontSize="small" sx={{ mr: 1 }} />
          <Typography
            variant="body2"
            noWrap
            sx={{
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {node.name}
          </Typography>
        </Box>
      </Tooltip>
    );
  };

  // Layoutable Node Button
  const LayoutableNodeButton = ({ id, node }) => {
    const handleClick = () => {
      addToDashboard(node);
    };

    const handleNodeSelect = (event) => {
      event.stopPropagation();
      const nodeToJumpTo = PPGraph.currentGraph.nodes[id];
      if (nodeToJumpTo) {
        nodeToJumpTo.renderOutlineThrottled();
        void ensureVisible([nodeToJumpTo], false);
        PPGraph.currentGraph.selection.selectNodes([nodeToJumpTo], false);
      }
    };

    const handleDragStart = (event: React.DragEvent) => {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          type: 'layoutable-node',
          nodeId: id,
          widgetId: `NODE_${id}`,
        }),
      );
      event.dataTransfer.effectAllowed = 'copy';
    };

    return (
      <Tooltip title={node.getName()} placement="right">
        <Box
          ref={(ref) => {
            const placeholderElement = (
              <Element
                is={PlaceholderWidget}
                text={`Loading ${node.name}...`}
                background={node
                  .getColor()
                  .darken(0.4)
                  .setAlpha(0.2)
                  .toString()}
                id={`NODE_${id}`}
              />
            );
            connectors.create(ref, placeholderElement);
          }}
          onClick={handleClick}
          onPointerEnter={handleNodeSelect}
          draggable={true}
          onDragStart={handleDragStart}
          data-cy={`layoutable-node-${id}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'grab',
            '&:active': { cursor: 'grabbing' },
            padding: '4px 8px',
            marginBottom: '2px',
            borderLeft: `4px solid ${node.getColor()}`,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            width: '100%',
          }}
        >
          <Box
            component="span"
            sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {node.isContainer() ? (
              <ViewColumnIcon fontSize="small" sx={{ mr: 1 }} />
            ) : (
              <DashboardCustomizeIcon fontSize="small" sx={{ mr: 1 }} />
            )}
            <Typography
              variant="body2"
              noWrap
              sx={{
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {node.name}
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    );
  };

  const staticTools = [
    {
      icon: TableRowsIcon,
      tooltip: 'Container stacked',
      nest: false,
      dataCy: 'tool-vertical-container',
      element: (
        <Element
          canvas
          is={Container}
          padding={[8, 8, 8, 8]}
          background={getDefaultContainerBackground(randomMainColor)}
          gap={8}
          flexDirection="column"
        />
      ),
    },
    {
      icon: ViewColumnIcon,
      tooltip: 'Container side by side',
      nest: false,
      dataCy: 'tool-horizontal-container',
      element: (
        <Element
          canvas
          is={Container}
          padding={[8, 8, 8, 8]}
          background={getDefaultContainerBackground(randomMainColor)}
          gap={8}
          flexDirection="row"
        />
      ),
    },
    {
      icon: TextFieldsIcon,
      tooltip: 'Text',
      dataCy: 'tool-text',
      element: (
        <Text
          text="Hello world"
          fontSize={24}
          textAlign="left"
          fontWeight="normal"
          color={TRgba.fromString(randomMainColor).getContrastTextColor()}
        />
      ),
    },
  ];

  // StaticToolButton component similar to WidgetNodeButton
  const StaticToolButton = ({ tool }) => {
    const { icon: Icon, tooltip, element, dataCy, nest = true } = tool;

    return (
      <Tooltip title={tooltip} placement="right">
        <Box
          ref={(ref) => connectors.create(ref, element)}
          onClick={() => {
            const dashboardItemId = uuid();
            const nodeToAdd = query
              .parseReactElement(element)
              .toNodeTree((node) => {
                node.id = dashboardItemId;
              });

            addNodeWithPlacement(
              query,
              nest,
              actions,
              nodeToAdd,
              dashboardItemId,
            );
          }}
          data-cy={dataCy}
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '4px 8px',
            marginBottom: '2px',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            width: '100%',
          }}
        >
          <Icon fontSize="small" sx={{ mr: 1 }} />
          <Typography
            variant="body2"
            noWrap
            sx={{
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {tooltip}
          </Typography>
        </Box>
      </Tooltip>
    );
  };

  const toolboxContent = (isCollapsedMode: boolean) => (
    <Box
      sx={{
        height: '100%',
        bgcolor: TRgba.fromString(randomMainColor)
          .negate()
          .darken(0.8)
          .toString(),
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px',
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255,255,255,0.2)',
          borderRadius: '3px',
        },
      }}
      data-cy="vertical-toolbox"
    >
      {/* Static Tools Section */}
      <Typography
        variant="caption"
        sx={{ px: 1, mb: 1, color: 'text.secondary', fontWeight: 'bold' }}
        title="Adds a static widget (not linked to a node)"
      >
        Static
      </Typography>
      <Box sx={{ mb: 1 }}>
        {staticTools.map((tool, index) => (
          <StaticToolButton key={index} tool={tool} />
        ))}
      </Box>

      {/* Widget Nodes Section */}
      {widgetNodes.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{ px: 1, mb: 1, color: 'text.secondary', fontWeight: 'bold' }}
            title="Creates a node on the graph and adds it as a widget"
          >
            Dynamic (node)
          </Typography>
          <Box sx={{ mb: 1 }}>
            {widgetNodes.map((node) => (
              // include idRefreshCounter in key to ensure re-render when IDs refresh per type
              <WidgetNodeButton
                key={`${node.key}-${idRefreshCounter}`}
                node={node}
              />
            ))}
          </Box>
        </>
      )}

      {/* Layoutable Nodes Section */}
      {layoutableNodes.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography
            variant="caption"
            sx={{ px: 1, mb: 1, color: 'text.secondary', fontWeight: 'bold' }}
            title="Adds an existing node as a widget"
          >
            Existing (node)
          </Typography>
          <Box>
            {layoutableNodes.map(([id, node]) => (
              <LayoutableNodeButton key={id} id={id} node={node} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Box ref={wrapperRef} sx={{ display: 'contents' }}>
      {isCollapsed ? (
        <>
          {/* Floating toggle button when collapsed - top left corner */}
          <Fab
            color="secondary"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            sx={{
              position: 'absolute',
              left: 0,
              top: 48,
              zIndex: 10002,
              width: 32,
              height: 32,
              minHeight: 32,
              borderRadius: 0,
            }}
            data-cy="toolbox-toggle-btn"
          >
            {isDrawerOpen ? <CloseIcon /> : <DashboardCustomizeIcon />}
          </Fab>

          {/* Floating panel overlay when opened */}
          {isDrawerOpen && (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 48,
                width: '200px',
                height: 'calc(100% - 48px)',
                bgcolor: 'rgba(0,0,0,0.9)',
                zIndex: 10001,
                boxShadow: '4px 0 20px rgba(0,0,0,0.5)',
                pointerEvents: 'auto',
              }}
            >
              {toolboxContent(true)}
            </Box>
          )}
        </>
      ) : (
        /* Sidebar mode when not collapsed */
        <Box
          ref={containerRef}
          sx={{
            position: 'relative',
            top: 48,
            width: '180px',
            // subtract the 48px top offset so the sidebar's bottom lands on the
            // panel bottom instead of overhanging it (mirrors the collapsed
            // drawer's calc height above); toolboxContent scrolls internally
            height: 'calc(100% - 48px)',
            zIndex: 10001,
            boxShadow: '2px 0 10px rgba(0,0,0,0.2)',
          }}
        >
          {toolboxContent(false)}
        </Box>
      )}
    </Box>
  );
};

export default Toolbox;
