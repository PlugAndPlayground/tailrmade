import React, { useState, useEffect } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useEditor, useNode } from '@craftjs/core';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { getLayoutableElement, useIsSmallScreen } from '../../utils/utils';
import {
  getDimensionValue,
  handleNodeSelection,
  isLinkedToNode,
  renderSelectNodeButton,
} from '../../utils/layoutableHelpers';
import { DynamicWidgetProps } from './DynamicWidget';
import { useEditModeStyles, useHoverEvents } from './hooks';
import { getContainerDashboardIcon } from './dashboardIcons';
import { dashboardVisibilitySocketName } from '../../utils/constants_shared';

export const DashboardContainerName = 'DashboardContainer';

interface ContainerState {
  visibility: boolean;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  flexDirection: string;
  mobileBehavior: string;
  collapseMode: string;
}

const getInitialContainerState = (
  props: Partial<DynamicWidgetProps>,
): ContainerState => {
  const nodeProps = props as Record<string, any>;

  return {
    visibility:
      typeof nodeProps[dashboardVisibilitySocketName] === 'boolean'
        ? nodeProps[dashboardVisibilitySocketName]
        : true,
    width: getDimensionValue(nodeProps.width || '100%'),
    height: getDimensionValue(nodeProps.height || 'auto'),
    minWidth: getDimensionValue(nodeProps.minWidth || 'auto'),
    minHeight: getDimensionValue(nodeProps.minHeight || 'auto'),
    maxWidth: getDimensionValue(nodeProps.maxWidth || 'none'),
    maxHeight: getDimensionValue(nodeProps.maxHeight || 'none'),
    flexDirection: nodeProps.flexDirection || 'column',
    mobileBehavior: nodeProps.mobileBehavior || 'row',
    collapseMode: nodeProps.collapseMode || 'none',
  };
};

/**
 * Header component shown in edit mode for containers
 */
const ContainerHeader: React.FC<{
  name: string;
  isVisible: boolean;
  isCollapsed?: boolean;
}> = ({ name, isVisible, isCollapsed }) => {
  // Determine status text
  let statusText = '';
  if (isCollapsed) {
    statusText = '(Collapsed)';
  } else if (!isVisible) {
    statusText = '(Hidden)';
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.default',
        opacity: isVisible ? 1 : 0.5,
        zIndex: 1,
        height: '32px',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
        <Box
          sx={{ px: 1, textAlign: 'center', color: 'text.primary' }}
          title={isVisible ? 'Visible' : 'Hidden'}
        >
          {isVisible ? (
            <VisibilityIcon sx={{ fontSize: '12px' }} />
          ) : (
            <VisibilityOffIcon sx={{ fontSize: '12px' }} />
          )}
        </Box>

        <Box
          sx={{
            p: 0.5,
            color: 'text.primary',
            fontSize: '14px',
            lineHeight: '14px',
          }}
        >
          {name} {statusText}
        </Box>
      </Box>
    </Box>
  );
};

