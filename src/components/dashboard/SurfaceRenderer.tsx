import React from 'react';
import { Box, Typography } from '@mui/material';
import { ContainerView, containerDefaultProps } from './Container';
import { DynamicWidgetView } from './DynamicWidget';
import { TextView, textDefaultProps } from './Text';
import {
  containerName,
  DynamicWidgetName,
  RootName,
} from '../../utils/constants_shared';
import {
  dynamicWidgetDefaultProps,
  SerializedCraftItem,
  SerializedCraftTree,
} from '../../utils/surfaceTree';
import { DashboardContainerName } from './DashboardContainer';
import { PlaceholderWidgetName } from './PlaceholderWidget';
import { getLayoutableElement } from '../../utils/utils';
import { FlexDirection } from '../../utils/interfaces';
import { getNewDirection } from '../../utils/layoutableHelpers';
import { useIsDashboardNarrow } from './hooks';
import { UNSET_VALUE } from '../../utils/constants';
import { AppThemeProvider } from './AppThemeProvider';

// ids of UI surface nodes currently being rendered up the React tree; used
// to break render cycles between mutually embedded surfaces
export const SurfaceVisitedContext = React.createContext<string[]>([]);

// true when the subtree is a surface's canvas preview (including surfaces
// embedded in that preview) rather than the live dashboard. Widgets whose
// content can only exist once in the DOM (e.g. ElementRenderer's DOM element)
// use this to render a placeholder in previews so the live dashboard keeps
// the real element instead of the preview stealing it
export const SurfaceCanvasPreviewContext = React.createContext(false);

export interface SurfaceRendererProps {
  tree: SerializedCraftTree;
  rootId?: string;
  // false = preview only (e.g. on the canvas), pointer events are disabled
  interactive?: boolean;
  randomMainColor: string;
  // ids of UI surface nodes already being rendered up the tree (cycle guard)
  visitedSurfaceIds?: string[];
}

// A surface rendered by SurfaceRenderer is never the top-level page (canvas
// preview, embedded surface, modal preview - see UISurfaceWidget), yet its
// stored ROOT carries page-level sizing: minHeight '50dvh' / height '100dvh'
// are relative to the WINDOW even when embedded, and maxWidth 'lg' centers
// against a page that isn't there. Translate those to wrapper-relative
// sizing - the placement of an embedded surface belongs to its parent, the
// same philosophy that suppresses the embedded root's Layout socket
// (uiSurface.tsx). Inner layout is untouched.
const isWindowRelativeSize = (value: unknown): boolean =>
  typeof value === 'string' && /^\d+(\.\d+)?[dsl]?v(h|w)$/.test(value);

export const neutralizeEmbeddedRootProps = (
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...props, maxWidth: false };
  if (isWindowRelativeSize(result.height)) {
    result.height = '100%';
  }
  for (const key of ['minHeight', 'minWidth', 'maxHeight'] as const) {
    if (isWindowRelativeSize(result[key])) {
      result[key] = UNSET_VALUE;
    }
  }
  return result;
};

const FallbackItem: React.FC<{ label: string }> = ({ label }) => (
  <Box
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
    {label}
  </Box>
);

// Renders a DashboardContainer item (linked container/page node) without
// craftjs. Visibility/page navigation listeners are omitted on purpose —
// this is a static preview of the layout structure.
const DashboardContainerPreview: React.FC<{
  item: SerializedCraftItem;
  randomMainColor: string;
  children: React.ReactNode;
}> = ({ item, randomMainColor, children }) => {
  const layoutableElement = getLayoutableElement(item.props.id);
  if (!layoutableElement) {
    return <FallbackItem label={`Missing ${item.displayName || 'widget'}`} />;
  }
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: item.props.width,
        height: item.props.height,
      }}
    >
      {layoutableElement.getDashboardWrapper({
        index: item.props.index ?? 0,
        randomMainColor,
        disabled: true,
        isEditMode: false,
        isSurfacePreview: true,
        components: children,
        height: item.props.height,
        width: item.props.width,
        minWidth: item.props.minWidth,
        minHeight: item.props.minHeight,
        maxWidth: item.props.maxWidth,
        maxHeight: item.props.maxHeight,
      })}
    </Box>
  );
};

