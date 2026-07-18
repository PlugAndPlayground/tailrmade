import { useNode, useEditor } from '@craftjs/core';
import React, { useEffect, useState } from 'react';
import { Box, IconButton, styled, Popper } from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import SubdirectoryArrowLeftIcon from '@mui/icons-material/SubdirectoryArrowLeft';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TuneIcon from '@mui/icons-material/Tune';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  getLayoutableElement,
  isEventComingFromWithinTextInput,
} from '../../utils/utils';
import { DashboardContainerName } from './DashboardContainer';
import {
  getDisplayedSurfaceElement,
  handleNodeSelection,
  scrollWidgetIntoView,
} from '../../utils/layoutableHelpers';
import * as styles from '../../utils/style.module.css';
import PPGraph from '../../classes/GraphClass';
import { useIsDashboardNarrow } from './hooks';
import {
  DynamicWidgetName,
  RootName,
  VISIBILITY_ACTION,
} from '../../utils/constants_shared';
import { RightDrawerView } from '../../utils/constants';

const IndicatorBox = styled(Box)<{ isActive?: boolean }>(
  ({ theme, isActive }) => ({
    height: '30px',
    fontSize: '12px',
    lineHeight: '12px',
    pointerEvents: isActive ? 'auto' : 'none',
    display: 'flex',
    alignItems: 'center',
    padding: '8px 8px 8px 4px',
    backgroundColor: isActive
      ? theme.palette.secondary.main
      : `${theme.palette.primary.main}80`,
    color: isActive
      ? theme.palette.secondary.contrastText
      : theme.palette.primary.contrastText,
    '& svg': {
      width: '16px',
      height: '16px',
      fill: isActive
        ? theme.palette.secondary.contrastText
        : theme.palette.primary.contrastText,
    },
  }),
);

export const ActionButton = styled(IconButton)(({ theme }) => ({
  padding: 0,
  opacity: 0.9,
  color: theme.palette.primary.contrastText,
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
}));

