// Shared interaction rules for hybrid/widget nodes
// - Canvas widgets stay live unless they are part of a multi-selection, or the
//   window is a phone - there the canvas is explore-only and a widget on it is
//   inert (see getCanvasGrabThroughSx)
// - Canvas non-widget hybrids require explicit interaction mode before content becomes live
// - A singly selected non-widget hybrid can enter interaction mode on enter, a confirming second click or double-click
// - Interaction-enabled hybrids must drop back out when they stop being the sole selection
// - Dashboard interaction is gated OUTSIDE the widget content, by DashboardContentGate -
//   pointer events via an overlay, keyboard and focus via `inert`. Widget content never
//   learns why it was blocked; `disabled` below is only ever the widget's OWN read-only state.

import { isCanvasExploreOnly } from './stackLayout';

export type CanvasNodeInteractivityState = {
  isWidget: boolean;
  selected: boolean;
  isOnlySelected?: boolean;
  isInteractionEnabled: boolean;
};

type WidgetPointerEventsInput = {
  inDashboard: boolean;
  disabled?: boolean;
  selected: boolean;
  isOnlySelected?: boolean;
  isInteractionEnabled: boolean;
  node?: {
    isWidget?: () => boolean;
  };
};

type WidgetAutoFocusInput = Pick<
  WidgetPointerEventsInput,
  'inDashboard' | 'disabled' | 'isInteractionEnabled'
>;

export const NODE_CLICK_DRAG_THRESHOLD_PX = 5;

function isPartOfMultiSelection(
  state: Pick<CanvasNodeInteractivityState, 'selected' | 'isOnlySelected'>,
): boolean {
  return state.selected && !(state.isOnlySelected ?? false);
}

export function getCanvasNodePointerEvents(
  state: CanvasNodeInteractivityState,
): 'auto' | 'none' {
  if (state.isWidget) {
    return isPartOfMultiSelection(state) ? 'none' : 'auto';
  }

  return state.isInteractionEnabled ? 'auto' : 'none';
}

export function getCanvasWidgetPointerEvents(
  state: WidgetPointerEventsInput,
): 'auto' | 'none' {
  if (state.inDashboard) {
    return getDashboardContentPointerEvents(state.disabled);
  }

  return getCanvasNodePointerEvents({
    isWidget: state.node?.isWidget?.() ?? false,
    selected: state.selected,
    isOnlySelected: state.isOnlySelected,
    isInteractionEnabled: state.isInteractionEnabled,
  });
}

export function getDashboardContentPointerEvents(
  disabled?: boolean,
): 'auto' | 'none' {
  return disabled ? 'none' : 'auto';
}

export function shouldAutoFocusWidgetContent(
  state: WidgetAutoFocusInput,
): boolean {
  return !state.inDashboard && !state.disabled && state.isInteractionEnabled;
}

export const WIDGET_CONTROL_ATTRIBUTE = 'data-widget-control';

// A control whose DRAG is its whole point - the slider. Everything else marked
// as a control wants a tap, so on the canvas a travelling finger is far more
// likely to have meant "pan" than "press", and is handed to the canvas
// instead (see startCanvasTouchPan). A drag control has to keep it.
export const WIDGET_DRAG_CONTROL_ATTRIBUTE = 'data-widget-drag-control';

const NOT_DISABLED = ':not(.Mui-disabled):not([disabled])';
export function getWidgetControlProps(disabled = false) {
  return disabled ? {} : { [WIDGET_CONTROL_ATTRIBUTE]: true as const };
}

export function getWidgetDragControlProps(disabled = false) {
  return disabled
    ? {}
    : {
        [WIDGET_CONTROL_ATTRIBUTE]: true as const,
        [WIDGET_DRAG_CONTROL_ATTRIBUTE]: true as const,
      };
}

/**
 * Hands pointer events back to a canvas widget's controls - the only part of
 * it that takes any, the rest being `pointer-events: none` so a press drags
 * the node underneath.
 *
 * Except on a phone, where it hands back nothing: there a widget on the canvas
 * is a picture of a control rather than a control (see isCanvasExploreOnly).
 * That leaves the whole widget inert, which is what makes panning across one
 * work like panning across anything else - and takes with it the hover state
 * that a finger has no way to leave once it has landed on a control.
 */
export function getCanvasGrabThroughSx(exploreOnly = isCanvasExploreOnly()) {
  if (exploreOnly) {
    return {};
  }
  return {
    [`& [${WIDGET_CONTROL_ATTRIBUTE}]${NOT_DISABLED}`]: {
      pointerEvents: 'auto',
      // The canvas itself is `touch-action: none` (PIXI sets it), but these
      // controls are HTML on top of it and are not. Without this the browser
      // treats a drag that starts on one as a scroll of the nearest scrollable
      // ancestor - the hybrid container is `overflow: auto` - so the widget's
      // own content slides around inside its node and neither the control nor
      // the canvas ever sees the gesture.
      touchAction: 'none',
      // and iOS answers a long press on HTML with its selection callout, which
      // would land on top of the node's own long-press context menu
      WebkitTouchCallout: 'none',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    },
  };
}

export function shouldCanvasContainerBeInteractive(
  state: Pick<
    CanvasNodeInteractivityState,
    'isWidget' | 'isOnlySelected' | 'isInteractionEnabled'
  >,
): boolean {
  if (state.isWidget) {
    return false;
  }

  return state.isInteractionEnabled;
}

export function shouldNodeStayInteractionEnabled(
  state: Pick<
    CanvasNodeInteractivityState,
    'isInteractionEnabled' | 'isOnlySelected'
  >,
): boolean {
  return state.isInteractionEnabled && (state.isOnlySelected ?? false);
}

export function shouldEnterHybridEditModeOnCanvasClick(state: {
  isWidget: boolean;
  isInteractionEnabled: boolean;
  isOnlySelected: boolean;
  wasOnlySelectedAtPointerDown: boolean;
  clickCount: number;
}): boolean {
  if (state.isWidget || state.isInteractionEnabled || !state.isOnlySelected) {
    return false;
  }

  return state.wasOnlySelectedAtPointerDown || state.clickCount >= 2;
}
