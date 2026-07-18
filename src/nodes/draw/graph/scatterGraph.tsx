import Socket from '../../../classes/SocketClass';
import { SOCKET_TYPE } from '../../../utils/constants';
import { TRgba } from '../../../utils/color';
import { BooleanType } from '../../datatypes/booleanType';
import { ColorType } from '../../datatypes/colorType';
import {
  getMinMaxValuesOfArray,
  GraphInputPointXY,
  GraphInputXYType,
} from '../../datatypes/graphInputType';
import { NumberType } from '../../datatypes/numberType';
import { DRAW_Base } from '../abstract';

import * as PIXI from 'pixi.js';
import {
  axisMaxName,
  axisMinName,
  dynamicAxisName,
  getAxisLinesStroke,
  getConnectingLineStroke,
  getConfidenceIntervalStroke,
  getTrendLineStroke,
  GRAPH_AXIS,
  inputShowNamesTilted,
} from './axisGraph';
import { StringType } from '../../datatypes/stringType';
import { prettyPrintNumber } from '../../../utils/utils';
import { calculateTrendLine } from './trendLine';
import PPGraph from '../../../classes/GraphClass';
export const inputDataName = 'Input Data';
export const inputHeightName = 'Height';
export const inputWidthName = 'Width';
export const inputCustomMinHeight = 'Custom min height';
export const inputCustomMaxHeight = 'Custom max height';
export const inputShouldShowAxisLines = 'Show axis lines';
export const inputAxisGranularityX = 'Axis granularity X';
export const inputAxisGranularityY = 'Axis granularity Y';
export const inputShowValuesFontSize = 'Font size';
export const inputShowTrendLine = 'Show Trend Line';
export const inputShowTrendLineHeader = 'Show Trend Line Header';
export const inputShowTrendLineCI = 'Show Trend Line CI';
export const inputShowConnectingLine = 'Show Connecting Line';

export const circleSize = 'Circle Size';

const axisXName = 'X Axis Name';
const axisYName = 'Y Axis Name';

const singleColor = 'Color';
const trendLineColor = 'Trend Line Color';
const roundedNumbers = 'Rounded Numbers';

const dynamicStartAndEndName = 'Dynamic Start and End';
const startName = 'Start';
const endName = 'End';

export abstract class GRAPH_SCATTER extends DRAW_Base {
  public getName(): string {
    return 'Draw Scatter Graph';
  }

