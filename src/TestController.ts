import * as PIXI from 'pixi.js';
import { hri } from 'human-readable-ids';
import PPGraph from './classes/GraphClass';
import PPLink from './classes/LinkClass';
import PPNode from './classes/NodeClass';
import InterfaceController from './InterfaceController';
import Socket from './classes/SocketClass';
import { getAllNodeTypes } from './nodes/allNodes';
import { NODE_MARGIN, STATUS_SEVERITY } from './utils/constants';
import PPStorage from './PPStorage';
import {
  ACTIONS,
  ActionHandler,
  AddNodeActionArgs,
  PNPAction,
} from './classes/Action';
import type { ActionSource } from './classes/Action';
import NodeHeaderClass from './classes/NodeHeaderClass';
import {
  COMMENT_BADGE_NAME,
  STATUS_BADGE_NAME,
} from './classes/NodeStatusBadges';
import FlowLogic from './classes/FlowLogic';
import { BackendGateway } from './services/BackendGateway';
import { DASHBOARD_DEFAULT, LeftDrawerView } from './utils/constants';
import { zoomToFitNodes } from './pixi/utils-pixi';
import { VISIBILITY_ACTION } from './utils/constants_shared';
import {
  MCPToolResult,
  TailrmadeMCPServer,
} from './services/TailrmadeMCPServer';
import { AIBackend } from './services/AIBackend';

export default class TestController {
  identify(): string {
    return 'its testcontroller';
  }

  // lets cypress drive the browser-local MCP server the AI uses, so the tool
  // behaviour can be verified without going through the LLM
  callAITool(name: string, input: Record<string, unknown>) {
    return TailrmadeMCPServer.getInstance().callTool(name, input);
  }

  getAIToolDefinitions() {
    return TailrmadeMCPServer.getInstance().listTools();
  }

  addNode(nodeType: string, id = hri.random(), x = 0, y = 0): Promise<PPNode> {
    const defaultLocation = PPGraph.currentGraph.getDefaultNewNodeLocation();
    return PPGraph.currentGraph.addNewNode(nodeType, {
      overrideId: id,
      nodePosX: defaultLocation.x + x,
      nodePosY: defaultLocation.y + y,
    });
  }

  addNodeAction(
    nodeType: string,
    id = hri.random(),
    x = 0,
    y = 0,
    source: ActionSource = 'human',
  ): Promise<boolean> {
    const defaultLocation = PPGraph.currentGraph.getDefaultNewNodeLocation();
    const args = new AddNodeActionArgs(
      nodeType,
      new PIXI.Point(defaultLocation.x + x, defaultLocation.y + y),
      id,
    );
    return PNPAction(ACTIONS.ADD_NODE, args, args, undefined, source);
  }

  getNodeByID(id: string): PPNode {
    return Object.values(PPGraph.currentGraph.nodes).find(
      (node) => node.id == id,
    )!;
  }

  getNodeCenter(node: PPNode): [number, number] {
    const pos = node.screenPointBackgroundRectCenter();
    return [pos.x, pos.y];
  }

  getNodeCenterById(nodeId: string): [number, number] {
    const toReturn = this.getNodeByID(nodeId);
    return this.getNodeCenter(toReturn);
  }

  // cancels any in-flight viewport animation ('animate' plugin) and momentum
  // ('decelerate') so a subsequent programmatic fit/move isn't overridden a
  // frame later when the animation completes and snaps to its own target.
  stopViewportAnimations() {
    const viewport = PPGraph.currentGraph.viewport;
    viewport.plugins.remove('animate');
    const decelerate = viewport.plugins.get('decelerate') as any;
    if (decelerate) {
      decelerate.x = 0;
      decelerate.y = 0;
    }
  }

  moveNodeByID(id: string, x: number, y: number): void {
    const node = this.getNodeByID(id);
    node.setPosition(x, y, true);
  }

