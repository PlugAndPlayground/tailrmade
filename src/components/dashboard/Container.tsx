import React from 'react';
import { useNode, useEditor } from '@craftjs/core';
import { Container as MUIContainer, Stack, ToggleButton } from '@mui/material';
import { getDefaultWidgetLayoutValue } from '../../nodes/datatypes/widgetLayoutType';
import { UNSET_VALUE } from '../../utils/constants';
import { FlexDirection, MobileBehavior } from '../../utils/interfaces';
import { TRgba } from '../../utils/color';
import {
  LayoutSection,
  PaddingSection,
  GapSection,
  AlignmentControl,
  AlignmentSection,
  DimensionsSection,
  ColorSection,
  CustomCSSSection,
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

const ROOT_PRESET_MAX_WIDTH: Record<string, false | string> = {
  fullscreen: false,
  website: 'lg',
};

type ContainerWidgetProps = {
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  color: Record<'r' | 'g' | 'b' | 'a', number>;
  flexDirection: FlexDirection;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  padding: number[];
  minWidth: string;
  minHeight: string;
  maxWidth:
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | false
    | typeof UNSET_VALUE
    | string;
  maxHeight: string;
  mobileBehavior: MobileBehavior;
  customStyles: Record<string, any>;
};

const defaultProps: ContainerWidgetProps = getDefaultWidgetLayoutValue();
// craft fills missing serialized props from Container.craft.props; the
// SurfaceRenderer needs the same defaults when rendering without craft
export const containerDefaultProps = defaultProps;

interface ContainerProps extends ContainerWidgetProps {
  children: React.ReactNode;
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
  const rootMaxWidth = getRootMaxWidth(maxWidth);
  // construct via TRgba (keyed assignment) rather than templating
  // Object.values() directly - the latter silently scrambles the r/g/b/a
  // channels whenever the stored object's key order isn't exactly r,g,b,a
  const backgroundCss = Object.assign(new TRgba(), background).toString();
  const colorCss = Object.assign(new TRgba(), color).toString();

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
        color: colorCss,
        padding: `${paddingValues[0]}px ${paddingValues[1]}px ${paddingValues[2]}px ${paddingValues[3]}px`,
        minWidth: minWidth || UNSET_VALUE,
        maxWidth: maxWidth || UNSET_VALUE,
        minHeight: minHeight || UNSET_VALUE,
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

  return isRoot ? (
    <RootContainerSettings
      setProp={setProp}
      width={props.width}
      height={props.height}
      minWidth={props.minWidth}
      minHeight={props.minHeight}
      maxWidth={props.maxWidth}
      maxHeight={props.maxHeight}
      padding={props.padding}
      gap={props.gap}
      background={props.background}
      customStyles={props.customStyles}
    />
  ) : (
    <ChildContainerSettings
      setProp={setProp}
      flexDirection={props.flexDirection}
      width={props.width}
      height={props.height}
      justifyContent={props.justifyContent}
      alignItems={props.alignItems}
      padding={props.padding}
      gap={props.gap}
      background={props.background}
      mobileBehavior={props.mobileBehavior}
      minWidth={props.minWidth}
      minHeight={props.minHeight}
      maxWidth={props.maxWidth}
      maxHeight={props.maxHeight}
      customStyles={props.customStyles}
    />
  );
};

interface RootContainerSettingsProps {
  setProp: (callback: (props: any) => void) => void;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: ContainerWidgetProps['maxWidth'];
  maxHeight: string;
  padding: number[];
  gap: number;
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  customStyles: Record<string, any>;
}

const RootContainerSettings: React.FC<RootContainerSettingsProps> = ({
  setProp,
  ...props
}) => {
  return (
    <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }}>
      <UIPresetSection
        setProp={setProp}
        height={props.height}
        onApplyPreset={(presetKey) => {
          const maxWidth = ROOT_PRESET_MAX_WIDTH[presetKey];
          if (maxWidth !== undefined) {
            setProp((p: any) => {
              p.maxWidth = maxWidth;
            });
          }
        }}
      />
      <AlignmentControl
        value={getRootMaxWidth(props.maxWidth)}
        onChange={(value) => setProp((props: any) => (props.maxWidth = value))}
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
      <DimensionsSection setProp={setProp} props={props} />
      <PaddingSection setProp={setProp} props={props} />
      <GapSection setProp={setProp} props={props} />
      <ColorSection setProp={setProp} props={props} />
      <CustomCSSSection setProp={setProp} props={props} />
    </Stack>
  );
};

interface ChildContainerSettingsProps {
  setProp: (callback: (props: any) => void) => void;
  flexDirection: FlexDirection;
  width: string;
  height: string;
  justifyContent: string;
  alignItems: string;
  padding: number[];
  gap: number;
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  mobileBehavior: MobileBehavior;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  customStyles: Record<string, any>;
}

const ChildContainerSettings: React.FC<ChildContainerSettingsProps> = ({
  setProp,
  ...props
}) => {
  return (
    <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }}>
      <LayoutSection setProp={setProp} props={props} />
      <PaddingSection setProp={setProp} props={props} />
      <GapSection setProp={setProp} props={props} />
      <AlignmentSection
        setProp={setProp}
        props={props}
        flexDirection={props.flexDirection}
      />
      <DimensionsSection setProp={setProp} props={props} />
      <ColorSection setProp={setProp} props={props} />
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
