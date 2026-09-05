/* eslint-disable */
import * as PIXI from 'pixi.js';
import { TRgba } from '../utils/color';
import { hri } from 'human-readable-ids';
import throttle from 'lodash/throttle';
import debounce from 'lodash/debounce';
import {
  CustomArgs,
  IWarningHandler,
  SerializedNode,
  SerializedSocket,
  TNodeId,
  TNodeSource,
  TSocketType,
} from '../utils/interfaces';
import {
  COLOR_MAIN,
  COMMENT_TEXTSTYLE,
  NODE_TYPE_COLOR,
  NODE_CORNERRADIUS,
  NODE_HEADER_HEIGHT,
  NODE_HEADER_TEXTMARGIN_LEFT,
  NODE_HEADER_TEXTMARGIN_TOP,
  NODE_MARGIN,
  NODE_PADDING_BOTTOM,
  NODE_PADDING_TOP,
  NODE_SOURCE,
  NODE_TEXTSTYLE,
  NODE_WIDTH,
  ONCLICK_DOUBLECLICK,
  STATUS_SEVERITY,
  SOCKET_HEIGHT,
  SOCKET_TYPE,
  SOCKET_WIDTH,
  TEXT_RESOLUTION,
  SOCKET_TEXTSTYLE,
  SMALL_NODE_WIDTH,
  DEFAULT_UPDATE_FREQUENCY,
  ERROR_COLOR,
  SUCCESS_COLOR,
  RightDrawerView,
  ERROR_BOUNDARY_SCREEN_OFFSET,
  ERROR_BOUNDARY_SCREEN_WIDTH,
} from '../utils/constants';
import UpdateBehaviourClass from './UpdateBehaviourClass';
import NodeHeaderClass from './NodeHeaderClass';
import PPGraph from './GraphClass';
import Socket from './SocketClass';
import {
  calculateAspectRatioFit,
  clearDocumentSelection,
  perform_action_connectNodeToSocket,
  getNodeCommentPosX,
  getNodeCommentPosY,
} from '../utils/utils';
import { ELEMENT_ID_SEPARATOR } from '../utils/elementIds';
import { shouldExecuteOnInitialNodeAdd } from '../utils/updateBehaviour';
import { AbstractType, IsCompatible } from '../nodes/datatypes/abstractType';
import { AnyType } from '../nodes/datatypes/anyType';
import { TriggerType } from '../nodes/datatypes/triggerType';
import { deSerializeType } from '../nodes/datatypes/typehelper';
import FlowLogic from './FlowLogic';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { TextStyle } from 'pixi.js';
import {
  NodeConfigurationError,
  NodeExecutionError,
  PNPCustomStatus,
  PNPError,
  PNPStatus,
  PNPSuccess,
  SocketParsingWarning,
} from './ErrorClass';
import { shouldEnterHybridEditModeOnCanvasClick } from '../utils/nodeInteractivity';
import {
  CONSTANT_NAME,
  ENTIRE_OBJECT_NAME,
  INDEX_NAME,
} from '../nodes/datatypes/inputArrayKeysType';
import { PNPHitArea } from './selection/PNPHitArea';
import { DropShadowFilter, GlowFilter } from 'pixi-filters';
import { getObjectsInsideBounds } from '../pixi/utils-pixi';
import { BackPropagation, BackPropagationPayload } from '../interfaces';
import { addDashboardContentOutput } from '../utils/layoutableHelpers';
import { loadStatusIcons } from '../utils/statusIcons';
import { NodeStatusBadges } from './NodeStatusBadges';

export default class PPNode extends PIXI.Container implements IWarningHandler {
  _NodeNameRef: PIXI.Text;
  _BackgroundRef: PIXI.Container;
  _NodeTextStringRef: PIXI.Text;
  _BackgroundGraphicsRef: PIXI.Graphics;
  _CommentRef: PIXI.Graphics;
  _StatusesRef: PIXI.Graphics;
  statusBadges: NodeStatusBadges;
  _ErrorBoundaryRef: PIXI.Graphics;
  _ForegroundRef: PIXI.Container;
  _SlowExecutionGraphics: PIXI.Graphics;

  _isHovering: boolean;

  id: TNodeId;
  type: string; // Type
  nodePosX: number;
  nodePosY: number;
  nodeWidth: number;
  nodeHeight: number;

  updateBehaviour: UpdateBehaviourClass;
  nodeSelectionHeader: NodeHeaderClass;
  lastTimeTicked = 0;
  lastExecutionTime = 0;
  lastRenderID = 0;

  status: { node: PNPStatus; socket: PNPStatus; custom: PNPStatus[] } = {
    node: new PNPSuccess(),
    socket: new PNPSuccess(),
    custom: [],
  };

  inputSocketArray: Socket[] = [];
  nodeTriggerSocketArray: Socket[] = [];
  outputSocketArray: Socket[] = [];

  listenId: string[] = [];

  comment: string = '';

  debug_timesDrawn;
  debug_timesExecuted = 0;
  debug_timesExecutedChildren = 0;

  hasBeenAdded = false;
  hasBeenDrawn = false;
  // whether drawErrorBoundary actually painted something, so the zoom refresh
  // can skip clean nodes without re-deriving the status for every one of them
  private errorBoundaryIsDrawn = false;

  executionFilter: GlowFilter | undefined = undefined;
  dropShadowFilter: DropShadowFilter | undefined = undefined;

  // for when user is hovering over the node
  hoverState = 0;
  hoverDirectionUp = false;

  // auto set values on first plug after placement, IF not coming from serialized
  hasAutoSetValues: boolean = false;
  shouldAutoSetValues: boolean = false;

  // a node cant execute multiple times overlapping!!
  isExecuting: boolean = false;
  isDrawingSlowExecutionGraphic: boolean = false;
  wantsToExecute: boolean = false;

  private executionListeners: Set<() => void> = new Set();

  // supported callbacks
  onNodeDoubleClick: (event: PIXI.FederatedPointerEvent) => void = () => {};
  onViewportMoveHandler: (event?: PIXI.FederatedPointerEvent) => void =
    () => {};
  onViewportPointerUpHandler: (event?: PIXI.FederatedPointerEvent) => void =
    () => {};
  onNodeRemoved: () => void = () => {}; // called when the node is removed from the graph
  onNodeResize: (width: number, height: number) => void = () => {}; // called when the node is resized

  public isInteractionEnabled(): boolean {
    return false;
  }

  public enableInteraction(): void | Promise<void> {}

  public onEnterKeyPressed(): boolean {
    return false;
  }

  public isSurface(): boolean {
    return false;
  }

  protected onCanvasClickResolved({
    event,
    wasOnlySelectedAtPointerDown,
  }: {
    event: PIXI.FederatedPointerEvent;
    wasOnlySelectedAtPointerDown: boolean;
  }): void {
    const selection = PPGraph.currentGraph.selection;
    const isOnlySelected =
      selection.isOnlySelectedNodeIgnoringPendingSelection(this);

    if (
      shouldEnterHybridEditModeOnCanvasClick({
        isWidget: this.isWidget(),
        isInteractionEnabled: this.isInteractionEnabled(),
        isOnlySelected,
        wasOnlySelectedAtPointerDown,
        clickCount: event.detail,
      })
    ) {
      void this.enableInteraction();
    }
  }

  // called when the node is added to the graph
  public async onNodeAdded(source: TNodeSource): Promise<void> {
    this._NodeTextStringRef = new PIXI.Text({
      text: this.getNodeTextString(),
      style: NODE_TEXTSTYLE,
      resolution: TEXT_RESOLUTION,
    });
    if (this.getIsSimpleStyleNode()) {
      this._NodeTextStringRef.x = this.nodeWidth / 2;
      this._NodeTextStringRef.y = this.nodeHeight / 2;
      this._NodeTextStringRef.anchor.x = 0.5;
      this._NodeTextStringRef.anchor.y = 0.5;
    } else {
      this._NodeTextStringRef.x = NODE_HEADER_TEXTMARGIN_LEFT;
      this._NodeTextStringRef.y = NODE_PADDING_TOP + NODE_HEADER_TEXTMARGIN_TOP;
    }
    //this._NodeTextStringRef.resolution = 8;

    this._BackgroundRef = new PIXI.Container();
    this.addChild(this._BackgroundRef);
    this._BackgroundRef.name = 'background';
    const backgroundGraphics = new PIXI.Graphics();
    this._BackgroundGraphicsRef =
      this._BackgroundRef.addChild(backgroundGraphics);
    this._BackgroundGraphicsRef.name = 'backgroundGraphics';

    this._NodeNameRef = this._BackgroundRef.addChild(this._NodeTextStringRef);
    this._CommentRef = this._BackgroundRef.addChild(new PIXI.Graphics());
    this._ErrorBoundaryRef = this._BackgroundRef.addChild(new PIXI.Graphics());
    this._StatusesRef = this._BackgroundRef.addChild(new PIXI.Graphics());
    this.statusBadges = new NodeStatusBadges(this, this._BackgroundRef);

    // only get default updateBehaviour when newly added
    if (source !== NODE_SOURCE.SERIALIZED) {
      this.updateBehaviour = this.getUpdateBehaviour();
    }

    await loadStatusIcons();

    this.nodeSelectionHeader = new NodeHeaderClass();
    await this.nodeSelectionHeader.init();
    if (this.getShouldShowHoverActions()) {
      this._BackgroundRef.addChild(this.nodeSelectionHeader);
    }
    this.nodeSelectionHeader.x = NODE_MARGIN + this.nodeWidth - 86;
    this.nodeSelectionHeader.y = -22;

    // do not show the node name
    if (!this.getShowNodeNameLabel()) {
      this._NodeNameRef.alpha = 0;
    }

    this._ForegroundRef = new PIXI.Container();
    this.addChild(this._ForegroundRef);
    this._ForegroundRef.name = 'foreground';

    this.hasBeenAdded = true;
    this.getAllSockets().forEach((socket) => {
      this._BackgroundRef.addChild(socket);
      socket.onNodeAdded(this);
    });

    this.executionFilter = new GlowFilter({
      distance: 4,
      outerStrength: 0,
    });
    this.executionFilter.resolution = 2;
    //this.filters = [this.executionFilter];

    await this.updateBehaviour.onNodeAdded();

    this.eventMode = 'static';

    this._addListeners();
    this.resizeAndDraw();

    if (source === NODE_SOURCE.NEWCONNECTED) {
      this.shouldAutoSetValues = true;
    } else {
      this.shouldAutoSetValues = false;
    }

    if (
      shouldExecuteOnInitialNodeAdd({
        isSerialized: source === NODE_SOURCE.SERIALIZED,
        isNewConnected: source === NODE_SOURCE.NEWCONNECTED,
        load: this.updateBehaviour.load,
        graphConfiguredAndReady: PPGraph.currentGraph.graphConfiguredAndReady,
      })
    ) {
      await this.executeOptimizedChain();
    }

    if (this.isLayoutable()) {
      addDashboardContentOutput(this);
    }
  }

