import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { hri } from 'human-readable-ids';
import { v4 as uuid } from 'uuid';

import {
  NODE_SOURCE,
  NODE_WIDTH,
  SOCKET_SNAP_SCREEN_RADIUS,
  SOCKET_TYPE,
} from '../utils/constants';
import { GRAPH_DATA_VERSION } from '../utils/graphMigrations';
import {
  CustomArgs,
  SerializedGraph,
  SerializedLink,
  SerializedNode,
  SerializedSelection,
  INodeSearch,
  DrawerSide,
  TNodeSource,
  AccessType,
  isSurfaceNode,
} from '../utils/interfaces';
import {
  calculateDistance,
  clearDocumentSelection,
  perform_action_connectNodeToSocket,
  isPhone,
} from '../utils/utils';
import { getLoadSeedNodes } from '../utils/updateBehaviour';
import { getNodesBounds } from '../pixi/utils-pixi';
import PPNode from './NodeClass';
import PPSocket from './SocketClass';
import PPLink from './LinkClass';
import PPSelection, { Interaction } from './selection/SelectionClass';
import { getAllNodeTypes } from '../nodes/allNodes';
import type { Macro } from '../nodes/macro/macro';
import FlowLogic from './FlowLogic';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { DynamicImport } from '../utils/dynamicImport';
import {
  MAX_LATEST_NODES_IN_SEARCH,
  ONCLICK_DOUBLECLICK,
} from '../utils/constants';
import HybridNode2 from './HybridNode2';
import {
  ActionHandler,
  ACTIONS,
  AddNodeActionArgs,
  BakedAction,
  PNPAction,
  SerializableAction,
  SerializableActionHandler,
} from './Action';
import { StoredGraph } from '../utils/indexedDB';
import PPStorage, { DEFAULT_ACCESS, DEFAULT_LOCATION } from '../PPStorage';

// withtout this the compilation order breaks
const DUMMY_IMPORT = getNodesBounds;
const EMPTY_DEFAULT_MACRO_NAME = 'EmptyDefaultMacro';

export default class PPGraph {
  static currentGraph: PPGraph;
  app: PIXI.Application;
  viewport: Viewport;

  _showDebugInfo: boolean;
  _showExecutionVisualisation: boolean;
  // the UI surface node shown on app load (set in the User Interface tab)
  defaultUISurfaceNodeId: string | undefined;
  selectedSocket: undefined | PPSocket;
  clickPoint: undefined | PIXI.Point;
  lastSelectedSocketWasOutput = false;
  overrideNodeCursorPosition: undefined | PIXI.Point = undefined;
  overInputRef: undefined | PPSocket;
  // nearest compatible socket within snap range while dragging a connection
  snapTargetSocket: undefined | PPSocket;
  pointerEvent: PIXI.FederatedPointerEvent | undefined = undefined; // lets try to get rid of this undefined
  dragSourcePoint: PIXI.Point | undefined;
  dragLastPoint: PIXI.Point;

  // For separate logic update loop
  private logicAnimationFrameId: number | null = null;
  private isLogicLoopRunning: boolean = false;

  backgroundTempContainer: PIXI.Container;
  backgroundCanvas: PIXI.Container;
  connectionContainer: PIXI.Container;
  nodeContainer: PIXI.Container;
  nodes: { [key: string]: PPNode } = {};
  foregroundCanvas: PIXI.Container;

  overlayContainer: PIXI.Container;
  emptyCanvasText: PIXI.HTMLText;

  id: string;
  name: string;
  location: string;
  owner: string;
  date: Date;
  isRemote: boolean;
  access: AccessType = DEFAULT_ACCESS;

  tempConnection: PIXI.Graphics;
  selection: PPSelection;

  graphConfiguredAndReady: boolean = false;

  interactionEnabledHybridNode: HybridNode2 | undefined = undefined; // single hybrid node currently in interaction mode

  // lives forever
  constructor(app: PIXI.Application, viewport: Viewport) {
    this.app = app;
    globalThis.__PPGRAPH__ = this;
    this.id = hri.random();
    this.name = this.id;
    this.location = DEFAULT_LOCATION;
    this.access = DEFAULT_ACCESS;
    this.viewport = viewport;
    console.log('Graph created');

    this._showDebugInfo = false;
    this._showExecutionVisualisation = true;
    this.selectedSocket = undefined;
    this.clickPoint = undefined;

    this.backgroundTempContainer = new PIXI.Container();
    this.backgroundTempContainer.name = 'backgroundTempContainer';
    this.backgroundCanvas = new PIXI.Container();
    this.backgroundCanvas.name = 'backgroundCanvas';
    this.connectionContainer = new PIXI.Container();
    this.connectionContainer.name = 'connectionContainer';
    this.nodeContainer = new PIXI.Container();
    this.nodeContainer.name = 'nodeContainer';
    this.foregroundCanvas = new PIXI.Container();
    this.foregroundCanvas.name = 'foregroundCanvas';

    // Add container on stage level so it does not move with viewport
    this.overlayContainer = new PIXI.Container();
    this.overlayContainer.name = 'OverlayContainer';
    this.app.stage.addChild(this.overlayContainer);
    this.initEmptyCanvasIndicator();

    this.graphConfiguredAndReady = false;

    this.viewport.addChild(
      this.backgroundCanvas,
      this.backgroundTempContainer,
      this.connectionContainer,
      this.nodeContainer,
      this.foregroundCanvas,
    );

    this.tempConnection = new PIXI.Graphics();
    this.tempConnection.name = 'tempConnection';
    this.backgroundTempContainer.addChild(this.tempConnection);

    this.selection = new PPSelection(this.viewport);
    void this.selection.init();
    this.viewport.addChild(this.selection);

    document.body.style.cursor = 'default';

    // add event listeners
    // listen to window resize event and resize app
    const resize = () => {
      viewport.resize(window.innerWidth, window.innerHeight);
      app.renderer.resize(window.innerWidth, window.innerHeight);
      this.updateEmptyCanvasVisibility();
    };
    resize();
    window.addEventListener('resize', resize);

    // register pointer events
    this.viewport.addEventListener(
      'pointerdown',
      this.onPointerDown.bind(this),
    );

    this.viewport.addEventListener(
      'rightclick',
      this.onPointerRightClicked.bind(this),
    );
    this.viewport.addEventListener('click', this.onPointerClick.bind(this));
    this.viewport.addEventListener('pointermove', (event) =>
      this.onViewportMove(event),
    );

    // NEVER CLEARED !
    InterfaceController.addListener(
      ListenEvent.GlobalPointerMove,
      this.onPointerMove.bind(this),
    );

    // when authentication changes some nodes need executing
    InterfaceController.addListener(ListenEvent.UserIsLoggedIn, async () => {
      await this.notifyUserDataChanged(true);
    });

    // define callbacks
    PPGraph.currentGraph = this;

    // Start the logic update loop
    this.startLogicLoop();
  }

