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
  NODE_SOURCE,
  NOTE_LINEHEIGHT_FACTOR,
  SOCKET_TYPE,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { NUMBER_COLOR, NumberType } from '../datatypes/numberType';
import * as PIXI from 'pixi.js';
import { StringType } from '../datatypes/stringType';
import { AbstractType } from '../datatypes/abstractType';
import { BackPropagation } from '../../interfaces';
import { StaticValue, UNKNOWN_STATIC_VALUE } from '../../classes/StaticValue';
import type { SerializedNode, TNodeSource } from '../../utils/interfaces';

const numberName = 'Number';
const stringName = 'String';
const constantFontSize = 30;
// set explicitly so the canvas text and its HTML editor space lines alike
const constantLineHeight = constantFontSize * NOTE_LINEHEIGHT_FACTOR;

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
    this.drawnConstant.style.lineHeight = constantLineHeight;
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
    this.syncEditorWithValue(input[this.getInputName()]);
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

  // --- editing the value in place on the canvas ---

  // a textarea, not a contenteditable: its value is exactly the typed text,
  // where a contenteditable turns line breaks into markup
  private editor: HTMLTextAreaElement | undefined;
  private editListenIds: string[] = [];

  // the value typed text stands for, or undefined while it is not one yet
  protected abstract parseEditedText(text: string): unknown;
  // Enter adds a line, or finishes editing
  protected abstract allowsLineBreaks(): boolean;
  // characters that can never be part of the value are not typed or pasted
  protected acceptsText(_text: string): boolean {
    return true;
  }

  onNodeDoubleClick = (): void => {
    this.startEditing();
  };

  // a new constant is ready to type into, like a new Dynamic text
  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    if (source === NODE_SOURCE.NEW || source === NODE_SOURCE.NEWCONNECTED) {
      this.startEditing();
    }
  }

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
    const socket = this.getInputSocketByName(this.getInputName());
    // a linked value comes from upstream, so there is nothing to edit here
    if (this.editor || !socket || socket.hasLink()) {
      return;
    }
    const editor = document.createElement('textarea');
    editor.wrap = 'off';
    editor.spellcheck = false;
    editor.setAttribute(DATA_DASHBOARD_EDITABLE, 'true');
    editor.dataset.cy = `constant-${this.getInputName().toLowerCase()}-editor`;
    editor.value = String(this.getInputData(this.getInputName()) ?? '');
    Object.assign(editor.style, {
      position: 'absolute',
      fontFamily: 'Arial',
      fontSize: `${constantFontSize}px`,
      lineHeight: `${constantLineHeight}px`,
      color: socket.dataType.getColor().hex(),
      whiteSpace: 'pre',
      // PIXI lines up multi-line text on the left inside its centred block
      textAlign: 'left',
      minWidth: '20px',
      minHeight: `${constantLineHeight}px`,
      margin: '0',
      padding: '0',
      border: '0 none',
      background: 'transparent',
      outline: 'none',
      resize: 'none',
      overflow: 'hidden',
      transformOrigin: 'top left',
    });
    editor.addEventListener('input', () => this.onEditorInput());
    editor.addEventListener('blur', () => this.stopEditing());
    editor.addEventListener('beforeinput', (event) => {
      const text = event.data ?? event.dataTransfer?.getData('text/plain');
      if (text && !this.acceptsText(text)) {
        event.preventDefault();
      }
    });
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !this.allowsLineBreaks()) {
        event.preventDefault();
        this.stopEditing();
      }
    });
    document.body.appendChild(editor);
    this.editor = editor;

    this.showDrawnConstant = false;
    this.drawNodeShape();
    this.positionEditor();
    editor.focus();
    editor.select();

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

  // a value set from outside while editing (undo, the inspector, a default
  // from the socket it was added to) replaces the typed text
  private syncEditorWithValue(value: unknown): void {
    if (!this.editor) {
      return;
    }
    // added from an output socket: the input got linked after editing began
    if (this.getInputSocketByName(this.getInputName())?.hasLink()) {
      this.stopEditing();
      return;
    }
    const typed = this.parseEditedText(this.editor.value);
    // a half-typed value ("-") is never overwritten
    if (typed !== undefined && typed !== value) {
      this.editor.value = String(value ?? '');
      this.editor.select();
    }
  }

  private onEditorInput(): void {
    if (!this.editor) {
      return;
    }
    const text = this.editor.value;
    const value = this.parseEditedText(text);
    if (value !== undefined) {
      const setValueArgs: SetSocketValueActionArgs = {
        nodeID: this.id,
        socketName: this.getInputName(),
        socketType: SOCKET_TYPE.IN,
        newValue: value,
      };
      // consecutive edits merge in the action handler, so undo restores the
      // value from before editing started
      const undoSetValueArgs: SetSocketValueActionArgs = {
        ...setValueArgs,
        newValue: this.getInputData(this.getInputName()),
      };
      void PNPAction(
        ACTIONS.SET_SOCKET_VALUE,
        setValueArgs,
        undoSetValueArgs,
        getSocketChecksum(this.getInputSocketByName(this.getInputName())),
      );
    }
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
      // a little wider than the text, so the caret after it is never clipped
      width: `${this.drawnConstant.width + 4}px`,
      height: `${this.drawnConstant.height}px`,
      transform: `scale(${scale})`,
    });
  }

  // also called when the node itself moves (see setPosition)
  protected onViewportMove(): void {
    this.positionEditor();
  }

  onRemoved(): void {
    this.stopEditing();
    super.onRemoved();
  }
}

export class CONSTANT_Number extends PRIMITIVE_CONSTANT {
  public getName() {
    return 'Constant Number';
  }
  public getDescription(): string {
    return 'Define a constant number manually; double-click it to edit';
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

  // "", "-" and "1e" are on their way to a number, so they are not committed
  protected parseEditedText(text: string): number | undefined {
    const value = Number(text.trim());
    return text.trim() !== '' && Number.isFinite(value) ? value : undefined;
  }

  protected allowsLineBreaks(): boolean {
    return false;
  }

  protected acceptsText(text: string): boolean {
    return /^[0-9.eE+-]*$/.test(text);
  }
}

export class CONSTANT_String extends PRIMITIVE_CONSTANT {
  public getName() {
    return 'Constant String';
  }
  public getDescription(): string {
    return 'Define a constant string manually; double-click it to edit';
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

  protected parseEditedText(text: string): string {
    return text;
  }

  protected allowsLineBreaks(): boolean {
    return true;
  }
}