  public getMinNodeWidth(): number {
    return NODE_WIDTH;
  }

  protected calculateSocketsBasedHeight(): number {
    const base = this.headerHeight + NODE_PADDING_BOTTOM;
    let socketsHeight = 0;
    if (this.getParallelInputsOutputs()) {
      socketsHeight = Math.max(
        this.countOfVisibleInputSockets + this.countOfVisibleNodeTriggerSockets,
        this.countOfVisibleOutputSockets,
      );
    } else {
      socketsHeight =
        this.countOfVisibleInputSockets +
        this.countOfVisibleNodeTriggerSockets +
        this.countOfVisibleOutputSockets;
    }
    return base + socketsHeight * SOCKET_HEIGHT;
  }

  public getMinNodeHeight(): number {
    return this.calculateSocketsBasedHeight();
  }

  protected getAllInitialSockets(): Socket[] {
    return this.getDefaultIO();
  }

  public getNodeTextString(
    useMaxCharacters = true,
    usedName = this.getName(),
  ): [string, PIXI.TextStyleFontStyle] {
    let usedTextStyleFont: PIXI.TextStyleFontStyle = 'normal';

    if (
      this.name !== this.type &&
      this.getName() !== this.name &&
      this.name.length > 0
    ) {
      usedName = this.name;
      usedTextStyleFont = 'italic';
    }
    let maxCharacters = 10;
    try {
      maxCharacters = this.nodeWidth / (NODE_TEXTSTYLE.fontSize * 0.7); //0.7 is magic number, this is not exactly right for some reason, in text editor "this" is undefined when this is called, not sure why, TODO fix this (in text editor most likely)
    } catch (e) {
      console.warn(
        'Exception when trying to catch this.width in: ' + this.name,
      );
    }

    if (usedName.length > maxCharacters && useMaxCharacters) {
      usedName = usedName.substring(0, maxCharacters) + '...';
    }
    return [usedName, usedTextStyleFont];
  }

  constructor(type: string, customArgs?: CustomArgs) {
    super({ isRenderGroup: true });
    this.id = customArgs?.overrideId || hri.random();
    // "::" is the reserved dashboard element-id separator - a node id
    // containing it would make its socket element ids unparseable (see
    // elementIds.ts). hri.random() can never produce it; only overrideId can.
    if (this.id.includes(ELEMENT_ID_SEPARATOR)) {
      console.error(
        `Node id "${this.id}" contains the reserved separator "${ELEMENT_ID_SEPARATOR}" - its sockets will not resolve on dashboards`,
      );
    }
    this.setNodeName(this.getName());
    this.type = type;
    this.nodeTriggerSocketArray = [];
    this.inputSocketArray = [];
    this.outputSocketArray = [];

    // customArgs
    this.x = customArgs?.nodePosX ?? 0;
    this.y = customArgs?.nodePosY ?? 0;
    this.nodeWidth = customArgs?.nodeWidth ?? this.getDefaultNodeWidth();
    this.nodeHeight = customArgs?.nodeHeight ?? this.getDefaultNodeHeight(); // if not set height is defined by in/out sockets
    this._isHovering = false;

    // add static inputs and outputs
    this.getAllInitialSockets().forEach((IO) => {
      // add in default data if supplied
      const newDefault = customArgs?.defaultArguments?.[IO.name];
      if (newDefault) {
        IO.data = newDefault;
      }
      this.addSocket(IO);
    });
    this.debug_timesDrawn = 0;
  }

  // GETTERS & SETTERS

  get selected(): boolean {
    return PPGraph.currentGraph.selection.isNodeSelected(this);
  }

  get isHovering(): boolean {
    return this._isHovering;
  }

  set isHovering(state: boolean) {
    this._isHovering = state;
  }

  get countOfVisibleNodeTriggerSockets(): number {
    return this.nodeTriggerSocketArray.filter((item) => item.visible).length;
  }

  get countOfVisibleInputSockets(): number {
    return this.inputSocketArray.filter((item) => item.visible).length;
  }

  get countOfVisibleOutputSockets(): number {
    return this.outputSocketArray.filter((item) => item.visible).length;
  }

  get headerHeight(): number {
    // hide header if !showLabels
    return this.getShowLabels() && !this.getIsSimpleStyleNode()
      ? NODE_PADDING_TOP + NODE_HEADER_HEIGHT
      : NODE_PADDING_TOP;
  }

  get nodeName(): string {
    return this.name;
  }

  public setNodeName(text: string) {
    this.name = text;
    if (this.hasBeenAdded) {
      const [text, fontStyle] = this.getNodeTextString();
      this._NodeNameRef.text = text;
      this._NodeNameRef.style.fontStyle = fontStyle;
    }
    this.nameChanged(text);
  }

  getSourceCode(): string {
    return this.constructor.toString();
  }

  // sockets that should go together with the dynamically made ones
  protected getDependentDynamicSockets(socketName: string): Socket[] {
    return [];
  }

  // useful bc of child classes wanting to get notification (dynamicinputnode)
  addDynamicSocket(socket: Socket): void {
    this.addSocket(socket);
    this.getDependentDynamicSockets(socket.name).forEach((dependent) => {
      dependent.dependentSocketName = socket.name;
      this.addSocket(dependent);
    });
  }

  addSocket(socket: Socket): void {
    if (this.hasBeenAdded) {
      this._BackgroundRef.addChild(socket);
      socket.onNodeAdded(this);
    }
    switch (socket.socketType) {
      case SOCKET_TYPE.TRIGGER: {
        this.nodeTriggerSocketArray.push(socket);
        break;
      }
      case SOCKET_TYPE.IN: {
        this.inputSocketArray.push(socket);
        break;
      }
      case SOCKET_TYPE.OUT: {
        this.outputSocketArray.push(socket);
        break;
      }
    }
    if (this.hasBeenAdded) {
      this.socketAdded();
    }
  }

  removeSocket(socket: Socket): void {
    const checkAndRemoveFrom = (nameOfArrayToCheck: string): void => {
      this[nameOfArrayToCheck] = this[nameOfArrayToCheck].filter(
        (socketRef: Socket) =>
          !(
            socketRef.name === socket.name &&
            socketRef.socketType === socket.socketType
          ),
      );
    };

    socket.links.forEach((link) => link.delete());
    if (socket.hasLink()) {
      const link = socket.links[0];
      link.delete();
    }

    const socketName = socket.name;

    //remove from arrays
    checkAndRemoveFrom('nodeTriggerSocketArray');
    checkAndRemoveFrom('inputSocketArray');
    checkAndRemoveFrom('outputSocketArray');

    const allSockets = this.getAllSockets();
    allSockets.forEach((otherSocket) =>
      otherSocket.nodeSocketRemoved(socketName),
    );

    socket.destroy({});
    this.socketRemoved();
    if (this.getShrinkOnSocketRemove()) {
      this.resizeAndDraw(0, 0);
    }
  }

  addTrigger(
    name: string,
    type: AbstractType,
    data?: unknown,
    visible?: boolean,
    custom?: Record<string, any>,
    redraw = true,
  ): void {
    this.addSocket(
      new Socket(SOCKET_TYPE.TRIGGER, name, type, data, visible, custom),
    );
    // redraw background due to size change
    if (redraw) {
      this.resizeAndDraw();
    }
  }

  addInput(
    name: string,
    type: AbstractType,
    data?: unknown,
    visible?: boolean,
    custom?: Record<string, any>,
    redraw = true,
  ): void {
    this.addSocket(
      new Socket(SOCKET_TYPE.IN, name, type, data, visible, custom),
    );
    // redraw background due to size change
    if (redraw) {
      this.resizeAndDraw();
    }
  }

