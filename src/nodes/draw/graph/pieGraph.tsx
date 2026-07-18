import { DRAW_Base } from '../abstract';
import Socket from '../../../classes/SocketClass';
import { COLOR, SOCKET_TYPE } from '../../../utils/constants';
import { NumberType } from '../../datatypes/numberType';
import { BooleanType } from '../../datatypes/booleanType';
import * as PIXI from 'pixi.js';
import { TRgba } from '../../../utils/color';
import {
  GraphInputPointX,
  GraphInputXType,
  getGraphInputPointColor,
} from '../../datatypes/graphInputType';
import { StringType } from '../../datatypes/stringType';
import { prettyPrintNumber } from '../../../utils/utils';
import {
  getMacroClickSockets,
  singleColor,
  useSingleColorName,
} from './axisGraph';
import { inputClickMacroName } from '../interactivityConstants';

const inputDataName = 'Input Data';
const inputRadius = 'Radius';
const inputShowNames = 'Show Names';
const inputShowNamesDistance = 'Name Distance';
const inputShowValuesFontSize = 'Font Size';
const inputShowReference = 'Show Reference';
const inputShowBorder = 'Show Border';
const inputShowPercentage = 'Percentage';
const coreRadiusName = 'Core Radius Percentage';
const inputIncludeThreshold = 'Size Threshold';
const othersName = 'Others Label';

interface PieDrawnSlice {
  color: TRgba;
  index: number;
  preDraws: ((g: PIXI.Graphics, desiredIntensity: number) => void)[];
  draws: ((g: PIXI.Graphics, desiredIntensity: number) => void)[];
  textDraws: ((g: PIXI.Graphics, desiredIntensity: number) => void)[];
}

const PIE_GRAPH_RESOLUTION = 360;
const RADIAN_PER_DEGREES = 1 / 57.2957795;

export class GRAPH_PIE extends DRAW_Base {
  public isCallingMacro(macroName: string): boolean {
    return this.getInputData(inputClickMacroName) == macroName;
  }

  public getName(): string {
    return 'Draw Pie Graph';
  }

