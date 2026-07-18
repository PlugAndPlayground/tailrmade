import PPNode from '../../../classes/NodeClass';
import Socket from '../../../classes/SocketClass';
import { GRAPH_RESOLUTION, SOCKET_TYPE } from '../../../utils/constants';
import { TRgba } from '../../../utils/color';
import { prettyPrintNumber } from '../../../utils/utils';
import { BooleanType } from '../../datatypes/booleanType';
import {
  getMinMaxValuesOfArray,
  GraphInputPointX,
  GraphInputXType,
} from '../../datatypes/graphInputType';
import { NumberType } from '../../datatypes/numberType';
import { DRAW_Base } from '../abstract';

import * as PIXI from 'pixi.js';
import {
  inputClickMacroInitialParameters,
  inputClickMacroName,
  inputUseClickName,
} from '../interactivityConstants';
import { DynamicEnumType } from '../../datatypes/dynamicEnumType';
import { ExecuteMacro } from '../../macro/macro';
import { ArrayType } from '../../datatypes/arrayType';
export const inputDataName = 'Input Data';
export const inputHeightName = 'Height';
export const inputWidthName = 'Width';
export const inputCustomMinHeight = 'Custom min height';
export const inputCustomMaxHeight = 'Custom max height';
export const inputShouldShowAxis = 'Show axis';
export const inputShouldShowAxisLines = 'Show axis lines';
export const inputAxisGranularity = 'Axis granularity';
export const inputShouldShowValues = 'Show values';
export const inputShowValuesFontSize = 'Font size';
export const inputShowNames = 'Show names';
export const inputShowNamesTilted = 'Tilted names';
export const inputShowNamesRatio = 'Name ratio';
export const inputLineWidthName = 'Line Width';

export const useSingleColorName = 'Use Single Graph Color';
export const singleColor = 'Graph Color';

export const dynamicAxisName = 'Dynamic Graph Axis';
export const dynamixAxisStartAt0 = 'Start at 0';
export const axisMinName = 'Graph Axis Min';
export const axisMaxName = 'Graph Axis Max';

export const getAxisLinesStroke = () => {
  return {
    width: 1,
    color: TRgba.black().hexNumber(),
    alpha: 0.2,
    resolution: GRAPH_RESOLUTION,
  };
};

export const getTrendLineStroke = (trendLineColor: TRgba) => {
  return {
    width: 3,
    color: trendLineColor.hexNumber(),
    alpha: 0.5,
    resolution: GRAPH_RESOLUTION,
  };
};

export const getConfidenceIntervalStroke = (color: TRgba) => {
  return {
    width: 2,
    color: color.hexNumber(),
    alpha: 0.15,
    resolution: GRAPH_RESOLUTION,
  };
};
export const getConnectingLineStroke = (color: TRgba) => {
  return {
    width: 3,
    color: color.hexNumber(),
    alpha: 0.5,
    resolution: GRAPH_RESOLUTION,
  };
};

// assumed to be an input object that contains the axis params as well as the input data of type GraphInputPointX
export function getAxisMinMax(inputObject: any): [number, number] {
  if (inputObject[dynamicAxisName]) {
    let minMax = getMinMaxValuesOfArray(
      inputObject[inputDataName].map((point) => point.Value),
    );
    if (inputObject[dynamixAxisStartAt0]) {
      minMax[0] = 0;
    }
    return minMax;
  } else {
    return [inputObject[axisMinName], inputObject[axisMaxName]];
  }
}

export function getMacroClickSockets(node: PPNode) {
  return [
    new Socket(SOCKET_TYPE.IN, inputUseClickName, new BooleanType(), false),
    Socket.getOptionalVisibilitySocket(
      SOCKET_TYPE.IN,
      inputClickMacroName,
      new DynamicEnumType(
        () => ExecuteMacro.getMacroOptions(),
        () => {},
      ),
      '',
      () => node.getInputData(inputUseClickName),
    ),
    Socket.getOptionalVisibilitySocket(
      SOCKET_TYPE.IN,
      inputClickMacroInitialParameters,
      new ArrayType(),
      [],
      () => node.getInputData(inputUseClickName),
    ),
  ];
}

export abstract class GRAPH_AXIS extends DRAW_Base {
  public isCallingMacro(macroName: string): boolean {
    return this.getInputData(inputClickMacroName) == macroName;
  }