  addOutput(
    name: string,
    type: AbstractType,
    visible?: boolean,
    redraw = true,
  ): void {
    this.addSocket(
      new Socket(SOCKET_TYPE.OUT, name, type, type.getDefaultValue(), visible),
    );
    // redraw background due to size change
    if (redraw) {
      this.resizeAndDraw();
    }
  }

  serialize(includeDataForOutputSockets: boolean = false): SerializedNode {
    //create serialization object
    const node: SerializedNode = {
      id: this.id,
      name: this.name == this.getName() ? undefined : this.name,
      type: this.type,
      x: Math.round(this.x), // round to save space
      y: Math.round(this.y),
      width: Math.round(this.nodeWidth),
      height: Math.round(this.nodeHeight),
      socketArray: this.getAllSockets().map((socket) =>
        socket.serialize(includeDataForOutputSockets),
      ),
      updateBehaviour: {
        load: this.updateBehaviour.load,
        update: this.updateBehaviour.update,
        interval: this.updateBehaviour.interval,
        intervalFrequency:
          this.updateBehaviour.intervalFrequency == DEFAULT_UPDATE_FREQUENCY
            ? undefined
            : this.updateBehaviour.intervalFrequency,
      },
      version: this.getVersion() === 1 ? undefined : this.getVersion(), // we only bother saving if version is different from 1
      comment: this.comment || undefined, // only save if there is a comment
    };

    return node;
  }
  mapSocket = (item: SerializedSocket) => {
    let matchingSocket = this.getSocketByNameAndType(
      item.name,
      item.socketType,
    );
    let addingSocket = false;
    item.socketType =
      item.socketType == undefined ? SOCKET_TYPE.IN : item.socketType;
    item.visible = item.visible == undefined ? true : item.visible;
    if (matchingSocket === undefined) {
      matchingSocket = new Socket(
        item.socketType,
        item.name,
        deSerializeType(item.dataType),
        item.data,
        item.visible,
      );
      addingSocket = true;
    }
    // ignore output sockets as no data is stored for them
    if (item.socketType !== SOCKET_TYPE.OUT) {
      matchingSocket.data = item.data;
      matchingSocket.defaultData = item.data;
    }
    const dataType = deSerializeType(item.dataType);
    if (dataType.configureOnLoad()) {
      matchingSocket.dataType = deSerializeType(item.dataType);
    }
    matchingSocket.visible = item.visible;
    matchingSocket.dependentSocketName =
      item.dependentSocketName == undefined ? '' : item.dependentSocketName;

    if (addingSocket) {
      this.addSocket(matchingSocket);
    }
  };

  // Remember, this is called before the node is added, so no visual operations needed
  async configure(
    nodeConfig: SerializedNode,
    includeSocketData = true,
  ): Promise<void> {
    this.x = nodeConfig.x;
    this.y = nodeConfig.y;
    this.nodeWidth = nodeConfig.width || this.getMinNodeWidth();
    this.nodeHeight = nodeConfig.height || this.getMinNodeHeight();
    this.setNodeName(
      nodeConfig.name == undefined ? this.getName() : nodeConfig.name,
    );
    this.comment = nodeConfig.comment || '';
    this.updateBehaviour = new UpdateBehaviourClass(
      nodeConfig.updateBehaviour.load ?? false,
      nodeConfig.updateBehaviour.update,
      nodeConfig.updateBehaviour.interval,
      nodeConfig.updateBehaviour.intervalFrequency ?? DEFAULT_UPDATE_FREQUENCY,
      this,
    );
    if (includeSocketData) {
      try {
        // ugly - filter out old "Meta" sockets YOU CANNOT HAVE SOCKETS CALLED META AS LONG AS WE HAVE THIS HERE
        const sockets = nodeConfig.socketArray.filter(
          (socket) => socket.name !== 'Meta',
        );
        sockets.forEach((item) => this.mapSocket(item));
      } catch (error) {
        this.setStatus(new NodeConfigurationError(error));
        console.error(
          `Could not configure node: ${this.name}(${this.id})`,
          error,
        );
      }
    }
  }

  public addExecutionListener(listener: () => void): void {
    this.executionListeners.add(listener);
  }

  public removeExecutionListener(listener: () => void): void {
    this.executionListeners.delete(listener);
  }

  private notifyExecutionListeners(): void {
    this.executionListeners.forEach((listener) => listener());
  }

  public getDirectDependents(onlyInputs = true): { [key: string]: PPNode } {
    const currDependents: { [key: string]: PPNode } = {};
    this.outputSocketArray.forEach((socket) => {
      Object.values(socket.getDirectDependents(onlyInputs)).forEach(
        (dependent) => {
          currDependents[dependent.id] = dependent;
        },
      );
    });
    return currDependents;
  }

  async executeOptimizedChain(): Promise<void> {
    //if (PPGraph.currentGraph.allowSelfExecution) {
    await FlowLogic.executeOptimizedChainBatch([this]);
    //}
  }

  // for when you dont want to execute your own node (you probably already did), but run all children that react to updates
  async executeChildren(): Promise<void> {
    this.debug_timesExecutedChildren++;
    await FlowLogic.executeOptimizedChainBatch(
      Object.values(this.getDirectDependents()).filter(
        (node) => node.updateBehaviour.update,
      ),
      this.id,
    );
  }

  public setPosition(x: number, y: number, isRelative = false): void {
    if (isRelative) {
      this.x = this.x + (x ?? 0);
      this.y = this.y + (y ?? 0);
    } else {
      this.x = x ?? this.x;
      this.y = y ?? this.y;
    }

    this.updateConnectionPosition();

    this.onViewportMove();
  }

  onBeingScaled(
    width: number = this.nodeWidth,
    height: number = this.nodeHeight,
    maintainAspectRatio = false,
  ): void {
    this.resizeAndDraw(width, height, maintainAspectRatio);
  }

  resizeAndDraw(
    width: number = this.nodeWidth,
    height: number = this.nodeHeight,
    maintainAspectRatio = false,
  ): void {
    if (this.destroyed) {
      return;
    }
    // set new size
    let newNodeWidth = Math.max(width, this.getMinNodeWidth());
    let newNodeHeight = Math.max(height, this.getMinNodeHeight());

    if (maintainAspectRatio) {
      const oldWidth = this.nodeWidth;
      const oldHeight = this.nodeHeight;
      const newRect = calculateAspectRatioFit(
        oldWidth,
        oldHeight,
        newNodeWidth,
        newNodeHeight,
        this.getMinNodeWidth(),
        this.getMinNodeHeight(),
      );
      newNodeWidth = newRect.width;
      newNodeHeight = newRect.height;
    }

    this.nodeHeight = newNodeHeight;
    this.nodeWidth = newNodeWidth;
    if (this.getIsSimpleStyleNode()) {
      this._NodeTextStringRef.x = this.nodeWidth / 2;
      this._NodeTextStringRef.y = this.nodeHeight / 2;
    }
    // update node shape
    this.drawNodeShape();

    this.updateConnectionPosition();

    this.nodeSelectionHeader.x = NODE_MARGIN + this.nodeWidth - 86;

    this.onNodeResize(this.nodeWidth, this.nodeHeight);

    if (this.selected) {
      PPGraph.currentGraph.selection.drawRectanglesFromSelection();
    }
  }

  public resetSize(): void {
    this.resizeAndDraw(this.getDefaultNodeWidth(), this.getDefaultNodeHeight());
  }

  // get all sockets that are not part of the base kit for the node
  // do not include trigger sockets regardless of if they are default or not
  public getAllNonDefaultInputSockets(): Socket[] {
    const defaultIONames = this.getAllInitialSockets()
      .filter((socket) => socket.isInput())
      .map((socket) => socket.name);
    const nonDefault = this.inputSocketArray.filter(
      (socket) => !defaultIONames.includes(socket.name),
    );
    return nonDefault;
  }

  public getAllInputSockets(): Socket[] {
    return this.inputSocketArray.concat(this.nodeTriggerSocketArray);
  }

  // Left-side input sockets in top-to-bottom rendered order: trigger sockets are
  // drawn above the regular inputs (see drawTriggers/drawSockets), so anything
  // that reasons about vertical socket order (e.g. auto-align wire ordering)
  // must use this, not getAllInputSockets (which lists inputs first).
  public getAllInputSocketsInDisplayOrder(): Socket[] {
    return this.nodeTriggerSocketArray.concat(this.inputSocketArray);
  }

  // includes sockets which are dynamically added. See: DynamicInputNode
  public hasInputSockets(): boolean {
    return this.inputSocketArray.length > 0;
  }

  getDataSockets(): Socket[] {
    return this.inputSocketArray.concat(this.outputSocketArray);
  }

  getAllSockets(): Socket[] {
    return this.inputSocketArray.concat(
      this.nodeTriggerSocketArray,
      this.outputSocketArray,
    );
  }

  getNodeTriggerSocketByName(slotName: string): Socket {
    return this.nodeTriggerSocketArray.find((el) => el.name === slotName);
  }

  getInputSocketByName(slotName: string): Socket {
    return this.inputSocketArray.find((el) => el.name === slotName);
  }

  getInputOrTriggerSocketByName(
    slotName: string,
    createIfNotExisting = true,
  ): Socket {
    const found = this.getAllInputSockets().find((el) => el.name === slotName);
    if (found === undefined && createIfNotExisting) {
      // create new socket for this ask, maybe this is a bit ugly
      console.log(
        'creating new socket because someone is trying to get a socket that didnt exist: ' +
          slotName,
      );
      const newSocket = new Socket(SOCKET_TYPE.IN, slotName, new AnyType());
      this.addSocket(newSocket);
      this.resizeAndDraw();
      return newSocket;
    } else {
      return found;
    }
  }

