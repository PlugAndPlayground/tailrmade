// needs to live in a separate file due to webpack ReferenceError
import React from 'react';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import {
  FlexDirection,
  isLayoutableNode,
  Layoutable,
  MobileBehavior,
} from '../utils/interfaces';
import { DeferredReactType } from '../nodes/datatypes/deferredHtmlType';
import { ensureVisible } from '../pixi/utils-pixi';
import PPGraph from '../classes/GraphClass';
import { StyledButton } from '../components/StyledButton';
import InterfaceController from '../InterfaceController';
import {
  DynamicWidgetName,
  VISIBILITY_ACTION,
} from '../utils/constants_shared';
import { UNSET_VALUE } from './constants';

export const SOCKET_NAME_DASHBOARD_CONTENT = 'ReactUI';
export const widthName = 'Width';
export const heightName = 'Height';
export const directionName = 'Direction';

export const editPadding = 8;

type DashboardContentOutputNode = {
  getOutputSocketByName(name: string): unknown;
  addOutput(
    name: string,
    type: DeferredReactType,
    visible?: boolean,
    redraw?: boolean,
  ): void;
};

export function addDashboardContentOutput(
  node: DashboardContentOutputNode,
): void {
  // Check if the socket already exists
  if (!node.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)) {
    node.addOutput(
      SOCKET_NAME_DASHBOARD_CONTENT,
      new DeferredReactType(),
      false,
    );
  }
}

export const getDimensionValue = (value: string, isChild: boolean = false) => {
  if (isChild && value.endsWith('%')) {
    return '100%';
  }
  return value;
};

export const getNewDirection = (
  direction: string,
  isSmallScreen: boolean,
  mobileBehavior: any,
): FlexDirection => {
  return direction === 'row' && isSmallScreen && mobileBehavior === 'column'
    ? 'column'
    : (direction as FlexDirection);
};

// Basic layout styles for all components (widgets that are not containers)
export const getBasicLayoutStyles = (
  width: string,
  height: string,
  parentDirection: 'row' | 'column',
): React.CSSProperties => {
  const style: React.CSSProperties = {
    display: 'flex',
    overflow: getOverflowForSize(width, height),
  };

  // Handle width
  style.width = getDimensionValue(width);

  if (parentDirection === 'row' && width !== 'auto' && !width.endsWith('%')) {
    style.flexGrow = 0;
    style.flexShrink = 0;
    style.flexBasis = 'auto';
  }

  // flex-grow/shrink act along the parent's main axis: on the horizontal
  // axis "100%" means "share the remaining space between siblings", so the
  // item must be allowed to shrink from its 100%-of-parent basis (which
  // overflows as soon as there is more than one such sibling). The basis
  // stays 'auto' so that wrapping rows still put each 100% item on its
  // own line
  if (parentDirection === 'row' && width === '100%') {
    style.flexGrow = 1;
    style.flexShrink = 1;
  }

  if (parentDirection === 'row' && width === 'auto') {
    style.minWidth = UNSET_VALUE;
  }

  // Handle height
  style.height = getDimensionValue(height);

  // mirror of the fixed-width branch above: a fixed height on the vertical
  // main axis must not shrink when a fill sibling's 100% basis overflows
  // the parent, nor grow into free space
  if (
    parentDirection === 'column' &&
    height !== 'auto' &&
    !height.endsWith('%')
  ) {
    style.flexGrow = 0;
    style.flexShrink = 0;
    style.flexBasis = 'auto';
  }

  if (parentDirection === 'column' && height === '100%') {
    style.flexGrow = 1;
    style.flexShrink = 1;
    // basis 'auto' (not 'content'): in a definite-height parent the 100%
    // bases are identical, so siblings shrink to an EQUAL split
    // (Figma-style fill) instead of growing from unequal content sizes;
    // in a hug (auto-height) parent the percentage cannot resolve and the
    // basis falls back to the content size - never 0, which would collapse
    style.flexBasis = 'auto';
  }

  return style;
};

// Complete layout styles for containers (includes direction and wrapping behavior)
export const getContainerLayoutStyle = (
  direction: FlexDirection,
  mobileBehavior: MobileBehavior,
  width: string,
  height: string,
  parentDirection: FlexDirection,
): React.CSSProperties => {
  // Get the basic layout styles first and pass along the parent direction
  const style = getBasicLayoutStyles(width, height, parentDirection);

  if (parentDirection === 'column' && height === '100%') {
    // the basis is already 'auto' (getBasicLayoutStyles); containers
    // additionally drop their minHeight floor (default '80px') so equal
    // shrinking is not cut short by it
    style.minHeight = 0;
  }

  // Add container-specific styles
  const flexWrap =
    direction === 'row' && mobileBehavior === 'wrap' ? 'wrap' : 'nowrap';

  return {
    ...style,
    flexDirection: direction,
    flexWrap: flexWrap,
  };
};

