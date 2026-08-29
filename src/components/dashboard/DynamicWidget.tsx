import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  FormControlLabel,
  Stack,
  Switch,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useEditor, useNode } from '@craftjs/core';
import { getLayoutableElement } from '../../utils/utils';
import { FlexDirection } from '../../utils/interfaces';
import { TRgba } from '../../utils/color';

import {
  FormWrapper,
  StyledFormLabel,
  WidthHeightControl,
  ColorSection,
} from './SettingsControls';
import {
  getBasicLayoutStyles,
  handleNodeSelection,
  renderSelectNodeButton,
} from '../../utils/layoutableHelpers';
import InterfaceController from '../../InterfaceController';
import { useHoverEvents, useParentDirection } from './hooks';
import { DynamicWidgetName } from '../../utils/constants_shared';
import { dynamicWidgetDefaultProps } from '../../utils/surfaceTree';
import { ColorSetting } from '../../utils/themeColors';

export type DynamicWidgetBaseProps = {
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  // see WidgetLayoutInterface.color - may be the 'inherit' keyword
  color: ColorSetting;
  flexDirection: FlexDirection;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  padding: number[];
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  showLabel: boolean;
  collapsible: boolean;
  collapsedByDefault: boolean;
};

const defaultProps: DynamicWidgetBaseProps =
  dynamicWidgetDefaultProps as DynamicWidgetBaseProps;

export interface DynamicWidgetProps extends DynamicWidgetBaseProps {
  id: string;
  index: number;
  disabled: boolean;
  children?: React.ReactNode;
}

export interface DynamicWidgetViewProps extends Partial<DynamicWidgetProps> {
  domId?: string;
  isEditMode?: boolean;
  parentDirection?: FlexDirection;
  innerRef?: (ref: HTMLElement | null) => void;
  // extra props forwarded to getDashboardWrapper (e.g. visitedSurfaceIds)
  wrapperExtraProps?: Record<string, any>;
  onDoubleClick?: (event: React.MouseEvent) => void;
  title?: string;
  // see DashboardWidgetProps.isSurfacePreview - set by SurfaceRenderer, unset
  // (false) for the live craft `DynamicWidget` below
  isSurfacePreview?: boolean;
}

