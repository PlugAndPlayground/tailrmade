import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Tooltip, Divider, Typography, Drawer } from '@mui/material';
import { Element, useEditor } from '@craftjs/core';
import { v4 as uuid } from 'uuid';
import { hri } from 'human-readable-ids';
import { Container } from './Container';
import { Text } from './Text';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import PPGraph from './../../classes/GraphClass';
import { addNodeWithPlacement } from './DashboardEditor';
import { TRgba } from '../../utils/color';
import { ensureVisible } from '../../pixi/utils-pixi';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { getDefaultContainerBackground } from '../../nodes/datatypes/widgetLayoutType';
import { NodeListOptionType } from '../Search';
import { getNodeGroup } from '../nodeSearchConstants';
import { getAllNodeTypes } from '../../nodes/allNodes';
import { PlaceholderWidget } from './PlaceholderWidget';
import { NODE_SOURCE } from '../../utils/constants';
import { useDashboardPanelWidth } from './hooks';
import { setToolboxOpen, useToolboxOpen } from './viewState';
import { MAIN_COLOR } from '../../utils/constants';

export const draggedWidgetType = 'widget-node';

const TOOLBOX_WIDTH = 180;
// The drawer is scoped to the dashboard box, so it only has to outrank the
// widgets it floats over - not the whole shell. Anything global (dialogs,
// snackbars, the rail's menus) still wins, which is the point.
const TOOLBOX_Z_INDEX = 5;

// The panel is too narrow for an in-flow sidebar below COLLAPSE_BELOW, and
// roomy enough for one again above EXPAND_ABOVE. The thresholds differ on
// purpose: showing the sidebar is itself what takes the width away, so with a
// single threshold a panel parked on it flaps between the two layouts.
const COLLAPSE_BELOW = 500;
const EXPAND_ABOVE = 560;

// Derived during render rather than in an effect, so the toolbox never paints
// a frame in the layout it is about to leave. Safe to run twice with the same
// width: outside the hysteresis band both branches agree, and inside it each
// branch keeps the state it was given, so the result is idempotent.
function useIsToolboxCollapsed(): boolean {
  const panelWidth = useDashboardPanelWidth();
  const collapsedRef = useRef(panelWidth < COLLAPSE_BELOW);

  collapsedRef.current = collapsedRef.current
    ? panelWidth <= EXPAND_ABOVE
    : panelWidth < COLLAPSE_BELOW;

  return collapsedRef.current;
}

const rowStyles = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  marginBottom: '2px',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
  width: '100%',
};

const labelStyles = {
  maxWidth: '120px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// craft's editor handles are untyped throughout this codebase - keep them
// loose here rather than inventing a shape they do not actually have
type CraftHandle = any;

type WidgetNodeButtonProps = {
  node: any;
  widgetId: string;
  connectors: CraftHandle;
  addToDashboard: (itemToAdd: any) => Promise<void> | void;
  onAdded: () => void;
};

// Creates a node on the graph and adds it to the surface as a widget.
const WidgetNodeButton: React.FC<WidgetNodeButtonProps> = ({
  node,
  widgetId,
  connectors,
  addToDashboard,
  onAdded,
}) => {
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
      onAdded();
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
              background={TRgba.fromString(MAIN_COLOR)
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
          ...rowStyles,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DashboardCustomizeIcon fontSize="small" sx={{ mr: 1 }} />
        <Typography variant="body2" noWrap sx={labelStyles}>
          {node.name}
        </Typography>
      </Box>
    </Tooltip>
  );
};

type LayoutableNodeButtonProps = {
  id: string;
  node: any;
  connectors: CraftHandle;
  addToDashboard: (itemToAdd: any) => Promise<void> | void;
};

// Adds a node that already exists on the graph as a widget.
const LayoutableNodeButton: React.FC<LayoutableNodeButtonProps> = ({
  id,
  node,
  connectors,
  addToDashboard,
}) => {
  const handleClick = () => {
    void addToDashboard(node);
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
              background={node.getColor().darken(0.4).setAlpha(0.2).toString()}
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
          ...rowStyles,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
          borderLeft: `4px solid ${node.getColor()}`,
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
          <Typography variant="body2" noWrap sx={labelStyles}>
            {node.name}
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
};

type StaticToolButtonProps = {
  tool: any;
  connectors: CraftHandle;
  query: CraftHandle;
  actions: CraftHandle;
};

// Adds a static widget, not linked to any node.
const StaticToolButton: React.FC<StaticToolButtonProps> = ({
  tool,
  connectors,
  query,
  actions,
}) => {
  const { icon: Icon, tooltip, element, dataCy, nest = true } = tool;

  return (
    <Tooltip title={tooltip} placement="right">
      <Box
        ref={(ref) => {
          connectors.create(ref, element);
        }}
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
        sx={{ ...rowStyles, cursor: 'pointer' }}
      >
        <Icon fontSize="small" sx={{ mr: 1 }} />
        <Typography variant="body2" noWrap sx={labelStyles}>
          {tooltip}
        </Typography>
      </Box>
    </Tooltip>
  );
};

const getStaticTools = () => [
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
        background={getDefaultContainerBackground()}
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
        background={getDefaultContainerBackground()}
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
        color={TRgba.fromString(MAIN_COLOR).getContrastTextColor()}
      />
    ),
  },
];

