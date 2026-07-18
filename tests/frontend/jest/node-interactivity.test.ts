import {
  getCanvasNodePointerEvents,
  getCanvasWidgetPointerEvents,
  shouldEnterHybridEditModeOnCanvasClick,
  shouldCanvasContainerBeInteractive,
  shouldNodeStayInteractionEnabled,
} from '../../../src/utils/nodeInteractivity';

describe('node interactivity rules', () => {
  it('keeps widget content live on canvas until the widget joins a multi-selection', () => {
    expect(
      getCanvasNodePointerEvents({
        isWidget: true,
        selected: false,
        isOnlySelected: false,
        isInteractionEnabled: false,
      }),
    ).toBe('auto');

    expect(
      getCanvasNodePointerEvents({
        isWidget: true,
        selected: true,
        isOnlySelected: false,
        isInteractionEnabled: false,
      }),
    ).toBe('none');
  });

  it('requires focus before hybrid node content becomes interactive on canvas', () => {
    expect(
      getCanvasNodePointerEvents({
        isWidget: false,
        selected: true,
        isOnlySelected: true,
        isInteractionEnabled: false,
      }),
    ).toBe('none');

    expect(
      getCanvasNodePointerEvents({
        isWidget: false,
        selected: true,
        isOnlySelected: true,
        isInteractionEnabled: true,
      }),
    ).toBe('auto');
  });

  it('only lets widget containers capture pointer events while singly selected', () => {
    expect(
      shouldCanvasContainerBeInteractive({
        isWidget: true,
        isOnlySelected: true,
        isInteractionEnabled: false,
      }),
    ).toBe(true);

    expect(
      shouldCanvasContainerBeInteractive({
        isWidget: true,
        isOnlySelected: false,
        isInteractionEnabled: false,
      }),
    ).toBe(false);
  });

  it('allows a slower second click to enter edit mode for a singly selected hybrid node', () => {
    expect(
      shouldEnterHybridEditModeOnCanvasClick({
        isWidget: false,
        isInteractionEnabled: false,
        isOnlySelected: true,
        wasOnlySelectedAtPointerDown: true,
        clickCount: 1,
      }),
    ).toBe(true);
  });

  it('allows double-click to enter edit mode even if the hybrid node was not selected at pointer down', () => {
    expect(
      shouldEnterHybridEditModeOnCanvasClick({
        isWidget: false,
        isInteractionEnabled: false,
        isOnlySelected: true,
        wasOnlySelectedAtPointerDown: false,
        clickCount: 2,
      }),
    ).toBe(true);
  });

  it('keeps drag-intent clicks and widget clicks out of hybrid edit mode', () => {
    expect(
      shouldEnterHybridEditModeOnCanvasClick({
        isWidget: false,
        isInteractionEnabled: false,
        isOnlySelected: false,
        wasOnlySelectedAtPointerDown: true,
        clickCount: 1,
      }),
    ).toBe(false);

    expect(
      shouldEnterHybridEditModeOnCanvasClick({
        isWidget: true,
        isInteractionEnabled: false,
        isOnlySelected: true,
        wasOnlySelectedAtPointerDown: true,
        clickCount: 1,
      }),
    ).toBe(false);
  });

  it('keeps an interaction-enabled node active only while it is the sole selection', () => {
    expect(
      shouldNodeStayInteractionEnabled({
        isInteractionEnabled: true,
        isOnlySelected: true,
      }),
    ).toBe(true);

    expect(
      shouldNodeStayInteractionEnabled({
        isInteractionEnabled: true,
        isOnlySelected: false,
      }),
    ).toBe(false);

    expect(
      shouldNodeStayInteractionEnabled({
        isInteractionEnabled: false,
        isOnlySelected: true,
      }),
    ).toBe(false);
  });

  it('keeps dashboard widget pointer events independent of canvas interaction mode', () => {
    expect(
      getCanvasWidgetPointerEvents({
        inDashboard: true,
        disabled: false,
        selected: true,
        isOnlySelected: true,
        isInteractionEnabled: false,
        node: { isWidget: () => false },
      }),
    ).toBe('auto');

    expect(
      getCanvasWidgetPointerEvents({
        inDashboard: true,
        disabled: true,
        selected: true,
        isOnlySelected: true,
        isInteractionEnabled: true,
        node: { isWidget: () => false },
      }),
    ).toBe('none');
  });
});