// Pure presentational widget, usable outside of a craftjs Editor
// (e.g. by the SurfaceRenderer). The craft `DynamicWidget` below wraps it.
export const DynamicWidgetView = (viewProps: DynamicWidgetViewProps) => {
  const {
    domId,
    isEditMode = false,
    parentDirection,
    innerRef,
    wrapperExtraProps,
    onDoubleClick,
    title,
    isSurfacePreview = false,
    ...props
  } = viewProps;
  const layoutableElement = getLayoutableElement(props.id);
  // this hook runs on both branches below, so returning the placeholder
  // early cannot violate the rules of hooks
  const { localHover, handleMouseEnter, handleMouseLeave } =
    useHoverEvents(layoutableElement);
  if (!layoutableElement) {
    // a widget whose graph node cannot be resolved must be visibly broken,
    // not silently blank - the stored layout still references it (e.g. a
    // stale saved surface, or an id that is not a resolvable node id)
    return (
      <Box
        ref={innerRef}
        data-cy={`missing-widget of ${props.id}`}
        id={domId}
        sx={{
          width: '100%',
          p: 1,
          borderRadius: 1,
          background: 'rgba(0,0,0,0.1)',
          color: 'text.secondary',
          fontSize: '12px',
          textAlign: 'center',
        }}
      >
        {`Missing widget (${props.id ?? 'no id'})`}
      </Box>
    );
  }

  const {
    index,
    flexDirection,
    alignItems,
    justifyContent,
    background,
    color,
    padding,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    showLabel,
    collapsible,
    collapsedByDefault,
    disabled,
    width,
    height,
  } = props as DynamicWidgetProps;

  const handleSelectNode = handleNodeSelection(layoutableElement);
  const overlayState = InterfaceController.getOverlayState();
  const dashboardFullscreen =
    overlayState.dashboard.fullscreen || overlayState.dashboard.maximized;
  const showButton = localHover && !dashboardFullscreen && !isEditMode;

  const style = getBasicLayoutStyles(width, height, parentDirection);

  const widgetContent = (
    <>
      {showLabel && (
        <Box sx={{ px: 1, py: 0.5, color: 'text.primary', fontSize: '14px' }}>
          {layoutableElement.getDashboardName()}
        </Box>
      )}
      {layoutableElement.getDashboardWrapper({
        index,
        isEditMode,
        disabled: isEditMode ? true : disabled,
        height: style.height as string,
        width: style.width as string,
        minWidth,
        minHeight,
        maxWidth,
        maxHeight,
        isSurfacePreview,
        ...wrapperExtraProps,
      })}
    </>
  );

  // the live craft-connected instance keeps the plain "widget of {id}" used
  // throughout the test suite; SurfaceRenderer's preview copies (canvas
  // thumbnail, embedded surfaces, modal previews) get a distinguishable
  // data-cy so the two never collide when both are on screen at once
  const dashboardId = layoutableElement.getDashboardId();
  const widgetDataCy = isSurfacePreview
    ? `widget preview of ${dashboardId}`
    : `widget of ${dashboardId}`;

  return (
    <Box
      ref={innerRef}
      data-cy={widgetDataCy}
      id={domId}
      sx={{
        position: 'relative',
        cursor: isEditMode ? 'move' : 'auto',
        justifyContent,
        alignItems,
        flexDirection,
        // construct via TRgba (keyed assignment) rather than templating
        // Object.values() directly - the latter silently scrambles the
        // r/g/b/a channels whenever the stored object's key order isn't
        // exactly r,g,b,a
        background: Object.assign(new TRgba(), background).toString(),
        color: Object.assign(new TRgba(), color).toString(),
        padding: `${padding[0]}px ${padding[1]}px ${padding[2]}px ${padding[3]}px`,
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={onDoubleClick}
      title={title}
    >
      {showButton && renderSelectNodeButton(handleSelectNode)}
      {collapsible && !isEditMode ? (
        <Accordion
          disableGutters
          defaultExpanded={!collapsedByDefault}
          data-cy={
            isSurfacePreview
              ? `collapsible preview of ${dashboardId}`
              : `collapsible of ${dashboardId}`
          }
          sx={{
            width: '100%',
            background: 'transparent',
            color: 'inherit',
            boxShadow: 'none',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            {layoutableElement.getDashboardName()}
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>{widgetContent}</AccordionDetails>
        </Accordion>
      ) : (
        widgetContent
      )}
    </Box>
  );
};

export const DynamicWidget = (props: Partial<DynamicWidgetProps>) => {
  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));

  const {
    connectors: { connect, drag },
    id,
    parent,
  } = useNode((node) => ({
    id: node.id,
    parent: node.data.parent ? node.data.parent : null,
  }));

  const parentDirection = useParentDirection(parent);

  // double-clicking an embedded UI surface in edit mode dives into it
  // (makes it the edited surface; the breadcrumb navigates back up)
  const layoutableElement = props.id
    ? getLayoutableElement(props.id)
    : undefined;
  const handleDive =
    isEditMode && layoutableElement?.isSurface()
      ? (event: React.MouseEvent) => {
          event.stopPropagation();
          InterfaceController.showSurface(
            layoutableElement.getRelatedNode().id,
            'dive',
          );
        }
      : undefined;

  return (
    <DynamicWidgetView
      {...props}
      domId={id}
      isEditMode={isEditMode}
      parentDirection={parentDirection}
      innerRef={(ref) => ref && connect(drag(ref))}
      onDoubleClick={handleDive}
      title={handleDive ? 'Double-click to edit this UI surface' : undefined}
    />
  );
};

const DynamicWidgetSettings = () => {
  const {
    actions: { setProp },
    props,
  } = useNode((node) => ({
    props: node.data.props,
    id: node.id,
    node,
  }));

  return (
    <Stack
      spacing={0.5}
      sx={{
        bgcolor: 'background.paper',
      }}
      data-cy="dynamic-widget-settings"
    >
      <FormWrapper>
        <StyledFormLabel>Show label</StyledFormLabel>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.showLabel}
              onChange={(e) => {
                setProp((props) => (props.showLabel = e.target.checked));
              }}
              data-cy="label-switch"
            />
          }
          label={props.showLabel.toString()}
          sx={{
            p: 0.5,
            m: 0,
            '& .MuiFormControlLabel-label': {
              fontSize: '0.8rem',
            },
          }}
        />
      </FormWrapper>
      {/* collapse is a per-placement option for embedded UI surfaces */}
      {props.id && getLayoutableElement(props.id)?.isSurface() && (
        <FormWrapper>
          <StyledFormLabel>Collapsible</StyledFormLabel>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={Boolean(props.collapsible)}
                onChange={(e) => {
                  setProp((props) => (props.collapsible = e.target.checked));
                }}
                data-cy="collapsible-switch"
              />
            }
            label={Boolean(props.collapsible).toString()}
            sx={{
              p: 0.5,
              m: 0,
              '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
            }}
          />
          {Boolean(props.collapsible) && (
            <>
              <StyledFormLabel>Collapsed by default</StyledFormLabel>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={Boolean(props.collapsedByDefault)}
                    onChange={(e) => {
                      setProp(
                        (props) =>
                          (props.collapsedByDefault = e.target.checked),
                      );
                    }}
                    data-cy="collapsed-by-default-switch"
                  />
                }
                label={Boolean(props.collapsedByDefault).toString()}
                sx={{
                  p: 0.5,
                  m: 0,
                  '& .MuiFormControlLabel-label': { fontSize: '0.8rem' },
                }}
              />
            </>
          )}
        </FormWrapper>
      )}
      {props.disabled != null && (
        <FormWrapper>
          <StyledFormLabel>Read only</StyledFormLabel>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={props.disabled}
                onChange={(e) => {
                  setProp((props) => (props.disabled = e.target.checked));
                }}
                data-cy="label-switch"
              />
            }
            label={props.disabled.toString()}
            sx={{
              p: 0.5,
              m: 0,
              '& .MuiFormControlLabel-label': {
                fontSize: '0.8rem',
              },
            }}
          />
        </FormWrapper>
      )}

      <WidthHeightControl
        setProp={setProp}
        width={props.width}
        minWidth={props.minWidth}
        maxWidth={props.maxWidth}
        height={props.height}
        minHeight={props.minHeight}
        maxHeight={props.maxHeight}
      />

      <ColorSection setProp={setProp} props={props} />
    </Stack>
  );
};

DynamicWidget.craft = {
  displayName: DynamicWidgetName,
  props: {
    ...defaultProps,
  },
  rules: {
    canDrag: () => true,
  },
  related: {
    settings: DynamicWidgetSettings,
  },
};
