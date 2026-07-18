import { DRAW_Base, outputPixiName } from './abstract';
import { SOCKET_TYPE } from '../../utils/constants';
import { BooleanType } from '../datatypes/booleanType';
import {
  DeferredPixiType,
  DeferredPixiTypeInterface,
} from '../datatypes/deferredPixiType';
import { DynamicInputNodeFunctions } from '../abstract/DynamicInputNode';
import * as PIXI from 'pixi.js';
import Socket from '../../classes/SocketClass';
import { inputGraphicsName } from './draw';
import { StringType } from '../datatypes/stringType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { ExecuteMacro, macroNameName } from '../macro/macro';
import { ArrayType } from '../datatypes/arrayType';
import PPGraph from '../../classes/GraphClass';
import { ColorType } from '../datatypes/colorType';
import { NumberType } from '../datatypes/numberType';
import { TRgba } from '../../utils/color';
import {
  inputClickMacroName,
  inputClickMacroParameters,
  inputUseClickName,
} from './interactivityConstants';

const inputHoverLabel = 'Hover Text Label';
const inputHoverFontSize = 'Hover Text Font Size';
const inputHoverFontColor = 'Hover Text Color';
const inputHoverBorder = 'Hover Text Border';

export class DRAW_Interactivity extends DRAW_Base {
  public getName(): string {
    return 'Add Draw Interactivity';
  }

  public getDescription(): string {
    return 'Add hover and/or click event to drawn object';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputGraphicsName, new DeferredPixiType()),
      new Socket(SOCKET_TYPE.IN, inputHoverLabel, new StringType()),
      new Socket(SOCKET_TYPE.IN, inputHoverFontSize, new NumberType(), 12),
      new Socket(
        SOCKET_TYPE.IN,
        inputHoverFontColor,
        new ColorType(),
        new TRgba(0, 0, 0, 1),
      ),
      new Socket(SOCKET_TYPE.IN, inputUseClickName, new BooleanType(), false),
      new Socket(
        SOCKET_TYPE.IN,
        inputClickMacroName,
        new DynamicEnumType(
          () => ExecuteMacro.getMacroOptions(),
          () => {},
        ),
      ),
      new Socket(SOCKET_TYPE.IN, inputClickMacroParameters, new ArrayType()),
      new Socket(SOCKET_TYPE.IN, inputHoverBorder, new BooleanType(), true),
    ].concat(super.getDefaultIO());
  }

  public isCallingMacro(macroName: string): boolean {
    return (
      super.isCallingMacro(macroName) ||
      this.getInputData(inputClickMacroName) == macroName
    );
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
  ): Promise<void> {
    const myContainer = new PIXI.Container();
    const drawingFunction: DeferredPixiTypeInterface =
      inputObject[inputGraphicsName];
    await drawingFunction.drawFunction(
      myContainer,
      new PIXI.Point(0, 0),
      topParentOverrideSettings,
    );
    myContainer.eventMode = 'static';
    myContainer.cursor = 'pointer';
    if (inputObject[inputHoverLabel].length) {
      this.addHoverInfoListenTarget(
        myContainer,
        container,
        inputObject[inputHoverLabel],
        inputObject[inputHoverFontSize],
        inputObject[inputHoverFontColor],
        inputObject[inputHoverBorder],
      );
    }
    if (inputObject[inputUseClickName]) {
      const clonedParameters = structuredClone(
        inputObject[inputClickMacroParameters],
      );
      myContainer.on('pointerdown', () => {
        void PPGraph.currentGraph.invokeMacro(
          inputObject[inputClickMacroName],
          clonedParameters,
        );
      });
    }
    container.addChild(myContainer);
  }
}
