import React from 'react';
import { useNode, useEditor } from '@craftjs/core';
import { Container as MUIContainer, Stack, ToggleButton } from '@mui/material';
import { getDefaultWidgetLayoutValue } from '../../nodes/datatypes/widgetLayoutType';
import { UNSET_VALUE } from '../../utils/constants';
import { FlexDirection, MobileBehavior } from '../../utils/interfaces';
import {
  LayoutSection,
  PaddingSection,
  GapSection,
  AlignmentControl,
  AlignmentSection,
  DimensionsSection,
  ColorSection,
  CustomCSSSection,
  EmphasisSection,
  UIPresetSection,
} from './SettingsControls';
import {
  editPadding,
  getContainerLayoutStyle,
  getNewDirection,
} from '../../utils/layoutableHelpers';
import {
  useDevicePreviewWidth,
  useEditModeStyles,
  useIsDashboardNarrow,
  useParentDirection,
} from './hooks';
import { resolveCustomStylesForPreviewWidth } from './viewState';
import { getContainerDashboardIcon } from './dashboardIcons';
import { RootName, containerName } from '../../utils/constants_shared';
import {
  ColorSetting,
  colorSettingToCss,
  isTransparentColor,
} from '../../utils/themeColors';
import {
  ContainerEmphasis,
  containerEmphasisSx,
  ContainerTone,
  DEFAULT_CONTAINER_EMPHASIS,
  DEFAULT_CONTAINER_TONE,
} from '../../utils/theme/emphasis';

const ROOT_PRESET_MAX_WIDTH: Record<string, false | string> = {
  fullscreen: false,
  website: 'lg',
};

type ContainerWidgetProps = {
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
  maxWidth:
    'xs' | 'sm' | 'md' | 'lg' | 'xl' | false | typeof UNSET_VALUE | string;
  maxHeight: string;
  mobileBehavior: MobileBehavior;
  emphasis: ContainerEmphasis;
  tone: ContainerTone;
  customStyles: Record<string, any>;
};

const EMPTY_CONTAINER_EDIT_MIN_HEIGHT = '80px';

const hasOwnMinHeight = (minHeight: string | undefined): boolean =>
  !!minHeight && minHeight !== UNSET_VALUE && minHeight !== 'auto';

const defaultProps: ContainerWidgetProps = {
  ...getDefaultWidgetLayoutValue(),
  minHeight: UNSET_VALUE,
  emphasis: DEFAULT_CONTAINER_EMPHASIS,
  tone: DEFAULT_CONTAINER_TONE,
};
// craft fills missing serialized props from Container.craft.props; the
// SurfaceRenderer needs the same defaults when rendering without craft
export const containerDefaultProps = defaultProps;

export interface ContainerProps extends ContainerWidgetProps {
  children?: React.ReactNode;
  gap: number;
}

const getRootMaxWidth = (
  maxWidth: ContainerWidgetProps['maxWidth'],
): 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false => {
  if (maxWidth === false) {
    return false;
  }

  return ['xs', 'sm', 'md', 'lg', 'xl'].includes(maxWidth)
    ? (maxWidth as 'xs' | 'sm' | 'md' | 'lg' | 'xl')
    : false;
};

export interface ContainerViewProps extends ContainerProps {
  id?: string;
  isRoot?: boolean;
  isEditMode?: boolean;
  parentDirection?: FlexDirection;
  innerRef?: (ref: HTMLDivElement | null) => void;
}

