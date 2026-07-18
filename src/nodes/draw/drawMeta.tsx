import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import {
  DeferredPixiType,
  DeferredPixiTypeInterface,
} from '../datatypes/deferredPixiType';
import { NumberType } from '../datatypes/numberType';
import { outputPixiName } from './abstract';
import * as PIXI from 'pixi.js';

const outputXName = 'X';
const outputYName = 'Y';
const outputWidthName = 'Width';
const outputHeightName = 'Height';
const inputMarginName = 'Margin';

export default class DRAW_Get_Bounds extends PPNode {
  static hashedBounds: Record<string, PIXI.Rectangle> = {};
  public getName(): string {
    return 'Get Draw Bounds';
  }

  public getDescription(): string {
    return 'Returns the bounds from a draw with optional side margin parameter';
  }

  public getTags(): string[] {
    return ['Draw'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DRAW);
  }
  public getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, outputPixiName, new DeferredPixiType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputMarginName,
        new NumberType(false, 0, 100),
        0,
      ),
      new Socket(SOCKET_TYPE.OUT, outputXName, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputYName, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputWidthName, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, outputHeightName, new NumberType()),
    ];
  }

  public static async getDrawingBounds(
    drawingFunction: DeferredPixiTypeInterface,
    marginX: number = 0,
    marginY: number = 0,
    position,
    topParentOverrideSettings,
  ): Promise<PIXI.Rectangle> {
    const tempContainer = new PIXI.Container();
    if (
      drawingFunction == undefined ||
      typeof drawingFunction.drawFunction !== 'function'
    ) {
      console.warn("Drawing function wasn't a function");
      return new PIXI.Rectangle();
    }
    await drawingFunction.drawFunction(
      tempContainer,
      position,
      topParentOverrideSettings,
    );
    const rect = tempContainer.getBounds().rectangle;

    tempContainer.children.forEach((child) => {
      if (child instanceof PIXI.Sprite) {
        const textureURL = child.texture.baseTexture.resource.url;
        void PIXI.Assets.unload(textureURL);
      }
    });

    tempContainer.destroy();
    const bounds = structuredClone(rect);
    bounds.x -= marginX;
    bounds.y -= marginY;
    bounds.width += marginX * 2;
    bounds.height += marginY * 2;
    bounds.width = Math.max(bounds.width, 1);
    bounds.height = Math.max(bounds.height, 1);
    return bounds;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const drawingFunction: DeferredPixiTypeInterface = input[outputPixiName];
    const bounds = await DRAW_Get_Bounds.getDrawingBounds(
      drawingFunction,
      input[inputMarginName],
      input[inputMarginName],
      new PIXI.Point(),
      {},
    );
    output[outputXName] = bounds.x;
    output[outputYName] = bounds.y;
    output[outputWidthName] = bounds.width;
    output[outputHeightName] = bounds.height;
    return;
  }
}
