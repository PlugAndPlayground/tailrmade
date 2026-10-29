// The UI Template frame: a block you drop nodes into, shaped and read like a
// Macro.
//
// Geometry is the point. Like Macro, the sockets are inverted - the parameter
// OUTPUTS sit on the left block and the single UI INPUT on the right - so a
// parameter leaves the left edge, flows rightward through the nodes inside the
// frame, and the surface they build flows back into the right edge. Nothing
// doubles back, which is what makes a macro legible and what a parameter wired
// out of a surface could never be.
//
// The template holds no layout of its own: its body is whatever UI surface is
// plugged into "UI", so surfaces, nested surfaces and the dashboard editor all
// work here unchanged.
import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { PNPHitArea } from '../../classes/selection/PNPHitArea';
import PPSelection from '../../classes/selection/SelectionClass';
import FlowLogic from '../../classes/FlowLogic';
import { registerTemplateBody } from './templateInstancing';
import { ensureVisible } from '../../pixi/utils-pixi';
import { TRgba } from '../../utils/color';
import { AGENT_DOCS_HEADING } from '../../utils/nodeDocs';
import {
  NODE_MARGIN,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
} from '../../utils/constants';
import {
  templateParameterPrefixName,
  templateOutputPrefixName,
  templateUISocketName,
} from '../../utils/constants_shared';
import { AnyType } from '../datatypes/anyType';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import { deSerializeType, serializeType } from '../datatypes/typehelper';
import type { UISurfaceNode } from './uiSurface';
import { isSurfaceNode } from '../../utils/interfaces';

// left block: the parameters leave from its right edge
const PARAM_BLOCK_SIZE = 120;
// right block: the UI input sits on its left edge
const UI_BLOCK_SIZE = 60;

const COMPONENT_AUTOALIGN_PADDING = 100;
const UPDATE_PLACEMENTS_INTERVAL_MILLISECONDS = 2000;

export function getTemplates(): UITemplate[] {
  return Object.values(PPGraph.currentGraph?.nodes ?? {}).filter(
    (node): node is UITemplate => node instanceof UITemplate,
  );
}

export class UITemplate extends PPNode {
  // A template exists to be placed; it never looks unused.
  public getSeemsUnused(): boolean {
    return false;
  }

  placementGraphics!: PIXI.Graphics;
  prevPlacements = '';
  prevTimeUpdated = 0;

  public getName(): string {
    return 'UI Template';
  }

  public getDescription(): string {
    return 'Wrap a piece of UI into a template and place it as often as you want';
  }

  public getDocs(): string {
    return `A block you build a piece of reusable UI inside, shaped like a Macro.

Drop the nodes that make up the UI inside the frame, arrange them on a UI
surface as usual, and plug that surface's "ReactUI" output into the template's
"${templateUISocketName}" input on the right.

Anything the template should differ by - a city, a title, a number - comes out
of a "${templateParameterPrefixName}" socket on the left: wire it into the
input that should change. A fresh parameter appears as soon as you use the last
one, and each takes the name of the socket it feeds.

Place it with "Place Template", once per copy you want. Each placement has its
own parameter values and renders on its own; the nodes inside the frame are
shared, so a change to the template shows up in every placement.

Placements render read-only for now: a widget inside a template does not yet
write back per placement.

${AGENT_DOCS_HEADING}
Templates are referenced by NAME, which is kept unique across templates.`;
  }

  public getTags(): string[] {
    return ['Template', 'Layout', 'UI'];
  }

  public getMinNodeWidth(): number {
    return PARAM_BLOCK_SIZE * 3;
  }

