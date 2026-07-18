import Socket from '../../../classes/SocketClass';
import { SOCKET_TYPE } from '../../../utils/constants';
import {
  parseValueAndAttachWarnings,
  prettyPrintNumber,
} from '../../../utils/utils';
import * as PIXI from 'pixi.js';
import { BooleanType } from '../../datatypes/booleanType';
import { ColorType } from '../../datatypes/colorType';
import { GraphInputPointX } from '../../datatypes/graphInputType';
import {
  getAxisMinMax,
  GRAPH_AXIS,
  inputDataName,
  inputHeightName,
  inputLineWidthName,
  inputShouldShowValues,
  inputShowNames,
  inputWidthName,
} from './axisGraph';

const inputColorName = 'Color';
const inputShouldUseBezierCurve = 'Bezier curve';

export class GRAPH_LINE extends GRAPH_AXIS {
  public getName(): string {
    return 'Draw Line Graph';
  }

  public getDescription(): string {
    return 'Draws a line graph';
  }

  protected getDefaultIO(): Socket[] {
    return super
      .getDefaultIO()
      .concat([
        new Socket(
          SOCKET_TYPE.IN,
          inputShouldUseBezierCurve,
          new BooleanType(),
          true,
          false,
        ),
        new Socket(SOCKET_TYPE.IN, inputColorName, new ColorType()),
      ]);
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    await super.drawOnContainer(inputObject, container);
    const points: GraphInputPointX[] = inputObject[inputDataName];
    const values = points.map((point) => point.Value);
    if (!points.length) {
      return;
    }

    const [minValue, maxValue] = getAxisMinMax(inputObject);
    const scaleY = inputObject[inputHeightName] / (maxValue - minValue);
    const scaleX = inputObject[inputWidthName] / Math.max(1, points.length - 1);

    const graphics: PIXI.Graphics = new PIXI.Graphics();
    const selectedColor = parseValueAndAttachWarnings(
      this,
      new ColorType(),
      inputObject[inputColorName],
    );
    graphics.alpha = selectedColor.a;

    const textStyle = this.getTextStyle(inputObject);

    graphics.moveTo(0, (points[0].Value - minValue) * -scaleY);
    const placedPoints: PIXI.Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const scaledX = scaleX * i;
      const scaledY = (point.Value - minValue) * -scaleY;
      const prevPoint = points[Math.max(0, i - 1)];
      const prevPrevPoint = points[Math.max(i - 2, 0)];
      const nextPoint = points[Math.min(i + 1, points.length - 1)];
      placedPoints.push(new PIXI.Point(scaledX, scaledY));
      if (inputObject[inputShouldUseBezierCurve] && i > 0) {
        const scaledPrevX = scaleX * (i - 1);
        const scaledPrevY = (prevPoint.Value - minValue) * -scaleY;
        const scaledPrevPrevX = scaleX * Math.max(i - 2, 0);
        const scaledPrevPrevY = (prevPrevPoint.Value - minValue) * -scaleY;
        const scaledNextX = scaleX * (i + 1);
        const scaledNextY = (nextPoint.Value - minValue) * -scaleY;
        const prevTanX = (scaledPrevX - scaledPrevPrevX) * 0.07 + scaledPrevX;
        const prevTanY = (scaledPrevY - scaledPrevPrevY) * 0.07 + scaledPrevY;
        const nextTanX = (scaledNextX - scaledX) * -0.07 + scaledX;
        const nextTanY = (scaledNextY - scaledY) * -0.07 + scaledY;

        graphics.bezierCurveTo(
          prevTanX,
          prevTanY,
          nextTanX,
          nextTanY,
          scaledX,
          scaledY,
        );
      } else {
        graphics.lineTo(scaledX, scaledY);
      }
      if (inputObject[inputShouldShowValues]) {
        const numberToUse = prettyPrintNumber(point.Value);
        const basicText = new PIXI.Text({
          text: numberToUse,
          style: textStyle,
        });
        basicText.x = scaledX;
        basicText.anchor.x = 0.5;
        basicText.y = scaledY - 20;
        basicText.anchor.y = 1.0;

        // if values only above, print below, otherwise above
        if (prevPoint > point && nextPoint > point) {
          basicText.y += 50;
          basicText.anchor.y = 0.0;
        }
        graphics.addChild(basicText);
      }
      if (point.Name && inputObject[inputShowNames]) {
        this.drawValueText(
          point.Name,
          inputObject,
          scaledX,
          graphics,
          i,
          points.length,
        );
      }
    }

    graphics.stroke({
      width: inputObject[inputLineWidthName],
      color: selectedColor.hexNumber(),
      alpha: selectedColor.a,
    });

    container.addChild(graphics);
  }
}
