import React, { useContext } from 'react';
import { Box } from '@mui/material';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import PPSocket, { DynamicInputDummySocket } from '../../classes/SocketClass';
import PPGraph from '../../classes/GraphClass';
import FlowLogic from '../../classes/FlowLogic';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  SurfaceCanvasPreviewContext,
  SurfaceRenderer,
  SurfaceVisitedContext,
} from '../../components/dashboard/SurfaceRenderer';
import { SurfaceChrome } from '../../components/dashboard/SurfaceChrome';
import { getPageDashboardIcon } from '../../components/dashboard/dashboardIcons';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import { JSONType } from '../datatypes/jsonType';
import { BooleanType } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';
import { GhostType } from '../datatypes/ghostType';
import {
  getDefaultWidgetLayoutValue,
  WidgetLayoutInterface,
  WidgetLayoutType,
} from '../datatypes/widgetLayoutType';
import {
  DashboardIconProps,
  Layoutable,
  TNodeSource,
  WidgetProps,
} from '../../utils/interfaces';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import {
  NODE_SOURCE,
  NODE_TYPE_COLOR,
  RightDrawerView,
  SOCKET_TYPE,
} from '../../utils/constants';
import {
  dashboardLayoutInputName,
  surfaceJsonSocketName,
  surfaceRouteSocketName,
  surfaceRadioGroupSocketName,
  surfaceElementVisibleSuffix,
  surfaceElementLayoutSuffix,
  VISIBILITY_ACTION,
} from '../../utils/constants_shared';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import {
  SerializedCraftTree,
  slugifyUINodeRoute,
} from '../../utils/surfaceTree';
import {
  coerceSurfaceTree,
  coerceSurfaceTreeOrEmpty,
  getLinkedSourceNodeIds,
  isElementSocket,
  StashedWidget,
  SurfaceSync,
  wouldCreateSurfaceEmbeddingLoop,
  wrapSurfaceTree,
} from './surfaceSync';

export const UISurfaceWidget: React.FunctionComponent<
  HybridWidgetContentProps<UISurfaceNode>
> = (props) => {
  const node = props.node;
  const visited = useContext(SurfaceVisitedContext);
  // a surface rendered outside the dashboard is a canvas preview; surfaces
  // embedded in it render with inDashboard true, so inherit the flag too
  const isCanvasPreview =
    useContext(SurfaceCanvasPreviewContext) || !props.inDashboard;

  if (visited.includes(node.id)) {
    return (
      <Box
        sx={{
          width: '100%',
          p: 1,
          color: 'warning.main',
          fontSize: '12px',
          textAlign: 'center',
        }}
      >
        Recursive UI surface ({node.getDashboardName()}) — not rendered
      </Box>
    );
  }

  const tree = SurfaceSync.applyRuntimeOverrides(
    node,
    coerceSurfaceTreeOrEmpty(
      props[surfaceJsonSocketName] ?? node.getSurfaceTree(),
    ),
  );

  // A UISurfaceWidget only ever renders a surface as a canvas preview or as a
  // surface embedded inside another surface — never the top-level surface that
  // is live in the DashboardEditor (that uses the craft Editor frame).
  // - Canvas preview (inDashboard false): always read-only.
  // - Embedded in another surface: interactive in view/app mode so the UI can
  //   be used. While the surrounding surface is being EDITED nothing here has
  //   to change - the DashboardContentGate above this widget already makes the
  //   whole subtree inert, so the click that dives in reaches craftjs instead.
  const interactive = Boolean(props.inDashboard) && !props.disabled;
  const rendered = (
    <SurfaceCanvasPreviewContext.Provider value={isCanvasPreview}>
      <SurfaceVisitedContext.Provider value={[...visited, node.id]}>
        <SurfaceRenderer tree={tree} interactive={interactive} />
      </SurfaceVisitedContext.Provider>
    </SurfaceCanvasPreviewContext.Provider>
  );

  // The canvas preview gets the browser-like chrome to emphasise the node's
  // purpose; in the dashboard the surrounding editor already provides context.
  if (props.inDashboard) {
    return rendered;
  }

  const isDefault = PPGraph.currentGraph?.defaultUISurfaceNodeId === node.id;
  return (
    <SurfaceChrome
      label={node.getDashboardName()}
      routeSlug={node.getRouteSlug()}
      isEmbedded={node.isEmbedded()}
      isDefault={isDefault}
    >
      {rendered}
    </SurfaceChrome>
  );
};