  public getDescription(): string {
    return 'Draws a Pie Graph based on input data/labels/colors';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputDataName, new GraphInputXType(), [
        { Value: 5, Name: 'Big slice', Color: new TRgba(33, 150, 243, 1) },
        { Value: 3, Name: 'Small slice', Color: new TRgba(251, 192, 45, 1) },
        {
          Value: 1,
          Name: 'Tiny slice',
          Color: new TRgba(38, 166, 154, 1),
        },
      ]),
      new Socket(
        SOCKET_TYPE.IN,
        inputRadius,
        new NumberType(false, 1, 1000),
        140,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        coreRadiusName,
        new NumberType(false, 0, 1),
        0.4,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputIncludeThreshold,
        new NumberType(false, 0, 1),
        0.03,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        othersName,
        new StringType(),
        'Other',
        () => this.getInputData(inputIncludeThreshold) > 0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShowNames,
        new BooleanType(),
        true,
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShowNamesDistance,
        new NumberType(false, 0.1, 2),
        0.75,
        () => this.getInputData(inputShowNamesDistance),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputShowReference,
        new BooleanType(),
        true,
        true,
      ),
      new Socket(SOCKET_TYPE.IN, inputShowBorder, new BooleanType(), false),
      new Socket(SOCKET_TYPE.IN, inputShowPercentage, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputShowValuesFontSize,
        new NumberType(),
        24,
        () =>
          this.getInputData(inputShowNames) ||
          this.getInputData(inputShowReference),
      ),
    ]
      .concat(getMacroClickSockets(this))
      .concat(super.getDefaultIO());
  }

  private getValueText(
    text: string,
    location: PIXI.Point,
    fontSize: number,
    anchorCentered = true,
  ): PIXI.Text {
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: fontSize,
      whiteSpace: 'pre-line',
    });
    const basicText = new PIXI.Text(text, textStyle);
    basicText.position = location;
    if (anchorCentered) {
      basicText.anchor.y = 0.5;
      basicText.anchor.x = 0.5;
    }
    return basicText;
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const graphics = new PIXI.Graphics();

    const pieSlicesRaw: GraphInputPointX[] = inputObject[inputDataName];
    // fail error if invalid input
    if (typeof pieSlicesRaw !== 'object') {
      return;
    }

    // determine total amount of values
    // we allow either an array of just the numbers, or (better), an object that contains data and potentially other stuff
    const total: number = pieSlicesRaw.reduce(
      (total, pieSlice) => total + pieSlice.Value,
      0,
    );
    // merge slices that are too small into a single one based on set threshold
    const cutoff = total * inputObject[inputIncludeThreshold];
    const pieSlices = pieSlicesRaw.filter((slice) => slice.Value > cutoff);
    const remaining = pieSlicesRaw.filter((slice) => slice.Value <= cutoff);
    if (remaining.length == 1) {
      // if only one, no point, push it back
      pieSlices.push(remaining[0]);
    } else if (remaining.length > 1) {
      const remainingSlice: GraphInputPointX = {
        Value: remaining.reduce((total, slice) => total + slice.Value, 0),
        Name: inputObject[othersName],
        Color: TRgba.white().multiply(0.5),
      };
      pieSlices.push(remainingSlice);
    }

    const radius = inputObject[inputRadius];
    const fontSize = inputObject[inputShowValuesFontSize];
    const degreesTotal = 360;
    const defaultNameDistance = inputObject[inputShowNamesDistance];

    let currDegrees = 0;

    const slicesToDraw: PieDrawnSlice[] = [];

    pieSlices.sort((slice1, slice2) => slice2.Value - slice1.Value);

    // sick shit
    const remainders = pieSlices.map((slice) => {
      const val = (slice.Value * PIE_GRAPH_RESOLUTION) / total;
      return val - Math.floor(val);
    });

    //console.log('remainders : ' + JSON.stringify(remainders));
    let totalRemainingSteps = remainders.reduce((prev, curr) => prev + curr, 0);
    totalRemainingSteps = Math.ceil(totalRemainingSteps);
    //console.log('remainding steps: ' + totalRemainingSteps);

    // draw all slices

    pieSlices.forEach((pieSlice, index) => {
      pieSlice.Color = getGraphInputPointColor(
        pieSlice,
        index,
        inputObject[useSingleColorName],
        inputObject[singleColor],
      );
      const draws: ((g: PIXI.Graphics, desiredIntensity: number) => void)[] =
        [];
      const preDraws: ((g: PIXI.Graphics, desiredIntensity: number) => void)[] =
        [];
      const textDraws: ((
        g: PIXI.Graphics,
        desiredIntensity: number,
      ) => void)[] = [];
      const coreRadius = inputObject[coreRadiusName] * radius;

      const partOfTotal = pieSlice.Value / total;
      const polygonPoints: PIXI.Point[] = [];

      const color = pieSlice.Color;
      const degreesPre = currDegrees;
      const endIndex =
        PIE_GRAPH_RESOLUTION * partOfTotal +
        (index < totalRemainingSteps ? 1.0 : 0.0);

      for (let i = 0; i <= endIndex; i++) {
        const currRadian = RADIAN_PER_DEGREES * currDegrees;
        const x = Math.cos(currRadian) * coreRadius;
        const y = Math.sin(currRadian) * coreRadius;
        polygonPoints.push(new PIXI.Point(x, y));
        currDegrees += degreesTotal / PIE_GRAPH_RESOLUTION;
      }
      currDegrees -= degreesTotal / PIE_GRAPH_RESOLUTION;
      const maxDegrees = currDegrees;
      for (let i = endIndex + 1; i > 0; i--) {
        const currRadian = RADIAN_PER_DEGREES * currDegrees;
        const x = Math.cos(currRadian) * radius;
        const y = Math.sin(currRadian) * radius;
        polygonPoints.push(new PIXI.Point(x, y));
        currDegrees -= degreesTotal / PIE_GRAPH_RESOLUTION;
      }
      currDegrees = maxDegrees;

      const averageDegree = (currDegrees + degreesPre) / 2;
      const averageDirection = new PIXI.Point(
        Math.cos(RADIAN_PER_DEGREES * averageDegree),
        Math.sin(RADIAN_PER_DEGREES * averageDegree),
      );
      if (inputObject[inputShowNames]) {
        const distance = radius * defaultNameDistance;
        const valuePosition = new PIXI.Point(
          averageDirection.x * distance,
          averageDirection.y * distance,
        );
        const textToUse = pieSlice.Name;
        textDraws.push((drawGraphics: PIXI.Graphics) => {
          drawGraphics.addChild(
            this.getValueText(textToUse, valuePosition, fontSize),
          );
        });

        // if too far away, draw line back to my slice
        if (distance > radius) {
          textDraws.push((drawGraphics: PIXI.Graphics) => {
            drawGraphics.moveTo(
              averageDirection.x * radius,
              averageDirection.y * radius,
            );
            drawGraphics.lineTo(
              averageDirection.x * distance,
              averageDirection.y * (distance - fontSize * 0.5),
            );
            drawGraphics.stroke({ width: 1, color: TRgba.black().hexNumber() });
          });
        }
      }
      if (inputObject[inputShowReference]) {
        const circleOffsetX = fontSize * 2;
        const distanceDesiredByPie = circleOffsetX;
        const distanceDesiredByName =
          (defaultNameDistance - 1) * radius + circleOffsetX;
        const distanceBetween =
          (radius * 2) / Math.max(1, pieSlices.length - 1);
        const location = new PIXI.Point(
          radius * (4 / 3) +
            Math.max(distanceDesiredByName, distanceDesiredByPie),
          -radius + index * distanceBetween,
        );
        const textToUse =
          pieSlice.Name +
          ': ' +
          (inputObject[inputShowPercentage]
            ? prettyPrintNumber(partOfTotal * 100.0) + '%'
            : pieSlice.Value.toString());

        draws.push((drawGraphics: PIXI.Graphics) => {
          drawGraphics.addChild(
            this.getValueText(
              textToUse,
              location,
              inputObject[inputShowValuesFontSize],
              false,
            ),
          );
          drawGraphics.circle(
            location.x - circleOffsetX,
            location.y + fontSize * 0.5,
            fontSize,
          );
          drawGraphics.stroke({ width: 0, color: TRgba.black().hexNumber() });
        });
      }

      const slice = new PIXI.Polygon();
      polygonPoints.forEach((point) => {
        slice.points.push(point.x);
        slice.points.push(point.y);
      });

      const drawTop = (currGraphics: PIXI.Graphics, desiredIntensity) => {
        currGraphics
          .poly(slice.points)
          .fill(color.multiply(desiredIntensity).hexNumber());
        if (inputObject[inputShowBorder]) {
          currGraphics.stroke({
            width: 2,
            color: TRgba.white().multiply(0.9).hexNumber(),
            alpha: 1,
          });
        }
        this.addHoverInfoListenTargetGraph(
          currGraphics,
          graphics,
          '',
          undefined,
        );
        this.potentiallyAddClickInteraction(
          currGraphics,
          inputObject,
          pieSlice,
        );
      };
      draws.unshift(drawTop);

      slicesToDraw.push({
        color,
        index,
        preDraws,
        draws,
        textDraws,
      });
    });

    const topDraws: PIXI.Graphics[] = [];
    slicesToDraw.forEach((slice) => {
      slice.preDraws.forEach((preDraw) => {
        preDraw(graphics, 1.0);
      });
      graphics.fill(slice.color.hexNumber());
    });
    slicesToDraw.forEach((slice) => {
      const drawContainer = new PIXI.Graphics();
      slice.draws.forEach((draw) => {
        draw(drawContainer, 1.0);
      });
      drawContainer.fill(slice.color.hexNumber());
      drawContainer.interactive = true;

      topDraws.push(drawContainer);
    });

    graphics.stroke({ width: 1, color: TRgba.black().hexNumber() });
    topDraws.forEach((draw) => graphics.addChild(draw));

    slicesToDraw.forEach((slice) => [
      slice.textDraws.forEach((textDraw) => {
        textDraw(graphics, 1.0);
        graphics.fill(slice.color.hexNumber());
      }),
    ]);

    container.addChild(graphics);
  }
}
