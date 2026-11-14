import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import PPGraph from '../../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  ACTIONS,
  getSocketChecksum,
  PNPAction,
  SetSocketValueActionArgs,
} from '../../classes/Action';
import {
  DATA_DASHBOARD_EDITABLE,
  NODE_MARGIN,
  SOCKET_TYPE,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { NUMBER_COLOR, NumberType } from '../datatypes/numberType';
import * as PIXI from 'pixi.js';
import { StringType } from '../datatypes/stringType';
import { AbstractType } from '../datatypes/abstractType';
import { BackPropagation } from '../../interfaces';
import { StaticValue, UNKNOWN_STATIC_VALUE } from '../../classes/StaticValue';
import type { SerializedNode } from '../../utils/interfaces';

const numberName = 'Number';
const stringName = 'String';
const constantFontSize = 30;

abstract class PRIMITIVE_CONSTANT extends PPNode {
  public getStaticOutputData(name: string, visited: Set<Socket>): StaticValue {
    return name === this.getInputName()
      ? this.getStaticInputData(this.getInputName(), visited)
      : UNKNOWN_STATIC_VALUE;
  }

  drawnConstant: PIXI.Text | undefined = undefined;
  // hidden while an in-place editor covers it
  protected showDrawnConstant = true;

  public getParallelInputsOutputs(): boolean {
    return true;
  }

  protected abstract getInputName(): string;
  protected abstract getInputType(): AbstractType;

  public getShowLabels(): boolean {
    return false;
  }

  // The size from configure was measured before the value loaded; grow to
  // fit it, so a saved size smaller than the value (a migrated Label) shows
  // all of it.
  async configure(
    nodeConfig: SerializedNode,
    includeSocketData = true,
  ): Promise<void> {
    await super.configure(nodeConfig, includeSocketData);
    this.drawConstant();
    this.nodeWidth = Math.max(this.nodeWidth, this.getMinNodeWidth());
    this.nodeHeight = Math.max(this.nodeHeight, this.getMinNodeHeight());
  }

  public getMinNodeHeight(): number {
    if (!this.drawnConstant) {
      this.drawConstant();
    }
    return this.drawnConstant!.height + 20;
  }

  public getMinNodeWidth(): number {
    if (this.drawnConstant == undefined) {
      this.drawConstant();
    }
    return this.drawnConstant!.width + 50;
  }

  private drawConstant(): void {
    const number = this.getInputData(this.getInputName());
    if (this.drawnConstant == undefined) {
      const color = this.inputSocketArray.length
        ? this.inputSocketArray[0].dataType.getColor()
        : NUMBER_COLOR;
      this.drawnConstant = new PIXI.Text({
        style: {
          fill: color.hexNumber(),
        },
      });
    }

    this.drawnConstant.text = number !== undefined ? number : '';
    this.drawnConstant.style.fontSize = constantFontSize;
    this.drawnConstant.visible = this.showDrawnConstant;
    this.drawnConstant.x = this.nodeWidth / 2 + NODE_MARGIN / 2;
    this.drawnConstant.y = this.nodeHeight / 2;
    this.drawnConstant.anchor.x = 0.5;
    this.drawnConstant.anchor.y = 0.5;
    this.addChild(this.drawnConstant);
  }

  public drawNodeShape(): void {
    if (!this.hasBeenAdded || this.destroyed) {
      return;
    }

    this._BackgroundGraphicsRef.clear();
    if (this.drawnConstant) {
      this.removeChild(this.drawnConstant);
    }
    this.drawErrorBoundary();
    this.drawBackground();
    this.drawConstant();

    this.drawTriggers();
    this.drawSockets();
    this.drawDebugInfo();
    this.drawStatuses();
    this.hasBeenDrawn = true;

    this.hitArea = this.getHitArea();
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const res = await this.passThrough(input, output);
    cancelAnimationFrame(this.lastRenderID);
    this.lastRenderID = requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.drawConstant();
        this.resizeAndDraw(0, 0);
      }
    });
    return res;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, this.getInputName(), this.getInputType()),
      new Socket(SOCKET_TYPE.OUT, this.getInputName(), this.getInputType()),
    ];
  }

  protected getBackPropagationTargets(): BackPropagation {
    return { SocketToGetValue: this.getInputSocketByName(this.getInputName()) };
  }
}

export class CONSTANT_Number extends PRIMITIVE_CONSTANT {
  public getName() {
    return 'Constant Number';
  }
  public getDescription(): string {
    return 'Define a constant number manually';
  }

  public getTags(): string[] {
    return ['Input'];
  }

  protected getInputName(): string {
    return numberName;
  }

  protected getInputType(): AbstractType {
    return new NumberType();
  }

  public getColor(): TRgba {
    return NUMBER_COLOR.multiply(0.5);
  }
}