  public setBaselineMetadata(
    metadata: Partial<{
      id: string;
      name: string;
      location: string;
      access: AccessType;
      owner: string;
      date: Date;
      isRemote: boolean;
    }> = {},
  ): void {
    // Set with defaults, allowing overrides
    this.id = metadata.id ?? this.id;
    this.name = metadata.name ?? this.name;
    this.location = metadata.location ?? DEFAULT_LOCATION;
    this.access = metadata.access ?? DEFAULT_ACCESS;
    this.owner = metadata.owner ?? 'unknown';
    this.date = metadata.date ?? new Date();
    this.isRemote = metadata.isRemote ?? false;
  }

  async notifyUserDataChanged(alsoOnLoad: boolean): Promise<void> {
    const nodesToExecute = Object.values(this.nodes).filter(
      (node) =>
        node.isDependentOnUserData() &&
        (node.updateBehaviour.update ||
          (node.updateBehaviour.load && alsoOnLoad)),
    );
    console.log('executing user data change nodes', nodesToExecute);
    await FlowLogic.executeOptimizedChainBatch(nodesToExecute);
  }

  // SETUP
  onPointerRightClicked(event: PIXI.FederatedPointerEvent): void {
    console.log('GraphClass - onPointerRightClicked');
    event.stopPropagation();
    const target = event.target;
    if (
      // only trigger right click if viewport was not dragged
      this.dragSourcePoint === undefined ||
      (this.dragSourcePoint.x === this.viewport.x &&
        this.dragSourcePoint.y === this.viewport.y)
    ) {
      InterfaceController.onRightClick(event, target);
    }
  }

  onPointerClick(event: PIXI.FederatedPointerEvent): void {
    console.log('onPointerClick', event.detail);

    // check if double clicked
    if (event.detail === ONCLICK_DOUBLECLICK) {
      event.stopPropagation();
      const target = event.target;
      if (target instanceof Viewport) {
        this.overrideNodeCursorPosition = this.viewport.toWorld(event.global);
        InterfaceController.openNodeSearch(new PIXI.Point(event.x, event.y));
      }
    }
    this.selection.setInteraction(Interaction.Passive);
  }

  async onPointerDown(event: PIXI.FederatedPointerEvent): Promise<void> {
    clearDocumentSelection();
    if (this.interactionEnabledHybridNode) {
      await this.interactionEnabledHybridNode.disableInteraction();
    }
    console.log('Graph: onPointerDown');
    this.viewport.plugins.resume('mouse-edges');
    this.pointerEvent = event;
    InterfaceController.notifyListeners(ListenEvent.ToggleTooltipInspector, {
      event,
      open: false,
    });

    if (event.button === 0 && !isPhone()) {
      if (!this.overInputRef) {
        this.selection.drawSelectionStart(event, event.shiftKey);
      }

      // pause viewport drag
      //this.viewport.plugins.pause('drag');
    } else if (event.button === 2) {
      document.body.style.cursor = 'grabbing';
      this.dragSourcePoint = new PIXI.Point(this.viewport.x, this.viewport.y);
      InterfaceController.notifyListeners(ListenEvent.ViewportDragging, true);
    }
  }

  onPointerMove(event: PIXI.FederatedPointerEvent): void {
    this.pointerEvent = event;
  }

  onPointerUpAndUpOutside(event: PIXI.FederatedPointerEvent): void {
    console.log('Graph: onPointerUpAndUpOutside');
    this.viewport.plugins.pause('mouse-edges');
    document.body.style.cursor = 'default';

    if (!this.overInputRef && this.selectedSocket) {
      if (this.snapTargetSocket) {
        // released within snap range of a compatible socket - connect to it
        void this.socketMouseUp(this.snapTargetSocket, event);
      } else if (!this.overrideNodeCursorPosition) {
        this.overrideNodeCursorPosition = this.viewport.toWorld(event.global);
        if (this.lastSelectedSocketWasOutput || this.selectedSocket.isInput()) {
          InterfaceController.openNodeSearch(new PIXI.Point(event.x, event.y));
        } else {
          this.stopConnecting();
        }
      }
    }

    if (
      InterfaceController.isClickOutsideDashboard(event) &&
      !InterfaceController.isDashboardInEditMode
    ) {
      InterfaceController.unselectDashboardItems();
    }

    this.selection.drawSelectionFinish(event);

    document.body.style.cursor = 'default';
    this.viewport.plugins.resume('drag');
    InterfaceController.notifyListeners(ListenEvent.ViewportDragging, false);
  }

  getSocketCenter(object: PPSocket): PIXI.Point {
    // Skip if socket is already destroyed
    if (!object || object.destroyed) {
      return new PIXI.Point(0, 0);
    }

    try {
      const bounds = object._SocketRef.getBounds();

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // Transform to world coordinates
      return this.viewport.toWorld(new PIXI.Point(centerX, centerY));
    } catch (e) {
      console.error('Failed to get bounds of socket:', object?.name);
      return new PIXI.Point(0, 0);
    }
  }

  onViewportMove(event: PIXI.FederatedPointerEvent): void {
    this.tempConnection.clear();
    if (!this.selectedSocket) {
      return;
    }

    // Check for disconnection (only for input sockets with existing links)
    if (
      this.selectedSocket.isInput() &&
      this.clickPoint &&
      this.selectedSocket.hasLink()
    ) {
      const threshold = calculateDistance(this.clickPoint, event.global);
      // only disconnect if the mouse movement was intentional/more than threshold
      if (threshold > 5) {
        const sourceSocket = this.selectedSocket.links[0].getSource();
        const toDisconnect = this.selectedSocket.links[0];
        this.selectedSocket = sourceSocket;

        void this.perform_action_Disconnect(toDisconnect);

        this.clickPoint = undefined;
        return;
      }
    }

    // Magnetic snapping: find the nearest compatible socket in screen space
    this.updateSnapTarget(event);

    // Draw the connection line
    this.drawConnectionLine(event);
  }

  // returns true if the candidate socket could be connected to the currently
  // dragged socket - mirrors the rules in socketMouseUp
  private canConnectWhileDragging(candidate: PPSocket): boolean {
    const source = this.selectedSocket;
    if (!source || candidate === source) {
      return false;
    }
    // avoid the wire constantly snapping to neighboring sockets on the
    // node we are dragging from
    if (candidate.getNode() === source.getNode()) {
      return false;
    }
    return (
      (source.isInput() && candidate.isOutput()) ||
      (source.isOutput() && candidate.isInput()) ||
      candidate.socketType === SOCKET_TYPE.GHOST
    );
  }