  public getDefaultNodeWidth(): number {
    return 1000;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, true, false, 1000, this);
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.LAYOUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.OUT,
        `${templateParameterPrefixName} 1`,
        new AnyType(),
      ),
      new Socket(SOCKET_TYPE.IN, templateUISocketName, new DeferredReactType()),
      new Socket(
        SOCKET_TYPE.IN,
        `${templateOutputPrefixName} 1`,
        new AnyType(),
      ),
    ];
  }

  // Inverted, exactly as Macro is: outputs (the parameters) on the left block,
  // the UI input on the right block, so everything reads left to right.
  public getInputSocketXPos(): number {
    return this.nodeWidth - UI_BLOCK_SIZE;
  }

  public getOutputSocketXPos(): number {
    return PARAM_BLOCK_SIZE;
  }

  public getParameterSockets(): Socket[] {
    return this.outputSocketArray.filter((socket) =>
      socket.name.startsWith(templateParameterPrefixName),
    );
  }

  // What one placement of this template PRODUCES. Inputs on the right block,
  // exactly as Macro's Output is: the nodes inside feed them, and a placement
  // exposes one output socket per declared one.
  public getOutputSockets(): Socket[] {
    return this.inputSocketArray.filter((socket) =>
      socket.name.startsWith(templateOutputPrefixName),
    );
  }

  // The values this pass produced, keyed by socket name. Only the WIRED
  // outputs: the spare one at the end is an affordance, not a result, and
  // counting it would make a single-output template look like it has two.
  public readOutputs(): Record<string, unknown> {
    return Object.fromEntries(
      this.getOutputSockets()
        .filter((socket) => socket.hasLink())
        .map((socket) => [socket.name, socket.data]),
    );
  }

  private shouldRemoveLastOutput(outputs: Socket[]): boolean {
    return (
      outputs.length >= 2 &&
      outputs[outputs.length - 1].links.length === 0 &&
      outputs[outputs.length - 2].links.length === 0
    );
  }

  // keeps one spare Output at the end, the same way parameters work
  private updateOutputSocketCount(): void {
    const outputs = this.getOutputSockets();
    if (outputs.length > 0 && outputs[outputs.length - 1].hasLink()) {
      this.addInput(
        this.constructSocketName(
          templateOutputPrefixName,
          this.inputSocketArray,
        ),
        new AnyType(),
      );
    }
    let remaining = this.getOutputSockets();
    while (this.shouldRemoveLastOutput(remaining)) {
      this.removeSocket(remaining[remaining.length - 1]);
      remaining = remaining.slice(0, -1);
    }
    this.notifyPlacementsOfSignatureChange();
  }

  // the nodes this template's parameters reach, flagged so their socket types
  // never drift with one row's data (see utils/templatePass.ts)
  public registerBody(): void {
    registerTemplateBody(this);
  }

  public inputPlugged(socket: Socket): void {
    super.inputPlugged(socket);
    this.registerBody();
    if (socket.name.startsWith(templateOutputPrefixName)) {
      // adopt the type of whatever feeds it, so placements get it too
      const linked = socket.links[0]?.getSource();
      if (linked && linked.dataType.getName() !== socket.dataType.getName()) {
        socket.changeSocketDataType(
          deSerializeType(serializeType(linked.dataType)),
        );
      }
      this.updateOutputSocketCount();
      this.debounceDrawShape();
    }
  }

  public inputUnplugged(socket: Socket): void {
    super.inputUnplugged(socket);
    if (socket.name.startsWith(templateOutputPrefixName)) {
      this.updateOutputSocketCount();
      this.debounceDrawShape();
    }
  }

  // an Output's display name follows whatever feeds it, as a parameter's
  // follows what it feeds
  public getOutputDisplayName(socket: Socket): string {
    if (socket.hasLink()) {
      const source = socket.links[0].getSource();
      return source.getNode().getSocketDisplayName(source);
    }
    return socket.name;
  }

  // the surface plugged into "UI" - the template's body
  public getBodySurface(): UISurfaceNode | undefined {
    const socket = this.getInputSocketByName(templateUISocketName);
    const source = socket?.links[0]?.getSource().getNode();
    return source && isSurfaceNode(source) ? source : undefined;
  }

  // Same direction as Macro: the Output INPUTS adapt to whatever feeds them,
  // while a parameter keeps the type it adopted from the socket it feeds (see
  // outputPlugged). Letting a parameter adapt would make it take the type of
  // the last VALUE pushed through it - that is one placement's data, and every
  // placement would then inherit it.
  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.isInput();
  }

  // mirrors the fed socket's name onto the parameter, as Macro does
  public getSocketDesiredDisplayName(socket: Socket): string {
    if (socket == undefined) {
      return '';
    }
    return socket.isOutput() && socket.hasLink()
      ? socket.links[0].target
          .getNode()
          .getSocketDisplayName(socket.links[0].target)
      : socket.name;
  }

  public getSocketDisplayName(socket: Socket): string {
    if (socket == undefined) {
      return '';
    }
    return socket.isOutput()
      ? this.getSocketDesiredDisplayName(socket)
      : socket.name;
  }

  // template names are the reference placements store, so keep them unique
  // (Macro does the same for the same reason)
  public setNodeName(text: string): string {
    const others = getTemplates().filter((template) => template.id !== this.id);
    const oldName = this.nodeName;
    let nameToUse = text;
    for (
      let i = 0;
      nameToUse === 'UI Template' ||
      others.some((template) => template.nodeName === nameToUse);
      i++
    ) {
      nameToUse = `${text}${i}`;
    }
    const placements = this.getPlacements();
    this.name = nameToUse;
    super.setNodeName(nameToUse);
    placements.forEach((node) =>
      node.placedTemplateChangedName(oldName, nameToUse),
    );
    return nameToUse;
  }

  public getPlacements(): PPNode[] {
    return Object.values(PPGraph.currentGraph.nodes).filter((node) =>
      node.isPlacingTemplate(this.nodeName),
    );
  }

  private shouldRemoveLastParameter(parameters: Socket[]): boolean {
    return (
      parameters.length >= 2 &&
      parameters[parameters.length - 1].links.length === 0 &&
      parameters[parameters.length - 2].links.length === 0
    );
  }

  // keeps exactly one spare parameter at the end, as Macro does
  private updateParameterSocketCount(): void {
    const parameters = this.getParameterSockets();
    if (parameters.length > 0 && parameters[parameters.length - 1].hasLink()) {
      this.addOutput(
        this.constructSocketName(
          templateParameterPrefixName,
          this.outputSocketArray,
        ),
        new AnyType(),
      );
    }
    let remaining = this.getParameterSockets();
    while (this.shouldRemoveLastParameter(remaining)) {
      this.removeSocket(remaining[remaining.length - 1]);
      remaining = remaining.slice(0, -1);
    }
    this.notifyPlacementsOfSignatureChange();
  }

  private notifyPlacementsOfSignatureChange(): void {
    if (!PPGraph.currentGraph?.graphConfiguredAndReady) {
      return;
    }
    this.getPlacements().forEach((node) =>
      node.placedTemplateUpdatedMeta(this),
    );
  }

  public outputPlugged(socket: Socket): void {
    super.outputPlugged(socket);
    // Everything a parameter reaches is shared between rows, so its sockets
    // must stop adapting to data - from this connection onwards.
    this.registerBody();

    // EVERY link, not just the first: a parameter commonly fans out (one
    // value feeding a widget and a test of it), and looking only at links[0]
    // left every target after the first typed by the placeholder below.
    const targets = socket.links.map((link) => link.target);

    // Connecting copies the parameter's data into the target, and a parameter
    // that has never run carries a placeholder. A target that adapts will have
    // just taken the placeholder's type, which says nothing about the
    // template, so both stay untyped: a parameter feeding a socket that takes
    // anything IS untyped, and rows carry whatever they carry - which is the
    // whole point of a type test downstream.
    const adapting = targets.filter((target) =>
      target.getNode().socketShouldAutomaticallyAdapt(target),
    );
    if (adapting.length > 0) {
      adapting.forEach((target) => {
        if (!(target.dataType instanceof AnyType)) {
          target.changeSocketDataType(new AnyType());
        }
      });
      if (!(socket.dataType instanceof AnyType)) {
        socket.changeSocketDataType(new AnyType());
      }
    } else {
      // otherwise adopt the type of what it was wired into, as Macro does
      const linked = targets[0];
      if (linked && linked.dataType.getName() !== socket.dataType.getName()) {
        socket.changeSocketDataType(
          deSerializeType(serializeType(linked.dataType)),
        );
      }
    }
    this.updateParameterSocketCount();
    this.debounceDrawShape();
  }

  public outputUnplugged(socket: Socket): void {
    super.outputUnplugged(socket);
    this.updateParameterSocketCount();
    this.debounceDrawShape();
  }

  public connectedTargetSocketChangedType(socket: Socket): void {
    const mySocket = socket.links[0].getSource();
    mySocket.changeSocketDataType(
      deSerializeType(serializeType(socket.dataType)),
    );
  }

  protected socketAdded(): void {
    this.notifyPlacementsOfSignatureChange();
  }

  protected socketRemoved(): void {
    this.notifyPlacementsOfSignatureChange();
  }

  // the frame itself computes nothing; it tells its placements to re-render
  protected async rawExecute(): Promise<void> {
    if (!this.hasBeenAdded) {
      return;
    }
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      this.getPlacements().forEach((node) => {
        if (!node.isExecuting) {
          node.placedTemplateUpdated();
        }
      });
    }
  }

  // execution never flows through the frame itself
  public shouldPropagateExecutionThrough(_socket: Socket): boolean {
    return false;
  }

  // ---- canvas chrome, adapted from Macro -------------------------------

  async tick(currentTime: number, deltaTime: number): Promise<void> {
    await super.tick(currentTime, deltaTime);
    if (
      currentTime >
      UPDATE_PLACEMENTS_INTERVAL_MILLISECONDS + this.prevTimeUpdated
    ) {
      this.prevTimeUpdated = currentTime;
      if (this.isVisible()) {
        this.drawPlacementGraphics();
      }
    }
  }

  private drawPlacementGraphics(force = false): void {
    const placements = this.getPlacements();
    const names = placements.map((node) => node.getNodeTextString(false)[0]);
    const nameString = names.join('');
    if (nameString === this.prevPlacements && !force) {
      return;
    }
    this.prevPlacements = nameString;
    this.placementGraphics.removeChildren();
    this.placementGraphics.clear();
    if (placements.length === 0) {
      return;
    }

    const distPerUnit = 15;
    let currentPos = this.nodeHeight - distPerUnit * placements.length;
    const heading = new PIXI.Text({ text: 'Placed by' });
    heading.y = currentPos - 20;
    heading.x = 10;
    heading.style.fill = new TRgba(128, 128, 128).hexNumber();
    heading.style.fontSize = 12;
    heading.anchor.y = 1;
    this.placementGraphics.addChild(heading);

    placements.forEach((placement) => {
      const text = placement.getNodeTextString(false)[0];
      const label = new PIXI.Text({
        text: text.length > 20 ? `${text.substring(0, 17)}...` : text,
      });
      label.x = 10;
      label.y = currentPos;
      label.style.fill = TRgba.white().hexNumber();
      label.style.fontSize = 12;
      label.anchor.y = 1;
      label.interactive = true;
      label.addListener('pointerover', () => {
        document.body.style.cursor = 'pointer';
      });
      label.addListener('pointerout', () => {
        document.body.style.cursor = 'default';
      });
      label.addListener('click', () => {
        void ensureVisible([PPGraph.currentGraph.nodes[placement.id]], true);
      });
      label.on('destroyed', () => label.removeAllListeners());
      this.placementGraphics.addChild(label);
      currentPos += distPerUnit;
    });
    this.placementGraphics.fill({ color: this.getColor().hexNumber() });
  }

  public drawBackground(): void {
    if (this.placementGraphics == undefined) {
      this.placementGraphics = new PIXI.Graphics();
      this.drawPlacementGraphics();
    }
    this._BackgroundGraphicsRef.removeChildren();
    const nameRef = new PIXI.Text({ text: this.nodeName });
    nameRef.y = -50;
    nameRef.x = this.nodeWidth / 2;
    nameRef.anchor.x = 0.5;
    nameRef.style.fill = new TRgba(56, 56, 56).hexNumber();
    nameRef.style.fontSize = 48;
    this._BackgroundGraphicsRef.addChild(nameRef);
    this._BackgroundGraphicsRef.addChild(this.placementGraphics);

    this._BackgroundGraphicsRef.moveTo(10, 1.5);
    this._BackgroundGraphicsRef.lineTo(this.nodeWidth - 20, 1.5);
    this._BackgroundGraphicsRef.moveTo(10, this.nodeHeight - 1.5);
    this._BackgroundGraphicsRef.lineTo(
      this.nodeWidth - 20,
      this.nodeHeight - 1.5,
    );
    this._BackgroundGraphicsRef.stroke({
      width: 3,
      color: this.getColor(),
      alpha: 0.5,
    });

    this.drawBlock(this.getLeftBlock());
    this.drawBlock(this.getRightBlock());

    this._BackgroundGraphicsRef.fill({
      color: this.getColor().hexNumber(),
      alpha: this.getOpacity(),
    });
  }

  private getLeftBlock(): PIXI.Rectangle {
    return new PIXI.Rectangle(
      NODE_MARGIN,
      0,
      PARAM_BLOCK_SIZE,
      this.nodeHeight,
    );
  }

  private getRightBlock(): PIXI.Rectangle {
    return new PIXI.Rectangle(
      NODE_MARGIN + this.nodeWidth - UI_BLOCK_SIZE,
      0,
      UI_BLOCK_SIZE,
      this.nodeHeight,
    );
  }

  private drawBlock(block: PIXI.Rectangle): void {
    this._BackgroundGraphicsRef.roundRect(
      block.x,
      block.y,
      block.width,
      block.height,
      this.getCornerRadius(),
    );
  }

  public getSelectionBounds(): PIXI.Rectangle[] {
    const adjustMargins = (bounds: PIXI.Rectangle) => {
      bounds.x += this.x;
      bounds.y += this.y;
      return PPNode.boundsToSelectionBounds(bounds);
    };
    return [this.getLeftBlock(), this.getRightBlock()].map(adjustMargins);
  }

  // only the two blocks are grabbable, so the middle stays click-through for
  // the nodes living inside the frame
  protected getHitArea(): PNPHitArea {
    const leftBlock = PPNode.boundsToSelectionBounds(this.getLeftBlock());
    const rightBlock = PPNode.boundsToSelectionBounds(this.getRightBlock());
    return new PNPHitArea(
      (x, y) =>
        leftBlock.contains(x, y) ||
        rightBlock.contains(x, y) ||
        this.statusBadges.containsPoint(x, y) ||
        this.isPointNearVisibleSocket(x, y),
    );
  }

  public getShrinkOnSocketRemove(): boolean {
    return false;
  }

  public allowOverlap(): boolean {
    return true;
  }

  public isPostPassForAutoAlign(): boolean {
    return true;
  }

  public getAutoAlignChromeMargin(): number {
    return COMPONENT_AUTOALIGN_PADDING;
  }

  public getAutoAlignContentNodes(): PPNode[] {
    return FlowLogic.getAllUpDownstreamNodes(this, true, true, true).filter(
      (node) => node.id !== this.id,
    );
  }

  public postPassForAutoAlign(nodes: PPNode[], _iterations: number): void {
    const relevantForMe = FlowLogic.getAllUpDownstreamNodes(
      this,
      true,
      true,
      true,
    );
    if (relevantForMe.length === 1) {
      return;
    }
    const { minX, minY, maxX, maxY } = PPSelection.getNodesMinMax(
      nodes.filter((node) =>
        relevantForMe.some((relevant) => relevant.id === node.id),
      ),
    );
    const padding = COMPONENT_AUTOALIGN_PADDING;
    this.setPosition(minX - 2 * padding, minY - padding);
    this.nodeWidth = maxX - minX + 4 * padding;
    this.nodeHeight = maxY - minY + 2 * padding;
    this.resizeAndDraw();
    this.updateConnectionPosition();
  }

  onNodeResize: (width: number, height: number) => void = () => {
    this.drawPlacementGraphics(true);
  };
}