  getOutputSocketByName(slotName: string): Socket {
    return this.outputSocketArray.find((el) => el.name === slotName);
  }

  public getSocketByName(name: string): Socket {
    return this.getAllSockets().find((socket) => socket.name === name);
  }

  public getSocketByNameAndType(name: string, socketType: TSocketType): Socket {
    switch (socketType) {
      case SOCKET_TYPE.TRIGGER: {
        return this.getNodeTriggerSocketByName(name);
      }
      case SOCKET_TYPE.IN: {
        return this.getInputSocketByName(name);
      }
      case SOCKET_TYPE.OUT: {
        return this.getOutputSocketByName(name);
      }
      default:
        return;
    }
  }

  public drawErrorBoundary(): void {
    if (!this.hasBeenAdded) {
      return;
    }

    this._ErrorBoundaryRef.clear();
    this.errorBoundaryIsDrawn = false;
    const status = this.getWorstStatus();
    if (!status) {
      return;
    }

    const scale = PPNode.currentViewportScale();
    const offset = ERROR_BOUNDARY_SCREEN_OFFSET / scale;
    const nodeRadius = this.getCornerRadius();

    this._ErrorBoundaryRef
      .roundRect(
        NODE_MARGIN - offset * 1.5,
        -offset * 1.5,
        this.nodeWidth + offset * 3,
        this.nodeHeight + offset * 3,
        nodeRadius ? nodeRadius + offset : 0,
      )
      .stroke({
        width: ERROR_BOUNDARY_SCREEN_WIDTH / Math.max(0.3, scale),
        color: status.getColor().hexNumber(),
        alpha: 1,
      });
    this.errorBoundaryIsDrawn = true;
  }

  public drawBackground(): void {
    this._BackgroundGraphicsRef
      .roundRect(
        NODE_MARGIN,
        0,
        this.nodeWidth,
        this.nodeHeight,
        this.getCornerRadius(),
      )
      .fill({
        color: this.getColor().hexNumber(),
        alpha: this.getOpacity(),
      });
  }

  public drawTriggers(): void {
    this.nodeTriggerSocketArray
      .filter((item) => item.visible)
      .forEach((item, index) => {
        item.y = this.headerHeight + index * SOCKET_HEIGHT;
        item.redraw();
      });
  }

  public drawSockets(): void {
    const triggerHeight = this.countOfVisibleNodeTriggerSockets * SOCKET_HEIGHT;
    const outputHeight = this.countOfVisibleOutputSockets * SOCKET_HEIGHT;
    this.outputSocketArray
      .filter((item) => item.visible)
      .forEach((item, index) => {
        item.y = this.headerHeight + triggerHeight + index * SOCKET_HEIGHT;
        item.redraw();
      });

    this.inputSocketArray
      .filter((item) => item.visible)
      .forEach((item, index) => {
        item.y =
          this.headerHeight +
          triggerHeight +
          (!this.getParallelInputsOutputs() ? outputHeight : 0) +
          index * SOCKET_HEIGHT;
        item.redraw();
      });
  }

  // y position immediately below the trigger/output/input socket columns -
  protected getGhostSocketY(): number {
    const triggerHeight = this.countOfVisibleNodeTriggerSockets * SOCKET_HEIGHT;
    const outputHeight = this.countOfVisibleOutputSockets * SOCKET_HEIGHT;
    const inputHeight = this.countOfVisibleInputSockets * SOCKET_HEIGHT;
    const combinedInputOutput = !this.getParallelInputsOutputs()
      ? outputHeight + inputHeight
      : inputHeight;
    return this.headerHeight + triggerHeight + combinedInputOutput;
  }

  public getWarningsAndErrors(): PNPStatus[] {
    const collected: PNPStatus[] = [];
    const consider = (status: PNPStatus) => {
      if (status.getSeverity() >= STATUS_SEVERITY.WARNING) {
        collected.push(status);
      }
    };
    const aggregated = this.status.socket;
    consider(this.status.node);
    consider(aggregated);
    this.getAllSockets().forEach((socket) => {
      const isTheAggregate =
        aggregated === socket.status ||
        (!(aggregated instanceof SocketParsingWarning) &&
          aggregated.message?.includes(socket.status.message));
      if (isTheAggregate) {
        return;
      }
      consider(socket.status);
    });
    return collected.sort((a, b) => b.getSeverity() - a.getSeverity());
  }

  public getWorstStatus(): PNPStatus | undefined {
    return this.getWarningsAndErrors()[0];
  }

  protected static currentViewportScale(): number {
    return PPGraph.currentGraph?.viewportScaleX || 1;
  }

  // Where the custom status pills begin, in node local space. Exposed so a
  // subclass whose own content covers the node can shift them off it without
  // having to know how the offset is built.
  protected getStatusesStartY(): number {
    return (
      (this.countOfVisibleOutputSockets +
        this.countOfVisibleNodeTriggerSockets) *
        SOCKET_HEIGHT +
      40
    );
  }

  protected drawStatuses(): void {
    if (!this.hasBeenAdded) {
      return;
    }

    this._StatusesRef.clear();
    this._StatusesRef.removeChildren().forEach((child) => child.destroy());

    const padding = 5;
    let startY = this.getStatusesStartY();

    const maxPillWidth = Math.max(40, this.nodeWidth - 12);
    const statusTextStyle = new TextStyle({
      fontSize: 18,
      fill: COLOR_MAIN,
      wordWrap: true,
      wordWrapWidth: maxPillWidth - padding * 2,
    });

    this.status.custom.forEach((nStatus) => {
      const text = new PIXI.Text({
        text: nStatus.message,
        style: statusTextStyle,
      });
      const pillWidth = Math.min(text.width + padding * 2, maxPillWidth);
      const pillX = NODE_MARGIN + this.nodeWidth - pillWidth - 6;
      text.x = pillX + padding;
      text.y = startY + padding;
      this._StatusesRef.addChild(text);
      this._StatusesRef
        .roundRect(
          pillX,
          startY,
          pillWidth,
          text.height + padding * 2,
          NODE_CORNERRADIUS,
        )
        .fill(nStatus.getColor().hexNumber());
      startY += text.height + padding;
    });

    this.statusBadges.draw();
  }

  public refreshZoomInvariantVisuals(): void {
    if (!this.hasBeenAdded || this.destroyed) {
      return;
    }
    if (this.statusBadges.isDrawn) {
      this.statusBadges.applyTransform();
    }
    if (this.errorBoundaryIsDrawn) {
      this.drawErrorBoundary();
    }
    this.getAllSockets().forEach((socket) =>
      socket.refreshZoomInvariantInteractivity(),
    );
  }

  protected getHitArea(): PNPHitArea {
    let rect = new PIXI.Rectangle(0, 0, this.nodeWidth, this.nodeHeight);
    rect = PPNode.boundsToSelectionBounds(rect);
    return new PNPHitArea((x, y) => {
      if (rect.contains(x, y)) {
        return true;
      }
      if (this.statusBadges.containsPoint(x, y)) {
        return true;
      }
      // zoomed out far enough, the node itself is the only thing worth hitting
      if (!Socket.hitTestingEnabled()) {
        return false;
      }
      // Pixi hit tests every node on every pointer move, so the socket scan
      // has to be unreachable for nodes the pointer is nowhere near. Sockets
      // never reach further than one hit radius past the node bounds.
      const reach = Socket.worldHitRadius();
      return (
        x >= rect.x - reach &&
        x <= rect.right + reach &&
        y >= rect.y - reach &&
        y <= rect.bottom + reach &&
        this.isPointNearVisibleSocket(x, y)
      );
    });
  }

  // x/y in node local space; needed so that the zoom invariant socket hit
  // areas are not pruned by the node's own hit area when they extend beyond
  // the node bounds (PIXI prunes children outside a parent's hitArea)
  protected isPointNearVisibleSocket(x: number, y: number): boolean {
    return this.getAllSockets().some(
      (socket) =>
        socket.visible &&
        socket.isWithinZoomInvariantHitRadius(x - socket.x, y - socket.y),
    );
  }

  public getForegroundDimensions(): { width: number; height: number } {
    if (!this._ForegroundRef) {
      return { width: 0, height: 0 };
    }

    const bounds = this._ForegroundRef.getLocalBounds();
    return {
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
    };
  }

  THROTTLE_DEBOUNCE_DRAWING_MIN_TIME = 100;