  private findSnapTarget(event: PIXI.FederatedPointerEvent): PPSocket | undefined {
    const pointer = event.global;
    const scale = this.viewportScaleX;
    const snapRadius = SOCKET_SNAP_SCREEN_RADIUS;
    let best: PPSocket | undefined = undefined;
    let bestDistSquared = snapRadius * snapRadius;

    Object.values(this.nodes).forEach((node) => {
      // cheap prune: skip nodes whose (screen space) bounds incl. snap radius
      // cannot contain the pointer
      const nodePos = node.getGlobalPosition();
      if (
        pointer.x < nodePos.x - snapRadius ||
        pointer.y < nodePos.y - snapRadius ||
        pointer.x > nodePos.x + node.nodeWidth * scale + snapRadius ||
        pointer.y > nodePos.y + node.nodeHeight * scale + snapRadius
      ) {
        return;
      }
      node.getAllSockets().forEach((socket) => {
        if (!socket.visible || !this.canConnectWhileDragging(socket)) {
          return;
        }
        const center = socket.screenPointSocketCenter();
        const dx = pointer.x - center.x;
        const dy = pointer.y - center.y;
        const distSquared = dx * dx + dy * dy;
        if (distSquared < bestDistSquared) {
          bestDistSquared = distSquared;
          best = socket;
        }
      });
    });
    return best;
  }

  private updateSnapTarget(event: PIXI.FederatedPointerEvent): void {
    // a directly hovered socket always wins over snapping and while the node
    // search is open the wire is pinned to overrideNodeCursorPosition
    const snappingDisabled =
      this.overrideNodeCursorPosition !== undefined ||
      (this.overInputRef && this.overInputRef !== this.selectedSocket);
    const newTarget = snappingDisabled ? undefined : this.findSnapTarget(event);
    if (newTarget !== this.snapTargetSocket) {
      this.snapTargetSocket?.hideSnapHighlight();
      newTarget?.showSnapHighlight();
      this.snapTargetSocket = newTarget;
    }
  }

  private clearSnapTarget(): void {
    this.snapTargetSocket?.hideSnapHighlight();
    this.snapTargetSocket = undefined;
  }

  // Separate drawing logic to reduce complexity in the onViewportMove method
  private drawConnectionLine(event: PIXI.FederatedPointerEvent): void {
    let socketCenter = this.getSocketCenter(this.selectedSocket);

    // Get target point based on context
    let targetPoint: PIXI.Point;
    if (this.overInputRef && this.overInputRef !== this.selectedSocket) {
      targetPoint = this.getSocketCenter(this.overInputRef);
    } else if (this.snapTargetSocket) {
      targetPoint = this.getSocketCenter(this.snapTargetSocket);
    } else if (this.overrideNodeCursorPosition) {
      targetPoint = this.overrideNodeCursorPosition;
    } else {
      targetPoint = this.viewport.toWorld(event.global);
    }

    // swap points if grabbed an input socket
    if (this.selectedSocket.isInput()) {
      const temp = targetPoint;
      targetPoint = socketCenter;
      socketCenter = temp;
    }

    // Draw curve with fewer calculations
    const sourcePointX = socketCenter.x;
    const sourcePointY = socketCenter.y;
    const toX = targetPoint.x - sourcePointX;
    const toY = targetPoint.y - sourcePointY;

    // Simpler control point calculation
    const halfDistX = Math.abs(toX) / 2;

    this.tempConnection.bezierCurveTo(
      halfDistX,
      0, // first control point
      toX - halfDistX,
      toY, // second control point
      toX,
      toY, // destination point
    );

    const selectedDataType = this.selectedSocket.dataType;
    this.tempConnection.stroke({
      width: 2,
      color: selectedDataType.getColor().multiply(0.9).hexNumber(),
      alpha: selectedDataType.getConnectionAlpha(),
    });

    // Position the curve at the source point
    this.tempConnection.x = sourcePointX;
    this.tempConnection.y = sourcePointY;
  }

  socketHoverOver(socket: PPSocket): void {
    this.overInputRef = socket;
    document.body.style.cursor = 'grab';
  }

  socketHoverOut(socket: PPSocket): void {
    if (socket == this.overInputRef) this.overInputRef = undefined;
    if (this.selectedSocket == undefined) {
      document.body.style.cursor = 'default';
    }
  }

  async socketPointerDown(
    socket: PPSocket,
    event: PIXI.FederatedPointerEvent,
  ): Promise<void> {
    // we allow re-connection of outputs if ctrl is pressed
    if (event.ctrlKey && socket.isOutput() && socket.hasLink()) {
      const target = socket.links[0].getTarget();
      // detach and allow to connect to new
      await this.linkDisconnect(target.getNode().id, target.name, true);
      this.lastSelectedSocketWasOutput = false;
      this.selectedSocket = target;
      document.body.style.cursor = 'grabbing';
    } else {
      this.selection.selectNodes([socket.getNode()]);
      this.lastSelectedSocketWasOutput = socket.isOutput();
      this.selectedSocket = socket;
      if (socket.isInput() && socket.hasLink()) {
        // store clickPoint for threshold check
        this.clickPoint = new PIXI.Point(event.global.x, event.global.y);
        this.onViewportMove(event);
      }
      document.body.style.cursor = 'grabbing';
    }
  }

  async socketMouseUp(
    socket: PPSocket,
    event: PIXI.FederatedPointerEvent,
  ): Promise<void> {
    const source = this.selectedSocket;
    document.body.style.cursor = 'default';
    let connected = false;
    if (source && socket !== this.selectedSocket) {
      if (source.isInput() && socket.isOutput()) {
        await this.perform_action_Connect(socket, source);
        connected = true;
      } else if (source.isOutput() && socket.isInput()) {
        connected = true;
        await this.perform_action_Connect(source, socket);
      } else if (socket.socketType === SOCKET_TYPE.GHOST) {
        connected = true;
        await perform_action_connectNodeToSocket(source, socket.getNode());
      }
    }
    this.stopConnecting();
    if (source && socket !== this.selectedSocket && !connected) {
      InterfaceController.notifyListeners(ListenEvent.ToggleTooltipInspector, {
        event,
      });
    }
  }

  // GETTERS & SETTERS

  set showDebugInfo(value: boolean) {
    const changed = this._showDebugInfo != value;
    this._showDebugInfo = value;
    if (changed) {
      Object.values(this.nodes).forEach((node) => node.drawNodeShape());
    }
  }

  get viewportScaleX(): number {
    return this.viewport.scale.x;
  }

  get showExecutionVisualisation(): boolean {
    return this._showExecutionVisualisation;
  }

  set showExecutionVisualisation(value: boolean) {
    this._showExecutionVisualisation = value;
  }

  // METHODS
  clearTempConnection(): void {
    this.tempConnection.clear();
    this.dragSourcePoint = undefined;
  }

  public getNodeById(id: string): PPNode {
    return this.nodes[id];
  }

  public getDefaultNewNodeLocation(): PIXI.Point {
    return new PIXI.Point(
      this.viewport.center.x - NODE_WIDTH / 2,
      this.viewport.center.y,
    );
  }

