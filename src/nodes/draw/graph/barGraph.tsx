import Socket from '../../../classes/SocketClass';
import { SOCKET_TYPE } from '../../../utils/constants';
import {
  GraphInputPointX,
  getGraphInputPointColor,
} from '../../datatypes/graphInputType';
import { NumberType } from '../../datatypes/numberType';
import * as PIXI from 'pixi.js';
import {
  getAxisMinMax,
  GRAPH_AXIS,
  inputDataName,
  inputHeightName,
  inputShouldShowValues,
  inputShowNames,
  inputWidthName,
  singleColor,
  useSingleColorName,
} from './axisGraph';
import { BooleanType } from '../../datatypes/booleanType';
import { ColorType } from '../../datatypes/colorType';
import { TRgba } from '../../../utils/color';
import { prettyPrintNumber } from '../../../utils/utils';

const inputSpacingName = 'Spacing';

export class GRAPH_BAR extends GRAPH_AXIS {
  public getName(): string {
    return 'Draw Bar Graph';
  }

  public getDescription(): string {
    return 'Draws a Bar Graph based on input data/labels/colors';
  }

  protected getDefaultIO(): Socket[] {
    return super
      .getDefaultIO()
      .concat([
        new Socket(
          SOCKET_TYPE.IN,
          inputSpacingName,
          new NumberType(false, 0, 0.99),
          0.1,
        ),
        new Socket(
          SOCKET_TYPE.IN,
          useSingleColorName,
          new BooleanType(),
          false,
        ),
        Socket.getOptionalVisibilitySocket(
          SOCKET_TYPE.IN,
          singleColor,
          new ColorType(),
          new TRgba(0, 128, 192),
          () => this.getInputData(useSingleColorName),
        ),
      ]);
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    await super.drawOnContainer(inputObject, container);
    const graphData: GraphInputPointX[] = inputObject[inputDataName];
    const width = inputObject[inputWidthName];
    const height = inputObject[inputHeightName];
    const spacing = inputObject[inputSpacingName];
    const spacingWidth = width / graphData.length;
    const barWidth = spacingWidth * (1 - spacing);
    const [minValue, maxValue] = getAxisMinMax(inputObject);

    const yRatio = height / (maxValue - minValue);

    const textStyle = this.getTextStyle(inputObject);

    for (let i = 0; i < graphData.length; i++) {
      const point = graphData[i];
      const margin = (spacingWidth - barWidth) / 2;
      const currPosX = spacingWidth * i + margin;
      const graphics = new PIXI.Graphics();
      const barContainer = new PIXI.Container();
      const color = getGraphInputPointColor(
        point,
        i,
        inputObject[useSingleColorName],
        inputObject[singleColor],
      );

      const usedHeight = yRatio * (point.Value - minValue);
      const centerX = currPosX + barWidth / 2;

      this.addHoverInfoListenTargetGraph(
        graphics,
        container,
        point.Name || '',
        point.Value,
      );

      graphics
        .rect(currPosX, -usedHeight, barWidth, usedHeight)
        .fill(color.hexNumber());

      this.potentiallyAddClickInteraction(graphics, inputObject, point);

      if (inputObject[inputShouldShowValues]) {
        const numberToUse = prettyPrintNumber(point.Value);
        const basicText = new PIXI.Text({
          text: numberToUse,
          style: textStyle,
        });
        basicText.anchor.x = 0.5;
        basicText.anchor.y = 1.0;
        basicText.x = centerX;
        basicText.y = -usedHeight - 5;

        graphics.addChild(basicText);
      }

      if (point.Name && inputObject[inputShowNames]) {
        this.drawValueText(
          point.Name,
          inputObject,
          centerX,
          barContainer,
          i,
          graphData.length,
        );
      }

      barContainer.addChild(graphics);

      container.addChild(barContainer);
    }
  }
}