// Pure presentational container, usable outside of a craftjs Editor
// (e.g. by the SurfaceRenderer). The craft `Container` below wraps it.
export const ContainerView = (viewProps: ContainerViewProps) => {
  const {
    id,
    isRoot = false,
    isEditMode = false,
    parentDirection,
    innerRef,
    flexDirection,
    alignItems,
    justifyContent,
    background,
    color,
    padding,
    gap = 0,
    children,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    mobileBehavior,
    emphasis,
    tone,
    customStyles = {},
  } = viewProps;

  const editModeStyles = useEditModeStyles(isEditMode, flexDirection);

  const isMobile = useIsDashboardNarrow();
  // in device preview, `@media` width conditions in customStyles must
  // evaluate against the constrained preview width, not the window
  const devicePreviewWidth = useDevicePreviewWidth();
  const resolvedCustomStyles = resolveCustomStylesForPreviewWidth(
    customStyles,
    devicePreviewWidth,
  );
  const newDirection = getNewDirection(flexDirection, isMobile, mobileBehavior);
  const style = getContainerLayoutStyle(
    newDirection,
    mobileBehavior,
    width,
    height,
    parentDirection ?? 'column',
  );

  const gapValue = isEditMode ? Math.max(editPadding, gap) : gap;
  const isEmptyWhileEditing =
    isEditMode && React.Children.count(children) === 0;
  const effectiveMinHeight =
    isEmptyWhileEditing && !hasOwnMinHeight(minHeight)
      ? EMPTY_CONTAINER_EDIT_MIN_HEIGHT
      : minHeight;
  const rootMaxWidth = getRootMaxWidth(maxWidth);
  // both slots can hold the 'inherit' keyword instead of an rgba object, so
  // a container can defer to the app theme rather than naming a color
  const backgroundCss = colorSettingToCss(background);
  const colorCss = colorSettingToCss(color);
  const emphasisSx = containerEmphasisSx(
    emphasis,
    tone,
    !isTransparentColor(background),
  );

  // Apply minimum padding values when in edit mode
  const paddingValues = isEditMode
    ? padding.map((p) => Math.max(editPadding, p))
    : padding;
  // flex-grow/shrink act along the parent's main axis, so which dimension
  // decides them depends on the parent's direction
  const shouldFillMainAxis =
    (parentDirection ?? 'column') === 'row'
      ? width === '100%'
      : height !== 'auto';

  return isRoot ? (
    <MUIContainer
      ref={innerRef}
      maxWidth={rootMaxWidth}
      id={id}
      disableGutters={true}
      sx={{
        display: 'flex',
        flexDirection: 'column', // Root container uses column direction
        // column: alignItems places children horizontally, justifyContent
        // vertically (only visible when the root has spare height)
        alignItems,
        justifyContent,
        width: width,
        height: height,
        gap: `${gapValue}px`,
        background: backgroundCss,
        color: colorCss,
        padding: `${paddingValues[0]}px ${paddingValues[1]}px ${paddingValues[2]}px ${paddingValues[3]}px`,
        margin: '0 auto',
        overflow: 'auto',
        minWidth: minWidth,
        minHeight: minHeight,
        ...resolvedCustomStyles,
      }}
    >
      {children}
    </MUIContainer>
  ) : (
    <MUIContainer
      ref={innerRef}
      maxWidth={false}
      id={id}
      disableGutters={true}
      sx={{
        cursor: isEditMode ? 'move' : 'auto',
        // MUI Container defaults to margin-left/right 'auto' (it is built to
        // self-center as a page column); inside a flex row auto margins
        // swallow the free space BEFORE justify-content can distribute it,
        // breaking justify for any hug-width child container. Only the root
        // container is a page column - children must not self-center.
        margin: 0,
        justifyContent,
        alignItems,
        gap: `${gapValue}px`,
        background: backgroundCss,
        ...emphasisSx,
        color: colorCss,
        padding: `${paddingValues[0]}px ${paddingValues[1]}px ${paddingValues[2]}px ${paddingValues[3]}px`,
        minWidth: minWidth || UNSET_VALUE,
        maxWidth: maxWidth || UNSET_VALUE,
        minHeight: effectiveMinHeight || UNSET_VALUE,
        maxHeight: maxHeight || UNSET_VALUE,
        flexGrow: shouldFillMainAxis ? 1 : 0,
        flexShrink: shouldFillMainAxis ? 1 : 0,
        ...style,
        ...resolvedCustomStyles,
        ...editModeStyles,
      }}
    >
      {children}
    </MUIContainer>
  );
};