export class CONSTANT_String extends PRIMITIVE_CONSTANT {
  private editor: HTMLDivElement | undefined;
  private editListenIds: string[] = [];

  public getName() {
    return 'Constant String';
  }
  public getDescription(): string {
    return 'Define a constant string manually; double-click it to edit';
  }

  onNodeDoubleClick = (): void => {
    this.startEditing();
  };

  // Enter on the selected node edits it, like a double-click
  public onEnterKeyPressed(): boolean {
    this.startEditing();
    return true;
  }

  public isInteractionEnabled(): boolean {
    return this.editor !== undefined;
  }

  public enableInteraction(): void {
    this.startEditing();
  }

  private startEditing(): void {
    const socket = this.getInputSocketByName(stringName);
    // a linked value comes from upstream, so there is nothing to edit here
    if (this.editor || !socket || socket.hasLink()) {
      return;
    }
    const editor = document.createElement('div');
    editor.contentEditable = 'plaintext-only';
    editor.setAttribute(DATA_DASHBOARD_EDITABLE, 'true');
    editor.dataset.cy = 'constant-string-editor';
    editor.innerText = String(this.getInputData(stringName) ?? '');
    Object.assign(editor.style, {
      position: 'absolute',
      fontFamily: 'Arial',
      fontSize: `${constantFontSize}px`,
      color: socket.dataType.getColor().hex(),
      whiteSpace: 'pre',
      // PIXI lines up multi-line text on the left inside its centred block
      textAlign: 'left',
      minWidth: '20px',
      background: 'transparent',
      outline: 'none',
      transformOrigin: 'top left',
    });
    editor.addEventListener('input', () => this.onEditorInput());
    editor.addEventListener('blur', () => this.stopEditing());
    document.body.appendChild(editor);
    this.editor = editor;

    this.showDrawnConstant = false;
    this.drawNodeShape();
    this.positionEditor();
    editor.focus();
    window.getSelection()?.selectAllChildren(editor);

    this.editListenIds.push(
      InterfaceController.addListener(ListenEvent.EscapeKeyUsed, () =>
        this.stopEditing(),
      ),
      InterfaceController.addListener(ListenEvent.SelectionChanged, () => {
        if (!PPGraph.currentGraph.selection.isOnlySelectedNode(this)) {
          this.stopEditing();
        }
      }),
    );
  }

  private stopEditing(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    // cleared first: removing a focused element fires blur, which re-enters
    this.editor = undefined;
    editor.remove();
    InterfaceController.removeListeners(this.editListenIds);
    this.editListenIds = [];
    this.showDrawnConstant = true;
    this.drawNodeShape();
  }

  private onEditorInput(): void {
    if (!this.editor) {
      return;
    }
    const text = this.editor.innerText;
    const setValueArgs: SetSocketValueActionArgs = {
      nodeID: this.id,
      socketName: stringName,
      socketType: SOCKET_TYPE.IN,
      newValue: text,
    };
    // consecutive edits merge in the action handler, so undo restores the
    // text from before editing started
    const undoSetValueArgs: SetSocketValueActionArgs = {
      ...setValueArgs,
      newValue: this.getInputData(stringName),
    };
    void PNPAction(
      ACTIONS.SET_SOCKET_VALUE,
      setValueArgs,
      undoSetValueArgs,
      getSocketChecksum(this.getInputSocketByName(stringName)),
    );
    // resize now rather than after execution, so the editor never overflows
    if (this.drawnConstant) {
      this.drawnConstant.text = text;
    }
    this.resizeAndDraw(0, 0);
    this.positionEditor();
  }

  // the editor sits exactly over the hidden canvas text, scaled with the view
  private positionEditor(): void {
    if (!this.editor || !this.drawnConstant) {
      return;
    }
    const scale = PPGraph.currentGraph.viewportScaleX;
    const topLeft = PPGraph.currentGraph.viewport.toScreen(
      this.x + this.drawnConstant.x - this.drawnConstant.width / 2,
      this.y + this.drawnConstant.y - this.drawnConstant.height / 2,
    );
    Object.assign(this.editor.style, {
      left: `${topLeft.x}px`,
      top: `${topLeft.y}px`,
      width: `${this.drawnConstant.width}px`,
      transform: `scale(${scale})`,
    });
  }

  protected onViewportMove(): void {
    this.positionEditor();
  }

  onRemoved(): void {
    this.stopEditing();
    super.onRemoved();
  }

  public getTags(): string[] {
    return ['Input'];
  }

  public getColor(): TRgba {
    return NUMBER_COLOR.multiply(0.5);
  }

  protected getInputName(): string {
    return stringName;
  }

  protected getInputType(): AbstractType {
    return new StringType();
  }
}
