import * as PIXI from 'pixi.js';
import React, { useEffect, useState } from 'react';
import { TRgba } from '../utils/color';
import { createRoot, Root } from 'react-dom/client';
import { Box, ThemeProvider } from '@mui/material';
import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import UpdateBehaviourClass from './UpdateBehaviourClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import * as styles from '../utils/style.module.css';
import { HybridNodeErrorBoundary } from '../components/HybridNodeErrorBoundary';
import { DashboardContentGate } from '../components/dashboard/DashboardContentGate';
import {
  DashboardIconProps,
  DashboardWidgetProps,
  IOverlay,
  Layoutable,
  TNodeSource,
  WidgetProps,
  WidgetContentProps,
} from '../utils/interfaces';
import {
  COLOR_WHITE,
  NODE_MARGIN,
  NODE_CORNERRADIUS,
  NODE_SOURCE,
  MAIN_COLOR,
  UNSET_VALUE,
  customTheme,
} from '../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../components/dashboard/dashboardIcons';
import {
  SOCKET_NAME_DASHBOARD_CONTENT,
  getOverflowForSize,
} from '../utils/layoutableHelpers';
import {
  getCanvasWidgetPointerEvents,
  shouldCanvasContainerBeInteractive,
  shouldNodeStayInteractionEnabled,
  WIDGET_DRAG_CONTROL_ATTRIBUTE,
} from '../utils/nodeInteractivity';
import { TouchPanHandoff } from '../utils/touchGestures';
import { DeferredReactTypeInterface } from '../nodes/datatypes/deferredHtmlType';
import { uniqueId } from 'lodash';
const backgroundColor = TRgba.fromString(COLOR_WHITE);

export const defaultHybridProps: WidgetProps = {
  background: backgroundColor.setAlpha(0),
  width: '100%',
  height: '370px',
  minWidth: '48px',
  minHeight: '48px',
};

interface HybridProps extends WidgetProps {
  disabled?: boolean;
}

// Type for the input object passed to getWidgetContent
export interface HybridWidgetContentProps<
  T extends HybridNode2 = HybridNode2,
> extends WidgetContentProps {
  // Generic node type to allow subclasses
  node: T;
}

function pixiToContainerNumber(value: number) {
  return `${Math.round(value)}px`;
}

const EXTRA_EDGES = 6;

const FOCUS_RING_LINE_COUNT = 20;
const FOCUS_RING_MAX_INSET = 8;
const FOCUS_RING_MIN_WIDTH = 0;
const FOCUS_RING_MAX_WIDTH = 10;
const FOCUS_RING_ALPHA = 0.1;

type HybridInteractionRenderState = {
  selected: boolean;
  isOnlySelected: boolean;
  isInteractionEnabled: boolean;
};

type CanvasHybridNodeContentProps<T extends HybridNode2 = HybridNode2> = {
  node: T;
  widgetInputProps: { [key: string]: any };
  selected: boolean;
  isOnlySelected: boolean;
  isInteractionEnabled: boolean;
  dataCyId: string;
  width?: string;
  height?: string;
  index?: number;
  showDashboard?: boolean;
};

function hasInteractionRenderStateChanged(
  previousState: HybridInteractionRenderState | undefined,
  nextState: HybridInteractionRenderState,
): boolean {
  return (
    previousState === undefined ||
    previousState.selected !== nextState.selected ||
    previousState.isOnlySelected !== nextState.isOnlySelected ||
    previousState.isInteractionEnabled !== nextState.isInteractionEnabled
  );
}

function getCurrentCanvasContentPointerEvents(
  node: HybridNode2,
): 'auto' | 'none' {
  return node.isCanvasInteractionBlocked() || node.isWidget() ? 'none' : 'auto';
}