export const DashboardContainer = (props: Partial<DynamicWidgetProps>) => {
  const {
    actions: { setProp },
    id,
  } = useNode((node) => ({
    props: node.data.props,
    id: node.id,
  }));

  const [containerState, setContainerState] = useState<ContainerState>(() =>
    getInitialContainerState(props),
  );

  // Other hooks and variables
  const { isEditMode, query } = useEditor((state, query) => ({
    isEditMode: state.options.enabled,
  }));
  const isSmallScreen = useIsSmallScreen();

  if (isLinkedToNode(query.getNodes(), props.id!)) {
    return null;
  }
  const layoutableElement = getLayoutableElement(props.id!);
  const { localHover, handleMouseEnter, handleMouseLeave } = useHoverEvents(
    layoutableElement!,
  );
  if (!layoutableElement) {
    return null;
  }

  const editModeStyles = useEditModeStyles(
    isEditMode,
    containerState.flexDirection,
  );

  const sourceId = layoutableElement.getDashboardId();
  const isModalDialogNode = layoutableElement.isModalDialog?.() ?? false;

  // Listen for container/page state changes
  useEffect(() => {
    const listenID = InterfaceController.addListener(
      ListenEvent.DashboardContainerChanged,
      (data: any) => {
        if (data.id === sourceId) {
          setContainerState((prev) => ({
            ...prev,
            visibility: data.input.visibility,
            width: getDimensionValue(data.input.width),
            height: getDimensionValue(data.input.height),
            minWidth: getDimensionValue(data.input.minWidth),
            minHeight: getDimensionValue(data.input.minHeight),
            maxWidth: getDimensionValue(data.input.maxWidth),
            maxHeight: getDimensionValue(data.input.maxHeight),
            flexDirection: data.input.flexDirection,
            mobileBehavior: data.input.mobileBehavior,
            collapseMode: data.input.collapseMode,
          }));

          setProp((props: any) => {
            props.flexDirection = data.input.flexDirection;
            props.mobileBehavior = data.input.mobileBehavior;
          });
        }
      },
    );

    return () => InterfaceController.removeListener(listenID);
  }, [setProp, sourceId]);

  const { index, randomMainColor, disabled, children } = props;
  const {
    connectors: { connect, drag },
  } = useNode();

  const handleSelectNode = handleNodeSelection(layoutableElement);
  const overlayState = InterfaceController.getOverlayState();
  const dashboardFullscreen =
    overlayState.dashboard.fullscreen || overlayState.dashboard.maximized;
  const showButton = localHover && !dashboardFullscreen && !isEditMode;

  const isCollapsed = containerState.collapseMode === 'collapse';
  const shouldShow = isEditMode || containerState.visibility;
  const shouldFillHeight = containerState.height !== 'auto';
  const shouldUseModal = isModalDialogNode && !isEditMode;
  const shouldUseCollapsed = isCollapsed && !isEditMode;
  const containerSizeSx = shouldUseModal
    ? {
        width: 0,
        height: 0,
        minWidth: 0,
        maxWidth: 0,
        minHeight: 0,
        maxHeight: 0,
        overflow: 'visible',
      }
    : {
        width: containerState.width,
        height: shouldUseCollapsed ? 'auto' : containerState.height,
        minWidth: containerState.minWidth,
        maxWidth: containerState.maxWidth,
        minHeight: shouldUseCollapsed
          ? '40px'
          : isEditMode
            ? '60px'
            : containerState.minHeight,
        maxHeight: containerState.maxHeight,
        overflow: shouldUseCollapsed ? 'hidden' : 'visible',
      };

  // Get display name for the header
  const displayName = layoutableElement.getDashboardName?.() || 'Container';

  return (
    <Box
      ref={(ref: any) => connect(drag(ref))}
      data-cy={`widget of ${layoutableElement.getDashboardId()}`}
      id={id}
      sx={{
        position: 'relative',
        display: shouldShow ? 'flex' : 'none',
        flexDirection: 'column',
        cursor: isEditMode ? 'move' : 'auto',
        background: 'transparent',
        ...containerSizeSx,
        ...editModeStyles,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header shown in edit mode */}
      {isEditMode && (
        <ContainerHeader
          name={displayName}
          isVisible={containerState.visibility}
          isCollapsed={isCollapsed}
        />
      )}

      {showButton && renderSelectNodeButton(handleSelectNode)}

      <Box
        sx={{
          paddingTop: isEditMode ? `24px` : 0,
          flexGrow: shouldFillHeight ? 1 : 0,
          flexShrink: shouldFillHeight ? 1 : 0,
          width: shouldUseModal ? 0 : 'auto',
          height: shouldUseModal ? 0 : 'auto',
        }}
      >
        {layoutableElement.getDashboardWrapper({
          index: index ?? 0,
          randomMainColor: randomMainColor ?? '#4CAF50',
          disabled: isEditMode ? true : (disabled ?? false),
          height: containerState.height,
          width: containerState.width,
          minWidth: containerState.minWidth,
          minHeight: containerState.minHeight,
          maxWidth: containerState.maxWidth,
          maxHeight: containerState.maxHeight,
          isEditMode,
          components: children,
        })}
      </Box>
    </Box>
  );
};

const DashboardContainerSettings = () => {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
  }));

  return (
    <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }}>
      <Box sx={{ p: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Settings for this container are controlled through the node properties
        </Typography>
      </Box>
    </Stack>
  );
};

DashboardContainer.craft = {
  displayName: DashboardContainerName,
  rules: {
    canDrag: () => true,
    canDrop: () => true,
    canMoveIn: () => true,
  },
  related: {
    settings: DashboardContainerSettings,
  },
  custom: {
    getDashboardIcon: getContainerDashboardIcon,
  },
};