  getChildByName(id: string, name: string): PIXI.Container {
    const node = this.getNodeByID(id);
    return findChildByName(node, name)!;
  }

  getCoordinatesOfChildren(container: PIXI.Container): number[][] {
    const coordinates = container.children.map((child): number[] => [
      Math.round(child.x),
      Math.round(child.y),
    ]);
    return coordinates;
  }

  async connectNodesByID(
    node1ID: string,
    node2ID: string,
    node1Socket: string | undefined = undefined,
    node2Socket: string | undefined = undefined,
  ) {
    const n1 = this.getNodeByID(node1ID);
    const n2 = this.getNodeByID(node2ID);
    const originSocket =
      node1Socket == undefined
        ? n1.outputSocketArray[0]
        : n1.getOutputSocketByName(node1Socket);
    const targetSocket =
      node2Socket === undefined
        ? n2.getSocketForNewConnection(originSocket)
        : // like the real connect path (resolveInputSocketForLink), allow
          // trigger sockets as targets, not just regular inputs
          n2.getInputOrTriggerSocketByName(node2Socket, false);
    if (targetSocket !== undefined) {
      await PPGraph.currentGraph.actions_Connect(
        originSocket.name,
        node1ID,
        targetSocket.name,
        node2ID,
      )[0]();
    }
  }

  async disconnectLink(
    endNodeID: string,
    inputSocketName: string,
  ): Promise<void> {
    await PPGraph.currentGraph.linkDisconnect(endNodeID, inputSocketName, true);
  }

  getSocketLinks(nodeID: string, socketName: string): PPLink[] {
    return this.getNodeByID(nodeID).getSocketByName(socketName).links;
  }

  getInputSocketType(nodeID: string, socketName: string) {
    return this.getNodeByID(nodeID)
      .getInputSocketByName(socketName)
      .dataType.getName();
  }
  getOutputSocketType(nodeID: string, socketName: string) {
    return this.getNodeByID(nodeID)
      .getOutputSocketByName(socketName)
      .dataType.getName();
  }

  getInputSocketLinkNamesForID(nodeID: string, socketName: string) {
    const n = this.getNodeByID(nodeID);
    return n
      .getSocketByName(socketName)
      .links.map((link: PPLink) => link.getSource().name);
  }

  setNodeInputValue(id: string, inputSocketName: string, value: any): void {
    this.getNodeByID(id).getInputSocketByName(inputSocketName).data = value;
  }
  getNodeInputValue(id: string, inputSocketName: string): any {
    return this.getNodeByID(id).getInputSocketByName(inputSocketName).data;
  }
  getNodeOutputValue(id: string, outputSocketName: string): any {
    return this.getNodeByID(id).getOutputData(outputSocketName);
  }
  getOutputSockets(id: string) {
    return this.getNodeByID(id).outputSocketArray;
  }
  getInputSockets(id: string) {
    return this.getNodeByID(id).inputSocketArray;
  }
  getVisibleInputSockets(id: string) {
    return this.getInputSockets(id).filter((socket) => socket.visible);
  }
  getInputSocketByIDandName(id: string, socketName: string): Socket {
    return this.getNodeByID(id).getInputSocketByName(socketName);
  }
  getTriggerSocketByIDandName(id: string, socketName: string): Socket {
    return this.getNodeByID(id).getNodeTriggerSocketByName(socketName);
  }
  getOutputSocketByIDandName(id: string, socketName: string): Socket {
    return this.getNodeByID(id).getOutputSocketByName(socketName);
  }

  async executeNodeByID(id: string) {
    await this.getNodeByID(id).executeOptimizedChain();
  }

  getSocketByNodeIDAndSocketName(nodeID: string, socketName: string) {
    const node = this.getNodeByID(nodeID);
    return node.getAllSockets().find((socket) => socket.name == socketName);
  }