function blockDisabledCanvasInteraction(
  node: HybridNode2,
  event: React.SyntheticEvent,
): void {
  if (node.isCanvasInteractionBlocked()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * Lets a finger reach the canvas through a widget's controls.
 *
 * A widget's controls are the only part of IT that takes pointer events on the
 * canvas - the rest is `pointer-events: none` so a press falls through to PIXI
 * and drags the node. With a mouse that is fine, because the pointer is
 * precise enough to aim between the controls. With a finger the controls are
 * dead spots you cannot pan from, and on a tablet they are much of what is on
 * screen.
 *
 * So the control keeps the gesture until the finger travels, and the canvas
 * takes it after that. The viewport is moved directly rather than through
 * pixi-viewport's drag plugin, which never saw the press: the press landed on
 * an HTML element above the canvas, so PIXI was never told about it. The cost
 * of that shortcut is no deceleration on release, which a pan that started on
 * a button was never going to have anyway.
 */
function startCanvasTouchPan(
  event: React.PointerEvent,
  node: HybridNode2,
): void {
  if (event.pointerType !== 'touch' || !event.isPrimary) {
    return;
  }
  // Only widgets. A non-widget hybrid takes pointer events across its WHOLE
  // content, and only once the user has deliberately put it into interaction
  // mode - inside a text or code editor a drag is a scroll or a selection, and
  // the user has already said which of the two they wanted.
  if (!node.isWidget()) {
    return;
  }
  // a slider's drag IS its value - taking that away would leave it unusable
  const target = event.target as Element | null;
  if (target?.closest?.(`[${WIDGET_DRAG_CONTROL_ATTRIBUTE}]`)) {
    return;
  }

  const viewport = PPGraph.currentGraph?.viewport;
  if (!viewport) {
    return;
  }
  const { pointerId } = event;
  const handoff = new TouchPanHandoff();
  handoff.start(event.clientX, event.clientY);

  // The control fires on the CLICK that follows the release, so once the canvas
  // has taken the gesture that click has to be swallowed - otherwise a pan that
  // happened to end back over the button also presses it.
  //
  // Disarmed on the next pointerdown rather than on a timer: a click always
  // arrives before the next press, so this is exact, where a timer would be
  // betting on the browser dispatching click in the same task as pointerup.
  const disarmSwallow = (): void => {
    window.removeEventListener('click', swallowClick, true);
    window.removeEventListener('pointerdown', disarmSwallow, true);
  };
  const swallowClick = (clickEvent: MouseEvent): void => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    disarmSwallow();
  };

  const onMove = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) {
      return;
    }
    const delta = handoff.move(moveEvent.clientX, moveEvent.clientY);
    if (!delta) {
      return;
    }
    viewport.x += delta.dx;
    viewport.y += delta.dy;
    // what pixi-viewport's own drag emits - it is what repositions the HTML
    // overlays and the background tiles
    viewport.emit('moved', { viewport, type: 'drag' });
  };

  const onEnd = (endEvent: PointerEvent): void => {
    if (endEvent.pointerId !== pointerId) {
      return;
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
    if (handoff.hasPanned) {
      window.addEventListener('click', swallowClick, { capture: true });
      window.addEventListener('pointerdown', disarmSwallow, true);
    }
    handoff.end();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
}

function CanvasHybridNodeContent<T extends HybridNode2>(
  props: CanvasHybridNodeContentProps<T>,
): React.ReactElement {
  return (
    <HybridNodeErrorBoundary node={props.node}>
      <Box
        sx={{
          width: '100%',
          height: '100%',
          pointerEvents: getCurrentCanvasContentPointerEvents(props.node),
        }}
        onPointerDownCapture={(event) => {
          blockDisabledCanvasInteraction(props.node, event);
          startCanvasTouchPan(event, props.node);
        }}
        onClickCapture={(event) => {
          blockDisabledCanvasInteraction(props.node, event);
        }}
      >
        <props.node.getWidgetContent
          {...props.widgetInputProps}
          index={props.index}
          id={props.node.id}
          selected={props.selected}
          isOnlySelected={props.isOnlySelected}
          node={props.node}
          isInteractionEnabled={props.isInteractionEnabled}
          inDashboard={false}
          dataCyId={props.dataCyId}
          width={props.width}
          height={props.height}
        />
      </Box>
    </HybridNodeErrorBoundary>
  );
}

export default abstract class HybridNode2 extends PPNode implements Layoutable {
  root: Root | undefined;
  static: HTMLElement;
  staticRoot: Root;
  container: HTMLElement | undefined = undefined;
  listenId: string[] = [];
  selectionListenerId: string | undefined = undefined; // Track the selection listener for cleanup
  hybridNodeRenderID = 0;
  hybridNodeRepositionID = 0;
  prevWasFocused = false;
  hasRendered = false;
  lastInteractionRenderState: HybridInteractionRenderState | undefined =
    undefined;
  dashboardRenderFunctions: Record<string, any> = {}; // store all rendered instances by IDs so that we can tell all to re-render when we want to

  protected drawStatuses(): void {
    super.drawStatuses();
    this._StatusesRef.y = this.nodeHeight - this._StatusesRef.y;
  }

  public getRoundedCorners(): boolean {
    return false;
  }

  protected getHybridNodeWidth() {
    return this.nodeWidth - EXTRA_EDGES * 2;
  }

  protected getHybridNodeHeight() {
    return this.nodeHeight - EXTRA_EDGES * 2;
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this.createContainerComponent();
    if (this.shouldFocusWhenNew() && source === NODE_SOURCE.NEW) {
      setTimeout(() => {
        if (!this.destroyed) {
          void this.enableInteraction();
        }
      }, 500); // timeout is problematic TODO fix
    }

    // Listen to selection changes to update interactivity
    this.selectionListenerId = InterfaceController.addListener(
      ListenEvent.SelectionChanged,
      () => {
        if (this.destroyed) return;
        const previousState = this.lastInteractionRenderState;
        this.updateContainerInteractivity();
        const nextState = this.getInteractionRenderState();
        if (hasInteractionRenderStateChanged(previousState, nextState)) {
          this.forceRerender(false);
        }
      },
    );
  }

  public shouldFocusWhenNew(): boolean {
    return false;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  isLayoutable(): boolean {
    return true;
  }

  isContainer(): boolean {
    return false;
  }

  getDashboardId(): string {
    return `NODE_${this.id}`;
  }

  getDashboardName(): string {
    return this.nodeName;
  }

  getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return DEFAULT_DASHBOARD_ICON;
  }

  public getWidgetProps(): HybridProps {
    return { ...defaultHybridProps, disabled: false };
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    if (!this.container) {
      this.createContainerComponent();
    }

    // Use default height if not provided
    const { height = 'auto', ...otherProps } = props;

    return (
      <DynamicWidgetContainerHybridNode
        property={this}
        height={height}
        {...otherProps}
      />
    );
  }

  getRelatedNode(): PPNode {
    return this;
  }
  protected visualOffsetXY(x: number, y: number) {
    super.visualOffsetXY(x, y);
    this.redraw();
  }

  protected redraw() {
    if (this.destroyed) {
      return;
    }
    const scale = PPGraph.currentGraph.viewportScaleX;
    const screenPointBackgroundRectTopLeft =
      this.screenPointBackgroundRectTopLeft();
    const screenX = screenPointBackgroundRectTopLeft.x + EXTRA_EDGES * scale;
    const screenY = screenPointBackgroundRectTopLeft.y + EXTRA_EDGES * scale;
    if (this.container == undefined) {
      if (this.isVisible()) {
        this.createContainerComponent();
      }
      return;
    }

    if (this.isVisible()) {
      if (this.container.style.display !== 'block') {
        this.container.style.display = 'block';
      }

      // Update interactivity based on selection
      this.updateContainerInteractivity();

      const newScale = scale.toPrecision(3);
      const newLeft = pixiToContainerNumber(screenX);
      const newTop = pixiToContainerNumber(screenY);
      if (!this.hasRendered) {
        this.renderReactComponent(this.getInputObject());
      } else {
        // repositioning uses its own animation-frame handle: a viewport move
        // must never cancel a pending React content re-render (scheduled by
        // callRender on hybridNodeRenderID), otherwise the canvas widget keeps
        // rendering stale props after a value change made through the dashboard
        cancelAnimationFrame(this.hybridNodeRepositionID);
        this.hybridNodeRepositionID = requestAnimationFrame(() => {
          if (this.container !== undefined) {
            this.container.style.transform = `scale(${newScale})`;
            this.container.style.left = newLeft;
            this.container.style.top = newTop;
          }
        });
      }
    } else {
      if (this.container && this.container.style.display !== 'none') {
        this.container.style.display = 'none';
      }
    }
  }

  public fadeAllNonPIXIParts(alpha: number): void {
    if (this.container) {
      this.container.style.opacity = alpha.toString();
    }
  }

  // this function can be called for hybrid nodes, it
  // • creates a container component
  // • adds the onNodeDragOrViewportMove listener to it
  // • adds a react parent component with props
  createContainerComponent(): HTMLElement {
    //console.trace('CREATE CONTAINER COMPONENT' + this.name);
    const reactElement = document.createElement('div');
    const containerElement = document.getElementById('container');
    if (!containerElement) {
      throw new Error('Container element not found');
    }
    this.container = containerElement.appendChild(reactElement);
    this.root = createRoot(this.container!);
    this.container.id = `Container-${this.id}`;

    const scale = PPGraph.currentGraph.viewportScaleX;
    this.container.classList.add(styles.hybridContainer);

    // set initial position and size
    this.container.style.width = `${this.getHybridNodeWidth()}px`;
    this.container.style.height = `${this.getHybridNodeHeight()}px`;
    this.container.style.transform = `scale(${scale})`;

    // Set initial position
    const screenPointBackgroundRectTopLeft =
      this.screenPointBackgroundRectTopLeft();
    const screenX = screenPointBackgroundRectTopLeft.x + EXTRA_EDGES * scale;
    const screenY = screenPointBackgroundRectTopLeft.y + EXTRA_EDGES * scale;
    this.container.style.left = pixiToContainerNumber(screenX);
    this.container.style.top = pixiToContainerNumber(screenY);

    this.myComponentCleanup = () => {
      if (this.container && this.root) {
        this.removeContainerComponent(this.container, this.root);
      }
      this.root = undefined;
      this.container = undefined;
    };

    if (this.isVisible()) {
      this.callRender(this.getInputObject());
    }

    return this.container;
  }

  abstract getWidgetContent(
    inputObject: HybridWidgetContentProps,
  ): React.ReactElement;

  private getInteractionRenderState(): HybridInteractionRenderState {
    return {
      selected: this.selected,
      isOnlySelected: PPGraph.currentGraph.selection.isOnlySelectedNode(this),
      isInteractionEnabled: this.isInteractionEnabled(),
    };
  }

  // the render method, takes a component and props, and renders it to the page
  renderReactComponent = (props: { [key: string]: any }): void => {
    if (this.destroyed) {
      return;
    }
    if (this.root === undefined) {
      this.createContainerComponent();
    } else {
      const widgetProps = this.getWidgetProps();
      const interactionState = this.getInteractionRenderState();
      this.lastInteractionRenderState = interactionState;
      this.root.render(
        <ThemeProvider theme={customTheme}>
          <CanvasHybridNodeContent
            node={this}
            widgetInputProps={props}
            selected={interactionState.selected}
            isOnlySelected={interactionState.isOnlySelected}
            isInteractionEnabled={interactionState.isInteractionEnabled}
            dataCyId={`${this.id}-canvas`}
            width={widgetProps.width}
            height={widgetProps.height}
          />
        </ThemeProvider>,
      );
      this.hasRendered = true;
    }
  };

  protected async onHybridNodeExit(): Promise<void> {}

  removeContainerComponent(container: HTMLElement, root: Root): void {
    root.unmount();
    const containerElement = document.getElementById('container');
    if (containerElement) {
      containerElement.removeChild(container);
    }
  }

  protected onViewportMove(): void {
    this.redraw();
  }

  setPosition(x: number, y: number, isRelative = false): void {
    super.setPosition(x, y, isRelative);
    this.onViewportMove(); // trigger this once, so the react components get positioned properly
  }

  resizeAndDraw(
    width = this.nodeWidth,
    height = this.nodeHeight,
    maintainAspectRatio = false,
  ): void {
    super.resizeAndDraw(width, height, maintainAspectRatio);
    if (this.container) {
      this.container.style.width = `${this.nodeWidth - EXTRA_EDGES * 2}px`;
      this.container.style.height = `${this.nodeHeight - EXTRA_EDGES * 2}px`;
    }
  }

  public forceRerender(allowCancel = true): void {
    this.callRender(this.getInputObject(), allowCancel);
  }

  public socketChangedFromWidget(): void {
    this.forceRerender(false);
  }

  async makeEditable(): Promise<void> {
    // register hybrid nodes to listen to outside clicks
    if (this.container) {
      this.container.classList.add(styles.hybridContainerInteractive);
    }
    this.drawBackground();
    await this.execute();
  }

  private updateContainerInteractivity(): void {
    if (!this.container) {
      return;
    }

    const isInteractionEnabled = this.isInteractionEnabled();
    const isOnlySelected =
      PPGraph.currentGraph.selection.isOnlySelectedNodeIgnoringPendingSelection(
        this,
      );
    const shouldBeInteractive = shouldCanvasContainerBeInteractive({
      isWidget: this.isWidget(),
      isOnlySelected,
      isInteractionEnabled,
    });

    if (shouldBeInteractive) {
      this.container.classList.add(styles.hybridContainerInteractive);
    } else {
      this.container.classList.remove(styles.hybridContainerInteractive);
    }

    if (
      isInteractionEnabled &&
      !shouldNodeStayInteractionEnabled({
        isInteractionEnabled,
        isOnlySelected,
      })
    ) {
      void this.disableInteraction();
    }
  }

  /**
   * Whether this node's content must not respond to the pointer on the canvas:
   * a widget that has joined a multi-selection, or a non-widget hybrid that is
   * not in edit mode.
   */
  public isCanvasInteractionBlocked(): boolean {
    return (
      getCanvasWidgetPointerEvents({
        inDashboard: false,
        selected: this.selected,
        isOnlySelected: PPGraph.currentGraph.selection.isOnlySelectedNode(this),
        isInteractionEnabled: this.isInteractionEnabled(),
        node: this,
      }) === 'none'
    );
  }

  public isInteractionEnabled(): boolean {
    return PPGraph.currentGraph.interactionEnabledHybridNode?.id == this.id;
  }

  public onEnterKeyPressed(): boolean {
    if (this.isWidget()) {
      return false;
    }

    if (!this.isInteractionEnabled()) {
      void this.enableInteraction();
    }

    return true;
  }

  async enableInteraction(): Promise<void> {
    this.listenId.push(
      InterfaceController.addListener(ListenEvent.EscapeKeyUsed, () =>
        this.disableInteraction(),
      ),
    );
    if (PPGraph.currentGraph.interactionEnabledHybridNode) {
      await PPGraph.currentGraph.interactionEnabledHybridNode.disableInteraction();
    }
    PPGraph.currentGraph.interactionEnabledHybridNode = this;
    this.prevWasFocused = true;
    await this.makeEditable();
  }

  async disableInteraction(): Promise<void> {
    if (PPGraph.currentGraph.interactionEnabledHybridNode?.id == this.id) {
      this.prevWasFocused = false;
      PPGraph.currentGraph.interactionEnabledHybridNode = undefined;

      InterfaceController.removeListeners(this.listenId);
      this.listenId = [];
      if (this.container) {
        this.container.classList.remove(styles.hybridContainerInteractive);
      }
      this.drawBackground();
      await this.execute();
      await this.onHybridNodeExit();
    }
  }

  public getShrinkOnSocketRemove(): boolean {
    return false;
  }

  public getShowLabels(): boolean {
    return false;
  }

  /**
   * Override to return true if this node's React component should remain
   * rendered even when the node is scrolled off-screen (e.g. because it
   * contains <style> or <script> tags with global side-effects).
   */
  public shouldRenderWhenOffScreen(): boolean {
    return false;
  }

  public renderWidget(input: any) {
    if (
      !this.destroyed &&
      (this.isVisible() || this.shouldRenderWhenOffScreen())
    ) {
      this.renderReactComponent(input);
    }
    Object.values(this.dashboardRenderFunctions).forEach((func) => func());
  }

  protected callRender(input: any, allowCancel = true) {
    cancelAnimationFrame(this.hybridNodeRenderID);
    if (allowCancel) {
      this.hybridNodeRenderID = requestAnimationFrame(() => {
        this.renderWidget(input);
      });
    } else {
      this.renderWidget(input);
    }
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    await super.onExecute(input, output);

    if (this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)?.hasLink()) {
      const reactUIProps = structuredClone(input);
      const ReactUI: DeferredReactTypeInterface = {
        renderFunction: (props) =>
          this.getDashboardWrapper({
            ...props,
            reactUIProps,
          }),
        nodeId: this.id,
      };
      output[SOCKET_NAME_DASHBOARD_CONTENT] = ReactUI;
    }
    this.callRender(input);
  }

  public getOpacity(): number {
    return 0.3;
  }

  public getColor(): TRgba {
    return new TRgba(200, 200, 200);
  }

  private drawFocusRingLayer(
    focusColor: number,
    inset: number,
    strokeWidth: number,
    alpha: number,
  ): void {
    const rectX = NODE_MARGIN - inset;
    const rectY = -inset;
    const rectWidth = this.nodeWidth + inset * 2;
    const rectHeight = this.nodeHeight + inset * 2;

    this._BackgroundGraphicsRef.rect(rectX, rectY, rectWidth, rectHeight);
    this._BackgroundGraphicsRef.stroke({
      color: focusColor,
      width: strokeWidth,
      alpha,
    });
  }

  private drawFocusRing(focusColor: number, borderRadius: number): void {
    for (let i = 0; i < FOCUS_RING_LINE_COUNT; i++) {
      const t = i / (FOCUS_RING_LINE_COUNT - 1);
      const inverseT = 1 - t;

      const inset = FOCUS_RING_MAX_INSET * inverseT;
      const strokeWidth =
        FOCUS_RING_MIN_WIDTH +
        (FOCUS_RING_MAX_WIDTH - FOCUS_RING_MIN_WIDTH) * inverseT;
      const alpha = FOCUS_RING_ALPHA;

      this.drawFocusRingLayer(focusColor, inset, strokeWidth, alpha);
    }
  }

  public drawBackground(): void {
    const borderRadius = this.getRoundedCorners() ? NODE_CORNERRADIUS : 0;
    this._BackgroundGraphicsRef.clear();
    this._BackgroundGraphicsRef.roundRect(
      NODE_MARGIN,
      0,
      this.nodeWidth,
      this.nodeHeight,
      borderRadius,
    );
    this._BackgroundGraphicsRef.fill({
      color: this.getColor().hexNumber(),
      alpha: this.getOpacity(),
    });
    if (this.isInteractionEnabled()) {
      const focusColor = TRgba.fromString(MAIN_COLOR).hexNumber();
      this.drawFocusRing(focusColor, borderRadius);
    }
  }

  myComponentCleanup = () => {};

  onNodeRemoved = (): void => {
    // Check if this node is the focused node and clear the reference
    if (PPGraph.currentGraph.interactionEnabledHybridNode === this) {
      PPGraph.currentGraph.interactionEnabledHybridNode = undefined;
    }

    InterfaceController.removeListeners(this.listenId);

    // Clean up the selection listener
    if (this.selectionListenerId) {
      InterfaceController.removeListener(this.selectionListenerId);
      this.selectionListenerId = undefined;
    }

    this.myComponentCleanup();
  };

  fullScreenDashboardClosed(): void {
    this.redraw();
  }
}

