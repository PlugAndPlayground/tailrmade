import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import {
  DEFAULT_IMAGE,
  IMAGE_TYPES,
  SIMPLE_SIZE_OPTIONS,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import {
  DeferredPixiType,
  DeferredPixiTypeInterface,
} from '../datatypes/deferredPixiType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { ColorType } from '../datatypes/colorType';
import { NumberType } from '../datatypes/numberType';
import { BooleanType } from '../datatypes/booleanType';
import { ArrayType } from '../datatypes/arrayType';
import { TriggerType } from '../datatypes/triggerType';
import { StringType } from '../datatypes/stringType';
import { ImageType } from '../datatypes/imageType';
import {
  parseValueAndAttachWarnings,
  saveBase64AsImage,
} from '../../utils/utils';
import { TRgba } from '../../utils/color';
import { TNodeSource } from '../../utils/interfaces';
import { drawDottedLine, removeAndDestroyChild } from '../../pixi/utils-pixi';
import {
  DRAW_Base,
  DRAW_Interactive_Base,
  objectsInteractive,
  outputMultiplierIndex,
  outputMultiplierPointerDown,
  outputPixiName,
} from './abstract';
import DRAW_Get_Bounds from './drawMeta';
import { IsCompatible } from '../datatypes/abstractType';
import InterfaceController from '../../InterfaceController';
import {
  addDashboardContentOutput,
  SOCKET_NAME_DASHBOARD_CONTENT,
} from '../../utils/layoutableHelpers';
import { DeferredReactTypeInterface } from '../datatypes/deferredHtmlType';
import { TwoDVectorType } from '../datatypes/twoDVectorType';
import { DynamicInputNodeFunctions } from '../abstract/DynamicInputNode';

const availableShapes: EnumStructure = [
  {
    text: 'Circle',
  },
  {
    text: 'Ellipse',
  },
  {
    text: 'Rectangle',
  },
  {
    text: 'Rounded Rectangle',
  },
];

const inputShapeName = 'Shape';
const inputColorName = 'Color';
const inputSizeName = 'Size';
const inputBorderName = 'Border';
const outputImageName = 'Image';
const outputQualityName = 'Quality';
const outputTypeyName = 'Type';
const simpleSizeSocketName = 'Output Size';
export const inputReverseName = 'Reverse Direction';

const inputDottedName = 'Dotted';
const inputDottedIntervalName = 'Dot Interval';

const inputCombineArray = 'GraphicsArray';

const inputTextName = 'Text';
const inputLineHeightName = 'Line Height';
export const inputWidthName = 'Width';
export const inputHeightName = 'Height';

export const inputGraphicsName = 'Graphics';
const totalNumberName = 'Total Number';
const numberPerColumnRow = 'Number Per Column/Row';
const drawingOrder = 'Change Column/Row drawing order';
const spacingXName = 'Spacing X';
const spacingYName = 'Spacing Y';
const useBoundingBoxSpacingName = 'Adjacent Placing';

const inputImageName = 'Image';
const imageExport = 'Save image';

const inputPointsName = 'Points';

const outputPixelArray = 'Color array';

const useManualUpperLeftCornerName = 'Manual Upper Left Corner';
const manualUpperLeftCornerName = 'Upper Left Corner Coordinates';

const addShallowContainerEventListeners = (
  shallowContainer: PIXI.Container,
  node: PPNode,
  index: number,
) => {
  shallowContainer.eventMode = 'static';
  shallowContainer.hitArea = shallowContainer.getLocalBounds().rectangle;
  const alphaPre = shallowContainer.alpha;
  const scalePreX = shallowContainer.scale.x;
  const scalePreY = shallowContainer.scale.y;

  shallowContainer.addEventListener('pointerdown', (e) => {
    node.setOutputData(outputMultiplierIndex, index);
    node.setOutputData(outputMultiplierPointerDown, true);
    // tell all children when something is pressed
    void node.executeChildren();
    console.log(
      `Pressed ${index}: ${shallowContainer.x}, ${shallowContainer.y}`,
    );

    shallowContainer.alpha = alphaPre * 0.6;
  });

  shallowContainer.addEventListener('pointerup', (e) => {
    node.setOutputData(outputMultiplierPointerDown, false);
    void node.executeChildren();
    shallowContainer.alpha = alphaPre;
    shallowContainer.scale.x = scalePreX;
    shallowContainer.scale.y = scalePreY;
  });
};

// a PIXI draw node is a pure node that also draws its graphics if graphics at the end
export class DRAW_Shape extends DRAW_Base {
  public getName(): string {
    return 'Draw shape';
  }

  public getDescription(): string {
    return 'Draws a shape';
  }

  public hasExample(): boolean {
    return true;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputShapeName,
        new EnumType(availableShapes, undefined, true),
        'Circle',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputWidthName,
        new NumberType(true, 1, 1000),
        200,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputHeightName,
        new NumberType(true, 1, 1000),
        200,
      ),
      new Socket(SOCKET_TYPE.IN, inputBorderName, new BooleanType(), false),
      new Socket(
        SOCKET_TYPE.IN,
        inputColorName,
        new ColorType(),
        TRgba.randomColor(),
      ),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const width = inputObject[inputWidthName];
    const height = inputObject[inputHeightName];
    if (Number.isFinite(width) && Number.isFinite(height)) {
      const graphics: PIXI.Graphics = new PIXI.Graphics();
      const selectedColor = parseValueAndAttachWarnings(
        this,
        new ColorType(),
        inputObject[inputColorName],
      );
      const drawBorder = inputObject[inputBorderName];
      const shapeEnum = inputObject[inputShapeName];
      switch (shapeEnum) {
        case 'Circle': {
          graphics.circle(width / 2, width / 2, width / 2);
          break;
        }
        case 'Rectangle': {
          graphics.rect(0, 0, width, height);
          break;
        }
        case 'Rounded Rectangle': {
          graphics.roundRect(0, 0, width, height, width * 0.1);
          break;
        }
        case 'Ellipse': {
          graphics.ellipse(width / 2, height / 2, width / 2, height / 2);
          break;
        }
      }
      graphics
        .fill({
          color: selectedColor.hexNumber(),
          alpha: selectedColor.getAlpha(true),
        })
        .stroke({
          width: drawBorder ? 3 : 0,
          color: selectedColor.multiply(0.7).hexNumber(),
        });
      graphics.alpha = selectedColor.a;
      container.addChild(graphics);
    } else {
      throw new Error('The value for width or height is invalid.');
    }
  }
}

