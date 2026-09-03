import * as PIXI from 'pixi.js';
import { TRgba } from '../utils/color';
import { debounce } from 'lodash';
import { TextStyle } from 'pixi.js';
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { SocketBody } from '../containers/SocketContainer';
import {
  DashboardIconProps,
  DashboardWidgetProps,
  IWarningHandler,
  Layoutable,
  SerializedSocket,
  WidgetContentProps,
  TSocketType,
  WidgetProps,
} from '../utils/interfaces';
import { SOCKET_DASHBOARD_ICON } from '../components/dashboard/dashboardIcons';
import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import PPLink from './LinkClass';
import { Tooltipable } from '../components/Tooltip';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  COLOR_DARK,
  COLOR_WHITE_TEXT,
  SOCKET_TEXTMARGIN_TOP,
  SOCKET_TEXTMARGIN,
  SOCKET_TYPE,
  SOCKET_WIDTH,
  TEXT_RESOLUTION,
  TOOLTIP_DISTANCE,
  TOOLTIP_WIDTH,
  STATUS_SEVERITY,
} from '../utils/constants';
import {
  AbstractType,
  DataTypeProps,
  IsCompatible,
  isDirectlyCompatible,
} from '../nodes/datatypes/abstractType';
import { dataToType, serializeType } from '../nodes/datatypes/typehelper';
import {
  clearDocumentSelection,
  constructSocketId,
  convertToViewableString,
  parseValueAndAttachWarnings,
} from '../utils/utils';
import { NodeExecutionWarning, PNPStatus, PNPSuccess } from './ErrorClass';
import { PNPHitArea } from './selection/PNPHitArea';
import { getOverflowForSize } from '../utils/layoutableHelpers';