export const RenderNode = ({ render }) => {
  const { id, node } = useNode((node) => ({ id: node.id, node }));
  const { actions, query, isActive, isEditMode } = useEditor(
    (state, query) => ({
      isActive: query.getEvent('selected').contains(id),
      isEditMode: state.options.enabled,
    }),
  );
  const isRoot = id === RootName;
  const isMobile = useIsDashboardNarrow();

  const {
    isHover,
    dom,
    name,
    displayName,
    moveable,
    deletable,
    connectors: { drag },
    parent,
    props,
    actions: { setHidden },
  } = useNode((node) => ({
    isHover: node.events.hovered,
    dom: node.dom,
    name: node.data.name,
    displayName: node.data.displayName,
    moveable: query.node(node.id).isDraggable(),
    deletable: query.node(node.id).isDeletable(),
    parent: node.data.parent,
    props: node.data.props,
  }));

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // In surface mode a NODE_ widget is the single representation of one graph
  // link (maintained by SurfaceSync). Duplicating its craft item would create
  // a second widget with no matching link, so duplicate is disabled for it —
  // the user duplicates the node on the canvas instead.
  const displayedSurfaceId = InterfaceController.displayedSurfaceNodeId;
  const displayedSurface = displayedSurfaceId
    ? PPGraph.currentGraph.getNodeById(displayedSurfaceId)
    : undefined;
  const isManagedNodeWidget =
    Boolean(displayedSurface?.isSurface()) &&
    typeof props?.id === 'string' &&
    props.id.startsWith('NODE_');

  useEffect(() => {
    if (isEditMode && (isHover || isActive) && dom) {
      setAnchorEl(dom);
    } else {
      setAnchorEl(null);
    }
  }, [isHover, isActive, dom, isEditMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if event is coming from within a text input or node is not active
      if (!isEditMode || isEventComingFromWithinTextInput(e) || !isActive)
        return;

      // Handle keys with Alt/Option modifier (for MOVING nodes)
      if (e.altKey && moveable) {
        switch (e.key) {
          case 'ArrowUp':
          case 'ArrowLeft':
            moveNode(e, 'up');
            break;
          case 'ArrowDown':
          case 'ArrowRight':
            moveNode(e, 'down');
            break;
        }
        return;
      }

      // Handle keys with Shift modifier
      if (e.shiftKey && e.key === 'Enter' && parent) {
        // Select parent with Shift+Enter
        e.stopPropagation();
        e.preventDefault();
        actions.selectNode(parent);
        return;
      }

      // Handle keys without modifiers
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (deletable) {
            e.stopPropagation();
            e.preventDefault();
            deleteAndSelectNext(e);
          }
          break;

        case 'Enter':
          // Select children with Enter
          e.stopPropagation();
          e.preventDefault();
          const childNodes = query.node(id).childNodes();
          if (childNodes.length > 0) {
            actions.selectNode(childNodes[0]);
          }
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          selectAdjacentNode(e, 'up');
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          selectAdjacentNode(e, 'down');
          break;

        case 'd':
          if (e.ctrlKey || e.metaKey) {
            duplicateNode(e);
            return;
          }
          break;
      }
    };

    InterfaceController.unselectDashboardItems = () => {
      actions.selectNode(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [id, deletable, isActive, moveable, parent, isEditMode]);

  useEffect(() => {
    if (dom) {
      dom.classList.remove(styles.componentSelected);
      dom.classList.remove(styles.componentHover);

      if (isEditMode && isActive) {
        dom.classList.add(styles.componentSelected);
      } else if (isEditMode && isHover) {
        dom.classList.add(styles.componentHover);
      }
    }
  }, [dom, isActive, isHover, isEditMode]);

  const handleNodeFocus = (ensureVisibility: boolean, select = false) => {
    // ROOT represents the UI surface node currently open for editing rather
    // than a node of its own, so it's resolved separately from props.id
    const layoutableElement = isRoot
      ? getDisplayedSurfaceElement()
      : dom && props.id
        ? getLayoutableElement(props.id)
        : null;
    if (layoutableElement) {
      return handleNodeSelection(layoutableElement, {
        ensureVisibility,
        select,
        stopPropagation: false,
      })();
    }
    if (select) {
      // switch to interface for widgets with no layoutable element
      InterfaceController.setRightDrawerView(RightDrawerView.INTERFACE);
    }
    return Promise.resolve();
  };

  useEffect(() => {
    if (isEditMode && isHover) {
      void handleNodeFocus(false);
    }
  }, [isHover, id, isEditMode]);

  useEffect(() => {
    if (isActive) {
      if (isEditMode) {
        void handleNodeFocus(true, true);
      }
    }
  }, [isActive, id, isEditMode]);

  const selectAdjacentNode = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();

    if (!parent) return;

    const siblings = query.node(parent).childNodes();
    const currentIndex = siblings.indexOf(id);

    // Determine which sibling to select
    let targetIndex;
    if (direction === 'up') {
      targetIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
    } else {
      targetIndex =
        currentIndex < siblings.length - 1 ? currentIndex + 1 : currentIndex;
    }

    // Select the target node if different
    if (targetIndex !== currentIndex) {
      const targetNodeId = siblings[targetIndex];
      actions.selectNode(targetNodeId);
      scrollWidgetIntoView(targetNodeId, query);
    }
  };

  const moveNode = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();

    try {
      const parentNode = query.node(parent).get();
      if (!parentNode) {
        console.warn('Parent node not found:', parent);
        return;
      }

      const siblings = query.node(parent).childNodes();
      const currentIndex = siblings.indexOf(id);

      if (direction === 'up') {
        // Only allow moving up if not already at the top
        if (currentIndex > 0) {
          actions.move(id, parent, currentIndex - 1);
        }
      } else if (direction === 'down') {
        // Only allow moving down if not already at the bottom
        if (currentIndex < siblings.length - 1) {
          // Moving down does not work, so I have to move the next sibling up
          const nextSiblingId = siblings[currentIndex + 1];

          if (nextSiblingId) {
            actions.move(nextSiblingId, parent, currentIndex);
            // actions.selectNode(id);
          }
        } else {
          console.log('Already at the bottom, cannot move down further');
        }
      }
      scrollWidgetIntoView(id, query);
    } catch (error) {
      console.error(`Error moving ${direction}:`, error);
    }
  };

  const duplicateNode = (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (isManagedNodeWidget) {
      InterfaceController.showSnackBar(
        'This widget is linked to a node — duplicate the node on the canvas instead',
      );
      return;
    }

    try {
      const nodeData = query.node(id).get();
      if (!nodeData) {
        console.warn('Node not found:', id);
        return;
      }

      // Implement duplicate functionality
      const src = { id, data: nodeData.data };
      let trg = src.data.parent;
      let childrenArray = trg ? query.node(trg).childNodes() : [];
      let index = childrenArray.indexOf(src.id);

      const srcNode = query.node(src.id).toNodeTree();
      const srcTreeCopy = { rootNodeId: '', nodes: {} };

      const copyTree = (curId) => {
        if (!curId) {
          throw new Error(`Node with id ${curId} not Found`);
        }
        const childNodes = srcNode.nodes[curId].data.nodes;
        const linkedNodes = srcNode.nodes[curId].data.linkedNodes;
        let freshNode = {
          data: { ...srcNode.nodes[curId].data },
        };
        freshNode.data.nodes = [];
        freshNode.data.linkedNodes = {};

        childNodes.map((val) => {
          const freshChild = copyTree(val);
          freshNode.data.nodes.push(freshChild.id);
        });

        Object.entries(linkedNodes).map(([key, val]) => {
          const freshChild = copyTree(val);
          freshNode.data.linkedNodes[key] = freshChild.id;
        });

        // Use the node parser from Craft.js - assuming it's available
        freshNode = query.parseFreshNode(freshNode).toNode();
        if (curId === srcNode.rootNodeId) srcTreeCopy.rootNodeId = freshNode.id;
        srcTreeCopy.nodes[freshNode.id] = freshNode;

        freshNode.data.nodes.map((id) => {
          srcTreeCopy.nodes[id].data.parent = freshNode.id;
        });

        Object.entries(freshNode.data.linkedNodes).map(([, val]) => {
          srcTreeCopy.nodes[val].data.parent = freshNode.id;
        });

        return freshNode;
      };

      try {
        const newNode = copyTree(srcNode.rootNodeId);
        actions.addNodeTree(srcTreeCopy, trg, index + 1);

        // Select the new node after duplication
        requestAnimationFrame(() => {
          actions.selectNode(srcTreeCopy.rootNodeId);
          scrollWidgetIntoView(srcTreeCopy.rootNodeId, query);
        });
      } catch (error) {
        console.error('Error in tree copying:', error);
      }
    } catch (error) {
      console.error('Error duplicating node:', error);
    }
  };

  const deleteAndSelectNext = (e) => {
    e.stopPropagation();
    InterfaceController.notifyListeners(ListenEvent.RemoveFromDashboard, id);
  };

  // Helper function to get display name with icon
  const getDisplayNameWithIcon = () => {
    let CustomIcon;
    let widgetName = isRoot ? 'Root' : displayName;

    // For dynamic widgets and containers/pages, get the name from the layoutable element
    if (name === DynamicWidgetName || displayName === DashboardContainerName) {
      const layoutableElement = getLayoutableElement(props.id);
      if (layoutableElement) {
        widgetName = layoutableElement.getDashboardName();
      }
    }

    // Get icon from Layoutable interface if available
    const layoutable = props.id ? getLayoutableElement(props.id) : null;
    if (layoutable) {
      CustomIcon = layoutable.getDashboardIcon({
        flexDirection: props.flexDirection,
        mobileBehavior: props.mobileBehavior,
        isMobile,
      });
    } else {
      CustomIcon = node.data.custom?.getDashboardIcon?.({
        flexDirection: props.flexDirection,
        mobileBehavior: props.mobileBehavior,
        isMobile,
      });
    }

    if (CustomIcon) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '18px' }}>
            {CustomIcon}
          </Box>
          {widgetName}
        </Box>
      );
    }

    return widgetName;
  };

  return (
    PPGraph.currentGraph.graphConfiguredAndReady && (
      <>
        <Popper
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          placement="top-start"
          modifiers={[
            {
              name: 'flip',
              enabled: true,
              options: {
                fallbackPlacements: ['top-end', 'bottom-start', 'bottom-end'],
              },
            },
            {
              name: 'preventOverflow',
              enabled: true,
              options: {
                boundary: 'viewport',
                padding: 8,
              },
            },
            {
              name: 'offset',
              options: {
                offset: [0, -4],
              },
            },
          ]}
          sx={{
            zIndex: 1400,
            pointerEvents: isActive ? 'auto' : 'none',
          }}
        >
          <IndicatorBox
            isActive={isActive}
            data-cy={`indicatorbox of ${props.id || id}`}
          >
            <Box
              ref={(ref) => {
                if (ref) drag(ref as HTMLElement);
              }}
              onClick={() => actions.selectNode(id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'move',
                marginRight: 2,
              }}
            >
              {moveable && (
                <ActionButton
                  size="small"
                  sx={{
                    p: 0.5,
                    transform: 'rotate(90deg)',
                    opacity: isActive ? 1 : 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (parent) actions.selectNode(parent);
                  }}
                  title="Select parent (Shift+Enter)"
                >
                  <SubdirectoryArrowLeftIcon />
                </ActionButton>
              )}
              <Box
                component="h2"
                sx={{
                  flexGrow: 1,
                  fontSize: 'inherit',
                  fontWeight: 'normal',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={`${props.id || id}${isActive ? ' (selected)' : ''}`}
              >
                {getDisplayNameWithIcon()}
              </Box>
              {moveable && isActive && (
                <>
                  <ActionButton
                    size="small"
                    sx={{ mx: 1, cursor: 'move' }}
                    title="Move"
                  >
                    <OpenWithIcon />
                  </ActionButton>
                  <ActionButton
                    size="small"
                    sx={{ mx: 0.5 }}
                    title="Move up (Alt+↑)"
                    onClick={(e) => moveNode(e, 'up')}
                    data-cy="indicatorbox-move-up-widget-btn"
                  >
                    <ArrowUpwardIcon />
                  </ActionButton>
                  <ActionButton
                    size="small"
                    sx={{ mx: 0.5 }}
                    title="Move down (Alt+↓)"
                    onClick={(e) => moveNode(e, 'down')}
                    data-cy="indicatorbox-move-down-widget-btn"
                  >
                    <ArrowDownwardIcon />
                  </ActionButton>
                  {!isManagedNodeWidget && (
                    <ActionButton
                      size="small"
                      sx={{ mx: 0.5 }}
                      title="Duplicate"
                      onClick={duplicateNode}
                      data-cy="indicatorbox-duplicate-widget-btn"
                    >
                      <ContentCopyIcon />
                    </ActionButton>
                  )}
                  <ActionButton
                    size="small"
                    sx={{ mx: 0.5 }}
                    title="Open inspector"
                    onClick={(e) => {
                      e.stopPropagation();
                      InterfaceController.toggleRightSideDrawer(
                        VISIBILITY_ACTION.OPEN,
                      );
                      InterfaceController.setRightDrawerView(
                        RightDrawerView.INTERFACE,
                      );
                    }}
                    data-cy="indicatorbox-inspector-widget-btn"
                  >
                    <TuneIcon />
                  </ActionButton>
                </>
              )}
            </Box>

            {deletable && isActive && (
              <ActionButton
                size="small"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  deleteAndSelectNext(e);
                }}
                title="Delete"
                data-cy="indicatorbox-delete-widget-btn"
              >
                <DeleteIcon />
              </ActionButton>
            )}
          </IndicatorBox>
        </Popper>
        {render}
      </>
    )
  );
};