type DynamicWidgetContainerHybridNodeProps = DashboardWidgetProps & {
  property: HybridNode2;
};

const DynamicWidgetContainerHybridNodeInner: React.FunctionComponent<
  DynamicWidgetContainerHybridNodeProps
> = (props) => {
  const [showDashboard, setShowDashboard] = useState(true);
  const [_, setDummyExecutionVar] = useState(0);

  // If reactUIProps is provided, use that directly (from nodes connected with reactUI)
  // Otherwise, use the remapped input socket values (live inputs)
  let widgetInputProps =
    props.reactUIProps !== undefined
      ? props.reactUIProps
      : HybridNode2.remapInput(props.property.inputSocketArray);

  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.OverlayStateChanged,
      (newState: IOverlay) => {
        setShowDashboard(newState.dashboard.visible);
      },
    );
    const myRenderID = uniqueId();
    props.property.dashboardRenderFunctions[myRenderID] = () => {
      setDummyExecutionVar(Math.random());
    };
    return () => {
      InterfaceController.removeListener(listenerId);
      delete props.property.dashboardRenderFunctions[myRenderID];
    };
  }, []);

  useEffect(() => {
    const executionListener = () => {
      setDummyExecutionVar(Math.random());
    };
    props.property.addExecutionListener(executionListener);

    return () => {
      props.property.removeExecutionListener(executionListener);
    };
  }, [props.property]);

  return (
    <Box
      id={`inspector-node-${props.property.getName()}`}
      sx={{
        height: '100%',
        width: '100%',
        minWidth: props.minWidth,
        minHeight: props.minHeight,
        maxWidth: props.maxWidth,
        maxHeight: props.maxHeight,
        overflow: getOverflowForSize(props.width, props.height),
        pointerEvents: showDashboard ? UNSET_VALUE : 'none',
      }}
    >
      <DashboardContentGate
        disabled={props.disabled}
        blockInteraction={props.blockInteraction}
        isSurfacePreview={props.isSurfacePreview}
      >
        <HybridNodeErrorBoundary node={props.property}>
          <props.property.getWidgetContent
            {...widgetInputProps}
            index={props.index}
            id={props.property.id}
            selected={props.property.selected}
            isOnlySelected={PPGraph.currentGraph.selection.isOnlySelectedNode(
              props.property,
            )}
            node={props.property}
            isInteractionEnabled={props.property.isInteractionEnabled()}
            inDashboard={true}
            isSurfacePreview={props.isSurfacePreview}
            dataCyId={`${props.property.id}-dashboard${props.isSurfacePreview ? '-preview' : ''}`}
            disabled={props.disabled}
            showDashboard={showDashboard}
            width={props.width}
            height={props.height}
          />
        </HybridNodeErrorBoundary>
      </DashboardContentGate>
    </Box>
  );
};

export const DynamicWidgetContainerHybridNode = React.memo(
  DynamicWidgetContainerHybridNodeInner,
);