export class DRAW_Passthrough extends DRAW_Base {
  public getName(): string {
    return 'Draw Passthrough';
  }

  public getDescription(): string {
    return 'Draws input draw object';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputGraphicsName, new DeferredPixiType()),
    ].concat(super.getDefaultIO());
  }

  public getIsSimpleStyleNode(): boolean {
    return true;
  }

  public getParallelInputsOutputs(): boolean {
    return true;
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
  ): Promise<void> {
    const drawingFunction: DeferredPixiTypeInterface =
      inputObject[inputGraphicsName];
    if (
      IsCompatible(
        new DeferredPixiType().getCompatability(drawingFunction).type,
      )
    ) {
      await drawingFunction.drawFunction(
        container,
        new PIXI.Point(0, 0),
        topParentOverrideSettings,
      );
    }
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const ReactUI: DeferredReactTypeInterface = {
      renderFunction: (props) => {
        return this.getDashboardWrapper({
          ...props,
        });
      },
      nodeId: this.id,
    };
    output[SOCKET_NAME_DASHBOARD_CONTENT] = ReactUI;

    await super.onExecute(input, output);
  }
}

export class DRAW_Text extends DRAW_Base {
  public getName(): string {
    return 'Draw text';
  }

  public getDescription(): string {
    return 'Draws text object';
  }

  public getTags(): string[] {
    return ['Text'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputTextName,
        new StringType(),
        'ExampleText',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputSizeName,
        new NumberType(true, 1, 100),
        20,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputLineHeightName,
        new NumberType(true, 1, 100),
        24,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputWidthName,
        new NumberType(true, 0, 2000),
        1000,
      ),
      new Socket(SOCKET_TYPE.IN, inputColorName, new ColorType()),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const textStyle = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: inputObject[inputSizeName],
      lineHeight: inputObject[inputLineHeightName],
      whiteSpace: 'pre-line',
      wordWrap: true,
      wordWrapWidth: inputObject[inputWidthName],
    });
    const basicText = new PIXI.Text({
      text: inputObject[inputTextName],
      style: textStyle,
    });
    const selectedColor = parseValueAndAttachWarnings(
      this,
      new ColorType(),
      inputObject[inputColorName],
    );
    basicText.style.fill = selectedColor.hex();
    basicText.alpha = selectedColor.getAlpha(true);
    container.addChild(basicText);
  }
}

