import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NODE_MARGIN, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { NUMBER_COLOR, NumberType } from '../datatypes/numberType';
import * as PIXI from 'pixi.js';
import { StringType } from '../datatypes/stringType';
import { AbstractType } from '../datatypes/abstractType';
import { BackPropagation } from '../../interfaces';

const numberName = 'Number';
const stringName = 'String';

abstract class PRIMITIVE_CONSTANT extends PPNode {
  drawnConstant: PIXI.Text = undefined;

  public getParallelInputsOutputs(): boolean {
    return true;
  }

  protected abstract getInputName(): string;
  protected abstract getInputType(): AbstractType;

  public getShowLabels(): boolean {
    return false;
  }

  public getMinNodeHeight(): number {
    if (!this.drawnConstant) {
      this.drawConstant();
    }
    return this.drawnConstant.height + 20;
  }

  public getMinNodeWidth(): number {
    if (this.drawnConstant == undefined) {
      this.drawConstant();
    }
    return this.drawnConstant.width + 50;
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
    this.drawnConstant.style.fontSize = 30;
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
    this.removeChild(this.drawnConstant);
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
  public getName() {
    return 'Constant String';
  }
  public getDescription(): string {
    return 'Define a constant string manually';
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