  public static getAxisParams(node: PPNode): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, dynamicAxisName, new BooleanType(), true),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        dynamixAxisStartAt0,
        new BooleanType(),
        true,
        () => node.getInputData(dynamicAxisName),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        axisMinName,
        new NumberType(false, 0, 100),
        0,
        () => !node.getInputData(dynamicAxisName),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        axisMaxName,
        new NumberType(false, 0, 100),
        100,
        () => !node.getInputData(dynamicAxisName),
      ),
    ].concat(getMacroClickSockets(node));
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputDataName, new GraphInputXType(), [
        { Value: 0, Name: 'First', Color: new TRgba(33, 150, 243, 1) },
        { Value: 1, Name: 'Second' },
        { Value: 5, Name: 'Third' },
        { Value: 10, Name: 'Fourth' },
        { Value: 7, Name: 'Dingus' },
      ]),

      new Socket(
        SOCKET_TYPE.IN,
        inputWidthName,
        new NumberType(false, 1, 2000),
        400,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputHeightName,
        new NumberType(false, 1, 1000),
        200,
      ),

      new Socket(
        SOCKET_TYPE.IN,
        inputShouldShowAxis,
        new BooleanType(),
        true,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputLineWidthName,
        new NumberType(false, 1, 10),
        2,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShouldShowAxisLines,
        new BooleanType(),
        true,
        () => this.getInputData(inputShouldShowAxis),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputAxisGranularity,
        new NumberType(true, 1, 10),
        3,
        () => this.getInputData(inputShouldShowAxis),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShouldShowValues,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, inputShowValuesFontSize, new NumberType(), 12),
      new Socket(SOCKET_TYPE.IN, inputShowNames, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShowNamesTilted,
        new BooleanType(),
        false,
        () => this.getInputData(inputShowNames),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShowNamesRatio,
        new NumberType(false, 0, 1),
        1,
        () => this.getInputData(inputShowNames),
      ),
    ]
      .concat(GRAPH_AXIS.getAxisParams(this))
      .concat(super.getDefaultIO());
  }

  protected getTextStyle(inputObject: Record<string, any>): PIXI.TextStyle {
    const fontSize: number = inputObject[inputShowValuesFontSize];
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: fontSize,
      whiteSpace: 'pre-line',
      wordWrap: true,
      wordWrapWidth: inputObject[inputWidthName],
    });
    return textStyle;
  }

  protected drawValueText(
    name: string,
    inputObject: any,
    x: number,
    graphics: PIXI.Graphics | PIXI.Container,
    index: number,
    max: number,
  ): void {
    const ratio = inputObject[inputShowNamesRatio];
    const shouldDraw =
      index == 0 || Math.floor(ratio * index) > Math.floor(ratio * (index - 1));
    if (shouldDraw) {
      const basicText = new PIXI.Text({
        text: name,
        style: this.getTextStyle(inputObject),
      });
      basicText.x = x;
      basicText.anchor.x = 0.5;
      basicText.anchor.y = 0.0;
      basicText.y = 10;
      if (inputObject[inputShowNamesTilted]) {
        basicText.angle = inputObject[inputShowNamesTilted] ? -45 : 0;
        basicText.anchor.x = 1.0;
      }
      graphics.addChild(basicText);
    }
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const points: GraphInputPointX[] = inputObject[inputDataName];
    if (!points.length) {
      return;
    }
    const [minValue, maxValue] = getAxisMinMax(inputObject);
    const graphics: PIXI.Graphics = new PIXI.Graphics();

    const fontSize = inputObject[inputShowValuesFontSize];
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: fontSize,
      whiteSpace: 'pre-line',
      wordWrap: true,
      wordWrapWidth: inputObject[inputWidthName],
    });

    if (inputObject[inputShouldShowAxis]) {
      const samples = inputObject[inputAxisGranularity];
      for (let i = 0; i < samples; i++) {
        const ratio = i / Math.max(1, samples - 1);
        const currPos = inputObject[inputHeightName] * ratio;
        graphics.moveTo(0, -currPos);

        const basicText = new PIXI.Text(
          prettyPrintNumber(ratio * (maxValue - minValue) + minValue),
          textStyle,
        );
        basicText.x = -10;
        basicText.anchor.x = 1.0;
        basicText.anchor.y = 0.5;
        basicText.y = -currPos;
        graphics.addChild(basicText);
        if (inputObject[inputShouldShowAxisLines]) {
          graphics.lineTo(inputObject[inputWidthName], -currPos);
        }
      }
      graphics.stroke(getAxisLinesStroke());
    }
    container.addChild(graphics);
  }
}