export class DRAW_COMBINE_ARRAY extends DRAW_Interactive_Base {
  public getName(): string {
    return 'Combine draw array';
  }

  public getDescription(): string {
    return 'Combines an array of draw objects';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputCombineArray, new ArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        numberPerColumnRow,
        new NumberType(true, 0, 100),
        2,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        useBoundingBoxSpacingName,
        new BooleanType(),
        true,
      ),
      new Socket(SOCKET_TYPE.IN, drawingOrder, new BooleanType(), true),
      new Socket(
        SOCKET_TYPE.IN,
        spacingXName,
        new NumberType(true, 0, 2000),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        spacingYName,
        new NumberType(true, 0, 2000),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        useManualUpperLeftCornerName,
        new BooleanType(),
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        manualUpperLeftCornerName,
        new TwoDVectorType(),
        { x: 0, y: 0 },
        () => this.getInputData(useManualUpperLeftCornerName),
      ),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
  ): Promise<void> {
    const graphicsArray: DeferredPixiTypeInterface[] =
      inputObject[inputCombineArray];
    const changeDrawingOrder = inputObject[drawingOrder];
    const spacingSize =
      graphicsArray.length && inputObject[useBoundingBoxSpacingName]
        ? await DRAW_Get_Bounds.getDrawingBounds(
            graphicsArray[0],
            inputObject[spacingXName],
            inputObject[spacingYName],
            new PIXI.Point(0, 0),
            this.id,
            {},
          )
        : new PIXI.Rectangle(
            0,
            0,
            inputObject[spacingXName],
            inputObject[spacingYName],
          );

    const manualUpperLeftCorner = inputObject[useManualUpperLeftCornerName];
    if (manualUpperLeftCorner) {
      const dummyShape = new PIXI.Graphics();
      const location = inputObject[manualUpperLeftCornerName];
      dummyShape.rect(location.x, location.y, 1, 1);
      dummyShape.fill({
        color: 0x000000,
        alpha: 0.01,
      });
      container.addChild(dummyShape);
    }
    for (let i = graphicsArray.length - 1; i >= 0; i--) {
      const drawingFunction: DeferredPixiTypeInterface = graphicsArray[i];
      if (
        IsCompatible(
          new DeferredPixiType().getCompatability(drawingFunction).type,
        )
      ) {
        const r = Math.floor(i / inputObject[numberPerColumnRow]);
        const s = i % inputObject[numberPerColumnRow];
        const x = changeDrawingOrder ? s : r;
        const y = changeDrawingOrder ? r : s;
        const drawing = async () => {
          const shallowContainer = new PIXI.Container();
          await drawingFunction.drawFunction(
            shallowContainer,
            new PIXI.Point(x * spacingSize.width, y * spacingSize.height),
            topParentOverrideSettings,
          );
          if (inputObject[objectsInteractive]) {
            addShallowContainerEventListeners(shallowContainer, this, i);
          }
          return shallowContainer;
        };
        const insideContainer = await drawing();
        container.addChild(insideContainer);
      }
    }
  }
}

export class DRAW_Image extends DRAW_Base {
  public getName(): string {
    return 'Draw image';
  }

  public getDescription(): string {
    return 'Draws an image object (jpg,png)';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.IN, inputImageName, new ImageType())].concat(
      super.getDefaultIO(),
    );
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const textureToLoad = inputObject[inputImageName] || DEFAULT_IMAGE;
    await PIXI.Assets.load(textureToLoad);
    const image = PIXI.Texture.from(textureToLoad);
    const sprite = new PIXI.Sprite(image);
    container.addChild(sprite);
  }
}

const BASE_POINTS = [
  [0, 0],
  [100, 50],
  [0, 100],
];

export class DRAW_Line extends DRAW_Base {
  public getName(): string {
    return 'Draw line';
  }