export class UISurfaceNode extends HybridNode2 implements Layoutable {
  // preserves widget placement across unlink/relink (e.g. undo of a disconnect)
  removedWidgetCache: Map<string, StashedWidget> = new Map();

  // a dedicated drop target for new connections, so a link can always be
  // wired up even when the surface's rendered widgets cover its body (see
  // DynamicInputNode, which uses the same dummy-socket pattern)
  ghostSocket: DynamicInputDummySocket = new DynamicInputDummySocket(
    SOCKET_TYPE.GHOST,
    '',
    new GhostType(),
  );

  public getName(): string {
    return 'UI surface';
  }

  public getDescription(): string {
    return 'Build a page or reusable UI container from connected widgets.';
  }

  public getDocs(): string {
    return `A top-level surface is a page; a surface nested in another is a
reusable container or component.

Connect any "ReactUI" output (widgets, charts, or other surfaces) to place it
on the surface. This creates an element socket and two control sockets:
"<name> visible" (boolean) and "<name> layout" (layout object). Self-embedding
loops are rejected. Disconnecting a widget takes it back off, so moving one to
another page is a disconnect plus a connect.

Arrange the surface in the dashboard editor. If "Layout JSON" is linked, the
graph owns the layout and it can no longer be arranged by hand.

## Layout
- A container holds children in a row or column, with its own gap, padding,
  background, width, height, align and justify. The root is ALWAYS a vertical
  stack; nest a row container for side-by-side items.
- A container's emphasis makes it stand out: 'subtle' is a faint tint,
  'strong' a card with a border and shadow. Both follow light/dark and the
  preset, so prefer them over a background color to group or highlight.
- A row's mobile behaviour decides what it does on a narrow dashboard
  (< 600px): stack its children (the default), let them wrap, or keep them
  side by side.
- The root defaults to zero desktop padding, so content touches the surface
  edges. On a scrollable content page (root height 'auto') give the root
  padding ~16-24 and gap ~8-16; on a fullscreen dashboard (root height
  '100dvh') keep padding minimal.
- Static text is Markdown. Its variant sets size, weight and line height and
  its tone a theme color, so text follows the app theme. It shows {{…}}
  literally - to show a value from the graph, use a Text node widget.
- Heading variants are fluid: display, h1, h2 and stat shrink on a narrow app
  and grow on a wide one, so pick the variant for the heading's job rather
  than a smaller one to fit a phone. body, caption, label and h3 hold one size.
- Leave colors on Theme so the surface follows the app's preset and
  light/dark mode; use a container's emphasis to group or highlight. A picked
  background or text color is fixed, so it only reads well in one mode.

## Navigation and multi-view apps
Switch surfaces with "Navigate to UI surface", which resolves a surface by its
NODE name or route slug. The first surface is the default.

Two patterns:
1. Separate pages: several top-level surfaces share one navigation widget
whose options are those surface NODE names, wired into "Navigate to UI surface".
2. Nav shell with embedded pages: connect each child surface's ReactUI output
into one main surface that holds the navigation, with a shared non-empty
"Radio Group" so navigating shows one child and hides the rest. Children
default to visible; set each non-default child's hidden
"<child name> visible" companion socket on the main surface to false -
otherwise all pages render at once.

${AGENT_DOCS_HEADING}
disconnect_sockets takes a widget back off (pass the surface as to_node and the
widget as from_node).

Use inspect_surface and set_surface_layout to arrange it; set_surface_layout is
locked while "Layout JSON" is linked. Change the default surface with
set_default_surface.

### set_surface_layout spec
Each call replaces the layout; omitted props reset. Inspect first and include
everything to keep. Omitted connected widgets are appended with a warning.
- Container: {direction:'row'|'column', children:[...], gap?, padding?,
  background?, width?, height?, align?, justify?, mobileBehavior?,
  emphasis?}. The root must be a container with direction fixed to 'column'.
  mobileBehavior is 'column' | 'wrap' | 'row'. emphasis is
  'none' | 'subtle' | 'strong'.
- Static text: {text:'...', variant?, tone?, alignment?}. text is
  Markdown: # headings, - lists, > quotes, code blocks, **bold**, *italic*,
  \`code\`, [link](https://…), and [words]{.primary .nowrap} for a run's tone
  or no-wrap; each line is a paragraph. variant: 'display'|'h1'|'h2'|'h3'|'body'|'caption'|'label'|'stat';
  tone: 'default'|'muted'|'primary'|'secondary'|'success'|'warning'|'error';
  alignment: 'left'|'center'|'right'|'justify'.
- Graph widget: {widget:'<node_id>'} - a node with a ReactUI output;
  unconnected widgets are connected automatically.
- Colors are {r,g,b,a} (0-255, a 0-1).`;
  }

