import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { alpha } from '@mui/system';
import PPGraph from '../../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  FlexDirection,
  Layoutable,
  MobileBehavior,
} from '../../utils/interfaces';
import { getDashboardWidth } from '../../utils/utils';
import { getNewDirection } from '../../utils/layoutableHelpers';
import { useEditor } from '@craftjs/core';
import { isSurfaceNode } from '../../utils/interfaces';
import { useDevicePreviewWidth } from './devicePreviewStore';
import { useAppView } from '../appViewStore';

export function useHoverEvents(
  layoutableElement: Layoutable | null | undefined,
) {
  const [localHover, setLocalHover] = useState(false);

  const handleMouseEnter = async (e: React.MouseEvent) => {
    setLocalHover(true);
    const nodeToJumpTo = layoutableElement?.getRelatedNode();
    if (nodeToJumpTo) {
      PPGraph.currentGraph.selection.drawSingleFocus(nodeToJumpTo);
    }
  };

  const handleMouseLeave = async (e: React.MouseEvent) => {
    setLocalHover(false);
    PPGraph.currentGraph.selection.clearFocus();
  };

  return {
    localHover,
    handleMouseEnter,
    handleMouseLeave,
  };
}

// Same width as MUI's default breakpoint used in useIsSmallScreen
const NARROW_DASHBOARD_THRESHOLD = 600;

// The dashboard column's REAL width, unaffected by the device preview.
//
// Chrome that sits beside the previewed surface rather than inside it (the
// toolbox) has to size against the panel it lives in: previewing a phone
// inside a wide panel leaves that chrome just as much room as before. Only
// the surface itself follows the preview width - see useIsDashboardNarrow.
export function useDashboardPanelWidth(): number {
  const overlayStateRef = useRef(InterfaceController.getOverlayState());
  const appView = useAppView();

  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.OverlayStateChanged,
      (newState) => {
        overlayStateRef.current = newState;
        forceUpdate();
      },
    );

    window.addEventListener('resize', forceUpdate);

    return () => {
      InterfaceController.removeListener(listenerId);
      window.removeEventListener('resize', forceUpdate);
    };
  }, []);

  // app view drops the rail and every panel and stretches the dashboard column
  // to 100vw, so the docked share the overlay state describes no longer says
  // anything about how much room the surface actually has
  if (appView) {
    return window.innerWidth;
  }

  // the resolved column width already accounts for maximising and for the
  // space the menu panel and inspector take out of the row
  return getDashboardWidth(overlayStateRef.current);
}

export function useIsDashboardNarrow(): boolean {
  // while the dashboard editor previews a device width, all width-dependent
  // layout logic must read that constrained width instead of the real drawer
  // width, so the surface reflows exactly as it would at that viewport
  const devicePreviewWidth = useDevicePreviewWidth();
  const dashboardWidth = useDashboardPanelWidth();

  if (devicePreviewWidth !== null) {
    return devicePreviewWidth < NARROW_DASHBOARD_THRESHOLD;
  }

  return dashboardWidth < NARROW_DASHBOARD_THRESHOLD;
}

export const useEditModeStyles = (
  isEditMode: boolean,
  flexDirection: string = 'column',
) => {
  return useMemo(() => {
    if (!isEditMode) return {};

    const isHorizontal = flexDirection === 'row';
    const borderStyle = {
      // For horizontal layout (row), top and bottom borders are dashed
      // For vertical layout (column), left and right borders are dashed
      borderTopStyle: isHorizontal ? 'dashed' : 'solid',
      borderBottomStyle: isHorizontal ? 'dashed' : 'solid',
      borderLeftStyle: isHorizontal ? 'solid' : 'dashed',
      borderRightStyle: isHorizontal ? 'solid' : 'dashed',
      borderWidth: '2px',
      borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
    };

    return {
      position: 'relative',
      transition: 'all 0.2s',
      ...borderStyle,
      '&:hover': {
        borderColor: 'primary.main',
        boxShadow: (theme) =>
          `inset 0 0 0 1000px ${alpha(theme.palette.primary.main, 0.2)}`,
      },
    };
  }, [isEditMode, flexDirection]);
};

// editor becomes read-only when the displayed surface's Layout JSON socket
// is wired (the graph owns the layout then)
export function useDisplayedSurfaceLocked(): boolean {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const updateLock = () => {
      const surfaceId = InterfaceController.displayedSurfaceNodeId;
      const node = surfaceId
        ? PPGraph.currentGraph.getNodeById(surfaceId)
        : undefined;
      setLocked(Boolean(node && isSurfaceNode(node) && node.isLayoutLocked()));
    };
    const listenerId = InterfaceController.addListeners(
      [
        ListenEvent.DisplayedSurfaceChanged,
        ListenEvent.SurfaceLayoutChanged,
        ListenEvent.GraphConfigured,
      ],
      updateLock,
    );
    return () => InterfaceController.removeListener(listenerId);
  }, []);

  return locked;
}

// re-renders the caller on the given InterfaceController events, plus an
// optional poll interval for state that has no dedicated change event yet
// (e.g. a modal's "open" socket changing outside the normal execution
// chain). Pass a poll interval only when such a real gap exists - this is a
// backstop, not a substitute for listening to the events that already cover
// a case.
export function useForceUpdateOn(
  events: ListenEvent[],
  pollIntervalMs?: number,
): () => void {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const ids = events.map((event) =>
      InterfaceController.addListener(event, forceUpdate),
    );
    const pollInterval = pollIntervalMs
      ? setInterval(forceUpdate, pollIntervalMs)
      : undefined;
    return () => {
      InterfaceController.removeListeners(ids);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return forceUpdate;
}

export function useParentDirection(parent: string | null) {
  const isNarrow = useIsDashboardNarrow();
  const { direction, mobileBehavior } = useEditor((state, query) => {
    if (!parent) return { direction: undefined, mobileBehavior: undefined };

    const parentNode = query.node(parent).get();

    return {
      direction: parentNode.data.props.flexDirection as FlexDirection,
      mobileBehavior: parentNode.data.props.mobileBehavior as MobileBehavior,
    };
  });

  if (!direction) {
    return undefined;
  }

  // children size themselves against the direction the parent actually
  // renders with, which differs from its declared flexDirection when
  // mobileBehavior flips it on narrow dashboards
  return getNewDirection(direction, isNarrow, mobileBehavior);
}