type ToolboxProps = {
  addToDashboard: (itemToAdd: any) => Promise<void> | void;
};

export const Toolbox: React.FC<ToolboxProps> = ({ addToDashboard }) => {
  const { actions, connectors, query } = useEditor();
  const [widgetNodes, setWidgetNodes] = useState<any[]>([]);
  const [layoutableNodes, setLayoutableNodes] = useState<[string, any][]>([]);
  const nodeIdMapRef = useRef(new Map<string, string>());
  // Used to force re-render after regenerating IDs so connectors.create picks up new placeholder IDs
  const [idRefreshCounter, setIdRefreshCounter] = useState(0);
  const isCollapsed = useIsToolboxCollapsed();
  const isOpen = useToolboxOpen();

  const staticTools = useMemo(() => getStaticTools(), []);

  // Crossing the breakpoint resets the toolbox: a panel that just got too
  // narrow must not have it covering the surface, and one that just got wide
  // enough gets its sidebar back.
  useEffect(() => {
    setToolboxOpen(!isCollapsed);
  }, [isCollapsed]);

  const regenerateWidgetId = useCallback((key: string) => {
    nodeIdMapRef.current.set(key, `NODE_${hri.random()}`);
    // Trigger re-render so the placeholder element re-attaches with the new ID
    setIdRefreshCounter((c) => c + 1);
  }, []);

  // the ids are seeded when the widget list loads; this covers the render
  // that beats the effect (and any type that shows up later)
  const getWidgetId = (key: string): string => {
    const existing = nodeIdMapRef.current.get(key);
    if (existing) {
      return existing;
    }
    const generated = `NODE_${hri.random()}`;
    nodeIdMapRef.current.set(key, generated);
    return generated;
  };

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
        group: getNodeGroup(obj.tags),
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

  // A wide panel with the toolbox toggled off has nothing to render at all.
  // The narrow one stays mounted while closed, so its rows keep their craft
  // drag connectors and the drawer has something to transition.
  if (!isCollapsed && !isOpen) {
    return null;
  }

  return (
    <Drawer
      // Wide: an ordinary flex child that pushes the surface aside. Narrow:
      // the same drawer lifted out of the flow so it floats over the surface
      // instead of squeezing it.
      //
      // Deliberately NOT `temporary`: that variant is a modal, and its
      // backdrop would swallow the drags this toolbox exists for - every row
      // is a craft drag source aimed at the surface underneath. Without a
      // backdrop there is no click-away either, so the header button (and
      // widening the panel) is what closes it.
      variant={isCollapsed ? 'persistent' : 'permanent'}
      open={isCollapsed ? isOpen : true}
      slotProps={{
        docked: {
          sx: isCollapsed
            ? {
                // relative to the dashboard box, which already starts below
                // the dashboard header - hence no top offset of its own
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                zIndex: TOOLBOX_Z_INDEX,
              }
            : {},
        },
        paper: {
          sx: {
            position: 'relative',
            width: TOOLBOX_WIDTH,
            border: 'none',
            overflowX: 'hidden',
            boxShadow: isCollapsed
              ? '4px 0 20px rgba(0,0,0,0.5)'
              : '2px 0 10px rgba(0,0,0,0.2)',
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: '3px',
            },
          },
        },
      }}
    >
      {/* the drawer's paper is the surface (position, width, background); this
          is the content that scrolls inside it */}
      <Box data-cy="vertical-toolbox" sx={{ padding: '4px' }}>
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
            <StaticToolButton
              key={index}
              tool={tool}
              connectors={connectors}
              query={query}
              actions={actions}
            />
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
                  widgetId={getWidgetId(node.key)}
                  connectors={connectors}
                  addToDashboard={addToDashboard}
                  onAdded={() => regenerateWidgetId(node.key)}
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
                <LayoutableNodeButton
                  key={id}
                  id={id}
                  node={node}
                  connectors={connectors}
                  addToDashboard={addToDashboard}
                />
              ))}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
};

export default Toolbox;