  public getTags(): string[] {
    return ['Widget', 'Layout', 'Container', 'Page'];
  }

  public getVersion(): number {
    return 1;
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  public isSurface(): boolean {
    return true;
  }

  // The canvas representation is a read-only preview — instead of entering
  // hybrid interaction mode on the canvas (which wouldn't be meaningful for
  // a surface), double-click/Enter show this surface in the DashboardEditor.
  // eslint-disable-next-line require-await
  public async enableInteraction(): Promise<void> {
    InterfaceController.openDashboardInEditMode();
    InterfaceController.showSurface(this.id);
    InterfaceController.setRightDrawerView(RightDrawerView.INTERFACE);
  }

  public onEnterKeyPressed(): boolean {
    void this.enableInteraction();
    return true;
  }

  // embedded surfaces are rendered via their own tree, not via nested craft
  // children, so they are regular (non-container) widgets in a parent tree
  public isContainer(): boolean {
    return false;
  }

  // the surface's ReactUI output feeds another surface
  public isEmbedded(): boolean {
    return (
      this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)
        ?.links.map((link) => link.getTarget().getNode())
        .some((node) => node.isSurface()) ?? false
    );
  }

  // something is wired into the Layout JSON socket: the graph owns the
  // layout and the DashboardEditor must be read-only for this surface
  public isLayoutLocked(): boolean {
    return this.getInputSocketByName(surfaceJsonSocketName).hasLink();
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this._BackgroundRef.addChild(this.ghostSocket);
    this.ghostSocket.onNodeAdded(this);
    // a graph's first surface becomes the displayed one automatically
    if (!InterfaceController.displayedSurfaceNodeId) {
      InterfaceController.showSurface(this.id);
    }
    // the first surface a user creates becomes the default shown on app load
    // (only for freshly created surfaces, not ones restored from a saved graph;
    // the user can change the default afterwards via the star toggle)
    if (
      source !== NODE_SOURCE.SERIALIZED &&
      PPGraph.currentGraph &&
      !PPGraph.currentGraph.defaultUISurfaceNodeId
    ) {
      PPGraph.currentGraph.defaultUISurfaceNodeId = this.id;
    }
  }

  public async onRemoved(): Promise<void> {
    await super.onRemoved();
    if (InterfaceController.displayedSurfaceNodeId === this.id) {
      InterfaceController.showAnotherSurfaceOrClear(this.id);
    }
  }