  createNode<T extends PPNode = PPNode>(
    type: string,
    customArgs?: CustomArgs,
  ): T {
    // console.log(this._registeredNodeTypes);
    const newArgs: any = {};
    const normalizedType = type.toLowerCase();
    const placeholderNode = 'placeholder';
    let nodeConstructor;
    let name;

    if (normalizedType === placeholderNode) {
      // placeholder nodes use the name field to indicate which node they are a placeholder for
      // check if the replaced node exists now
      const placeholderLookupName = customArgs?.name ?? type;
      name = placeholderLookupName.toLowerCase();
      nodeConstructor = getAllNodeTypes()[name]?.constructor;
      if (customArgs?.name !== undefined && nodeConstructor) {
        InterfaceController.showSnackBar(
          `A replacement for the placeholder node ${customArgs?.name} was found. It will be replaced with ${name}.`,
          {
            variant: 'success',
          },
        );
      } else {
        InterfaceController.showSnackBar(
          `No replacement for the placeholder node ${customArgs?.name} was found.`,
        );
      }
    } else {
      name = normalizedType;
      nodeConstructor = getAllNodeTypes()[normalizedType]?.constructor;
    }

    if (!nodeConstructor) {
      // if there is no node of this type, create a placeholder node instead
      // and "save" the original node type in the placeholders name
      const errorMessage = `Node of type ${type}(${customArgs?.name}) is missing. A placeholder node will be created instead`;
      console.warn(errorMessage);
      InterfaceController.showSnackBar(errorMessage, {
        variant: 'warning',
      });
      name = type;
      nodeConstructor = getAllNodeTypes()[placeholderNode]?.constructor;
      newArgs.name = type;
    }

    const defaultLocation = this.getDefaultNewNodeLocation();
    const node = new nodeConstructor(name, {
      ...customArgs,
      ...newArgs,
      nodePosX: customArgs?.nodePosX ?? defaultLocation.x,
      nodePosY: customArgs?.nodePosY ?? defaultLocation.y,
    }) as T;

    return node;
  }

  async addNode<T extends PPNode = PPNode>(
    node: T,
    source: TNodeSource,
  ): Promise<T> {
    // check for possible extra imports, make them accessible to the node (not the absolutely cleanest way to do this but OK I think)
    await Promise.all(
      node.getDynamicImports().map(async (currImport) => {
        await DynamicImport.dynamicImport(currImport);
      }),
    );

    // add the node to the canvas
    this.nodes[node.id] = node;
    this.nodeContainer.addChild(node);

    await node.onNodeAdded(source);

    if (isSurfaceNode(node)) {
      InterfaceController.notifyListeners(ListenEvent.SurfaceListChanged, {
        nodeId: node.id,
        action: 'added',
      });
    }

    this.updateEmptyCanvasVisibility();

    return node;
  }

  // does not add any links, youll have do do that yourself
  async addSerializedNode(
    serialized: SerializedNode,
    customArgs: CustomArgs = {},
    newNodeType?: string,
  ): Promise<PPNode> {
    const node = this.createNode(
      (newNodeType ?? serialized.type).toLowerCase(),
      customArgs,
    );

    await node.configure(serialized, newNodeType === undefined);
    await this.addNode(node, NODE_SOURCE.SERIALIZED);
    return node;
  }

  addSerializedLink(link: SerializedLink): void {
    const outputRef = this.getOutputSocket(
      link.sourceNodeId,
      link.sourceSocketName,
    );
    const inputRef = this.getInputSocket(
      link.targetNodeId,
      link.targetSocketName,
    );
    if (outputRef && inputRef) {
      this.connect(outputRef, inputRef, false);
    } else {
      this.notifyLinkCreationFailure(link, outputRef, inputRef);
    }
  }

  private notifyLinkCreationFailure(
    link: Pick<
      SerializedLink,
      'sourceNodeId' | 'sourceSocketName' | 'targetNodeId' | 'targetSocketName'
    >,
    sourceSocket?: PPSocket,
    targetSocket?: PPSocket,
  ): void {
    console.warn(
      `Link could not be created between ${link.sourceNodeId}/${
        link.sourceSocketName
      }${sourceSocket === undefined ? '-MISSING' : ''} and ${
        link.targetNodeId
      }/${link.targetSocketName}${targetSocket === undefined ? '-MISSING' : ''}`,
    );
    InterfaceController.showSnackBar(
      'Some links could not be created. Check console for more info',
      {
        variant: 'warning',
        preventDuplicate: true,
      },
    );
  }

  async addNewNode(
    type: string,
    customArgs: CustomArgs = {},
    source: TNodeSource = NODE_SOURCE.NEW,
  ): Promise<PPNode> {
    const node = this.createNode(type.toLowerCase(), customArgs);
    await this.addNode(node, source);
    return node;
  }

