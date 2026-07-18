import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useEditor, NodeId } from '@craftjs/core';
import {
  Box,
  Breadcrumbs,
  Collapse,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import WebAssetIcon from '@mui/icons-material/WebAsset';
import WidgetsIcon from '@mui/icons-material/Widgets';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ArticleIcon from '@mui/icons-material/Article';
import PolylineIcon from '@mui/icons-material/Polyline';
import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';
import {
  containerName,
  DynamicWidgetName,
  RootName,
  VISIBILITY_ACTION,
} from '../../utils/constants_shared';
import { RightDrawerView } from '../../utils/constants';
import { DashboardContainerName } from './DashboardContainer';
import { getLayoutableElement } from '../../utils/utils';
import {
  getDisplayedSurfaceElement,
  handleNodeSelection,
} from '../../utils/layoutableHelpers';
import { Layoutable } from '../../utils/interfaces';
import * as styles from '../../utils/style.module.css';
import { useIsDashboardNarrow } from './hooks';

/**
 * A Photoshop-like layers panel for the dashboard editor.
 * Shows the full node tree with expand/collapse, selection,
 * visibility toggle, and drag-and-drop reordering.
 *
 * Inspired by @craftjs/layers but implemented with MUI
 * to match the existing project theme and avoid adding
 * styled-components as a dependency.
 */

// ── Drag-and-drop state shared across all layer items ──

type DropPosition = 'before' | 'after' | 'inside';

let draggedNodeId: NodeId | null = null;

type LayerNodeProps = {
  id: NodeId;
  depth: number;
};

const getNodeIcon = (
  displayName: string,
  isCanvas: boolean,
  custom?: any,
  props?: any,
  isMobile?: boolean,
) => {
  if (displayName === RootName) {
    return <WebAssetIcon sx={{ fontSize: 16 }} />;
  }

  // Try to get icon from the Layoutable interface
  const layoutable = props?.id ? getLayoutableElement(props.id) : null;
  if (layoutable) {
    const icon = layoutable.getDashboardIcon({
      flexDirection: props?.flexDirection,
      mobileBehavior: props?.mobileBehavior,
      isMobile,
    });
    if (icon) return icon;
  }

  const customIcon = custom?.getDashboardIcon?.({
    flexDirection: props?.flexDirection,
    mobileBehavior: props?.mobileBehavior,
    isMobile,
  });
  if (customIcon) {
    return customIcon;
  }

  if (displayName === DashboardContainerName || displayName === containerName) {
    return <ViewColumnIcon sx={{ fontSize: 16 }} />;
  }
  if (isCanvas) {
    return <ArticleIcon sx={{ fontSize: 16 }} />;
  }
  return <WidgetsIcon sx={{ fontSize: 16 }} />;
};

/**
 * Check whether `candidateAncestor` is an ancestor of `nodeId`
 * (i.e. dropping into own descendant would create a cycle).
 */
const isAncestor = (
  query: any,
  nodeId: NodeId,
  candidateAncestor: NodeId,
): boolean => {
  try {
    return query.node(nodeId).ancestors().includes(candidateAncestor);
  } catch {
    return false;
  }
};

const LayerItem: React.FC<LayerNodeProps> = ({ id, depth }) => {
  const isMobile = useIsDashboardNarrow();
  const {
    node,
    selected,
    hovered,
    childNodeIds,
    parentId,
    actions,
    query,
    isEditMode,
    selectedId,
  } = useEditor((state, editorQuery) => {
    const currentNode = state.nodes[id];
    if (!currentNode)
      return {
        node: null,
        childNodeIds: [],
        parentId: null,
        isEditMode: false,
      };

    const selectedId = state.events.selected
      ? Array.from(state.events.selected)[0]
      : null;
    const hoveredId = state.events.hovered
      ? typeof state.events.hovered === 'object'
        ? Array.from(state.events.hovered as Set<string>)[0]
        : state.events.hovered
      : null;

    return {
      node: {
        displayName: currentNode.data.displayName,
        name: currentNode.data.name,
        hidden: currentNode.data.hidden,
        isCanvas: currentNode.data.isCanvas,
        props: currentNode.data.props,
        custom: currentNode.data.custom,
      },
      selected: selectedId === id,
      hovered: hoveredId === id,
      childNodeIds: currentNode.data.nodes || [],
      parentId: currentNode.data.parent,
      isEditMode: state.options.enabled,
      selectedId,
    };
  });

  const [expanded, setExpanded] = useState(true);
  const [dropIndicator, setDropIndicator] = useState<DropPosition | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = childNodeIds.length > 0;

  // Auto-scroll selected layer into view
  useEffect(() => {
    if (selected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  // Auto-expand when a descendant gets selected
  useEffect(() => {
    if (!hasChildren || expanded || !selectedId || selectedId === id) return;
    try {
      if (query.node(selectedId).ancestors().includes(id)) {
        setExpanded(true);
      }
    } catch {
      return;
    }
  }, [selectedId, hasChildren, expanded, id, query]);

  // ── Selection / expand / visibility handlers ──
  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isEditMode) {
        // Enter edit mode and select this widget
        InterfaceController.openDashboardInEditMode();
        // Select after a tick so the editor is enabled
        requestAnimationFrame(() => {
          actions.selectNode(id);
        });
      } else {
        actions.selectNode(id);
      }
    },
    [actions, id, isEditMode],
  );

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  // ── Hover highlight handlers ──

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      try {
        const isRoot = id === RootName;
        const nodeElementId = node?.props?.id;
        let layoutable = null;
        if (isRoot) {
          layoutable = getDisplayedSurfaceElement();
        } else if (nodeElementId) {
          layoutable = getLayoutableElement(nodeElementId);
        }
        const relatedNode = layoutable?.getRelatedNode();
        if (relatedNode) {
          PPGraph.currentGraph.selection.drawSingleFocus(relatedNode);
        }
      } catch (error) {
        // element may not exist yet
        console.error('handleMouseEnter: skipped focus for id', id, error);
      }
      // Apply blue hover outline directly on dashboard widget DOM
      const widgetDom = document.getElementById(id);
      if (widgetDom) {
        widgetDom.classList.add(styles.componentHover);
      }
    },
    [node?.props?.id, id],
  );

  const handleMouseLeave = useCallback(() => {
    PPGraph.currentGraph.selection.clearFocus();
    const widgetDom = document.getElementById(id);
    if (widgetDom) {
      widgetDom.classList.remove(styles.componentHover);
    }
  }, [id]);

  // ── Drag-and-drop handlers ──

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // Don't allow dragging ROOT
      if (id === RootName) {
        e.preventDefault();
        return;
      }
      draggedNodeId = id;
      e.dataTransfer.effectAllowed = 'move';
      // Make the drag image slightly transparent
      if (rowRef.current) {
        e.dataTransfer.setDragImage(rowRef.current, 0, 0);
      }
    },
    [id],
  );

  const handleDragEnd = useCallback(() => {
    draggedNodeId = null;
    setDropIndicator(null);
  }, []);

  const computeDropPosition = useCallback(
    (e: React.DragEvent): DropPosition | null => {
      if (!rowRef.current || !draggedNodeId || draggedNodeId === id) {
        return null;
      }
      // Can't drop a node into its own descendant
      if (isAncestor(query, draggedNodeId, id)) {
        return null;
      }

      const rect = rowRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = y / rect.height;

      // For canvas/container nodes: top third = before, middle = inside, bottom third = after
      if (node?.isCanvas) {
        if (ratio < 0.25) return 'before';
        if (ratio > 0.75) return 'after';
        return 'inside';
      }
      // For leaf nodes: top half = before, bottom half = after
      return ratio < 0.5 ? 'before' : 'after';
    },
    [id, node?.isCanvas, query],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = computeDropPosition(e);
      setDropIndicator(pos);
      e.dataTransfer.dropEffect = pos ? 'move' : 'none';
    },
    [computeDropPosition],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if actually leaving this element
    if (
      rowRef.current &&
      !rowRef.current.contains(e.relatedTarget as HTMLElement)
    ) {
      setDropIndicator(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropIndicator(null);

      if (!draggedNodeId || draggedNodeId === id) return;
      if (isAncestor(query, draggedNodeId, id)) return;

      const pos = computeDropPosition(e);
      if (!pos) return;

      try {
        if (pos === 'inside') {
          // Drop as last child of this container
          actions.move(draggedNodeId, id, childNodeIds.length);
        } else if (parentId) {
          // Get siblings of the target to find the insertion index
          const targetNode = query.node(id).get();
          const targetParent = targetNode.data.parent;
          if (!targetParent) return;
          const siblings = query.node(targetParent).childNodes();
          const targetIndex = siblings.indexOf(id);
          const insertIndex = pos === 'before' ? targetIndex : targetIndex + 1;
          actions.move(draggedNodeId, targetParent, insertIndex);
        }
      } catch (err) {
        console.warn('Layer drag-drop failed:', err);
      }

      draggedNodeId = null;
    },
    [id, parentId, childNodeIds.length, actions, query, computeDropPosition],
  );

  if (!node) return null;

  // Resolve linked node name (same logic as RenderNode.getDisplayNameWithIcon)
  let label = id === RootName ? 'Root' : node.displayName || node.name || id;
  let elementId = node.props?.id;
  let linkedNodeElement: Layoutable | null = null;
  if (id === RootName) {
    linkedNodeElement = getDisplayedSurfaceElement();
  } else if (
    (node.name === DynamicWidgetName ||
      node.displayName === DashboardContainerName) &&
    elementId
  ) {
    try {
      const layoutableElement = getLayoutableElement(elementId);
      if (layoutableElement) {
        label = layoutableElement.getDashboardName();
        linkedNodeElement = layoutableElement;
      }
    } catch {
      // keep the fallback label
    }
  }

  const handleJumpToNode = (
    layoutableElement: Layoutable,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    InterfaceController.setRightDrawerView(RightDrawerView.GRAPH);
    void handleNodeSelection(layoutableElement, { stopPropagation: false })(e);
  };

  // Build tooltip: node/element ID + widget type
  const tooltipLines: string[] = [];
  if (elementId) {
    tooltipLines.push(elementId);
  }
  if (node.displayName && node.displayName !== label) {
    tooltipLines.push(node.displayName);
  }
  const tooltipText = tooltipLines.length > 0 ? tooltipLines.join(' — ') : id;

  // Indicator line styles
  const dropLineStyle: Record<string, any> = {};
  if (dropIndicator === 'before') {
    dropLineStyle.borderTop = '2px solid';
    dropLineStyle.borderTopColor = 'primary.main';
  } else if (dropIndicator === 'after') {
    dropLineStyle.borderBottom = '2px solid';
    dropLineStyle.borderBottomColor = 'primary.main';
  } else if (dropIndicator === 'inside') {
    dropLineStyle.outline = '1px solid';
    dropLineStyle.outlineColor = 'primary.main';
    dropLineStyle.outlineOffset = '-1px';
  }

  return (
    <Box>
      <Stack
        ref={rowRef}
        title={tooltipText}
        direction="row"
        alignItems="center"
        draggable={isEditMode && id !== RootName}
        onClick={handleSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onDragStart={isEditMode ? handleDragStart : undefined}
        onDragEnd={isEditMode ? handleDragEnd : undefined}
        onDragOver={isEditMode ? handleDragOver : undefined}
        onDragLeave={isEditMode ? handleDragLeave : undefined}
        onDrop={isEditMode ? handleDrop : undefined}
        sx={(theme) => ({
          pl: `${depth * 16 + 4}px`,
          pr: 0.5,
          py: 0.25,
          minHeight: 30,
          cursor: isEditMode && id !== RootName ? 'grab' : 'pointer',
          userSelect: 'none',
          borderRadius: 0.5,
          bgcolor: selected
            ? alpha(theme.palette.primary.main, 0.25)
            : hovered
              ? alpha(theme.palette.action.hover, 0.08)
              : 'transparent',
          '&:hover': {
            bgcolor: selected
              ? alpha(theme.palette.primary.main, 0.3)
              : alpha(theme.palette.action.hover, 0.12),
          },
          transition: 'background-color 0.1s',
          ...dropLineStyle,
        })}
      >
        {/* Expand / collapse toggle */}
        <Box sx={{ width: 20, flexShrink: 0, display: 'flex' }}>
          {hasChildren ? (
            <IconButton size="small" onClick={handleToggleExpand} sx={{ p: 0 }}>
              {expanded ? (
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          ) : null}
        </Box>

        {/* Node type icon */}
        <Box
          sx={{
            mr: 0.75,
            display: 'flex',
            alignItems: 'center',
            color: 'text.secondary',
          }}
        >
          {getNodeIcon(
            node.displayName,
            node.isCanvas,
            node.custom,
            node.props,
            isMobile,
          )}
        </Box>

        {/* Label */}
        <Typography
          variant="body2"
          noWrap
          sx={{
            flex: 1,
            fontSize: '12px',
            fontWeight: selected ? 600 : 400,
          }}
        >
          {label}
        </Typography>

        {/* Jump to the linked graph node */}
        {linkedNodeElement && (
          <Tooltip
            title={`Linked to ${
              id === RootName ? linkedNodeElement.getDashboardName() : label
            } — open in Graph tab`}
          >
            <IconButton
              size="small"
              onClick={(e) => handleJumpToNode(linkedNodeElement, e)}
              sx={{ p: 0.25, ml: 0.5, flexShrink: 0 }}
              data-cy={`layer-jump-to-node-${id}`}
            >
              <PolylineIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* Children */}
      {hasChildren && (
        <Collapse in={expanded} timeout={150} unmountOnExit>
          {childNodeIds.map((childId: string) => (
            <LayerItem key={childId} id={childId} depth={depth + 1} />
          ))}
        </Collapse>
      )}
    </Box>
  );
};

export const DashboardLayersPanel: React.FC = () => {
  const { rootNode, selectedId, actions, query } = useEditor((state) => {
    const selId = state.events.selected
      ? Array.from(state.events.selected)[0]
      : null;
    return {
      rootNode: state.nodes[RootName],
      selectedId: selId || null,
    };
  });

  // Build breadcrumb items for the selected node
  const breadcrumbItems = useMemo(() => {
    if (!selectedId) return [];
    const crumbs: { id: string; name: string }[] = [];
    let dashboardId = selectedId;
    try {
      while (dashboardId && dashboardId !== RootName) {
        const node = query.node(dashboardId).get();
        if (!node) break;
        crumbs.unshift({ id: dashboardId, name: node.data.displayName });
        dashboardId = node.data.parent ?? '';
      }
      crumbs.unshift({ id: RootName, name: 'Root' });
    } catch {
      // node may not exist
    }
    return crumbs;
  }, [selectedId, query]);

  if (!rootNode) return null;

  return (
    <Box
      sx={{
        bgcolor: 'background.medium',
        py: 0.5,
        px: 0.5,
        display: 'flex',
        flexDirection: 'column',
        // Fill the parent's allocated space
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        outline: 'none',
      }}
      data-cy="layers-panel"
    >
      {/* Scrollable tree — Root node serves as the collapsible header */}
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        <LayerItem id={RootName} depth={0} />
      </Box>

      {/* Fixed breadcrumbs footer */}
      {breadcrumbItems.length > 1 && (
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
          aria-label="component hierarchy"
          sx={{
            pt: 0.5,
            px: 0.5,
            flexShrink: 0,
            overflowX: 'auto',
            '& .MuiBreadcrumbs-ol': {
              flexWrap: 'nowrap',
            },
          }}
          data-cy="node-breadcrumbs"
        >
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1;
            return isLast ? (
              <Typography
                key={item.id}
                color="text.primary"
                variant="caption"
                sx={{ whiteSpace: 'nowrap' }}
              >
                {item.name}
              </Typography>
            ) : (
              <Link
                key={item.id}
                component="button"
                variant="caption"
                color="text.secondary"
                underline="hover"
                onClick={() => actions.selectNode(item.id)}
                sx={{
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textTransform: 'none',
                  '&:hover': { color: 'primary.main' },
                }}
                data-cy={`breadcrumb-${item.id}`}
              >
                {item.name}
              </Link>
            );
          })}
        </Breadcrumbs>
      )}
    </Box>
  );
};