export const Container = (props: ContainerProps) => {
  const {
    connectors: { connect, drag },
    id,
    parent,
  } = useNode((node) => ({
    id: node.id,
    parent: node.data.parent ? node.data.parent : null,
  }));

  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));

  const isRoot = id === RootName;
  const parentDirection = useParentDirection(parent);

  return (
    <ContainerView
      {...props}
      id={id}
      isRoot={isRoot}
      isEditMode={isEditMode}
      parentDirection={parentDirection}
      innerRef={(ref) => {
        if (ref) {
          if (isRoot) {
            connect(ref);
          } else {
            connect(drag(ref));
          }
        }
      }}
    />
  );
};

// Page-level settings that only the root has: it is the page column, so it
// gets the UI preset and a max width in the slot where a child container
// shows its direction/mobile Layout section.
const RootPageSection: React.FC<{
  setProp: (callback: (props: any) => void) => void;
  height: string;
  maxWidth: ContainerWidgetProps['maxWidth'];
}> = ({ setProp, height, maxWidth }) => (
  <>
    <UIPresetSection
      setProp={setProp}
      height={height}
      onApplyPreset={(presetKey) => {
        const presetMaxWidth = ROOT_PRESET_MAX_WIDTH[presetKey];
        if (presetMaxWidth !== undefined) {
          setProp((p: any) => {
            p.maxWidth = presetMaxWidth;
          });
        }
      }}
    />
    <AlignmentControl
      value={getRootMaxWidth(maxWidth)}
      onChange={(value) => setProp((p: any) => (p.maxWidth = value))}
      label="Max Width"
      options={[
        <ToggleButton size="small" value="xs" key="xs">
          XS
        </ToggleButton>,
        <ToggleButton size="small" value="sm" key="sm">
          SM
        </ToggleButton>,
        <ToggleButton size="small" value="md" key="md">
          MD
        </ToggleButton>,
        <ToggleButton size="small" value="lg" key="lg">
          LG
        </ToggleButton>,
        <ToggleButton size="small" value="xl" key="xl">
          XL
        </ToggleButton>,
        <ToggleButton size="small" value={false} key="false">
          None
        </ToggleButton>,
      ]}
    />
  </>
);

// Root and child containers share one panel in one order, so both read the
// same in the inspector. The root only differs where it really is different:
// page settings instead of Layout (it is always a column) and no emphasis.
const ContainerSettings = () => {
  const {
    actions: { setProp },
    props,
    id,
  } = useNode((node) => ({
    props: node.data.props,
    id: node.id,
  }));
  const isRoot = id === RootName;

  if (!props) {
    return null;
  }

  return (
    <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }}>
      {isRoot ? (
        <RootPageSection
          setProp={setProp}
          height={props.height}
          maxWidth={props.maxWidth}
        />
      ) : (
        <LayoutSection setProp={setProp} props={props} />
      )}
      <PaddingSection setProp={setProp} props={props} />
      <GapSection setProp={setProp} props={props} />
      <AlignmentSection
        setProp={setProp}
        props={props}
        flexDirection={isRoot ? 'column' : props.flexDirection}
      />
      <DimensionsSection setProp={setProp} props={props} />
      <ColorSection setProp={setProp} props={props} />
      {!isRoot && <EmphasisSection setProp={setProp} props={props} />}
      <CustomCSSSection setProp={setProp} props={props} />
    </Stack>
  );
};

Container.craft = {
  displayName: containerName,
  props: { ...defaultProps },
  rules: {
    canDrag: () => true,
  },
  related: {
    settings: ContainerSettings,
  },
  custom: {
    getDashboardIcon: getContainerDashboardIcon,
  },
};