  public getDescription(): string {
    return 'Draws a line specified by input points';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputPointsName, new ArrayType(), BASE_POINTS),
      new Socket(SOCKET_TYPE.IN, inputColorName, new ColorType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputWidthName,
        new NumberType(false, 1, 10),
        3,
      ),
      new Socket(SOCKET_TYPE.IN, inputDottedName, new BooleanType(), true),
      new Socket(
        SOCKET_TYPE.IN,
        inputDottedIntervalName,
        new NumberType(true, 2, 100),
        10,
      ),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const graphics: PIXI.Graphics = new PIXI.Graphics();
    const selectedColor = parseValueAndAttachWarnings(
      this,
      new ColorType(),
      inputObject[inputColorName],
    );
    const points: number[][] = inputObject[inputPointsName];
    if (points.length < 2) {
      return;
    }
    graphics.moveTo(points[0][0], points[0][1]);
    let lastX = points[0][0];
    let lastY = points[0][1];
    points.forEach((point, index) => {
      if (inputObject[inputDottedName]) {
        const nextX = point[0];
        const nextY = point[1];
        drawDottedLine(
          graphics,
          lastX,
          lastY,
          nextX,
          nextY,
          inputObject[inputDottedIntervalName],
        );
        lastX = nextX;
        lastY = nextY;
      }
      graphics.lineTo(point[0], point[1]);
    });
    graphics.stroke({
      width: inputObject[inputWidthName],
      color: selectedColor.hexNumber(),
      alpha: selectedColor.getAlpha(true),
    });
    container.addChild(graphics);
  }
}

export class DRAW_Polygon extends DRAW_Base {
  public getName(): string {
    return 'Draw polygon';
  }

  public getDescription(): string {
    return 'Draws a polygon based on input points';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputPointsName, new ArrayType(), BASE_POINTS),
      new Socket(SOCKET_TYPE.IN, inputColorName, new ColorType()),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
  ): Promise<void> {
    const graphics: PIXI.Graphics = new PIXI.Graphics();
    const selectedColor = parseValueAndAttachWarnings(
      this,
      new ColorType(),
      inputObject[inputColorName],
    );

    const points: [number, number][] = inputObject[inputPointsName];
    graphics.poly(points.map((p) => new PIXI.Point(p[0], p[1]))).fill({
      color: selectedColor.hexNumber(),
      alpha: selectedColor.getAlpha(true),
    });
    container.addChild(graphics);
  }

  public drawNodeShape(): void {
    super.drawNodeShape();
    this.drawAddInputButton();
  }

  protected drawAddInputButton(): void {
    DynamicInputNodeFunctions.drawAddInputButton(this);
  }
}

export class Extract_Image_From_Graphics extends PPNode {
  public getName(): string {
    return 'Get image from Draw';
  }

  public getDescription(): string {
    return 'Converts Draw graphic into an image and allows saving it';
  }