  getSocketCenterByNodeIDAndSocketName(nodeID: string, socketName: string) {
    const socket = this.getSocketByNodeIDAndSocketName(nodeID, socketName)!;
    const pos = socket.screenPointSocketCenter();
    return [pos.x, pos.y];
  }

  getHeaderButtonCenter(
    nodeID: string,
    buttonName: string,
  ): [number, number] | null {
    const node = this.getNodeByID(nodeID);
    if (!node) return null;

    // Get the header container which is the first child of the node
    const header = findChildByName(
      node,
      'headerGraphics',
    ) as NodeHeaderClass | null;
    if (!header) return null;

    const pos = header.screenPointButtonCenter(buttonName);
    if (!pos) return null;
    return [pos.x, pos.y];
  }

  getStatusBadgeCenter(
    nodeID: string,
    kind: 'status' | 'comment',
  ): [number, number] | null {
    const node = this.getNodeByID(nodeID);
    if (!node) return null;

    const badge = findChildByName(
      node,
      kind === 'status' ? STATUS_BADGE_NAME : COMMENT_BADGE_NAME,
    );
    if (!badge) return null;

    const pos = badge.getGlobalPosition();
    return [pos.x, pos.y];
  }

  // shows/hides a node's header buttons the same way hovering does. Hovering
  // is not reliable for nodes whose DOM overlay is interactive (e.g. a table
  // grid swallows the pointer events before the canvas sees them), so tests
  // reveal the header programmatically and then click the real buttons
  setHeaderVisible(nodeID: string, visible = true) {
    this.getNodeByID(nodeID).nodeSelectionHeader.redrawAnythingChanging(
      visible,
    );
  }

  // an invisible header button never receives pointer events, so tests must
  // wait for this before clicking (buttons only show while hovering the node)
  isHeaderButtonVisible(nodeID: string, buttonName: string): boolean {
    const node = this.getNodeByID(nodeID);
    if (!node) return false;

    const header = findChildByName(
      node,
      'headerGraphics',
    ) as NodeHeaderClass | null;
    return header?.isButtonVisible(buttonName) ?? false;
  }

  getSocketLabelCenterByNodeIDAndSocketName(
    nodeID: string,
    socketName: string,
  ) {
    const socket = this.getSocketByNodeIDAndSocketName(nodeID, socketName)!;
    const pos = socket.screenPointSocketLabelCenter();
    return [pos.x, pos.y];
  }

  getNodes(): PPNode[] {
    return Object.values(PPGraph.currentGraph.nodes);
  }

  getAllDefinedNodeTypes(): string[] {
    return Object.keys(getAllNodeTypes());
  }

  getGraph(): PPGraph {
    return PPGraph.currentGraph;
  }

  async deleteAllGraphs(): Promise<void> {
    await PPStorage.getInstance().deleteAllGraphs();
  }

  async removeNode(nodeID: string): Promise<void> {
    await PPGraph.currentGraph.removeNode(PPGraph.currentGraph.nodes[nodeID]);
  }

  // undoable node deletion (goes through the action handler)
  async removeNodeAction(nodeID: string): Promise<void> {
    this.selectNodesById([nodeID]);
    await PPGraph.currentGraph.perform_action_DeleteSelectedNodes();
  }

  async waitForPendingExecution(): Promise<void> {
    await FlowLogic.waitForPendingExecution();
  }

  getSelectedNodes(): PPNode[] {
    return this.getGraph().selection.selectedNodes;
  }

  selectNodesById(nodeIDs: string[]): PPNode[] {
    const nodes = nodeIDs.map((id) => this.getNodeByID(id));
    this.getGraph().selection.selectNodes(nodes, false);
    return nodes;
  }

  doesNodeHaveError(nodeID: string): boolean {
    const node = this.getNodeByID(nodeID);
    return (
      node.status.node.getSeverity() >= STATUS_SEVERITY.ERROR ||
      node.status.socket.getSeverity() >= STATUS_SEVERITY.ERROR
    );
  }