  private animationFrameRedraw() {
    cancelAnimationFrame(this.lastRenderID);
    this.lastRenderID = requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.drawNodeShape();
      }
    });
  }

  protected debounceDrawShape = debounce(
    this.animationFrameRedraw,
    this.THROTTLE_DEBOUNCE_DRAWING_MIN_TIME,
  );

  public drawNodeShape(): void {
    if (!this.hasBeenAdded) {
      return;
    }
    this.debug_timesDrawn += 1;
    //console.log('drawing node shape: ' + this.name);
    //console.trace();
    // update selection

    this._BackgroundGraphicsRef.clear();
    this.drawErrorBoundary();
    this.drawBackground();

    this.drawTriggers();
    this.drawSockets();
    this.drawDebugInfo();
    this.drawStatuses();
    this._NodeTextStringRef.text = this.getNodeTextString()[0];
    this.hasBeenDrawn = true;

    this.hitArea = this.getHitArea();
  }

  constructSocketName(prefix: string, existing: Socket[]): string {
    let count = 1;
    let newName = prefix + ' ' + count;
    while (existing.find((socket) => socket.name === newName)) {
      newName = prefix + ' ' + count++;
    }
    return newName;
  }

  public addDefaultTrigger(): void {
    this.addTrigger(
      this.constructSocketName('Trigger', this.nodeTriggerSocketArray),
      new TriggerType(),
    );
  }

  public addDefaultOutput(): void {
    this.addOutput(
      this.constructSocketName('Custom Output', this.outputSocketArray),
      new AnyType(),
    );
  }

  updateConnectionPosition(): void {
    // check for connections and move them too
    this.getAllSockets().forEach((socket) => {
      socket.links.forEach((link) => {
        link.updateConnectionDrawing();
      });
    });
  }

  public setStatus(status: PNPStatus, type: 'node' | 'socket' = 'node') {
    const currentMessage = JSON.stringify(this.status[type].message);
    const newMessage = JSON.stringify(status.message);
    if (currentMessage !== newMessage) {
      this.status[type] = status;
      this.drawStatuses();
      this.drawErrorBoundary();
      this.notifyStatusChanged();
    }
  }

  public pushExclusiveCustomStatus(status: PNPStatus) {
    this.status.custom = [];
    this.status.custom.push(status);
    this.notifyStatusChanged();
  }

  private notifyStatusChanged(): void {
    InterfaceController.notifyListeners(ListenEvent.NodeStatusChanged, {
      nodeId: this.id,
    });
  }

  adaptToSocketErrors(): void {
    const hasWarningsOrErrors = this.getAllSockets().some(
      (socket) => socket.status.getSeverity() >= STATUS_SEVERITY.WARNING,
    );
    if (!hasWarningsOrErrors) {
      this.setStatus(new PNPSuccess(), 'socket');
      this.drawStatuses();
      this.drawErrorBoundary();
    }
  }

  drawDebugInfo(): void {
    if (!this.hasBeenAdded) {
      return;
    }

    this._CommentRef.removeChildren();
    if (PPGraph.currentGraph._showDebugInfo) {
      const bounds = this.getLocalBounds();
      const debugText = new PIXI.Text({
        text: `${this.id}
${Math.round(this.position.x)}, ${Math.round(this.position.y)}
${Math.round(bounds.minX)}, ${Math.round(
          bounds.minY,
        )}, ${Math.round(bounds.maxX)}, ${Math.round(bounds.maxY)}, Execution time: ${this.lastExecutionTime}, `,
        style: COMMENT_TEXTSTYLE,
      });
      debugText.resolution = 1;

      debugText.x = getNodeCommentPosX(this.width);
      debugText.y = getNodeCommentPosY() - 48;

      this._CommentRef.addChild(debugText);
    }
  }

  public setComment(text: string): void {
    this.comment = text;
    this.drawNodeShape();
  }

  screenPointBackgroundRectTopLeft(): PIXI.Point {
    return PPGraph.currentGraph.viewport.toScreen(this.x + NODE_MARGIN, this.y);
  }

  screenPointBackgroundRectCenter(): PIXI.Point {
    return PPGraph.currentGraph.viewport.toScreen(
      this.x + NODE_MARGIN + this._BackgroundGraphicsRef.width / 2,
      this.y + this._BackgroundGraphicsRef.height / 2,
    );
  }

  // avoid calling this directly when possible, instead use the input/output objects in onExecute and keep it encapsulated in that flow (not always possible but most of the time is)
  public setInputData(name: string, data: any): void {
    const inputSocket = this.inputSocketArray.find((input: Socket) => {
      return name === input.name;
    });

    if (!inputSocket) {
      console.error('No input socket found with the name: ', name);
      return;
    }

    inputSocket.data = data;
  }

  private static getArrayData(array: Socket[], name: string) {
    const socket = array.find((input: Socket) => {
      return name === input.name;
    });

    if (!socket) {
      return undefined;
    }

    return socket.data;
  }

  // avoid calling this directly when possible
  public getInputData(name: string): any {
    return PPNode.getArrayData(this.inputSocketArray, name);
  }

  // avoid calling this directly when possible
  public getOutputData(name: string): any {
    return PPNode.getArrayData(this.outputSocketArray, name);
  }

  // avoid calling this directly if possible, instead use the input/output objects in onExecute
  public setOutputData(name: string, data: any): void {
    const outputSocket = this.outputSocketArray.find((output: Socket) => {
      return name === output.name;
    });
    if (outputSocket) {
      outputSocket.data = data;
    } else {
      console.warn('Failed to set socket data on socket: ' + name);
    }
  }

  async tick(currentTime: number, deltaTime: number): Promise<void> {
    if (
      this.updateBehaviour?.interval &&
      currentTime - this.lastTimeTicked >=
        this.updateBehaviour?.intervalFrequency
    ) {
      this.lastTimeTicked = currentTime;
      await this.executeOptimizedChain();
    }
  }

  static remapInput(sockets: Socket[]): any {
    const inputObject = {};
    sockets.forEach((input: Socket) => {
      inputObject[input.name] = input.data;
    });
    return inputObject;
  }

  protected getInputObject(): any {
    return PPNode.remapInput(this.inputSocketArray);
  }

  // if you want to optimize the mapping of arguments, override this function instead of execute(), but most of the time just override onExecute()
  protected async rawExecute(): Promise<void> {
    if (!this.hasBeenAdded) {
      return;
    }

    this.debug_timesExecuted++;
    // remap input
    const inputObject = this.getInputObject();
    const outputObject = {};

    await this.onExecute(inputObject, outputObject);

    // output whatever the user has put in
    this.outputSocketArray.forEach((output: Socket) => {
      if (outputObject[output.name] !== undefined) {
        output.data = outputObject[output.name];
      }
    });
  }

  TIME_BEFORE_SLOW_EXECUTION_SHOWS = 500;

  public renderSlowExecutionDebounce = debounce(async () => {
    await this.renderSlowExecutionGraphic();
  }, this.TIME_BEFORE_SLOW_EXECUTION_SHOWS);

  public renderSpinnerDebounce = debounce(async () => {
    let started = false;
    if (!this.destroyed && this.isExecuting) {
      InterfaceController.showSpinner('Executing ' + this.name);
      started = true;
    }
    while (!this.destroyed && this.isExecuting && started) {
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    if (started) {
      InterfaceController.hideSpinner('Executing ' + this.name);
    }
  }, this.TIME_BEFORE_SLOW_EXECUTION_SHOWS);

  public renderSlowExecutionGraphic = async () => {
    if (!this.destroyed && this.isExecuting) {
      this.isDrawingSlowExecutionGraphic = true;
      if (this._SlowExecutionGraphics == undefined) {
        this._SlowExecutionGraphics = new PIXI.Graphics();
        const radius = 30;
        let angle = 0;
        const segments = 15;
        for (let i = 0; i < segments; i++) {
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          this._SlowExecutionGraphics.circle(x, y, 5);
          angle += (2 * Math.PI) / segments;
        }
        this._SlowExecutionGraphics.fill({ color: 0xffffff, alpha: 0.7 });
        this._SlowExecutionGraphics.y = -50;
        this._SlowExecutionGraphics.x = this.nodeWidth / 2;
      }
      this.addChild(this._SlowExecutionGraphics);
      const start = Date.now();
      const timeUntilMaxAlpha = 1000;
      while (this.isDrawingSlowExecutionGraphic) {
        const curr = Date.now() - start;
        this._SlowExecutionGraphics.rotation = (curr - start) / 500;
        this._SlowExecutionGraphics.alpha = Math.min(
          1,
          Math.max(0, curr / timeUntilMaxAlpha),
        );
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      this.removeChild(this._SlowExecutionGraphics);
    }
  };
  public removeSlowExecutionGraphic() {
    this.isDrawingSlowExecutionGraphic = false;
    if (this._SlowExecutionGraphics !== undefined) {
      this.removeChild(this._SlowExecutionGraphics);
    }
  }

  public renderOutlineThrottled = throttle(this.drawExecutionVisualizer, 500, {
    trailing: false,
    leading: true,
  });

  private async drawExecutionVisualizer(): Promise<void> {
    if (!this.hasBeenAdded || this.destroyed || !this.executionFilter) {
      return;
    }

    // SOMETHING IS WRONG WITH FILTERS THEY MAKE THE NODE INVISIBLE WHEN COMBINED
    /*await drawExecutionFilter(
      this.executionFilter,
      this._BackgroundGraphicsRef,
    );*/
  }

  // Don't call this from outside unless you know very well what you are doing, you are probably looking for executeOptimizedChain()
  public async execute(): Promise<void> {
    this.setStatus(new PNPSuccess());
    if (this.isExecuting) {
      this.wantsToExecute = true;
      return;
    }
    this.isExecuting = true;
    try {
      this.removeSlowExecutionGraphic();
      if (PPGraph.currentGraph.showExecutionVisualisation && this.isVisible()) {
        this.renderOutlineThrottled();
        this.renderSlowExecutionDebounce();
      }
      this.renderSpinnerDebounce();
      const pre = Date.now();
      await this.rawExecute();
      const post = Date.now();
      this.lastExecutionTime = post - pre;
      if (PPGraph.currentGraph.showExecutionVisualisation && this.isVisible()) {
        this.outputSocketArray.forEach((socket) => {
          socket.links.forEach((link) => link.renderOutlineThrottled());
        });
      }

      // Notify listeners after execution
      this.notifyExecutionListeners();

      this.drawDebugInfo();
      this.isExecuting = false;
      this.removeSlowExecutionGraphic();
    } catch (error) {
      this.removeSlowExecutionGraphic();
      const errorText = error?.stack == undefined ? error : error.stack;
      this.isExecuting = false;
      if (error instanceof PNPError) {
        this.setStatus(error);
      } else {
        this.setStatus(new NodeExecutionError(errorText));
      }
      console.warn(
        `Node ${this.name}(${this.id}) execution error:  ${errorText}`,
      );

      // set default data on output sockets, dont let data just linger around
      this.outputSocketArray.forEach(
        (socket) => (socket.data = socket.dataType.getDefaultValue()),
      );
    }
    // previous run was cancelled - pick it up here and run again
    if (this.wantsToExecute) {
      this.wantsToExecute = false;
      console.log('Picking up execution desired from before: ' + this.name);
      await this.execute();
    }
  }

  // helper function for nodes who want execution to just be a passthrough
  protected async passThrough(input, output): Promise<void> {
    Object.keys(input).forEach((key) => {
      output[key] = input[key];
    });
  }

  // SETUP

  _addListeners(): void {
    this.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.addEventListener('pointerover', this.onPointerOver.bind(this));
    this.addEventListener('pointerout', this.onPointerOut.bind(this));
    this.addEventListener('click', this.onPointerClick.bind(this));
    this.addEventListener('removed', this.onRemoved.bind(this));

    this.onViewportPointerUpHandler = this.onViewportPointerUp.bind(this);
    this.onViewportMoveHandler = this.onViewportMove.bind(this);
    PPGraph.currentGraph.viewport.addEventListener(
      'moved',
      (this as any).onViewportMoveHandler,
    );
  }

  async onPointerDown(event: PIXI.FederatedPointerEvent): Promise<void> {
    console.log('Node: onPointerDown');
    clearDocumentSelection();
    InterfaceController.spamToast(
      `${event.shiftKey ? 'node_shift_clicked' : 'node_clicked'} ${this.id}`,
    );
    event.stopPropagation();
    const eventTarget = event.target;
    PPGraph.currentGraph.viewport.plugins.resume('mouse-edges');

    if (eventTarget == this) {
      const selection = PPGraph.currentGraph.selection;
      if (event.shiftKey) {
        selection.beginPendingClick(this, event, {
          clearExistingSelection: false,
          isShiftClick: true,
          wasOnlySelectedAtPointerDown: false,
        });
        await selection.beginNodePointerInteraction(event);
      } else if (PPGraph.currentGraph.socketFocus.hovered != undefined) {
        // this clause is a bit hacky, it happened for me under some edge cases where i would drag the selected node (macro in my case) instead of dragging socket connection
        PPGraph.currentGraph.socketFocus.hovered.onSocketPointerDown(event);
      } else {
        selection.beginPendingClick(this, event, {
          clearExistingSelection: !this.selected,
          isShiftClick: false,
          wasOnlySelectedAtPointerDown: selection.isOnlySelectedNode(this),
        });
        await selection.beginNodePointerInteraction(event);
      }

      // Keep dashboard widget selection in sync while editing
      if (InterfaceController.isDashboardInEditMode) {
        const elementId = `NODE_${this.id}`;
        InterfaceController.selectDashboardItemByElementId(elementId);
      }

      const isDashboardVisible = Boolean(
        InterfaceController.getOverlayState().dashboard.visible,
      );

      if (!isDashboardVisible) {
        InterfaceController.setRightDrawerView(RightDrawerView.GRAPH);
      }
    }
    if (event.button == 2) {
      if (event.target == this) {
        InterfaceController.onRightClick(event, this);
      }
      PPGraph.currentGraph.selection.stopDragAction(event);
    }
  }

  public getNewSocketName(
    preferredName: string,
    existingSockets: Socket[] = this.inputSocketArray,
  ): string {
    const existing = this.getAllInputSockets();
    let newParamName = preferredName;
    let count: number = 2;
    // find a new param name that is unique
    while (existing.find((param) => param.name === newParamName)) {
      newParamName = preferredName + ' ' + count;
      count += 1;
    }
    return newParamName;
  }

  private static calculateCompatibility(
    otherSocket: Socket,
    preferredSocketName: string,
    socket: Socket,
  ) {
    const isPreferred = socket.name === preferredSocketName;
    const isVisible = socket.visible;
    const hasLink = socket.hasLink();
    const compatibility = socket.dataType.getCompatability(
      otherSocket.data,
      otherSocket.dataType,
    ).type;
    return (
      (isPreferred ? 1000 : 0) +
      (isVisible ? 100 : 0) +
      (hasLink ? 0 : 1) -
      compatibility
    );
  }

  public getSocketForNewConnection(socket: Socket): Socket {
    const socketArray = socket.isInput()
      ? this.outputSocketArray
      : this.inputSocketArray;
    const preferredSocketName = socket.isInput()
      ? this.getPreferredOutputSocketName()
      : this.getPreferredInputSocketName();
    if (socketArray.length > 0) {
      // get best match first, then others
      const sortedMatchQuality = socketArray.sort((s1: Socket, s2: Socket) => {
        return (
          PPNode.calculateCompatibility(socket, preferredSocketName, s2) -
          PPNode.calculateCompatibility(socket, preferredSocketName, s1)
        );
      });

      // make sure the best match is not incompatible
      if (
        IsCompatible(
          sortedMatchQuality[0].dataType.getCompatability(
            socket.data,
            socket.dataType,
          ).type,
        )
      ) {
        return sortedMatchQuality[0];
      }
    }

    InterfaceController.showSnackBar(
      'Failed to connect socket to node, no sockets on target or bad input data',
    );
    return undefined;
  }

  protected async mouseReleasedOverWithSourceSocketSelected(
    source: Socket,
  ): Promise<void> {
    await perform_action_connectNodeToSocket(source, this);
  }

  onPointerUp(event: PIXI.FederatedPointerEvent): void {
    PPGraph.currentGraph.viewport.plugins.pause('mouse-edges');

    const source = PPGraph.currentGraph.selectedSocket;
    const focused = PPGraph.currentGraph.socketFocus.focused;
    if (focused) {
      focused.onPointerUp(event);
      return;
    }
    if (source && this !== source.getNode()) {
      PPGraph.currentGraph.selectedSocket = undefined; // hack // ????
      this.mouseReleasedOverWithSourceSocketSelected(source);
    }

    const selection = PPGraph.currentGraph.selection;
    selection.resolvePendingClick(
      this,
      event,
      ({ event: resolvedEvent, wasOnlySelectedAtPointerDown }) => {
        this.onCanvasClickResolved({
          event: resolvedEvent,
          wasOnlySelectedAtPointerDown,
        });
      },
    );

    PPGraph.currentGraph.selection.stopDragAction(event);
  }

  protected onViewportMove(): void {}

  onRemoved(): void {
    // remove added listener from graph.viewport
    PPGraph.currentGraph.viewport.removeEventListener(
      'moved',
      this.onViewportMoveHandler,
    );

    // Clean up event listeners
    this.removeAllListeners();
    InterfaceController.removeListeners(this.listenId);
    this.executionListeners.clear();

    // Clean up socket connections
    const sockets = this.getAllSockets();
    for (let i = 0; i < sockets.length; i++) {
      const socket = sockets[i];
      socket.links.forEach((link) => link.delete());
      socket.destroy({});
    }

    // Clear references
    this.filters = [];
    this.executionFilter = undefined;
    this.dropShadowFilter = undefined;

    this.onNodeRemoved();
  }

  OFFSET_TRANSLATION_ITERATION = 0.02;
  BLUR_CHANGE_ITERATION = 0.05;
  HOVER_SHADOW_ALPHA = 0.3;
  MAX_HOVER_CHANGE_ITERATIONS = 10;

  protected visualOffsetXY(x: number, y: number) {
    this.x += x;
    this.y += y;
  }

  private changeHoverState(increase: boolean) {
    if (this.destroyed) {
      return;
    }
    const curr = increase ? this.hoverState : this.hoverState - 1;

    const cosFactor = this.MAX_HOVER_CHANGE_ITERATIONS - curr;
    let changeXY = -this.OFFSET_TRANSLATION_ITERATION * cosFactor;
    let changeBlur = this.OFFSET_TRANSLATION_ITERATION * cosFactor;
    if (!increase) {
      changeXY = -changeXY;
      changeBlur = -changeBlur;
    }
    this.visualOffsetXY(changeXY, changeXY);
    this.dropShadowFilter.offset.x -= changeXY;
    this.dropShadowFilter.offset.y -= changeXY;

    this.dropShadowFilter.blur += changeBlur;
    this.dropShadowFilter.blur = Math.max(0.01, this.dropShadowFilter.blur);
    this.updateConnectionPosition();
    this.hoverState = Math.max(
      0,
      Math.min(
        this.MAX_HOVER_CHANGE_ITERATIONS,
        this.hoverState + (increase ? 1 : -1),
      ),
    );
  }

  private async selectionFilterIn() {
    this.hoverDirectionUp = true;
    if (!this.dropShadowFilter) {
      this.dropShadowFilter = new DropShadowFilter({
        offset: new PIXI.Point(0.01, 0.01),
        blur: this.BLUR_CHANGE_ITERATION,
        alpha: this.HOVER_SHADOW_ALPHA,
      });
      this.dropShadowFilter.resolution = 2;
    }
    this.filters = [this.dropShadowFilter];
    while (
      this.hoverDirectionUp &&
      this.hoverState < this.MAX_HOVER_CHANGE_ITERATIONS &&
      !this.destroyed
    ) {
      this.changeHoverState(true);
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  private async selectionFilterOut() {
    this.hoverDirectionUp = false;
    while (!this.hoverDirectionUp && this.hoverState > 0 && !this.destroyed) {
      this.changeHoverState(false);
      await new Promise((r) => setTimeout(r, 16));
    }
    if (!this.hoverDirectionUp && !this.destroyed) {
      this.filters = [];
      // a pointerout can arrive without a preceding pointerover having
      // created the filter (e.g. the viewport moved/zoomed under a
      // stationary pointer), so it may not exist yet
      if (this.dropShadowFilter) {
        this.dropShadowFilter.offset.set(0, 0);
        this.dropShadowFilter.blur = this.BLUR_CHANGE_ITERATION;
      }
      this.x = Math.round(this.x);
      this.y = Math.round(this.y);
    }
  }
  onPointerOver(): void {
    if (this.isHovering) {
      return;
    }
    this.isHovering = true;
    this.cursor = 'move'; // Show move cursor on hover
    this.updateBehaviour.graphics.redrawAnythingChanging();
    this.nodeSelectionHeader.redrawAnythingChanging(true);
    this.selectionFilterIn();
  }

  onPointerOut(): void {
    this.isHovering = false;
    this.cursor = 'auto'; // Reset cursor
    this.updateBehaviour.graphics.redrawAnythingChanging();
    this.nodeSelectionHeader.redrawAnythingChanging(false);
    this.selectionFilterOut();
  }

  onPointerClick(event: PIXI.FederatedPointerEvent): void {
    // check if double clicked
    if (event.detail === ONCLICK_DOUBLECLICK) {
      //event.stopPropagation();
      this.listenId.push(
        InterfaceController.addListener(
          ListenEvent.EscapeKeyUsed,
          this.onViewportPointerUpHandler,
        ),
      );
      if (this.onNodeDoubleClick) {
        this.onNodeDoubleClick(event);
      }
    }
  }

  onViewportPointerUp(): void {
    InterfaceController.removeListeners(this.listenId);
  }

  public hasSocketNameInDefaultIO(name: string, type: TSocketType): boolean {
    return (
      this.getAllInitialSockets().find(
        (socket) => socket.name == name && socket.socketType == type,
      ) !== undefined
    );
  }

  // Throttled version of metaInfoChanged for better performance
  private throttledMetaInfoChanged = throttle(() => {
    if (!this.destroyed) {
      this.resizeAndDraw();
      this.updateConnectionPosition();
    }
  }, 100);

  // mean to be overridden with custom behaviour

  public metaInfoChanged(): void {
    this.throttledMetaInfoChanged();
  }

  // This is the main one you'll want to override this in child classes
  protected async onExecute(input, output): Promise<void> {
    // just define function
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(
      true,
      true,
      false,
      DEFAULT_UPDATE_FREQUENCY,
      this,
    );
  }

  public allowResize(): boolean {
    return true;
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }

  protected getDefaultIO(): Socket[] {
    return [];
  }

  public getShowNodeNameLabel(): boolean {
    return this.getShowLabels() || this.getIsSimpleStyleNode();
  }

  public getShowLabels(): boolean {
    return true;
  }

  public getIsSimpleStyleNode(): boolean {
    return false;
  }

  public getDefaultNodeWidth(): number {
    return this.getMinNodeWidth();
  }

  public getDefaultNodeHeight(): number {
    return this.getMinNodeHeight();
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DEFAULT);
  }

  public getSocketDisplayName(socket: Socket): string {
    let usedName = socket.name;
    let maxCharacters = 10;
    try {
      maxCharacters = this.nodeWidth / (SOCKET_TEXTSTYLE.fontSize * 0.7); //0.7 is magic number, this is not exactly right for some reason, in text editor "this" is undefined when this is called, not sure why, TODO fix this (in text editor most likely)
    } catch (e) {
      console.warn(
        'Exception when trying to catch this.width in: ' + this.name,
      );
    }
    if (usedName.length > maxCharacters) {
      usedName = usedName.substring(0, maxCharacters) + '...';
    }
    return usedName;
  }

  public isLayoutable(): boolean {
    return false;
  }

  /**
   * Indicates if this is a widget node that should always be interactive in canvas mode.
   * Override this in HybridNode2 subclasses to return true for pure widgets (buttons, sliders, etc.)
   * @returns false by default (most nodes are not widgets)
   */
  public isWidget(): boolean {
    return false;
  }

  public reactsToCombineDrawKeyBinding(): boolean {
    return false;
  }

  // for hybrid/transparent nodes, set this value to 0.01, if set to 0, the node is not clickable/selectable anymore
  public getOpacity(): number {
    return 1;
  }

  public getCanAddInput(): boolean {
    return false;
  }

  public getShouldShowHoverActions(): boolean {
    return true;
  }

  public getParallelInputsOutputs(): boolean {
    return false;
  }

  public getRoundedCorners(): boolean {
    return true;
  }

  public getCornerRadius(): number {
    return this.getRoundedCorners() ? NODE_CORNERRADIUS : 0;
  }

  getPreferredInputSocketName(): string {
    return 'MyPreferredInputSocket';
  }

  getPreferredOutputSocketName(): string {
    return 'MyPreferredOutputSocket';
  }

  public getInputSocketXPos(): number {
    return 0;
  }
  public getOutputSocketXPos(): number {
    return this.nodeWidth;
  }

  public getShrinkOnSocketRemove(): boolean {
    return true;
  }

  public isCallingMacro(macroName: string): boolean {
    return false;
  }

  public calledMacroChangedName(oldName: string, newName: string): void {}

  /**
   * Called when an HTMLEventListener is renamed.
   * Override in nodes that need to update listener references (e.g., HTML nodes).
   */
  public updateListenerReferences(oldName: string, newName: string): void {}

  /**
   * Called to dispatch an HTML event to listener nodes.
   * Override in HTMLEventListener to handle events when the listener name matches.
   */
  public dispatchHTMLEvent(
    listenerName: string,
    eventType: string,
    customData: Record<string, unknown>,
    eventDetails: Record<string, unknown>,
  ): void {}

  MACRO_DEBOUNCE_TIME = 200;
  private macroDebouncedExecution = debounce(() => {
    FlowLogic.addPendingExecution(this.id);
  }, this.MACRO_DEBOUNCE_TIME);

  public calledMacroUpdated(): void {
    if (
      this.updateBehaviour.update &&
      PPGraph.currentGraph.graphConfiguredAndReady &&
      !this.isExecuting
    ) {
      this.macroDebouncedExecution();
    }
  }

  public calledMacroUpdatedMeta(): void {
    this.debounceDrawShape();
  }

  // we should migrate all nodes to use these functions instead of specifying the field themselves in constructor
  public getName(): string {
    return this.name;
  }

  public getDescription(): string {
    return '';
  }

  // displayed in the info tab and can contain HTML
  // not visible when searching nodes
  public getAdditionalDescription(): string {
    return '';
  }

  // Markdown documentation for the integrated AI agent (never shown to users).
  // Fetched on demand via the describe_node MCP tool; keep getDescription()
  // short and user-facing, and put agent-relevant usage detail here.
  public getAIDocs(): string {
    return '';
  }

  // enable if a node example graph exists on github
  public hasExample(): boolean {
    return false;
  }

  public showInNodeSearch(): boolean {
    return true;
  }

  // used when searching for nodes
  public getTags(): string[] {
    return [];
  }

  // a little bit hacky, nodes that mess with execution themselves should be last
  public executionOrder(): number {
    return 0;
  }

  public getPreferredNodesPerSocket(socket: Socket): string[] {
    return socket.isInput()
      ? socket.dataType.recommendedInputNodeWidgets()
      : socket.dataType.recommendedOutputNodeWidgets();
  }

  // observers

  // recreate a dynamically-managed input socket that was removed on unplug
  // (used when restoring links on undo); return undefined to fall back to a
  // plain auto-created socket
  public recreateDynamicSocket(
    sourceSocket: Socket,
    name: string,
  ): Socket | undefined {
    return undefined;
  }

  public socketTypeChanged(): void {}
  public nameChanged(newName: string): void {}
  public inputPlugged(socket: Socket): void {
    if (this.shouldAutoSetValues && !this.hasAutoSetValues) {
      this.autoSetDefaultValues();
      this.hasAutoSetValues = true;
    }
  }

  // just got pasted into the graph
  public async pasted() {
    this.inputSocketArray
      .filter((socket) => !socket.links.length)
      .forEach((socket) => this.inputUnplugged(socket));
  }

  public inputUnplugged(socket: Socket): void {}
  public outputPlugged(socket: Socket): void {}
  public outputUnplugged(socket: Socket): void {}

  protected socketAdded(): void {}
  protected socketRemoved(): void {}

  // content here means that if an output gets plugged immediately we take that linked value and send it back to the input

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: undefined,
      SocketToGetOptions: undefined,
      SocketToTakeName: undefined,
    };
  }

  // incoming socket is always an input socket, but we are not connected to it yet
  public async populateDefaults(inputSocket: Socket): Promise<void> {
    const propagationTarget = this.getBackPropagationTargets();
    if (propagationTarget.SocketToTakeName !== undefined) {
      propagationTarget.SocketToTakeName.data = inputSocket.name;
    }
    if (
      inputSocket.socketType == SOCKET_TYPE.IN &&
      propagationTarget.SocketToGetValue !== undefined &&
      IsCompatible(
        propagationTarget.SocketToGetValue.dataType.getCompatability(
          inputSocket.data,
          inputSocket.dataType,
        ).type,
      )
    ) {
      propagationTarget.SocketToGetValue.data = inputSocket.data;
    }

    const backPropagationPayload: BackPropagationPayload =
      inputSocket.dataType.getBackPropagationPayload(inputSocket.data);
    Object.entries(backPropagationPayload).forEach(([key, value]) => {
      const targetSocket = propagationTarget[key];
      if (targetSocket !== undefined && value !== undefined) {
        targetSocket.data = structuredClone(value);
      }
    });
  }

  // these are imported before node is added to the graph
  public getDynamicImports(): string[] {
    return [];
  }

  // hacky helper, was a problem with "Button" node specifically where we wanted the button to update the label
  public socketChangedFromWidget() {}

  static EXTRA_NODE_SELECTION_MARGIN = 26;

  protected static boundsToSelectionBounds(bounds: PIXI.Rectangle) {
    bounds.x -= PPNode.EXTRA_NODE_SELECTION_MARGIN - SOCKET_WIDTH / 2;
    bounds.y -= PPNode.EXTRA_NODE_SELECTION_MARGIN;
    bounds.width += PPNode.EXTRA_NODE_SELECTION_MARGIN * 2;
    bounds.height += PPNode.EXTRA_NODE_SELECTION_MARGIN * 2;
    return bounds;
  }

  // GLOBAL COORDINATES
  public getSelectionBounds(): PIXI.Rectangle[] {
    let bounds = new PIXI.Rectangle(
      this.x,
      this.y,
      this.nodeWidth,
      this.nodeHeight,
    );
    bounds = PPNode.boundsToSelectionBounds(bounds);
    return [bounds];
  }

  getInputKeyOptions(
    name: string,
    allowIndex = true,
    allowConstant = false,
  ): any {
    const inputArray: any[] = this.getInputData(name);
    let toReturn = [{ text: ENTIRE_OBJECT_NAME }];
    if (allowIndex) {
      toReturn.push({ text: INDEX_NAME });
    }
    if (allowConstant) {
      toReturn.push({ text: CONSTANT_NAME });
    }
    if (
      inputArray != undefined &&
      inputArray.length > 0 &&
      inputArray[0] != undefined &&
      typeof inputArray[0] === 'object'
    ) {
      toReturn = toReturn.concat(
        Object.keys(inputArray[0]).map((key) => ({ text: key })),
      );
    }
    return toReturn;
  }

  // if you make breaking changes to a node it is recommended up increment this and also handle migration in the migrate function
  public getVersion(): number {
    return 1;
  }

  public async migrate(previousVersion: number): Promise<void> {}
  // helper function for migration
  protected async replaceSocketWithOtherSocket(
    oldSocket: Socket,
    newSocket: Socket,
  ) {
    const links = oldSocket.links;
    if (oldSocket.socketType !== newSocket.socketType) {
      console.error(
        'Unable to replace an a socket with another of incompatible type',
      );
      return;
    }
    if (links.length) {
      if (oldSocket.socketType == SOCKET_TYPE.IN) {
        const prevSource = links[0].getSource();
        await PPGraph.currentGraph.linkConnect(
          prevSource.getNode().id,
          prevSource.name,
          this.id,
          newSocket.name,
          true,
        );
      } else if (oldSocket.socketType == SOCKET_TYPE.OUT) {
        for (let i = 0; i < links.length; i++) {
          const prevTarget = links[i].getTarget();
          await PPGraph.currentGraph.linkConnect(
            this.id,
            newSocket.name,
            prevTarget.getNode().id,
            prevTarget.name,
            true,
          );
        }
      }
      while (oldSocket.links.length) {
        await PPGraph.currentGraph.linkDisconnect(
          oldSocket.links[0].getTarget().getNode().id,
          oldSocket.links[0].getTarget().name,
          false,
        );
      }
    }
    this.removeSocket(oldSocket);
  }

  // migration helper: renames an input socket from oldName to newName while
  // preserving both its links and its hand-set value.
  protected async renameInputSocketPreservingData(
    oldName: string,
    newName: string,
  ): Promise<void> {
    if (oldName === newName) {
      return;
    }
    const oldSocket = this.getInputSocketByName(oldName);
    if (!oldSocket) {
      return;
    }
    const existingNewSocket = this.getInputSocketByName(newName);
    if (existingNewSocket) {
      this.setInputData(newName, oldSocket.data);
      await this.replaceSocketWithOtherSocket(oldSocket, existingNewSocket);
    } else {
      await this.replaceSocketWithOtherSocket(
        oldSocket,
        new Socket(
          oldSocket.socketType,
          newName,
          oldSocket.dataType,
          oldSocket.data,
        ),
      );
    }
  }

  public shouldPropagateExecutionThrough(socket: Socket): boolean {
    return true;
  }

  public fadeAllNonPIXIParts(alpha: number): void {}

  isVisible(): boolean {
    const screenPointBackgroundRectTopLeft =
      this.screenPointBackgroundRectTopLeft();
    const screenX = screenPointBackgroundRectTopLeft.x;
    const screenY = screenPointBackgroundRectTopLeft.y;
    const scale = PPGraph.currentGraph.viewportScaleX;
    // Get the visible screen dimensions
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Calculate the scaled dimensions of the container
    const containerWidth = this.nodeWidth * scale;
    const containerHeight = this.nodeHeight * scale;

    // Check if the container is at least partially visible on screen
    const isVisible =
      screenX < screenWidth &&
      screenY < screenHeight &&
      screenX + containerWidth > 0 &&
      screenY + containerHeight > 0;
    return isVisible;
  }

  public deOverlap(
    direction = new PIXI.Point(0, 10),
    ignoreNodes: PPNode[] = [],
  ) {
    // move down Y until we dont overlap anything
    const ignoreIds = new Set(ignoreNodes.map((node) => node.id));
    const otherNodes = Object.values(PPGraph.currentGraph.nodes).filter(
      (node) => node.id !== this.id && !ignoreIds.has(node.id),
    );
    while (
      getObjectsInsideBounds(otherNodes, this.getSelectionBounds()[0]).filter(
        (node) => !node.allowOverlap(),
      ).length
    ) {
      this.setPosition(direction.x, direction.y, true);
    }
  }
  public allowOverlap(): boolean {
    return false;
  }

  // when doing auto align, certain nodes want custom behaviour (macro)
  public isPostPassForAutoAlign(): boolean {
    return false;
  }
  public postPassForAutoAlign(nodes: PPNode[], iterations: number): void {}

  // Outer chrome (in px) a post-pass node draws around its content during auto
  // align. The layout reserves this so wrapped components keep the component gap
  // to their neighbours instead of overlapping. 0 = no chrome.
  public getAutoAlignChromeMargin(): number {
    return 0;
  }
  // The content nodes a post-pass node will wrap, tagged with the chrome margin.
  public getAutoAlignContentNodes(): PPNode[] {
    return [];
  }

  // called after the first input data is set, DO override
  protected autoSetDefaultValues(): void {}

  public isDependentOnUserData(): boolean {
    return false;
  }

  public shouldExecuteOnStorageValueChanged(
    storageBackend: string,
    location: string,
    key: string,
  ): boolean {
    return false;
  }

  public shouldExecuteOnStateValueChanged(key: string): boolean {
    return false;
  }

  socketCanBeRemoved(selectedSocket: Socket) {
    return !this.hasSocketNameInDefaultIO(
      selectedSocket.name,
      selectedSocket.socketType,
    );
  }

  protected clearStatuses() {
    this.status.custom = [];
    this.drawStatuses();
    this.notifyStatusChanged();
  }

  protected pushExclusiveStatus(status: PNPCustomStatus) {
    this.status.custom = this.status.custom.filter(
      (existingStatus) => status.id !== existingStatus.id,
    );
    this.status.custom.push(status);
    this.drawStatuses();
    this.notifyStatusChanged();
  }

  protected pushStatusCode(statusCode: number): void {
    this.pushExclusiveStatus(
      new PNPCustomStatus(
        'Status: ' + statusCode,
        statusCode >= 400 ? ERROR_COLOR : SUCCESS_COLOR,
        'statuscode',
      ),
    );
  }

  public connectedTargetSocketChangedType(socket: Socket): void {
    return;
  }

  public getDismissOnBackdrop(): boolean {
    return true;
  }

  public getDismissOnEscape(): boolean {
    return true;
  }

  fullScreenDashboardClosed(): void {}
}

export class SmallNode extends PPNode {
  public getIsSimpleStyleNode(): boolean {
    return true;
  }

  public getParallelInputsOutputs(): boolean {
    return true;
  }
  public getMinNodeWidth(): number {
    return SMALL_NODE_WIDTH;
  }
}