  public getDescription(): string {
    return 'Draws a Scatter Graph based on 2 axes';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputDataName, new GraphInputXYType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputWidthName,
        new NumberType(false, 1, 2000),
        600,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputHeightName,
        new NumberType(false, 1, 1000),
        300,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShouldShowAxisLines,
        new BooleanType(),
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputAxisGranularityX,
        new NumberType(true, 1, 10),
        3,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputAxisGranularityY,
        new NumberType(true, 1, 10),
        3,
      ),
      new Socket(SOCKET_TYPE.IN, axisXName, new StringType()),
      new Socket(SOCKET_TYPE.IN, axisYName, new StringType()),
      new Socket(
        SOCKET_TYPE.IN,
        singleColor,
        new ColorType(),
        new TRgba(44, 103, 222, 0.6),
      ),
      new Socket(SOCKET_TYPE.IN, circleSize, new NumberType(), 8),
      new Socket(SOCKET_TYPE.IN, inputShowTrendLine, new BooleanType(), false),
      new Socket(
        SOCKET_TYPE.IN,
        inputShowTrendLineCI,
        new BooleanType(),
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShowConnectingLine,
        new BooleanType(),
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        trendLineColor,
        new ColorType(),
        TRgba.randomColor(),
        () => this.getInputData(inputShowTrendLine),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShowTrendLineHeader,
        new BooleanType(),
        true,
        () => this.getInputData(inputShowTrendLine),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShowNamesTilted,
        new BooleanType(),
        false,
      ),
      new Socket(SOCKET_TYPE.IN, inputShowValuesFontSize, new NumberType(), 12),
      new Socket(SOCKET_TYPE.IN, roundedNumbers, new BooleanType(), false),
      new Socket(
        SOCKET_TYPE.IN,
        dynamicStartAndEndName,
        new BooleanType(),
        true,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        startName,
        new NumberType(),
        0,
        () => !this.getInputData(dynamicStartAndEndName),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        endName,
        new NumberType(),
        0,
        () => !this.getInputData(dynamicStartAndEndName),
      ),
    ]
      .concat(GRAPH_AXIS.getAxisParams(this))
      .concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const points: GraphInputPointXY[] = inputObject[inputDataName];
    if (!points.length) {
      return;
    }
    let [minValue1, maxValue1] = getMinMaxValuesOfArray(
      points.map((point) => point.Value1),
    );
    let [minValue2, maxValue2] = getMinMaxValuesOfArray(
      points.map((point) => point.Value2),
    );

    if (!inputObject[dynamicStartAndEndName]) {
      minValue1 = inputObject[startName];
      maxValue1 = inputObject[endName];
    }

    if (!inputObject[dynamicAxisName]) {
      minValue2 = inputObject[axisMinName];
      maxValue2 = inputObject[axisMaxName];
    }

    const width = inputObject[inputWidthName];
    const height = inputObject[inputHeightName];
    const scaleX = Math.max((maxValue1 - minValue1) / width, 0.001);
    const scaleY = Math.max((maxValue2 - minValue2) / height, 0.001);

    const graphics: PIXI.Graphics = new PIXI.Graphics();

    const fontSize = inputObject[inputShowValuesFontSize];
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: fontSize,
      whiteSpace: 'pre-line',
      wordWrap: true,
      wordWrapWidth: width,
    });

    // draw the graph itself
    // TODO figure out elegant way to do this generically for X and Y
    const samplesX = inputObject[inputAxisGranularityX];
    const samplesY = inputObject[inputAxisGranularityY];

    // in order for graphs to combine properly when there is not dynamic axes used we need to always put down bottom and top axis
    const samplesYToUse = !inputObject[dynamicAxisName]
      ? Math.max(3, samplesY)
      : samplesY;

    for (let i = 0; i <= samplesYToUse; i++) {
      const ratio = i / Math.max(1, samplesYToUse);
      const currPos = height * ratio;
      graphics.moveTo(0, -currPos);

      const num = ratio * (maxValue2 - minValue2) + minValue2;
      const basicText = new PIXI.Text({
        text: inputObject[roundedNumbers]
          ? Math.round(num)
          : prettyPrintNumber(num),
        style: textStyle,
      });
      basicText.x = -10;
      basicText.anchor.x = 1.0;
      basicText.anchor.y = 0.5;
      basicText.y = -currPos;
      if (samplesYToUse > samplesY) {
        basicText.alpha = 0.01; // make it invisible but still counted by PIXI
      }

      graphics.addChild(basicText);
      if (inputObject[inputShouldShowAxisLines]) {
        graphics.lineTo(width, -currPos);
      }
    }
    for (
      let i = 0;
      i <= samplesX;
      i +=
        i + 0.99 > samplesX ? Math.max(0.1, samplesX - Math.floor(samplesX)) : 1
    ) {
      const ratio = i / Math.max(1, samplesX);
      const currPos = width * ratio;
      graphics.moveTo(currPos, 0);

      const value = ratio * (maxValue1 - minValue1) + minValue1;
      // Round if within 0.01 of a whole number
      const isCloseToWholeNumber = Math.abs(Math.round(value) - value) < 0.01;
      const textValue = isCloseToWholeNumber
        ? Math.round(value).toString()
        : prettyPrintNumber(value);

      const basicText = new PIXI.Text({
        text: textValue,
        style: textStyle,
      });
      basicText.y = 20;
      basicText.anchor.y = 0.0;
      basicText.anchor.x = 0.5;
      basicText.x = currPos;
      if (inputObject[inputShowNamesTilted]) {
        basicText.angle = inputObject[inputShowNamesTilted] ? -45 : 0;
        basicText.anchor.x = 1.0;
      }
      graphics.addChild(basicText);
      if (inputObject[inputShouldShowAxisLines]) {
        graphics.lineTo(currPos, -height);
      }
    }
    graphics.stroke(getAxisLinesStroke());

    // potentially draw trend line

    // draw axis labels
    const labelTextStyle = textStyle.clone();
    labelTextStyle.fontStyle = 'italic';
    labelTextStyle.fontSize *= 1.5;
    const xLabel = new PIXI.Text({
      style: labelTextStyle,
      text: inputObject[axisXName],
    });
    const yLabel = new PIXI.Text({
      style: labelTextStyle,
      text: inputObject[axisYName],
    });
    xLabel.anchor.x = 0.5;
    xLabel.anchor.y = 0.0;
    xLabel.y = 70;
    xLabel.x = width / 2;
    graphics.addChild(yLabel);
    yLabel.anchor.x = 0.5;
    yLabel.anchor.y = 0.0;
    yLabel.x = -100;
    yLabel.angle = 270;
    yLabel.y = -height / 2;
    graphics.addChild(xLabel);

    if (inputObject[inputShowTrendLine]) {
      const [mBase, bBase, mCI, bCI] = calculateTrendLine(points);

      const drawLine = (m: number, b: number, stroke: PIXI.Stroke) => {
        const intersectionX0 = (minValue2 - b) / m;
        const intersectionXMax = (maxValue2 - b) / m;

        const smallest = Math.min(intersectionX0, intersectionXMax);
        const largest = Math.max(intersectionX0, intersectionXMax);

        // Calculate start and end points of the trend line
        const startX = Math.max(Math.min(minValue1, largest), smallest);
        const startY = m * startX + b;
        const endX = Math.max(Math.min(maxValue1, largest), smallest);
        const endY = m * endX + b;

        // Convert to graph coordinates
        const screenStartX = (startX - minValue1) / scaleX;
        const screenStartY = height - (startY - minValue2) / scaleY;
        const screenEndX = (endX - minValue1) / scaleX;
        const screenEndY = height - (endY - minValue2) / scaleY;

        graphics.moveTo(screenStartX, screenStartY - height);
        graphics.lineTo(screenEndX, screenEndY - height);

        graphics.stroke(stroke);
      };
      drawLine(mBase, bBase, getTrendLineStroke(inputObject[trendLineColor]));
      if (inputObject[inputShowTrendLineCI]) {
        drawLine(
          mCI[0],
          bCI[0],
          getConfidenceIntervalStroke(new TRgba(255, 0, 0, 0.5)),
        );
        drawLine(
          mCI[1],
          bCI[1],
          getConfidenceIntervalStroke(new TRgba(255, 0, 0, 0.5)),
        );
      }

      if (inputObject[inputShowTrendLineHeader]) {
        const equationTextStyle = labelTextStyle.clone();
        equationTextStyle.fontStyle = 'italic';

        const equationText = new PIXI.Text({
          style: equationTextStyle,
          text: `Trend: y = ${prettyPrintNumber(mBase)}x + ${prettyPrintNumber(bBase)}`,
        });
        equationText.anchor.x = 0.5;
        equationText.anchor.y = 1.0;
        equationText.x = width / 2;
        equationText.y = -height - 30;
        graphics.addChild(equationText);
      }
    }

    let selectedColor = inputObject[singleColor];
    // draw the points
    graphics.moveTo(0, 0);
    if (inputObject[inputShowConnectingLine]) {
      graphics.setStrokeStyle(getConnectingLineStroke(selectedColor));
    }
    points.forEach((point, index) => {
      // making a new graphics because I want to be able to draw the name of the entry when hovered

      const pointGraphics = new PIXI.Graphics();
      const posX = (point.Value1 - minValue1) / scaleX;
      const posY = (minValue2 - point.Value2) / scaleY;
      if (index == 0) {
        graphics.moveTo(posX, posY);
      }
      const sizeToUse =
        point['Size'] !== undefined ? point['Size'] : inputObject[circleSize];
      pointGraphics.circle(posX, posY, sizeToUse);
      if (inputObject[inputShowConnectingLine]) {
        graphics.lineTo(posX, posY);
      }
      if (point['Color'] !== undefined) {
        const color = point['Color'];
        selectedColor = TRgba.fromObject(color);
      }
      pointGraphics.fill({
        color: selectedColor.hexNumber(),
        alpha: selectedColor.getAlpha(true),
      });

      this.addHoverInfoListenTargetGraph(
        pointGraphics,
        container,
        point.Name || '',
        point.Value1,
        point.Value2,
      );

      this.potentiallyAddClickInteraction(pointGraphics, inputObject, point);

      graphics.addChild(pointGraphics);
    });
    graphics.stroke();

    container.addChild(graphics);
  }
}