export default class Socket
  extends PIXI.Container
  implements Tooltipable, IWarningHandler, Layoutable
{
  onNodeAdded(node: PPNode): void {
    this.eventMode = 'static';
    this.addEventListener('pointerover', this.onPointerOver.bind(this));
    this.addEventListener('pointerout', this.onPointerOut.bind(this));
    this.addEventListener('pointerup', this.onPointerUp);
    this.addEventListener('pointerdown', this.onSocketPointerDown.bind(this));

    this._MetaText = new PIXI.Text({
      text: '',
      style: new TextStyle({
        fontSize: 8,
      }),
      resolution: TEXT_RESOLUTION,
    });
    this._TextRef = new PIXI.Text({
      text: '',
      style: new TextStyle({
        fontSize: 12,
      }),
    });

    this._ErrorBox = new PIXI.Graphics();
    this._SocketRef = new PIXI.Graphics();
    this._SocketRef.name = 'SocketRef';
    this._SocketRef.eventMode = 'static';
    this._SocketRef.hitArea = new PNPHitArea((x, y) =>
      this.socketRefHitAreaContains(x, y),
    );
    this._ValueSpecificGraphics = new PIXI.Graphics();

    this._TextRef.eventMode = 'static';
    this._TextRef.addEventListener(
      'pointerover',
      this.onPointerOver.bind(this),
    );

    this.on('destroyed', () => {
      this.removeAllListeners();
    });

    this._TextRef.addEventListener('pointerout', this.onPointerOut.bind(this));

    this.node = node;

    this.dataType.onNodeAdded(node);

    this.redraw();
  }
  // Input sockets
  // only 1 link is allowed
  // data can be set or comes from link

  // Output sockets
  // data is derived from execute function

  _SocketRef: PIXI.Graphics;
  _TextRef: PIXI.Text;
  _ErrorBox: PIXI.Graphics;
  _MetaText: PIXI.Text;
  _ValueSpecificGraphics: PIXI.Graphics;
  status: PNPStatus = new PNPSuccess();

  _socketType: TSocketType;
  _dataType: AbstractType;
  _data: any;
  _defaultData: any; // for inputs: data backup while unplugged, restores data when unplugged again
  _custom: Record<string, any>;
  _links: PPLink[];

  // some sockets are dependent on other sockets to exist, if that other socket does not, then this should also be removed
  dependentSocketName: string = '';

  // UI-only: whether this socket's value widget is collapsed in the inspector.
  // undefined until first read/toggled, at which point it's resolved to a
  // real boolean via getInspectorCollapsed() - access through that method
  // and setInspectorCollapsed(), never read/write this directly.
  private _inspectorCollapsed: boolean | undefined = undefined;

  getInspectorCollapsed(): boolean {
    if (this._inspectorCollapsed === undefined) {
      this._inspectorCollapsed =
        this.dataType.isInspectorCollapsible() &&
        this.dataType.isInspectorCollapsedByDefault();
    }
    return this._inspectorCollapsed;
  }

  setInspectorCollapsed(value: boolean): void {
    this._inspectorCollapsed = value;
  }

  node: PPNode = undefined; // populated when socket is added

  // cached data, for performance reasons (mostly UI related)
  cachedParsedData = undefined;
  cachedStringifiedData = undefined;
  lastSetTime = new Date().getTime();

  visibilityCondition: () => boolean = () => true;

  // Throttled version of redrawMetaAndValueSpecific
  private throttledRedrawMetaAndValueSpecific = debounce(() => {
    this.redrawMetaAndValueSpecific();
  }, 16); // ~60fps

  constructor(
    socketType: TSocketType,
    name: string,
    dataType: AbstractType,
    data = dataType.getDefaultValue(),
    visible = true,
    custom?: Record<string, any>,
  ) {
    super();

    this._socketType = socketType;
    this.name = name;
    this._dataType = dataType;
    this._data = data;
    this._defaultData = data;
    this.visible = visible;
    this._custom = custom;
    this._links = [];
  }

  getWidgetContent(props: WidgetContentProps): React.ReactNode {
    throw new Error('Method not implemented.');
  }

  isContainer(): boolean {
    return false;
  }

  static getOptionalVisibilitySocket(
    socketType: TSocketType,
    name: string,
    dataType: AbstractType,
    data: any,
    visibilityCondition: () => boolean,
  ): Socket {
    const socket = new Socket(socketType, name, dataType, data);
    socket.visibilityCondition = visibilityCondition;
    socket.visible = false; // dont show these as sockets on the node itself by default (user can expose him/herself)
    return socket;
  }

  getSocketLocation(): PIXI.Point {
    return new PIXI.Point(
      this.isInput()
        ? this.getNode()?.getInputSocketXPos() + SOCKET_WIDTH / 2
        : this.getNode()?.getOutputSocketXPos() + SOCKET_WIDTH / 2,
      SOCKET_WIDTH / 2,
    );
  }

  redrawMetaAndValueSpecific() {
    if (!this.destroyed) {
      this.redrawMetaText();
      this.redrawValueSpecificGraphics();
    }
  }

  redrawMetaText() {
    if (this._MetaText) {
      this.removeChild(this._MetaText);
      if (this.getNode().getShowLabels()) {
        this._MetaText.text = this.dataType.getMetaText(this.data);
        this._MetaText.x =
          this.getSocketLocation().x + (this.isInput() ? 10 : -14);
        this._MetaText.y = this.getSocketLocation().y + 5;
        this.addChild(this._MetaText);
      }
    }
  }

  redrawValueSpecificGraphics() {
    if (this._ValueSpecificGraphics !== undefined) {
      this.removeChild(this._ValueSpecificGraphics);
      this._ValueSpecificGraphics.clear();
      this._ValueSpecificGraphics.removeChildren();
      this.dataType.drawValueSpecificGraphics(
        this._ValueSpecificGraphics,
        this._data,
      );
      this._ValueSpecificGraphics.x = this.getSocketLocation().x;
      this._ValueSpecificGraphics.y = this.getSocketLocation().y;
      this.addChild(this._ValueSpecificGraphics);
    }
  }

  public setStatus(status: PNPStatus) {
    const currentMessage = this.status.message;
    const newMessage = status.message;
    if (currentMessage !== newMessage) {
      this.status = status;
      if (this.getNode() !== undefined) {
        this.redraw();
        if (status.getSeverity() >= STATUS_SEVERITY.WARNING) {
          this.getNode().setStatus(
            new NodeExecutionWarning(
              `Parsing warning on ${this.isInput() ? 'input' : 'output'}: ${
                this.name
              }
  ${newMessage}`,
            ),
            'socket',
          );
        } else {
          this.getNode().adaptToSocketErrors();
        }
        // the node's border reads socket statuses directly, so it has to be
        // re-derived even when the aggregated node status came out unchanged
        this.getNode().drawErrorBoundary();
      }
    }
  }

  redraw(): void {
    this.removeChildren();
    this._SocketRef.clear();
    const color =
      this.status.getSeverity() >= STATUS_SEVERITY.WARNING
        ? TRgba.fromString(COLOR_DARK).hex()
        : TRgba.fromString(COLOR_WHITE_TEXT).hex();

    this.dataType.drawBox(
      this._ErrorBox,
      this._SocketRef,
      this.getSocketLocation(),
      this.isInput(),
      this.status,
    );
    this.addChild(this._ErrorBox);
    this.addChild(this._SocketRef);
    if (this.getNode().getShowLabels()) {
      if (!this.isInput()) {
        this._MetaText.anchor.set(1, 0);
      }
      this._MetaText.style.fill = color;
      this._TextRef.style.fill = color;
      this._TextRef.text = this.getNode()?.getSocketDisplayName(this);

      if (this.socketType === SOCKET_TYPE.OUT) {
        this._TextRef.anchor.set(1, 0);
        this._TextRef.name = 'TextRef';
      }
      this._TextRef.x = this.isInput()
        ? this.getSocketLocation().x + SOCKET_WIDTH / 2 + SOCKET_TEXTMARGIN
        : this.getSocketLocation().x - SOCKET_TEXTMARGIN - SOCKET_WIDTH / 2;
      this._TextRef.y = SOCKET_TEXTMARGIN_TOP;
      this._TextRef.resolution = TEXT_RESOLUTION;

      this._TextRef.pivot = new PIXI.Point(0, SOCKET_WIDTH / 2);
      if (!this.getNode().getIsSimpleStyleNode()) {
        this.addChild(this._TextRef);
      }
      this.throttledRedrawMetaAndValueSpecific();
    }
  }

  // GETTERS & SETTERS

  get socketType(): TSocketType {
    return this._socketType;
  }

  set socketType(newLink: TSocketType) {
    this._socketType = newLink;
  }

  get links(): PPLink[] {
    return this._links;
  }

  set links(newLink: PPLink[]) {
    this._links = newLink;
  }

  get data(): any {
    if (this.cachedParsedData == undefined) {
      this.cachedParsedData = parseValueAndAttachWarnings(
        this,
        this.dataType,
        this._data,
      );
    }
    return this.cachedParsedData;
  }

  getStringifiedData(): string {
    if (this.cachedStringifiedData == undefined) {
      this.cachedStringifiedData = convertToViewableString(this.data);
    }
    return this.cachedStringifiedData;
  }

  changeSocketDataType(newType: AbstractType) {
    this.dataType = newType;
    this.clearCachedData();
    this.redraw();
    this.getNode().socketTypeChanged();
    if (this.isOutput()) {
      this.links.forEach((link) => link.updateConnectionDrawing());
    }
    if (
      this.isInput() &&
      this.links.length > 0 &&
      PPGraph.currentGraph.graphConfiguredAndReady
    ) {
      this.links[0].getSource().connectedTargetSocketChangedType(this);
    }
  }

  clearCachedData(): void {
    this.cachedParsedData = undefined;
    this.cachedStringifiedData = undefined;
  }

  setDataCommon(newData: any) {
    this._data = newData;
    this.clearCachedData();
    this.lastSetTime = new Date().getTime();
    this.throttledRedrawMetaAndValueSpecific();

    //console.log(
    //  'setting data innit: ' + this.getNode().getName() + ', ' + this.name,
    //);

    const adaptationAcceptable =
      this.getNode()?.socketShouldAutomaticallyAdapt(this) &&
      this.dataType.allowedToAutomaticallyAdapt();
    const socketWantsToAdapt = this.dataType.prefersToChangeAwayFromThisType();
    const incompatibleData = !isDirectlyCompatible(
      this.dataType.getCompatability(newData).type,
    );
    if (
      adaptationAcceptable &&
      (incompatibleData || socketWantsToAdapt || this.isOutput())
    ) {
      const proposedType = dataToType(newData);
      if (this.dataType.getName() !== proposedType.getName()) {
        this.changeSocketDataType(proposedType);
      }
    }
    if (this.isInput()) {
      if (!this.hasLink()) {
        this._defaultData = this.data;
      }
      // update defaultData only if socket is input
      // and does not have a link
    }
  }

  // ugly with a separate function... but making the normal set data async would be too painful I thought (I need to be able to wait for possible execution caused by trigger data sockets executing their own chains, for when execution needs to be sequential)
  async setDataAndWait(newData: any) {
    this.setDataCommon(newData);
    if (this.isOutput()) {
      // if output, set all inputs im linking to
      for (let i = 0; i < this.links.length; i++) {
        await this.links[i].getTarget().setDataAndWait(this.data);
      }
    }
    await this.dataType.onDataSet(this.data, this);
  }

  // will not wait for potential side effects to complete before returning, use above function if you want that
  set data(newData: any) {
    this.setDataCommon(newData);
    if (this.isOutput()) {
      // if output, set all inputs im linking to
      for (let i = 0; i < this.links.length; i++) {
        void this.links[i].getTarget().setDataAndWait(this.data);
      }
    }
    void this.dataType.onDataSet(this.data, this);
  }

  get defaultData(): any {
    return this._defaultData;
  }

  set defaultData(defaultData: any) {
    this._defaultData = defaultData;
  }

  get dataType(): AbstractType {
    return this._dataType;
  }

  set dataType(newType: AbstractType) {
    this._dataType = newType;
    this.clearCachedData();
  }

  get custom(): any {
    return this._custom;
  }

  set custom(newObject: any) {
    this._custom = newObject;
  }

  // METHODS

  isInput(): boolean {
    return (
      this.socketType === SOCKET_TYPE.IN ||
      this.socketType === SOCKET_TYPE.TRIGGER
    );
  }

  isOutput(): boolean {
    return this.socketType === SOCKET_TYPE.OUT;
  }

  hasLink(): boolean {
    return this.links.length > 0;
  }

  setVisible(value: boolean): void {
    if (value != this.visible) {
      this.visible = value;

      // visibility change can result in position change
      // therefore redraw Node and connected Links
      if (this.getNode().getShrinkOnSocketRemove()) {
        this.getNode().resizeAndDraw(this.getNode().nodeWidth, 0);
      } else {
        this.getNode().resizeAndDraw();
      }
      this.getNode().updateConnectionPosition();
    }
  }

  nodeSocketRemoved(socketName: string) {
    if (this.dependentSocketName == socketName) {
      this.getNode().removeSocket(this);
    }
  }

  // only call from link class delete function
  removeLink(link: PPLink): void {
    const isSameLink = (item) =>
      link.getTarget().name === item.getTarget().name &&
      link.getTarget().getNode().id === item.getTarget().getNode().id &&
      link.getSource().name === item.getSource().name &&
      link.getSource().getNode().id === item.getSource().getNode().id;

    this.links = this.links.filter((item) => !isSameLink(item));

    // if this is an input which has defaultData stored
    // copy it back into data
    if (this.isInput()) {
      if (this.defaultData !== undefined) {
        this.data = this.defaultData;
      } else {
        this.data = this.dataType.getDefaultValue();
      }
    }
  }

  getNode(): PPNode {
    return this.node;
  }

  isLayoutable(): boolean {
    return true;
  }

  isSurface(): boolean {
    return false;
  }

  public getWidgetProps(): WidgetProps {
    return this.isInput()
      ? this.dataType.getInputWidgetProps()
      : this.dataType.getOutputWidgetProps();
  }

  getDashboardId(): string {
    return constructSocketId(this.getNode().id, this.socketType, this.name);
  }

  getDashboardName(): string {
    return `${this.getNode().nodeName} > ${this.name}`;
  }

  getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return SOCKET_DASHBOARD_ICON;
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return (
      <DashboardSocketWidgetContainer
        property={this}
        {...props}
        dataType={this.dataType}
        isInput={this.isInput()}
        hasLink={this.hasLink()}
        data={this.data}
        selectedNode={this.getRelatedNode()}
      />
    );
  }

  getRelatedNode(): PPNode {
    return this.getNode();
  }

  public getPreferredNodes(): string[] {
    const preferredNodesPerSocket =
      this.getNode().getPreferredNodesPerSocket(this);
    return preferredNodesPerSocket!.concat(
      this.isInput()
        ? this.dataType.recommendedInputNodeWidgets()
        : this.dataType.recommendedOutputNodeWidgets(),
    );
  }

  serialize(includeDataForOutputSockets: boolean = false): SerializedSocket {
    // ignore data for output sockets and input sockets with links
    // for input sockets with links store defaultData
    let data = undefined;
    if (this.isInput()) {
      if (!this.hasLink()) {
        data = structuredClone(this.dataType.prepareDataForSaving(this.data));
      }
    } else if (this.isOutput() && includeDataForOutputSockets) {
      data = structuredClone(this.dataType.prepareDataForSaving(this.data));
    }
    return {
      socketType: this.socketType,
      name: this.name,
      dataType: serializeType(this._dataType), // do not use this.dataType as, for linked inputs, it would save the linked output type
      data: data,
      visible: this.visible ? undefined : false, // save space by only saving if interesting
      dependentSocketName:
        this.dependentSocketName == '' ? undefined : this.dependentSocketName, // save space by only saving if interesting
    };
  }

  getSocketDependents(onlyInputs = true): Socket[] {
    const targets = this.links.map((link) => link.getTarget());
    let targetsFiltered = targets;
    if (onlyInputs) {
      targetsFiltered = targets.filter(
        (target) => target.socketType === SOCKET_TYPE.IN,
      );
    }
    return targetsFiltered;
  }

  getDirectDependents(onlyInputs = true): PPNode[] {
    const targetsFiltered = this.getSocketDependents(onlyInputs);
    const nodes = targetsFiltered.map((target) => target.getNode());
    return nodes;
  }

  getLinkedNodes(upstream = false): PPNode[] {
    return this.links.map((link) => {
      return upstream ? link.getSource().getNode() : link.getTarget().getNode();
    });
  }

  getTooltipContent(props): React.ReactElement {
    const baseProps: DataTypeProps = {
      index: 0,
      dataType: this.dataType,
      socketsToUpdate: [this],
    };
    const widget = this.isInput()
      ? this.dataType.getInputWidget(baseProps)
      : this.dataType.getOutputWidget(baseProps);

    return (
      <Box
        sx={{
          bgcolor: 'background.default',
        }}
      >
        <SocketBody
          referenceSocket={this}
          selectedNode={props.selectedNode}
          widget={widget}
        />
      </Box>
    );
  }

  getTooltipPosition(): PIXI.Point {
    const overlay = PPGraph.currentGraph.socketFocus.nameOverlay;
    const anchor = overlay.anchorFor(this, TOOLTIP_WIDTH);
    // sit under the label when it is up, under the socket when it is not
    const bottom =
      overlay.getFrameRect()?.bottom ??
      anchor.centerY + Socket.screenHitRadius();
    return new PIXI.Point(anchor.left, bottom + TOOLTIP_DISTANCE / 2);
  }

  // getGlobalPosition already returns stage (screen) coordinates; applying
  // viewport.toScreen on top would apply the viewport transform twice and
  // return shifted positions whenever the viewport is panned or zoomed
  screenPointSocketCenter(): PIXI.Point {
    return this._SocketRef.getGlobalPosition();
  }

  screenPointSocketLabelCenter(): PIXI.Point {
    const scale = PPGraph.currentGraph.viewportScaleX;
    const textRefPos = this._TextRef.getGlobalPosition();
    const factor = this.isInput() ? 1 : -1;
    const x = textRefPos.x + (factor * this._TextRef.width * scale) / 2;
    const y = textRefPos.y + (this._TextRef.height * scale) / 2;
    return new PIXI.Point(x, y);
  }

  // SETUP

  static screenHitRadius(): number {
    const MIN_HITBOX_SCREEN_SIZE = 24;
    const scale = PPGraph.currentGraph.viewportScaleX;
    return Math.max(SOCKET_WIDTH * scale, MIN_HITBOX_SCREEN_SIZE) / 2;
  }

  static worldHitRadius(): number {
    return Socket.screenHitRadius() / PPGraph.currentGraph.viewportScaleX;
  }

  isWithinZoomInvariantHitRadius(x: number, y: number): boolean {
    const center = this.getSocketLocation();
    const radius = Socket.worldHitRadius();
    const dx = x - center.x;
    const dy = y - center.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  private socketRefHitAreaContains(x: number, y: number): boolean {
    const half = SOCKET_WIDTH / 2;
    const radius = Socket.worldHitRadius();
    const dx = x - half;
    const dy = y - half;
    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
    return x >= 0 && x <= SOCKET_WIDTH && y >= 0 && y <= SOCKET_WIDTH;
  }

  onPointerOver(): void {
    this.cursor = 'pointer';
    (this._SocketRef as PIXI.Graphics).tint = TRgba.white().hexNumber();
    this.links.forEach((link) => link.nodeHoveredOver());
    PPGraph.currentGraph.socketFocus.hoverOver(this);
  }

  onPointerOut(): void {
    this.alpha = 1.0;
    this.cursor = 'default';
    (this._SocketRef as PIXI.Graphics).tint = 0xffffff;
    this.links.forEach((link) => link.nodeHoveredOut());
    PPGraph.currentGraph.socketFocus.hoverOut(this);
  }

  onSocketPointerDown(event: PIXI.FederatedPointerEvent): void {
    clearDocumentSelection();
    InterfaceController.spamToast(
      `${event.shiftKey ? 'socket_shift_clicked' : 'socket_clicked'} ${this.getNode().id}:${this.name}`,
    );
    if (event.shiftKey) {
      InterfaceController.notifyListeners(ListenEvent.AddToDashboard, this);
    } else {
      void PPGraph.currentGraph.socketPointerDown(this, event);
    }
  }

  // if the socket we are connecting to changed type then so do we (assuming we care)
  connectedTargetSocketChangedType(socket: Socket) {
    if (this.getNode().socketShouldAutomaticallyAdapt(this)) {
      this.changeSocketDataType(socket.dataType);
    }
    this.getNode().connectedTargetSocketChangedType(socket);
  }

  public onPointerUp(event: PIXI.FederatedPointerEvent): void {
    void PPGraph.currentGraph.socketMouseUp(this, event);
    event.stopPropagation();
  }

  destroy(options: PIXI.DestroyOptions): void {
    PPGraph.currentGraph.socketFocus.forgetSocket(this);
    super.destroy(options);
  }
}