  getNodeCustomStatuses(nodeID: string) {
    return this.getNodeByID(nodeID).status.custom;
  }

  // generic passthrough so tests can exercise any MCP tool the same way the AI does
  callMCPTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    return TailrmadeMCPServer.getInstance().callTool(name, input);
  }

  beginAIAgentTurn(): void {
    TailrmadeMCPServer.getInstance().beginAgentTurn();
  }

  finishAIAgentTurn(): Promise<void> {
    return TailrmadeMCPServer.getInstance().finishAgentTurn();
  }

  // lets cypress inspect the exact system prompt sent to the AI, e.g. to
  // assert the embedded node catalogue is present
  getAISystemPrompt(): Promise<string> {
    return AIBackend.getInstance().getConversationStartInstructions();
  }

  async undo() {
    await ActionHandler.undo();
  }

  async redo() {
    await ActionHandler.redo();
  }

  clearActionHistory() {
    ActionHandler.clear();
  }

  setShowUnsavedChangesWarning(show: boolean) {
    InterfaceController.showUnsavedChangesWarning = show;
  }

  toggleLeftSideDrawer(
    action: VISIBILITY_ACTION = VISIBILITY_ACTION.TOGGLE,
    content: LeftDrawerView = LeftDrawerView.GRAPHS,
  ) {
    InterfaceController.toggleLeftSideDrawer(action, content);
  }

  toggleDashboard(action: VISIBILITY_ACTION = VISIBILITY_ACTION.TOGGLE) {
    InterfaceController.toggleShowDashboard(action);
  }

  toggleRightSideDrawer(action: VISIBILITY_ACTION = VISIBILITY_ACTION.CLOSE) {
    InterfaceController.toggleRightSideDrawer(action);
  }

  selectDashboardItemByElementId(elementId: string) {
    InterfaceController.selectDashboardItemByElementId(elementId);
  }

  unselectDashboardItems() {
    InterfaceController.unselectDashboardItems();
  }

  getDashboardState() {
    return InterfaceController.getDashboardState();
  }

  resetDashboardState() {
    const currentOverlayState = InterfaceController.getOverlayState();
    InterfaceController.updateOverlayState({
      ...currentOverlayState,
      dashboard: { ...DASHBOARD_DEFAULT },
    });
    InterfaceController.toggleDashboardInEditMode(VISIBILITY_ACTION.CLOSE);
    InterfaceController.unselectDashboardItems();
  }

  // pans/zooms so the nodes are inside the visible canvas area, compensating
  // for open drawers/dashboard which cover parts of the canvas — pointer
  // events on covered areas hit the overlay DOM instead of the canvas.
  // maxZoom keeps a single small node from being blown up beyond the window.
  // Cancels any in-flight viewport animation/momentum first (see
  // stopViewportAnimations): a lingering animation completes a frame later and
  // snaps the viewport to its own target, overriding this fit and pushing the
  // nodes off-screen. This is a programmatic "fit now", so competing
  // animations are always unwanted - hence baked in rather than left to
  // callers to remember.
  zoomToFitNodesById(nodeIds?: string[], maxZoom = 1) {
    this.stopViewportAnimations();
    zoomToFitNodes(nodeIds?.map((id) => this.getNodeByID(id)));
    const viewport = PPGraph.currentGraph.viewport;
    if (viewport.scale.x > maxZoom) {
      viewport.setZoom(maxZoom, true);
      viewport.emit('moved', { viewport, type: 'pinch' });
      viewport.emit('moved-end', { viewport, type: 'pinch' });
    }
  }

  // places the node's center at an exact screen position (direct viewport
  // math, independent of drawer-offset heuristics) so tests can move a node
  // into the part of the canvas that is not covered by overlays
  centerNodeAtScreenPoint(
    nodeId: string,
    screenX: number,
    screenY: number,
    zoom = 1,
  ) {
    const node = this.getNodeByID(nodeId);
    const viewport = PPGraph.currentGraph.viewport;
    const worldCenterX = node.x + NODE_MARGIN + node.nodeWidth / 2;
    const worldCenterY = node.y + node.nodeHeight / 2;
    viewport.setZoom(zoom, false);
    // screen = (world - corner) * zoom  =>  corner = world - screen / zoom
    viewport.moveCorner(
      worldCenterX - screenX / zoom,
      worldCenterY - screenY / zoom,
    );
    PPGraph.currentGraph.selection.drawRectanglesFromSelection();
    viewport.emit('moved', { viewport, type: 'pinch' });
    viewport.emit('moved-end', { viewport, type: 'pinch' });
  }

  resetViewport() {
    const viewport = PPGraph.currentGraph.viewport;
    viewport.moveCenter(window.innerWidth / 2, window.innerHeight / 2);
    viewport.setZoom(1, true);
    PPGraph.currentGraph.selection.drawRectanglesFromSelection();
    viewport.emit('moved', {
      viewport,
      type: 'pinch',
    });
    viewport.emit('moved-end', {
      viewport,
      type: 'pinch',
    });
  }

  getTimesLoadedFromDB() {
    return PPStorage.getInstance().debug_timesLoaded;
  }
  getNodeTimesDrawn(nodeID: string) {
    return this.getNodeByID(nodeID).debug_timesDrawn;
  }
  spamToast(message: string) {
    InterfaceController.spamToast(message);
  }
  hideSnackBar() {
    InterfaceController.hideSnackBar();
  }

  async duplicateSelection() {
    await PPGraph.currentGraph.duplicateSelection();
  }

  async clear() {
    await PPGraph.currentGraph.clear();
    this.resetViewport();
  }

  async loadStringifiedGraph(graph: string) {
    await PPStorage.getInstance().loadGraphFromData(
      PPStorage.getInstance().stringToStoredGraph(graph),
    );
  }

  async deleteAllUserCloudGraphs() {
    await BackendGateway.getInstance().refreshGraphsMetadata();
    const graphs = BackendGateway.getInstance().getGraphsMetadata();
    await Promise.all(
      graphs.objects.map((graph) =>
        BackendGateway.getInstance().deleteGraph(
          graph.objectId,
          graph.location,
        ),
      ),
    );
  }
}