  public getTags(): string[] {
    return ['Draw', 'Media'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, outputPixiName, new DeferredPixiType()),
      new Socket(
        SOCKET_TYPE.IN,
        simpleSizeSocketName,
        new EnumType(SIMPLE_SIZE_OPTIONS, undefined, true),
        SIMPLE_SIZE_OPTIONS[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        outputTypeyName,
        new EnumType(IMAGE_TYPES, undefined, true),
        IMAGE_TYPES[1].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        outputQualityName,
        new NumberType(false, 0, 1),
        0.92,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        imageExport,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'saveImage'),
        0,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outputImageName, new ImageType()),
    ];
  }

  private async setupContainer(
    drawFunction: DeferredPixiTypeInterface,
    id: string,
  ): Promise<PIXI.Container> {
    const container = new PIXI.Container();
    await drawFunction.drawFunction(container, new PIXI.Point(0, 0), id, {});
    return container;
  }

  private async extractBase64(
    container: PIXI.Container,
    params: any,
    size: number,
  ): Promise<string> {
    const MAX_DIMENSION = 16384;

    const bounds = container.getLocalBounds();

    // Ensure we have valid bounds
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error('Invalid container bounds detected');
    }

    const originalWidth = Math.ceil(bounds.width);
    const originalHeight = Math.ceil(bounds.height);
    const targetWidth = originalWidth * size;
    const targetHeight = originalHeight * size;

    // Early check for texture size limits
    if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
      const scaleX = MAX_DIMENSION / targetWidth;
      const scaleY = MAX_DIMENSION / targetHeight;
      const scaleFactor = Math.min(scaleX, scaleY);

      size = size * scaleFactor * 0.99; // Add a small safety margin
      InterfaceController.showSnackBar(
        `Image had to be downscaled by ${Math.round((1 - size) * 100)}%. Original size: ${targetWidth}x${targetHeight}px (max: ${MAX_DIMENSION}px).`,
        {
          variant: 'warning',
        },
      );
    }
    PPGraph.currentGraph.app.renderer.resolution = size;
    try {
      const base64 = await PPGraph.currentGraph.app.renderer.extract.base64({
        target: container,
        format: params.format,
        quality: params.quality,
      });

      return base64;
    } catch (error) {
      throw new Error(
        `Failed to extract image. Original size: ${targetWidth}x${targetHeight}px. ` +
          `Error: ${error.message}`,
      );
    } finally {
      PPGraph.currentGraph.app.renderer.resolution = 2;
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const container = await this.setupContainer(
      inputObject[outputPixiName],
      this.id,
    );
    this.addChild(container);

    try {
      const size = getSize(this.getInputData(simpleSizeSocketName));
      const params = {
        format: inputObject[outputTypeyName].text,
        quality: inputObject[outputQualityName],
      };

      const base64out = await this.extractBase64(container, params, size);
      outputObject[outputImageName] = base64out;
    } catch (error) {
      console.warn(
        `Getting image failed. ${error.message}. Try a smaller output size.`,
      );
    } finally {
      removeAndDestroyChild(this, container);
    }
  }

  saveImage = async (): Promise<void> => {
    const container = await this.setupContainer(
      this.getInputData(outputPixiName),
      this.id,
    );
    this.addChild(container);

    try {
      const size = getSize(this.getInputData(simpleSizeSocketName));
      const params = {
        format: this.getInputData(outputTypeyName).text,
        quality: this.getInputData(outputQualityName),
      };

      const base64out = await this.extractBase64(container, params, size);
      await saveBase64AsImage(base64out, this.name, {
        format: IMAGE_TYPES.find(
          (option) => option.text === this.getInputData(outputTypeyName),
        ),
        quality: this.getInputData(outputQualityName),
      });
    } catch (error) {
      console.warn(
        `Getting image failed. ${error.message}. Try a smaller output size.`,
      );
    } finally {
      removeAndDestroyChild(this, container);
    }
  };
}

const getSize = (input: any): number => {
  return SIMPLE_SIZE_OPTIONS.find((option) => option.text === input).value;
};

export class Extract_PixelArray_From_Graphics extends PPNode {
  public getName(): string {
    return 'Get pixel array from graphic';
  }

  public getDescription(): string {
    return 'Get all color values of a graphic as a 1-dimensional array';
  }

  public getTags(): string[] {
    return ['Draw'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, outputPixiName, new DeferredPixiType()),
      new Socket(
        SOCKET_TYPE.IN,
        simpleSizeSocketName,
        new EnumType(SIMPLE_SIZE_OPTIONS, undefined, true),
        SIMPLE_SIZE_OPTIONS[2].text,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outputPixelArray, new ArrayType()),
      new Socket(SOCKET_TYPE.OUT, inputWidthName, new NumberType()),
      new Socket(SOCKET_TYPE.OUT, inputHeightName, new NumberType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const newContainer = new PIXI.Graphics();
    const drawingFunction: DeferredPixiTypeInterface =
      inputObject[outputPixiName];
    await drawingFunction.drawFunction(
      newContainer,
      new PIXI.Point(0, 0),
      this.id,
      {},
    );
    this.addChild(newContainer);

    const imageWidth = Math.floor(newContainer.width);
    const imageHeight = Math.floor(newContainer.height);

    const size = SIMPLE_SIZE_OPTIONS.find(
      (option) => option.text === inputObject[simpleSizeSocketName],
    ).value;
    PPGraph.currentGraph.app.renderer.resolution = size;
    const rgbaArray =
      PPGraph.currentGraph.app.renderer.extract.pixels(newContainer); // returns double the size
    PPGraph.currentGraph.app.renderer.resolution = 2;

    const pixelArray = [];
    for (let i = 0; i < rgbaArray.pixels.length; i += 4) {
      const rgbaObject = {
        r: rgbaArray[i],
        g: rgbaArray[i + 1],
        b: rgbaArray[i + 2],
        a: rgbaArray[i + 3] / 255.0,
      };
      pixelArray.push(rgbaObject);
    }

    outputObject[outputPixelArray] = pixelArray;
    outputObject[inputWidthName] = imageWidth;
    outputObject[inputHeightName] = imageHeight;

    removeAndDestroyChild(this, newContainer);
  }
}
