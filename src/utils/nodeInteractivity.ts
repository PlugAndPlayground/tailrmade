// Shared interaction rules for hybrid/widget nodes
// - Canvas widgets stay live unless they are part of a multi-selection
// - Canvas non-widget hybrids require explicit interaction mode before content becomes live
// - A singly selected non-widget hybrid can enter interaction mode on enter, a confirming second click or double-click
// - Interaction-enabled hybrids must drop back out when they stop being the sole selection
// - Dashboard disabled/read-only state is enforced outside the widget content via the DashboardContentGate

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

export function shouldCanvasContainerBeInteractive(
  state: Pick<
    CanvasNodeInteractivityState,
    'isWidget' | 'isOnlySelected' | 'isInteractionEnabled'
  >,
): boolean {
  if (state.isWidget) {
    return state.isInteractionEnabled || (state.isOnlySelected ?? false);
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