function findChildByName(container, name): PIXI.Container | null {
  for (const child of container.children) {
    if (child.name === name) {
      return child;
    }
    if (child instanceof PIXI.Container && child.children.length > 0) {
      const found = findChildByName(child, name);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

interface HeaderButtonPositions {
  selectUpstream: PIXI.Point;
  selectWhole: PIXI.Point;
  selectDownstream: PIXI.Point;
  edit: PIXI.Point;
  addToDashboard: PIXI.Point;
}

function getHeaderButtonPositionsByNodeID(
  nodeId: string,
): HeaderButtonPositions | undefined {
  const node = PPGraph.currentGraph.getNodeById(nodeId);
  if (!node) return undefined;

  const baseX = node.x + NODE_MARGIN + node.nodeWidth - 96;
  const baseY = node.y - 24;

  const headerButtons = {
    selectUpstream: new PIXI.Point(baseX + 0, baseY),
    selectWhole: new PIXI.Point(baseX + 24, baseY),
    selectDownstream: new PIXI.Point(baseX + 48, baseY),
    edit: new PIXI.Point(baseX + 72, baseY),
    addToDashboard: new PIXI.Point(baseX + 96, baseY),
  };

  // Convert to screen coordinates
  Object.keys(headerButtons).forEach((key) => {
    const screenPos = PPGraph.currentGraph.viewport.toScreen(
      headerButtons[key].x,
      headerButtons[key].y,
    );
    headerButtons[key] = screenPos;
  });

  return headerButtons;
}