type DashboardSocketWidgetContainerProps = {
  property: Socket;
  index: number;
  dataType: AbstractType;
  isInput: boolean;
  hasLink: boolean;
  data: any;
  selectedNode: PPNode;
  disabled: boolean;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
};

export const DashboardSocketWidgetContainer: React.FunctionComponent<
  DashboardSocketWidgetContainerProps
> = (props) => {
  const [dataTypeValue, setDataTypeValue] = useState(props.dataType);

  const baseProps: DataTypeProps = {
    // key: props.dataType.getName(),
    index: props.index,
    dataType: props.dataType,
    inDashboard: true,
    socketsToUpdate: [props.property],
  };
  const widget = props.isInput
    ? dataTypeValue.getInputWidget(baseProps)
    : dataTypeValue.getOutputWidget(baseProps);

  useEffect(() => {
    setDataTypeValue(props.dataType);
  }, [props.dataType]);

  return (
    <Box
      id={`inspector-socket-${props.dataType.getName()}`}
      sx={{
        height: '100%',
        width: '100%',
        minWidth: props.minWidth,
        minHeight: props.minHeight,
        overflow: getOverflowForSize(props.width, props.height),
        pointerEvents: props.disabled ? 'none' : 'auto',
      }}
    >
      <SocketBody
        referenceSocket={props.property}
        selectedNode={props.selectedNode}
        widget={widget}
      />
    </Box>
  );
};

export class DynamicInputDummySocket extends Socket {
  getSocketLocation(): PIXI.Point {
    return new PIXI.Point(
      this.getNode()?.getInputSocketXPos() + SOCKET_WIDTH / 2,
      SOCKET_WIDTH / 2,
    );
  }
}
