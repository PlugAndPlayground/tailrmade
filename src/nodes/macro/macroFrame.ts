// The frame Macro and UI template share: parameters leave the left block,
// results enter the right block, the nodes inside sit in between, and the
// nodes referencing the frame are listed in its corner.
//
// Deliberately not exported from a module allNodes.ts lists, which would
// register this abstract class as a node.
import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import FlowLogic from '../../classes/FlowLogic';
import { PNPHitArea } from '../../classes/selection/PNPHitArea';
import PPSelection from '../../classes/selection/SelectionClass';
import { ensureVisible } from '../../pixi/utils-pixi';
import { TRgba } from '../../utils/color';
import { NODE_MARGIN } from '../../utils/constants';
import { deSerializeType, serializeType } from '../datatypes/typehelper';

const LEFT_BLOCK_SIZE = 120;
const RIGHT_BLOCK_SIZE = 60;

const UPDATE_REFERRERS_INTERVAL_MILLISECONDS = 2000;

// Padding the frame draws around its content when auto-aligning.
export const FRAME_AUTOALIGN_PADDING = 100;

export abstract class MacroFrame extends PPNode {
  referrerGraphics!: PIXI.Graphics;
  prevReferrers = '';
  prevTimeUpdated = 0;

  // the nodes listed in the corner, under getReferrersHeading
  protected abstract getReferrers(): PPNode[];
  protected abstract getReferrersHeading(): string;

  // Referenced by name, or runs nodes with side effects, so it never looks
  // unused.
  public getSeemsUnused(): boolean {
    return false;
  }

  public getMinNodeWidth(): number {
    return LEFT_BLOCK_SIZE * 3;
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

  public getInputSocketXPos(): number {
    return this.nodeWidth - RIGHT_BLOCK_SIZE;
  }

  public getOutputSocketXPos(): number {
    return LEFT_BLOCK_SIZE;
  }

  // mirrors the fed socket's name onto the parameter
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

  // true while the last two sockets are both unlinked, one being the spare
  protected shouldRemoveLastSocket(array: Socket[]): boolean {
    return (
      array.length >= 2 &&
      array[array.length - 1].links.length == 0 &&
      array[array.length - 2].links.length == 0
    );
  }

  public connectedTargetSocketChangedType(socket: Socket): void {
    const mySocket = socket.links[0].getSource();
    mySocket.changeSocketDataType(
      deSerializeType(serializeType(socket.dataType)),
    );
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.isInput();
  }

  // execution never flows through the frame itself
  public shouldPropagateExecutionThrough(_socket: Socket): boolean {
    return false;
  }

  async tick(currentTime: number, deltaTime: number): Promise<void> {
    await super.tick(currentTime, deltaTime);
    if (
      currentTime >
      UPDATE_REFERRERS_INTERVAL_MILLISECONDS + this.prevTimeUpdated
    ) {
      this.prevTimeUpdated = currentTime;
      if (this.isVisible()) {
        this.drawReferrerGraphics();
      }
    }
  }

  private drawReferrerGraphics(force = false): void {
    const referrers = this.getReferrers();
    const names = referrers.map((node) => node.getNodeTextString(false)[0]);
    const nameString = names.join('');
    if (nameString === this.prevReferrers && !force) {
      return;
    }
    this.prevReferrers = nameString;
    this.referrerGraphics.removeChildren();
    this.referrerGraphics.clear();
    if (referrers.length === 0) {
      return;
    }

    const distPerUnit = 15;
    let currentPos = this.nodeHeight - distPerUnit * referrers.length;
    const heading = new PIXI.Text({ text: this.getReferrersHeading() });
    heading.y = currentPos - 20;
    heading.x = 10;
    heading.style.fill = new TRgba(128, 128, 128).hexNumber();
    heading.style.fontSize = 12;
    heading.anchor.y = 1;
    this.referrerGraphics.addChild(heading);

    referrers.forEach((referrer) => {
      const text = referrer.getNodeTextString(false)[0];
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
        void ensureVisible([PPGraph.currentGraph.nodes[referrer.id]], true);
      });
      label.on('destroyed', () => label.removeAllListeners());
      this.referrerGraphics.addChild(label);
      currentPos += distPerUnit;
    });
    this.referrerGraphics.fill({ color: this.getColor().hexNumber() });
  }

  public drawBackground(): void {
    if (this.referrerGraphics == undefined) {
      this.referrerGraphics = new PIXI.Graphics();
      this.drawReferrerGraphics();
    }
    this._BackgroundGraphicsRef.removeChildren();
    const nameRef = new PIXI.Text({ text: this.nodeName });
    nameRef.y = -50;
    nameRef.x = this.nodeWidth / 2;
    nameRef.anchor.x = 0.5;
    nameRef.style.fill = new TRgba(56, 56, 56).hexNumber();
    nameRef.style.fontSize = 48;
    this._BackgroundGraphicsRef.addChild(nameRef);
    this._BackgroundGraphicsRef.addChild(this.referrerGraphics);

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
    return new PIXI.Rectangle(NODE_MARGIN, 0, LEFT_BLOCK_SIZE, this.nodeHeight);
  }

  private getRightBlock(): PIXI.Rectangle {
    return new PIXI.Rectangle(
      NODE_MARGIN + this.nodeWidth - RIGHT_BLOCK_SIZE,
      0,
      RIGHT_BLOCK_SIZE,
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

  // Exposed as chrome so the layered layout can reserve room for the padding
  // when stacking components (otherwise adjacent frames overlap).
  public getAutoAlignChromeMargin(): number {
    return FRAME_AUTOALIGN_PADDING;
  }

  // The content nodes this frame will wrap, so the layout can tag them with the
  // chrome margin above.
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
    // not connected to anything
    if (relevantForMe.length === 1) {
      return;
    }
    const { minX, minY, maxX, maxY } = PPSelection.getNodesMinMax(
      nodes.filter((node) =>
        relevantForMe.some((relevant) => relevant.id === node.id),
      ),
    );
    const padding = FRAME_AUTOALIGN_PADDING;
    this.setPosition(minX - 2 * padding, minY - padding);
    this.nodeWidth = maxX - minX + 4 * padding;
    this.nodeHeight = maxY - minY + 2 * padding;
    this.resizeAndDraw();
    this.updateConnectionPosition();
  }

  onNodeResize: (width: number, height: number) => void = () => {
    this.drawReferrerGraphics(true);
  };
}