// Walks a serialized craft tree and renders it with plain (non-craftjs)
// view components. Used for read-only/live renderings of UI surface trees
// outside the single craftjs Editor: canvas previews and embedded surfaces.
export const SurfaceRenderer: React.FC<SurfaceRendererProps> = ({
  tree,
  rootId = RootName,
  interactive = false,
  randomMainColor,
  visitedSurfaceIds = [],
}) => {
  const isNarrow = useIsDashboardNarrow();

  // Every SurfaceRenderer output is a NON-live preview (canvas thumbnail,
  // embedded surface, modal) — the top-level surface renders through the craft
  // <Frame>, whose root DOM id is "ROOT" and whose widgets carry their raw
  // node ids. Emitting those same ids here would duplicate id="ROOT" (once per
  // preview) and shadow live widget ids, so getElementById('ROOT') / the
  // layers panel's getElementById(widgetId) could hit a preview element. Give
  // each SurfaceRenderer instance a unique prefix instead. useId() returns ids
  // containing ':' (e.g. ":r3:"), invalid in CSS selectors, so strip them to
  // keep the prefixed ids queryable. isRoot detection stays on the raw tree
  // key (itemId === RootName), independent of the DOM id.
  const instanceId = React.useId().replace(/:/g, '');
  const domIdFor = (itemId: string) => `preview-${instanceId}-${itemId}`;

  const renderItem = (
    itemId: string,
    parentDirection: FlexDirection | undefined,
  ): React.ReactNode => {
    const item = tree?.[itemId];
    if (!item || item.hidden) {
      return null;
    }

    const resolvedName = item.type?.resolvedName;
    // children size themselves against the direction the item actually
    // renders with, which differs from its declared flexDirection when
    // mobileBehavior flips it on narrow dashboards
    const ownDirection = getNewDirection(
      (item.props?.flexDirection ?? 'column') as FlexDirection,
      isNarrow,
      item.props?.mobileBehavior,
    );
    const children = (item.nodes ?? []).map((childId) =>
      renderItem(childId, ownDirection),
    );

    switch (resolvedName) {
      case containerName: {
        const isRootItem = itemId === RootName;
        // merge the craft default props, like craft does on deserialize
        const mergedProps = {
          ...(containerDefaultProps as any),
          ...(item.props as any),
        };
        return (
          <ContainerView
            key={itemId}
            {...(isRootItem
              ? (neutralizeEmbeddedRootProps(mergedProps) as any)
              : mergedProps)}
            id={domIdFor(itemId)}
            isRoot={isRootItem}
            isEditMode={false}
            parentDirection={parentDirection}
          >
            {children}
          </ContainerView>
        );
      }
      case DynamicWidgetName:
        return (
          <DynamicWidgetView
            key={itemId}
            {...(dynamicWidgetDefaultProps as any)}
            {...item.props}
            disabled={!interactive || item.props.disabled}
            domId={domIdFor(itemId)}
            isEditMode={false}
            isSurfacePreview
            parentDirection={parentDirection}
            randomMainColor={item.props.randomMainColor ?? randomMainColor}
            wrapperExtraProps={{ visitedSurfaceIds }}
          />
        );
      case DashboardContainerName:
        return (
          <DashboardContainerPreview
            key={itemId}
            item={item}
            randomMainColor={randomMainColor}
          >
            {children}
          </DashboardContainerPreview>
        );
      case 'Text':
        return (
          <TextView
            key={itemId}
            {...textDefaultProps}
            {...item.props}
            editable={false}
          />
        );
      case 'Box':
        return (
          <Box key={itemId} {...item.props}>
            {children}
          </Box>
        );
      case 'Typography':
        return (
          <Typography key={itemId} {...item.props}>
            {children}
          </Typography>
        );
      case PlaceholderWidgetName:
        return (
          <FallbackItem key={itemId} label={item.props.text ?? 'Loading…'} />
        );
      default:
        return (
          <FallbackItem
            key={itemId}
            label={`Unknown widget (${resolvedName ?? 'unnamed'})`}
          />
        );
    }
  };

  // App content, wherever it renders - a canvas thumbnail, an embedded
  // surface, a modal - follows the APP theme, not the editor's. A canvas
  // thumbnail on the editor theme would disagree with the same surface in the
  // dashboard, which is exactly the divergence the boundary exists to prevent.
  return (
    <AppThemeProvider>
      <Box
        data-cy="surface-renderer"
        sx={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      >
        {renderItem(rootId, undefined)}
      </Box>
    </AppThemeProvider>
  );
};