  // The route slug is a stable, user-controlled URL fragment for this surface,
  // used by the Navigate node to target it (decoupled from the node name).
  public getRouteSlug(): string {
    return slugifyUINodeRoute(
      String(this.getInputData(surfaceRouteSocketName) ?? ''),
    );
  }

  // Surfaces sharing a non-empty Radio Group are mutually exclusive wherever
  // each is embedded - showing one hides every other member of the group,
  // regardless of whether they share the same parent surface.
  public getRadioGroup(): string {
    return String(this.getInputData(surfaceRadioGroupSocketName) ?? '').trim();
  }

  // tolerant: malformed Layout JSON yields the empty layout so rendering and
  // editor reads never crash - onExecute parses strictly and throws, which
  // puts the error on the node status (visible to the user and the LLM)
  public getSurfaceTree(): SerializedCraftTree {
    return coerceSurfaceTreeOrEmpty(this.getInputData(surfaceJsonSocketName));
  }

  public setSurfaceTree(tree: SerializedCraftTree): void {
    this.setInputData(surfaceJsonSocketName, wrapSurfaceTree(tree));
    InterfaceController.notifyListeners(ListenEvent.SurfaceLayoutChanged, {
      nodeId: this.id,
    });
    // update the canvas preview and any surfaces embedding this one
    this.forceRerender(false);
    FlowLogic.addPendingExecution(this.id);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        surfaceJsonSocketName,
        new JSONType(),
        wrapSurfaceTree(coerceSurfaceTree(undefined)),
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        surfaceRouteSocketName,
        new StringType(),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        surfaceRadioGroupSocketName,
        new StringType(),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        dashboardLayoutInputName,
        new WidgetLayoutType(),
        getDefaultWidgetLayoutValue(),
        true,
      ),
    ];
  }

  public getMinNodeWidth(): number {
    return 300;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  public drawSockets(): void {
    super.drawSockets();
    this.ghostSocket.y = this.getGhostSocketY();
  }

  // a new connection from a ReactUI output creates a fresh, named element
  // socket (plus its hidden "<name> visible"/"<name> layout" companions)
  public getSocketForNewConnection(socket: PPSocket): PPSocket {
    if (!socket.isInput() && socket.dataType instanceof DeferredReactType) {
      const sourceNode = socket.getNode();
      // block embedding a surface into itself or into one it already contains
      if (wouldCreateSurfaceEmbeddingLoop(sourceNode, this)) {
        InterfaceController.showSnackBar(
          'Cannot embed a UI surface into itself or into one it already contains',
        );
        return undefined as unknown as PPSocket;
      }
      // already wired into this surface - the widget-sync layer dedupes by
      // source node id (only one widget is ever shown per source), so a
      // second socket/link here would just be inert clutter
      if (getLinkedSourceNodeIds(this).has(sourceNode.id)) {
        InterfaceController.showSnackBar(
          `${sourceNode.getName()} is already on this UI`,
        );
        return undefined as unknown as PPSocket;
      }
      return this.recreateDynamicSocket(socket, sourceNode.getName())!;
    }
    return super.getSocketForNewConnection(socket);
  }

  public recreateDynamicSocket(
    sourceSocket: PPSocket,
    name: string,
  ): PPSocket | undefined {
    if (!(sourceSocket?.dataType instanceof DeferredReactType)) {
      return undefined;
    }
    const newSocket = new PPSocket(
      SOCKET_TYPE.IN,
      this.getNewSocketName(name),
      new DeferredReactType(),
    );
    this.addDynamicSocket(newSocket);
    this.resizeAndDraw();
    return newSocket;
  }

  protected getDependentDynamicSockets(socketName: string): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        socketName + surfaceElementVisibleSuffix,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        socketName + surfaceElementLayoutSuffix,
        new WidgetLayoutType(),
        getDefaultWidgetLayoutValue(),
        false,
      ),
    ];
  }

  public inputPlugged(socket: PPSocket): void {
    super.inputPlugged(socket);
    if (isElementSocket(socket)) {
      SurfaceSync.syncWidgetsToLinks(this);
    } else if (socket.name === surfaceJsonSocketName) {
      // lock state of the editor depends on this socket being wired
      InterfaceController.notifyListeners(ListenEvent.SurfaceLayoutChanged, {
        nodeId: this.id,
      });
    }
  }

  public inputUnplugged(socket: PPSocket): void {
    super.inputUnplugged(socket);
    if (isElementSocket(socket)) {
      SurfaceSync.syncWidgetsToLinks(this);
      // remove the element socket (and via dependentSocketName its paired
      // sockets) once nothing is connected to it anymore
      if (
        this.socketCanBeRemoved(socket) &&
        socket.links.length === 0 &&
        socket.dependentSocketName === ''
      ) {
        this.removeSocket(socket);
      }
    } else {
      if (socket.name === surfaceJsonSocketName) {
        InterfaceController.notifyListeners(ListenEvent.SurfaceLayoutChanged, {
          nodeId: this.id,
        });
      }
      this.forceRerender(false);
    }
  }

  public outputPlugged(socket: PPSocket): void {
    super.outputPlugged(socket);
    this.updateRootLayoutSocketVisibility();
  }

  public outputUnplugged(socket: PPSocket): void {
    super.outputUnplugged(socket);
    this.updateRootLayoutSocketVisibility();
  }

  // an embedded surface's external placement is controlled by the parent's
  // per-element layout socket; its own root Layout socket is suppressed
  private updateRootLayoutSocketVisibility(): void {
    const layoutSocket = this.getInputSocketByName(dashboardLayoutInputName);
    if (layoutSocket && !layoutSocket.hasLink()) {
      layoutSocket.setVisible(!this.isEmbedded());
    }
  }

  public getWidgetProps(): WidgetProps {
    const layout: WidgetLayoutInterface = {
      ...getDefaultWidgetLayoutValue(),
      ...(this.getInputData(dashboardLayoutInputName) as WidgetLayoutInterface),
    };
    return {
      ...layout,
      background: layout.background,
      width: layout.width,
      height: layout.height,
      minWidth: layout.minWidth,
      minHeight: layout.minHeight,
    } as WidgetProps;
  }

  public getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return getPageDashboardIcon();
  }

  getWidgetContent(
    props: HybridWidgetContentProps<UISurfaceNode>,
  ): React.ReactElement {
    return <UISurfaceWidget {...props} />;
  }

  // do not call HybridNode2.onExecute: it structuredClones the input, which
  // throws on the render functions carried by element sockets
  // eslint-disable-next-line require-await
  protected async onExecute(input: any, output: any): Promise<void> {
    // parse the stored layout strictly: a malformed Layout JSON throws here,
    // which execute() turns into an error status on the node (visible to the
    // user and, via MCP, to the LLM) - and by aborting before the widget sync
    // below, the bad value stays in the socket to be inspected and fixed
    // instead of being overwritten with a freshly synced empty layout
    coerceSurfaceTree(this.getInputData(surfaceJsonSocketName));
    // links can be (re)created without plug notifications (graph load, undo
    // of a node deletion) — reconcile here as well; no-op when in sync
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      SurfaceSync.syncWidgetsToLinks(this);
    }
    if (this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)?.hasLink()) {
      output[SOCKET_NAME_DASHBOARD_CONTENT] = {
        renderFunction: (props) => this.getDashboardWrapper(props),
        nodeId: this.id,
      };
    }
    this.callRender(input);
    // runtime override sockets (visible/layout) may have changed; let the
    // dashboard re-apply them in view mode (the canvas preview re-renders via
    // callRender above)
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      InterfaceController.notifyListeners(ListenEvent.SurfaceRuntimeChanged, {
        nodeId: this.id,
      });
    }
  }
}