  // TODO SERIALIZED ACTION
  async perform_action_replaceNodeFromSerializedData(
    oldSerializedNode: SerializedNode,
    newSerializedNode: SerializedNode,
  ) {
    const referenceID = hri.random();
    const action = async () => {
      await PPGraph.currentGraph.replaceNode(
        oldSerializedNode,
        oldSerializedNode.id,
        referenceID,
        newSerializedNode.type,
        newSerializedNode,
      );
    };
    const undoAction = async () => {
      await PPGraph.currentGraph.replaceNode(
        newSerializedNode,
        referenceID,
        oldSerializedNode.id,
        oldSerializedNode.type,
        oldSerializedNode,
      );
    };
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Replace node'),
      ),
    );
  }

  replaceNode = async (
    oldSerializedNode: SerializedNode,
    oldId: string,
    newId: string,
    newType?: string,
    newSerializedNode?: SerializedNode,
  ): Promise<PPNode> => {
    const newNode = await this.addSerializedNode(
      newSerializedNode ?? oldSerializedNode,
      {
        overrideId: newId,
      },
      newType,
    );
    if (newType && newSerializedNode === undefined) {
      newNode.setNodeName(newType);
    }
    this.reconnectLinksToNewNode(this.nodes[oldId], newNode);
    await newNode.executeOptimizedChain();
    this.selection.selectNodes([newNode], false);
    this.selection.drawRectanglesFromSelection();
    await this.removeNode(this.nodes[oldId]);

    return newNode;
  };

  async linkConnect(
    sourceNodeID: string,
    outputSocketName: string,
    targetNodeID: string,
    inputSocketName: string,
    notify = false,
  ) {
    const sourceSocket =
      this.nodes[sourceNodeID].getOutputSocketByName(outputSocketName);
    const targetNode = this.nodes[targetNodeID];
    const targetSocket = this.resolveInputSocketForLink(
      targetNode,
      inputSocketName,
      sourceSocket,
    );
    await this.connect(sourceSocket, targetSocket, notify);
  }

  // dynamically created sockets are removed on unplug, so the named socket
  // may be gone — let the node recreate it before falling back to the
  // AnyType auto-create
  resolveInputSocketForLink(
    targetNode: PPNode,
    inputSocketName: string,
    sourceSocket: PPSocket,
  ) {
    return (
      targetNode.getInputOrTriggerSocketByName(inputSocketName, false) ??
      targetNode.recreateDynamicSocket(sourceSocket, inputSocketName) ??
      targetNode.getInputOrTriggerSocketByName(inputSocketName)
    );
  }

  linkDisconnect(
    targetNodeID: string,
    inputSocketName: string,
    notify: boolean,
  ) {
    const socket = this.nodes[targetNodeID].getInputOrTriggerSocketByName(
      inputSocketName,
      false,
    );
    if (socket !== undefined) {
      const link = socket.links[0];
      const sourceNodeID = link.getSource().getNode().id;
      const source = link.getSource();
      const target = link.getTarget();
      link.delete();
    }
  }

  // gets connect and unconnect actions for specified hypothetic link, based on node ID and socket name in order to be generic actions not reference-based, this is fired specifically when user is connecting things
  actions_Connect(
    sourceSocketName: string,
    sourceNodeID: string,
    targetSocketName: string,
    targetNodeID: string,
  ): [() => Promise<void>, () => Promise<void>] {
    // depending on the types, we might want to create a conversion node inbetween

    const sendingSocket =
      this.nodes[sourceNodeID].getOutputSocketByName(sourceSocketName);
    const receivingSocket =
      this.nodes[targetNodeID].getInputOrTriggerSocketByName(targetSocketName);
    const compatibility = receivingSocket.dataType.getCompatability(
      sendingSocket.data,
      sendingSocket.dataType,
    );
    const conversionNodeID = uuid();

    // TODO SERIALIZED ACTION
    const action = async () => {
      if (compatibility.conversionNode !== undefined) {
        // spawn a conversion node inbetween, connect both nodes to that one
        const x =
          (this.nodes[sourceNodeID].x +
            this.nodes[sourceNodeID].nodeWidth +
            this.nodes[targetNodeID].x) /
          2;
        const y = (this.nodes[sourceNodeID].y + this.nodes[targetNodeID].y) / 2;
        const conversionNode = await this.addNewNode(
          compatibility.conversionNode,
          {
            overrideId: conversionNodeID,
            nodePosX: x,
            nodePosY: y,
          },
          NODE_SOURCE.NEWCONNECTED,
        );
        await this.linkConnect(
          sourceNodeID,
          sourceSocketName,
          conversionNode.id,
          conversionNode.getSocketForNewConnection(
            this.nodes[sourceNodeID].getOutputSocketByName(sourceSocketName),
          ).name,
          true,
        );
        await this.linkConnect(
          conversionNodeID,
          conversionNode.outputSocketArray[0].name,
          targetNodeID,
          targetSocketName,
          true,
        );
      } else {
        await this.linkConnect(
          sourceNodeID,
          sourceSocketName,
          targetNodeID,
          targetSocketName,
          true,
        );
      }
    };
    const undoAction = async () => {
      if (
        compatibility.conversionNode !== undefined &&
        this.nodes[conversionNodeID] !== undefined
      ) {
        this.removeNode(this.nodes[conversionNodeID]);
      } else {
        this.linkDisconnect(targetNodeID, targetSocketName, true);
      }
    };
    return [action, undoAction];
  }

  // TODO SERIALIZED ACTION
  async perform_action_Disconnect(link: PPLink) {
    const preSourceName = link.getSource().name;
    const preSourceNodeID = link.getSource().getNode().id;
    const preTargetName = link.getTarget().name;
    const preTargetNodeID = link.getTarget().getNode().id;

    const actions = this.actions_Connect(
      preSourceName,
      preSourceNodeID,
      preTargetName,
      preTargetNodeID,
    );
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(actions[1], actions[0], 'Disconnect nodes'),
      ),
    );
  }

  // TODO SERIALIZED ACTION
  async perform_action_Connect(output: PPSocket, input: PPSocket) {
    const sourceSocketName = output.name;
    const sourceSocketID = output.getNode().id;
    const targetSocketName = input.name;
    const targetSocketID = input.getNode().id;

    const actions = this.actions_Connect(
      sourceSocketName,
      sourceSocketID,
      targetSocketName,
      targetSocketID,
    );

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          actions[0],
          actions[1],
          'Connect nodes ' +
            output.getNode().name +
            ' and ' +
            input.getNode().name,
        ),
      ),
    );
  }

  connect(
    output: PPSocket,
    input: PPSocket,
    notify = true,
  ): PPLink | undefined {
    if (input.getNode() === output.getNode()) {
      InterfaceController.showSnackBar("Can't connect node to itself");
      return undefined;
    }

    for (let i = 0; i < input.links.length; i++) {
      const link = input.links[i];
      link.delete(true);
    }

    // force connected sockets to be visible
    input.setVisible(true);
    output.setVisible(true);

    //create link class
    const link: PPLink = new PPLink(output, input);

    //add link to output
    output.links.push(link);

    //add link to input
    input.links = [link];

    input.data = output.data;

    this.connectionContainer.addChild(link);
    output.redraw();

    // send notification pulse
    if (notify) {
      const sourceNode = link.getSource().getNode();
      const targetNode = link.getTarget().getNode();
      sourceNode.outputPlugged(link.getSource());
      targetNode.inputPlugged(link.getTarget());
      if (targetNode.updateBehaviour.update) {
        FlowLogic.addPendingExecution(targetNode.id);
      }
    }

    return link;
  }

  stopConnecting() {
    this.clearTempConnection();
    this.clearSnapTarget();
    this.overrideNodeCursorPosition = undefined;
    this.selectedSocket = undefined;
  }

  addOrReplaceNode = async (event, selected: INodeSearch) => {
    if (!selected) return;

    const referenceID = hri.random();
    const addLink = PPGraph.currentGraph.selectedSocket;
    const setActiveItemArray = () =>
      InterfaceController.setNodeSearchActiveItem((oldArray: INodeSearch[]) => {
        selected.group = 'Latest';
        const newArray: INodeSearch[] = [selected, ...oldArray];
        if (newArray.length > MAX_LATEST_NODES_IN_SEARCH) {
          newArray.pop();
        }
        console.log(newArray.length, newArray);
        return newArray;
      });

    if (PPGraph.currentGraph.selection.selectedNodes.length === 1 && !addLink) {
      await this.perform_action_replaceSelectedNodeType(
        selected,
        referenceID,
        setActiveItemArray,
      );
    } else {
      await this.perform_action_addNewNodeFromNodeSearch(
        selected,
        referenceID,
        setActiveItemArray,
        addLink,
      );
    }
  };

  perform_action_replaceSelectedNodeType = async (
    selected: INodeSearch,
    referenceID: string,
    setActiveItemArray,
  ) => {
    // replace node if there is exactly one node selected
    const newNodeType = selected.title;
    const oldNode = PPGraph.currentGraph.selection.selectedNodes[0];
    const serializedNode = oldNode.serialize();

    const action = async () => {
      const newNode = await PPGraph.currentGraph.replaceNode(
        serializedNode,
        serializedNode.id,
        referenceID,
        newNodeType,
      );
      InterfaceController.notifyListeners(ListenEvent.SelectionChanged, [
        newNode,
      ]);
      setActiveItemArray();
      InterfaceController.setIsNodeSearchVisible(false);
    };
    const undoAction = async () => {
      const previousNode = await PPGraph.currentGraph.replaceNode(
        serializedNode,
        referenceID,
        serializedNode.id,
      );
      InterfaceController.notifyListeners(ListenEvent.SelectionChanged, [
        previousNode,
      ]);
    };
    // TODO SERIALIZED ACTION
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Replace node'),
      ),
    );
  };

  perform_action_addNewNodeFromNodeSearch = async (
    selected: INodeSearch,
    referenceID: string,
    setActiveItemArray,
    addLink: PPSocket | undefined,
  ) => {
    // add node
    let nodePos;
    if (this.overrideNodeCursorPosition) {
      nodePos = this.overrideNodeCursorPosition;
    } else {
      // place in center
      nodePos = this.viewport.toWorld(
        new PIXI.Point(window.innerWidth / 2, window.innerHeight / 2),
      );
    }

    const args: AddNodeActionArgs = {
      nodeName: selected.title,
      nodeID: referenceID,
      addLinkNodeID: addLink != undefined ? addLink.getNode().id : undefined,
      addLinkSocketName: addLink != undefined ? addLink.name : undefined,
      addLinkSocketType: addLink != undefined ? addLink.socketType : undefined,
      position: nodePos,
      isCustomFunction: selected.isNew === true,
    };
    await PNPAction(ACTIONS.ADD_NODE, args, args);
    this.selection.selectNodes([this.nodes[referenceID]]);
    setActiveItemArray();
  };

  async perform_action_addConnectedNode(
    socket: PPSocket,
    newNodeType: string,
    referenceID = hri.random(),
  ): Promise<void> {
    const node = socket.getNode();
    const args: AddNodeActionArgs = {
      nodeName: newNodeType,
      nodeID: referenceID,
      addLinkNodeID: node.id,
      addLinkSocketName: socket.name,
      addLinkSocketType: socket.socketType,
      position: new PIXI.Point(
        node.x + (socket.isInput() ? 0 : node.width + 40),
        node.y + socket.y,
      ),
    };
    await PNPAction(ACTIONS.ADD_NODE, args, args);
  }

  getLinks(): PPLink[] {
    return Object.values(this.nodes).flatMap((node) =>
      node.getAllInputSockets().flatMap((socket) => socket.links),
    );
  }

  checkOldSocketAndUpdateIt<T extends PPSocket>(
    oldSocket: T,
    newSocket: T,
    isInput: boolean,
  ): boolean {
    // check if this socket already has a connection
    Object.values(this.getLinks()).forEach((link) => {
      if (isInput ? link.target === oldSocket : link.source === oldSocket) {
        console.log('updating link:', isInput ? link.target : link.source);

        if (isInput) {
          link.updateTarget(newSocket);
          oldSocket.links = [];
          newSocket.links = [link];
          newSocket.data = link.source.data;
        } else {
          link.updateSource(newSocket);
          oldSocket.links = oldSocket.links.filter((item) => item !== link);
          newSocket.links.push(link);
        }
        return true;
      }
    });
    return false;
  }

  async fadeGraph(fadeIn: boolean) {
    const executionStartTime = Date.now();
    const FADE_TIME = 300;
    const INTERVAL = 16;
    while (true) {
      const time = Date.now() - executionStartTime;
      await new Promise((r) => setTimeout(r, INTERVAL));
      const ratioAlong = time / FADE_TIME;
      if (ratioAlong >= 1) {
        break;
      }
      const alphaToUse = fadeIn ? ratioAlong : 1 - ratioAlong;
      this.viewport.alpha = alphaToUse;
      Object.values(this.nodes).forEach((node) =>
        node.fadeAllNonPIXIParts(alphaToUse),
      );
    }
    this.viewport.alpha = fadeIn ? 1 : 0.01; // avoid going to absolute zero because it can confuse some node rendering behaviour
  }

  async clear(): Promise<void> {
    this.graphConfiguredAndReady = false;
    const fadeOut = Object.values(this.nodes).length;
    if (fadeOut) {
      await this.fadeGraph(false);
    }

    // remove all nodes from container
    this.selection.selectAllNodes();
    await this.perform_action_DeleteSelectedNodes();

    InterfaceController.notifyListeners(ListenEvent.GraphConfigured, {
      id: this.id,
      name: this.name,
    });

    this.graphConfiguredAndReady = true;

    if (fadeOut) {
      this.viewport.alpha = 1;
    }

    this.updateEmptyCanvasVisibility();

    InterfaceController.spamToast('graph_cleared');
  }

  async duplicateSelection(
    pastePos: PIXI.Point = new PIXI.Point(40, 40),
  ): Promise<PPNode[]> {
    const serializeSelection = this.serializeSelection(false);
    const pastedNodes = await this.perform_action_pasteNodes(
      serializeSelection,
      pastePos,
    );
    return pastedNodes;
  }

  async perform_action_pasteNodes(
    data: SerializedSelection,
    pastePos: PIXI.Point = new PIXI.Point(0, 0),
  ): Promise<PPNode[]> {
    const newNodes: PPNode[] = [];
    const mappingOfOldAndNewNodes: { [key: string]: PPNode } = {};

    // Preserve original IDs when possible
    const idMapping: { [key: string]: string } = {};
    data.nodes.forEach((node) => {
      idMapping[node.id] = this.nodes[node.id] ? hri.random() : node.id;
    });

    const action = async () => {
      const originalNodes: SerializedSelection = data;
      newNodes.length = 0;
      //create nodes
      try {
        await Promise.all(
          originalNodes.nodes.map(async (node, index) => {
            // add node and carry over its configuration
            const newNode = await this.addSerializedNode(node, {
              overrideId: idMapping[node.id],
            });

            // offset pasted node
            newNode.setPosition(pastePos.x + node.x, pastePos.y + node.y);

            mappingOfOldAndNewNodes[node.id] = newNode;
            newNodes.push(newNode);
          }),
        );

        for (let i = 0; i < originalNodes.links.length; i++) {
          const link = originalNodes.links[i];
          const newSource = mappingOfOldAndNewNodes[
            link.sourceNodeId
          ].getOutputSocketByName(link.sourceSocketName);
          const newTarget = mappingOfOldAndNewNodes[
            link.targetNodeId
          ].getInputOrTriggerSocketByName(link.targetSocketName);
          if (newSource && newTarget) {
            this.connect(newSource, newTarget, false);
          } else {
            this.notifyLinkCreationFailure(link, newSource, newTarget);
          }
        }
      } catch (error) {
        console.error(error);
      }
      await FlowLogic.waitForPendingExecution();
      await Promise.all(newNodes.map(async (node) => node.pasted()));

      // select newNode
      this.selection.selectNodes(newNodes, false);

      // execute all seed nodes to make sure there are values everywhere
      await this.executeAllSeedNodes(newNodes);
    };

    const undoAction = async () => {
      this.selection.deselectAllNodesAndResetSelection();
      Object.values(idMapping).forEach(async (id) => {
        await PPGraph.currentGraph.removeNode(
          SerializableActionHandler.getSafeNode(id),
        );
      });
    };

    // TODO SERIALIZED ACTION
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Paste node(s)'),
      ),
    );

    return newNodes;
  }

  getCanAddInput(): boolean {
    return !this.selection.selectedNodes.find((node) => !node.getCanAddInput());
  }

  addTriggerInput(): void {
    this.selection.selectedNodes.forEach((node) => node.addDefaultTrigger());
  }

  getSerializedStoredGraph(): StoredGraph {
    return {
      id: this.id,
      location: this.location,
      name: this.name,
      access: this.access,
      graphData: this.serialize(),
      date: new Date(),
      owner: this.owner,
      isRemote: this.isRemote,
    };
  }

  serialize(): SerializedGraph {
    // get serialized nodes
    const nodesSerialized = Object.values(this.nodes).map((node) =>
      node.serialize(),
    );

    // get serialized links
    const linksSerialized = Object.values(this.getLinks()).map((link) =>
      link.serialize(),
    );

    // Extract dashboard overlay state, ignoring left and right drawers
    const overlayState = InterfaceController.getOverlayState();
    const overlayForSerialization = {
      [DrawerSide.DASHBOARD]: overlayState.dashboard,
    };

    const data = {
      version: GRAPH_DATA_VERSION,
      graphSettings: {
        showExecutionVisualisation: this.showExecutionVisualisation,
        viewportCenterPosition: new PIXI.Point(
          Math.round(this.viewport.center.x),
          Math.round(this.viewport.center.y),
        ),
        viewportScale: this.viewportScaleX,
        defaultUISurfaceNodeId: this.defaultUISurfaceNodeId,
      },
      overlay: overlayForSerialization,
      nodes: nodesSerialized,
      links: linksSerialized,
    };

    return data;
  }

  serializeNodes(
    nodes: PPNode[],
    includeOutputSocketData: boolean,
  ): SerializedSelection {
    const linksFullyContainedInSelection: PPLink[] = [];
    const linksPartiallyInSelection: PPLink[] = [];

    nodes.forEach((node) => {
      // get links which are completely contained in selection
      node.getAllInputSockets().forEach((socket) => {
        if (socket.hasLink()) {
          const connectedNode = socket.links[0].source.getNode() as PPNode;
          nodes.includes(connectedNode)
            ? linksFullyContainedInSelection.push(socket.links[0])
            : linksPartiallyInSelection.push(socket.links[0]);
        }
      });
    });

    // get serialized nodes
    const nodesSerialized = nodes.map((node) =>
      node.serialize(includeOutputSocketData),
    );

    // add deep copy of data from input sockets whos links are not included
    linksPartiallyInSelection.forEach((link) => {
      const socket = link.getTarget();
      const foundNode = nodesSerialized.find(
        (nodes) => nodes.id === socket.getNode()?.id,
      );
      const foundSocket = foundNode?.socketArray.find(
        (socketToOverwrite) => socketToOverwrite.name === socket.name,
      );

      if (!foundSocket) {
        console.warn('Socket not found in serialized nodes');
        return;
      }

      let deepCopy;
      try {
        deepCopy = structuredClone(
          socket.dataType.prepareDataForSaving(socket.data),
        );
      } catch (error) {
        console.error('Error during deep copy:', error);
      }

      foundSocket.data = deepCopy;
    });

    // get serialized links
    const linksSerialized = linksFullyContainedInSelection.map((link) =>
      link.serialize(),
    );

    const data = {
      version: GRAPH_DATA_VERSION,
      nodes: nodesSerialized,
      links: linksSerialized,
    };

    return data;
  }

  serializeSelection(includeOutputSocketData: boolean): SerializedSelection {
    return this.serializeNodes(
      this.selection.selectedNodes,
      includeOutputSocketData,
    );
  }

  async configure(storedGraph: StoredGraph): Promise<boolean> {
    const CONFIGURE_GRAPH_SPINNER_MESSAGE = 'Configuring graph';
    InterfaceController.showSpinner(CONFIGURE_GRAPH_SPINNER_MESSAGE);

    console.time('graph_configure');
    PPStorage.getInstance().updateLocalURL(storedGraph);
    this.id = storedGraph.id;
    this.location = storedGraph.location;
    this.name = storedGraph.name;
    this.access = storedGraph.access;
    this.owner = storedGraph.owner;
    this.date = storedGraph.date;
    this.isRemote = storedGraph.isRemote;
    this.selection.deselectAllNodesAndResetSelection();

    if (Object.keys(this.nodes).length > 0) {
      await this.clear();
    }
    this.graphConfiguredAndReady = false;

    const data = storedGraph.graphData;
    const newX = data.graphSettings.viewportCenterPosition.x ?? 0;
    const newY = data.graphSettings.viewportCenterPosition.y ?? 0;

    this.viewport.moveCenter(newX, newY);
    this.viewport.setZoom(data.graphSettings.viewportScale ?? 1, true);

    // Get dashboard state from storedGraph and combine with current left and right state
    const currentOverlayState = InterfaceController.getOverlayState();
    const overlayWithCurrentDrawerState = {
      ...data.overlay,
      [DrawerSide.LEFT]: currentOverlayState.leftSide,
      [DrawerSide.RIGHT]: currentOverlayState.rightSide,
    };

    InterfaceController.updateOverlayState(overlayWithCurrentDrawerState);

    // other settings
    this.showExecutionVisualisation =
      data.graphSettings.showExecutionVisualisation ?? true;
    this.defaultUISurfaceNodeId =
      data.graphSettings.defaultUISurfaceNodeId ?? undefined;

    // create nodes & links
    let lastSerializedNode: SerializedNode | undefined = undefined;
    try {
      for (let i = 0; i < data.nodes.length; i++) {
        lastSerializedNode = data.nodes[i];
        await this.addSerializedNode(data.nodes[i], {
          overrideId: data.nodes[i].id,
        });
      }
    } catch (error) {
      console.error('Error adding node: ' + lastSerializedNode?.name);
      console.error(error);
      return false;
    }
    try {
      for (let i = 0; i < data.links.length; i++) {
        await this.addSerializedLink(data.links[i]);
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    // migrate all nodes that need to
    for (let i = 0; i < data.nodes.length; i++) {
      const serializedNode = data.nodes[i];
      const interpretedVersion =
        serializedNode.version === undefined ? 1 : serializedNode.version;
      const nodeInGraph = this.nodes[serializedNode.id];
      if (interpretedVersion !== nodeInGraph.getVersion()) {
        console.log(
          'Migrating: ' +
            serializedNode.name +
            ' from version ' +
            interpretedVersion +
            ' to ' +
            nodeInGraph.getVersion(),
        );
        await nodeInGraph.migrate(interpretedVersion);
      }
    }

    // execute all seed nodes to make sure there are values everywhere
    await this.executeAllSeedNodes(Object.values(this.nodes));

    // Fire DashboardLoaded after nodes are created and executed,
    // so page nodes have their listeners registered for default page activation
    InterfaceController.notifyListeners(ListenEvent.DashboardLoaded, {
      id: storedGraph.id,
      name: storedGraph.name,
    });

    this.graphConfiguredAndReady = true;

    this.updateEmptyCanvasVisibility();

    console.timeEnd('graph_configure');
    InterfaceController.hideSpinner(CONFIGURE_GRAPH_SPINNER_MESSAGE);

    InterfaceController.notifyListeners(ListenEvent.GraphConfigured, {
      id: storedGraph.id,
      name: storedGraph.name,
    });

    return true;
  }

  async executeAllSeedNodes(nodes: PPNode[]): Promise<void> {
    const firstIteration = getLoadSeedNodes(nodes);
    await FlowLogic.executeOptimizedChainBatch(firstIteration);
  }

  getInputSocket(nodeID: string, socketName: string): PPSocket {
    const node = this.getNodeById(nodeID);
    return node.getInputOrTriggerSocketByName(socketName);
  }

  getOutputSocket(nodeID: string, socketName: string): PPSocket {
    const node = this.getNodeById(nodeID);
    return node.getOutputSocketByName(socketName);
  }

  async logicTick(currentTime: number, deltaTime: number): Promise<void> {
    for (const nodeId in this.nodes) {
      await this.nodes[nodeId].tick(currentTime, deltaTime);
    }
  }

  reconnectLinksToNewNode(oldNode: PPNode, newNode: PPNode): void {
    const checkAndUpdateSocketArray = (
      oldArray: PPSocket[],
      newArray: PPSocket[],
      isInput = true,
    ): void => {
      oldArray.forEach((socket) => {
        const replacementSocket = newArray.find(
          (candidate) => candidate.name === socket.name,
        );

        if (replacementSocket) {
          this.checkOldSocketAndUpdateIt(socket, replacementSocket, isInput);
        }
      });
    };

    //check arrays
    checkAndUpdateSocketArray(
      oldNode.nodeTriggerSocketArray,
      newNode.nodeTriggerSocketArray,
    );
    checkAndUpdateSocketArray(
      oldNode.inputSocketArray,
      newNode.inputSocketArray,
    );
    checkAndUpdateSocketArray(
      oldNode.outputSocketArray,
      newNode.outputSocketArray,
      false,
    );
  }

  removeNode(node: PPNode): void {
    this.selection.selectNodes(
      this.selection.selectedNodes.filter(
        (selected) => selected.id !== node.id,
      ),
      false,
    );
    const removedSurfaceId = isSurfaceNode(node) ? node.id : undefined;
    delete this.nodes[node.id];
    node.destroy();

    if (removedSurfaceId) {
      InterfaceController.notifyListeners(ListenEvent.SurfaceListChanged, {
        nodeId: removedSurfaceId,
        action: 'removed',
      });
    }

    this.updateEmptyCanvasVisibility();
  }

  async perform_action_DeleteSelectedNodes(): Promise<void> {
    const nodesSerialized = this.selection.selectedNodes.map((node) =>
      node.serialize(),
    );
    const linksSerialized = this.selection.selectedNodes
      .map((node) =>
        node
          .getAllSockets()
          .map((socket) => socket.links.map((link) => link.serialize())),
      )
      .flat()
      .flat();
    const action = async () => {
      this.selection.deselectAllNodesAndResetSelection();
      for (let i = 0; i < nodesSerialized.length; i++) {
        await this.removeNode(this.nodes[nodesSerialized[i].id]);
      }
    };
    const undoAction = async () => {
      const addedNodes: PPNode[] = [];
      await Promise.all(
        nodesSerialized.map(async (node: SerializedNode) => {
          const addedNode = await PPGraph.currentGraph.addSerializedNode(node, {
            overrideId: node.id,
          });
          addedNodes.push(addedNode);
        }),
      );

      linksSerialized.forEach((link) => {
        const sourceSocket = this.nodes[
          link.sourceNodeId
        ].getOutputSocketByName(link.sourceSocketName);
        const targetNode = this.nodes[link.targetNodeId];
        const targetSocket = this.resolveInputSocketForLink(
          targetNode,
          link.targetSocketName,
          sourceSocket,
        );
        if (sourceSocket && targetSocket) {
          this.connect(sourceSocket, targetSocket, false);
        } else {
          this.notifyLinkCreationFailure(link, sourceSocket, targetSocket);
        }
      });

      this.selection.selectNodes(addedNodes);
      await this.executeAllSeedNodes(addedNodes);
    };
    // TODO SERIALIZED ACTION
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Delete node(s)'),
      ),
    );
  }

  getMacroWithName(name: string): Macro {
    return this.macros.find((node) => node.name === name) as Macro;
  }

  async invokeMacro(name: string, args: any[]): Promise<any> {
    // in case the macro hasnt selected a macro yet return empty object
    if (name == EMPTY_DEFAULT_MACRO_NAME) {
      return {};
    }
    return this.getMacroWithName(name).executeMacro(args);
  }

  static getCurrentGraph(): PPGraph {
    return PPGraph.currentGraph;
  }

  get macros(): Macro[] {
    return Object.values(this.nodes).filter(
      (node) => node.type?.toLowerCase() === 'macro',
    ) as Macro[];
  }

  // Start the separate logic update loop
  startLogicLoop(): void {
    if (this.isLogicLoopRunning) return;

    this.isLogicLoopRunning = true;
    let lastTime = Date.now();

    const updateLogic = () => {
      const currentTime = Date.now();
      const delta = currentTime - lastTime;
      lastTime = currentTime;

      // Run node updates that need to happen regardless of rendering
      void this.logicTick(currentTime, delta);

      if (this.isLogicLoopRunning) {
        this.logicAnimationFrameId = requestAnimationFrame(updateLogic);
      }
    };

    this.logicAnimationFrameId = requestAnimationFrame(updateLogic);
    console.log('Started logic update loop');
  }

  // Stop the logic update loop
  stopLogicLoop(): void {
    this.isLogicLoopRunning = false;

    if (this.logicAnimationFrameId !== null) {
      cancelAnimationFrame(this.logicAnimationFrameId);
      this.logicAnimationFrameId = null;
      console.log('Stopped logic update loop');
    }
  }

  destroy(): void {
    this.stopLogicLoop();
  }

  initEmptyCanvasIndicator(): void {
    this.emptyCanvasText = new PIXI.HTMLText({
      text: isPhone()
        ? 'To add nodes open the 3 dot menu<br>Then press Find node'
        : `<span style="color:#0c1122;">Add data and logic</span>
  Double click canvas or drag files in
  Then connect the nodes

  <span style="color:#0c1122;">Create user interface</span>
  Press 2 to open the panel
  Then add widgets/nodes

  Right click for more options`,
      style: {
        fontFamily: 'Arial',
        fontSize: 20,
        fill: '#888888',
        align: 'center',
        lineHeight: 28,
      },
    });
    this.emptyCanvasText.anchor.set(0.5, 0.5);
    this.emptyCanvasText.eventMode = 'none';

    // Add to overlay container
    this.overlayContainer.addChild(this.emptyCanvasText);

    this.updateEmptyCanvasVisibility();
  }

  updateEmptyCanvasVisibility(): void {
    // Show text only when there are no nodes
    const nodeCount = Object.keys(this.nodes).length;
    this.emptyCanvasText.visible = nodeCount === 0;

    // Center in screen
    if (this.emptyCanvasText.visible) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      this.emptyCanvasText.position.set(centerX, centerY);
    }
  }
}