// ROOT in the craftjs tree isn't itself a graph node - it represents the
// UI surface node currently open for editing. Resolve that as a Layoutable
// so ROOT can be focused/selected/jumped-to like any other dashboard item.
export function getDisplayedSurfaceElement(): Layoutable | null {
  const surfaceId = InterfaceController.displayedSurfaceNodeId;
  const surfaceNode = surfaceId
    ? PPGraph.currentGraph?.getNodeById(surfaceId)
    : null;
  return surfaceNode && isLayoutableNode(surfaceNode) ? surfaceNode : null;
}

export function handleNodeSelection(
  layoutableElement: Layoutable,
  options: {
    ensureVisibility?: boolean;
    select?: boolean;
    stopPropagation?: boolean;
  } = {},
) {
  const {
    ensureVisibility = true,
    select = true,
    stopPropagation = true,
  } = options;

  return async (e?: React.SyntheticEvent) => {
    if (e && stopPropagation) e.stopPropagation();

    const nodeToJumpTo = layoutableElement.getRelatedNode();
    if (nodeToJumpTo) {
      if (select) {
        PPGraph.currentGraph.selection.selectNodes([nodeToJumpTo], false);
        InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
      }

      if (ensureVisibility) {
        requestAnimationFrame(async () => {
          await ensureVisible([nodeToJumpTo], false);
        });
      }

      PPGraph.currentGraph.selection.drawSingleFocus(nodeToJumpTo);
    }
  };
}

export function renderSelectNodeButton(
  handleSelectNode: (e: any) => Promise<void>,
): React.ReactNode {
  return (
    <StyledButton
      data-cy="select-node-button"
      onClick={handleSelectNode}
      sx={{
        position: 'absolute',
        top: '0px',
        right: '0px',
        zIndex: 100,
        width: '18px',
        height: '18px',
        p: 0,
        borderRadius: 0,
      }}
    >
      <HighlightAltIcon sx={{ fontSize: '16px' }} />
    </StyledButton>
  );
}

export function getOverflowForSize(
  width: string,
  height: string,
): 'visible' | 'auto' {
  return width === 'auto' && height === 'auto' ? 'visible' : 'auto';
}

// check if the dashboard item is linked to a node on the graph/canvas
export function isLinkedToNode(
  nodes: Record<string, any>,
  nodeId: string,
): boolean {
  const node = nodes[nodeId];
  if (!node) return false;

  // Primary check: if props.id exists, it's linked to a canvas node
  // props.id format: NODE_<id> or SOCKET_<id>
  if (node.data?.props?.id) {
    return true;
  }

  // Legacy compatibility checks for old graphs
  return (
    node.data?.custom?.linkedToNode ||
    node.data?.custom?.isCanvasItem || // old field name
    node.data.name === DynamicWidgetName // very old graphs
  );
}

/**
 * Check if a node is currently in the dashboard or connected via ReactUI
 * @param node - The node to check
 * @returns true if the node is in the dashboard, false otherwise
 */
export function isNodeInDashboard(node: any): boolean {
  // If ReactUI output socket is connected, we're rendering for dashboard
  const reactUISocket = node.getOutputSocketByName(
    SOCKET_NAME_DASHBOARD_CONTENT,
  );
  if (reactUISocket.hasLink()) {
    return true;
  }

  // Otherwise check if this specific node is directly in the dashboard
  try {
    const dashboardNodes = InterfaceController.getDashboardState();
    if (!dashboardNodes) {
      return false;
    }
    const dashboardId = node.getDashboardId();
    // Check if any dashboard node has this node's dashboard ID
    const inDashboard = Object.values(dashboardNodes).some(
      (dashboardNode: any) => dashboardNode.data.props.id === dashboardId,
    );
    return inDashboard;
  } catch (error) {
    console.error('[isNodeInDashboard] Error checking dashboard status', {
      nodeId: node.id,
      error,
    });
    return false;
  }
}

/**
 * Utility function to scroll a widget into view after adding or selecting it
 * @param widgetId - The ID of the widget to scroll into view
 * @param query - The Craft.js query object
 */
export function scrollWidgetIntoView(widgetId: string, query: any) {
  const widget = query.node(widgetId).get();
  if (widget?.dom) {
    widget.dom.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }
}
