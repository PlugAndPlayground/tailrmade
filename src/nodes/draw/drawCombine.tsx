import Socket from '../../classes/SocketClass';
import {
  CANVAS_BACKGROUND_ALPHA,
  SOCKETNAME_BACKGROUNDCOLOR,
  SOCKET_TYPE,
  parentBgHeightName,
  parentBgWidthName,
} from '../../utils/constants';
import {
  DeferredPixiName,
  DeferredPixiType,
  DeferredPixiTypeInterface,
} from '../datatypes/deferredPixiType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import * as PIXI from 'pixi.js';
import { ColorType } from '../datatypes/colorType';
import { NumberType } from '../datatypes/numberType';
import { TwoDVectorType } from '../datatypes/twoDVectorType';
import { BooleanType } from '../datatypes/booleanType';
import { getSuffix, parseValueAndAttachWarnings } from '../../utils/utils';
import { TRgba } from '../../utils/color';
import {
  DRAW_Base,
  paddingSocketName,
  outputPixiName,
  widthBehaviourName,
  heightBehaviourName,
} from './abstract';
import { inputGraphicsName, inputReverseName } from './draw';
import { DynamicInputNodeFunctions } from '../abstract/DynamicInputNode';
import DRAW_Get_Bounds from './drawMeta';
import { IsCompatible } from '../datatypes/abstractType';

const layoutName = 'Layout mode';
const graphicsPositionName = 'Position';
const layoutDirectionName = 'Direction';
const horizontalAlignmentName = 'Horizontal alignment';
const verticalAlignmentName = 'Vertical alignment';
const spacingName = 'Gap';
const bgWidthName = 'Background width';
const bgHeightName = 'Background height';

const defaultBgColor = new TRgba(0, 0, 0, 0);

const layoutOptions: EnumStructure = [
  { text: 'manual' },
  { text: 'gap' },
  { text: 'spread' },
];

const layoutDirectionOptions: EnumStructure = [
  { text: 'vertical' },
  { text: 'horizontal' },
];

const horizontalAlignmentOptions: EnumStructure = [
  { text: 'left' },
  { text: 'center' },
  { text: 'right' },
];

const verticalAlignmentOptions: EnumStructure = [
  { text: 'top' },
  { text: 'center' },
  { text: 'bottom' },
];

const widthHeightFillOptions: EnumStructure = [
  { text: 'hug' },
  { text: 'fill' },
  { text: 'fixed' },
];

async function computeBounds(graphicsKeys, inputObject) {
  const computedBoundsObj = {
    singleMaxWidth: 0,
    singleMaxHeight: 0,
    netWidth: 0,
    netHeight: 0,
  };

  for (const [index, graphicsKey] of graphicsKeys.entries()) {
    const drawingFunction: DeferredPixiTypeInterface = inputObject[graphicsKey];
    const bounds = await DRAW_Get_Bounds.getDrawingBounds(
      drawingFunction,
      0,
      0,
      new PIXI.Point(),
      {}, // do not pass previous overrides down!
    );
    const width = bounds.width;
    const height = bounds.height;

    // Update max width and height
    computedBoundsObj.singleMaxWidth = Math.max(
      computedBoundsObj.singleMaxWidth,
      width,
    );
    computedBoundsObj.singleMaxHeight = Math.max(
      computedBoundsObj.singleMaxHeight,
      height,
    );

    // Accumulate net width and height (without padding)
    computedBoundsObj.netWidth += width;
    computedBoundsObj.netHeight += height;
  }

  return computedBoundsObj;
}

function determinePredefinedWidth(
  widthBehaviour,
  isVertical,
  groupWidthHeight,
  spacingValue,
  graphicsKeys,
  parentBgWidth,
  padding,
  fixedBgWidth,
) {
  let predefinedBackgroundWidth;
  switch (widthBehaviour) {
    case widthHeightFillOptions[0].text: // hug
      predefinedBackgroundWidth = isVertical
        ? groupWidthHeight.singleMaxWidth
        : groupWidthHeight.netWidth + spacingValue * (graphicsKeys.length - 1);
      break;
    case widthHeightFillOptions[1].text: // fill
      if (parentBgWidth) {
        predefinedBackgroundWidth =
          parentBgWidth - padding.left - padding.right;
      } else {
        predefinedBackgroundWidth = groupWidthHeight.singleMaxWidth;
      }
      break;
    case widthHeightFillOptions[2].text: // fixed
      predefinedBackgroundWidth = fixedBgWidth - padding.left - padding.right;
      break;
  }
  return predefinedBackgroundWidth;
}

function determinePredefinedHeight(
  heightBehaviour,
  isVertical,
  groupWidthHeight,
  spacingValue,
  graphicsKeys,
  parentBgHeight,
  padding,
  fixedBgHeight,
) {
  let predefinedBackgroundHeight;
  switch (heightBehaviour) {
    case widthHeightFillOptions[0].text: // hug
      predefinedBackgroundHeight = isVertical
        ? groupWidthHeight.netHeight + spacingValue * (graphicsKeys.length - 1)
        : groupWidthHeight.singleMaxHeight;
      break;
    case widthHeightFillOptions[1].text: // fill
      if (parentBgHeight) {
        predefinedBackgroundHeight =
          parentBgHeight - padding.top - padding.bottom;
      } else {
        predefinedBackgroundHeight = groupWidthHeight.singleMaxHeight;
      }
      break;
    case widthHeightFillOptions[2].text: // fixed
      predefinedBackgroundHeight = fixedBgHeight - padding.top - padding.bottom;
      break;
  }
  return predefinedBackgroundHeight;
}

function drawBackground(
  bgColor: any,
  layoutOption: any,
  container: PIXI.Container<PIXI.Container>,
  padding: { top: any; right: any; bottom: any; left: any },
  predefinedBackgroundWidth: number,
  predefinedBackgroundHeight: number,
) {
  const background = new PIXI.Graphics();
  let bgX = 0;
  let bgY = 0;
  let bgWidth;
  let bgHeight;
  if (layoutOption === layoutOptions[0].text) {
    const bounds = container.getBounds();
    bgX = bounds.x - padding.left;
    bgY = bounds.y - padding.top;
    bgWidth = bounds.width + padding.left + padding.right;
    bgHeight = bounds.height + padding.top + padding.bottom;
  } else {
    bgWidth = predefinedBackgroundWidth + padding.left + padding.right;
    bgHeight = predefinedBackgroundHeight + padding.top + padding.bottom;
  }

  background
    .rect(0, 0, bgWidth, bgHeight)
    .fill({ color: bgColor.hex(), alpha: bgColor.getAlpha(true) });

  container.addChildAt(background, 0);
}

export class DRAW_Combine extends DRAW_Base {
  public getName(): string {
    return 'Combine objects';
  }

  public getDescription(): string {
    return 'Combine objects relative to each other and add a background';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        layoutDirectionName,
        new EnumType(layoutDirectionOptions, undefined, true),
        layoutDirectionOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        layoutName,
        new EnumType(layoutOptions, undefined, true),
        layoutOptions[1].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        horizontalAlignmentName,
        new EnumType(horizontalAlignmentOptions, undefined, true),
        horizontalAlignmentOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        verticalAlignmentName,
        new EnumType(verticalAlignmentOptions, undefined, true),
        verticalAlignmentOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        spacingName,
        new NumberType(true, -100, 100),
        8,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        paddingSocketName,
        new NumberType(true, 0, 100),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        defaultBgColor,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        widthBehaviourName,
        new EnumType(widthHeightFillOptions, undefined, true),
        widthHeightFillOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        bgWidthName,
        new NumberType(true, 0, 2000),
        400,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        heightBehaviourName,
        new EnumType(widthHeightFillOptions, undefined, true),
        widthHeightFillOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        bgHeightName,
        new NumberType(true, 0, 2000),
        400,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, inputReverseName, new BooleanType(), false),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
    inDashboard: boolean = false,
  ): Promise<void> {
    const graphicsKeys = Object.keys(inputObject).filter((key) =>
      key.startsWith(outputPixiName),
    );
    const positionKeys = Object.keys(inputObject).filter((key) =>
      key.startsWith(graphicsPositionName),
    );
    //graphicsKeys.sort();
    //positionKeys.sort();

    if (inputObject[inputReverseName]) {
      graphicsKeys.reverse();
      positionKeys.reverse();
    }

    let bgColor;
    if (inDashboard) {
      // Make transparent as background color is added in dashboard
      bgColor = new TRgba(0, 0, 0, CANVAS_BACKGROUND_ALPHA);
    } else {
      bgColor = parseValueAndAttachWarnings(
        this,
        new ColorType(),
        inputObject[SOCKETNAME_BACKGROUNDCOLOR],
      );
    }
    const fixedBgWidth = inputObject[bgWidthName];
    const fixedBgHeight = inputObject[bgHeightName];
    const parentBgWidth = inputObject[parentBgWidthName];
    const parentBgHeight = inputObject[parentBgHeightName];
    const layoutOption = inputObject[layoutName];
    const horizontalOption = inputObject[horizontalAlignmentName];
    const verticalOption = inputObject[verticalAlignmentName];
    const isVertical =
      inputObject[layoutDirectionName] === layoutDirectionOptions[0].text;
    const widthBehaviour = inputObject[widthBehaviourName];
    const heightBehaviour = inputObject[heightBehaviourName];
    const padding = {
      top: inputObject[paddingSocketName],
      right: inputObject[paddingSocketName],
      bottom: inputObject[paddingSocketName],
      left: inputObject[paddingSocketName],
    };
    let spacingValue = inputObject[spacingName];

    const groupWidthHeight = await computeBounds(graphicsKeys, inputObject);

    const predefinedBackgroundWidth = determinePredefinedWidth(
      widthBehaviour,
      isVertical,
      groupWidthHeight,
      spacingValue,
      graphicsKeys,
      parentBgWidth,
      padding,
      fixedBgWidth,
    );
    const predefinedBackgroundHeight = determinePredefinedHeight(
      heightBehaviour,
      isVertical,
      groupWidthHeight,
      spacingValue,
      graphicsKeys,
      parentBgHeight,
      padding,
      fixedBgHeight,
    );

    // Calculate spacing for spread option
    if (layoutOption === layoutOptions[2].text) {
      const remainingSpace = isVertical
        ? predefinedBackgroundHeight - groupWidthHeight.netHeight
        : predefinedBackgroundWidth - groupWidthHeight.netWidth;
      // Distribute the remaining space as gaps between elements
      spacingValue = remainingSpace / (graphicsKeys.length - 1);
    }

    // pass down overrides
    topParentOverrideSettings = {
      [parentBgWidthName]: isVertical ? predefinedBackgroundWidth : undefined,
      [parentBgHeightName]: isVertical ? undefined : predefinedBackgroundHeight,
    };

    // absolute positioning
    if (layoutOption === layoutOptions[0].text) {
      for (const [index, graphicsKey] of graphicsKeys.entries()) {
        const positionKey = positionKeys[index];
        const drawingFunction: DeferredPixiTypeInterface =
          inputObject[graphicsKey];
        if (
          IsCompatible(
            new DeferredPixiType().getCompatability(drawingFunction).type,
          )
        ) {
          const position = new PIXI.Point(
            inputObject[positionKey].x,
            inputObject[positionKey].y,
          );
          await drawingFunction.drawFunction(
            container,
            position,
            topParentOverrideSettings,
          );
        }
      }
    } else {
      let currentPositionX = 0;
      let currentPositionY = 0;

      if (isVertical) {
        // Calculate starting y based on vertical alignment
        switch (verticalOption) {
          case verticalAlignmentOptions[0].text: // top
            currentPositionY = padding.top;
            break;
          case verticalAlignmentOptions[1].text: // center
            currentPositionY =
              padding.top +
              (predefinedBackgroundHeight -
                (graphicsKeys.length - 1) * spacingValue -
                groupWidthHeight.netHeight) /
                2;
            break;
          case verticalAlignmentOptions[2].text: // bottom
            currentPositionY =
              padding.top +
              predefinedBackgroundHeight -
              (graphicsKeys.length - 1) * spacingValue -
              groupWidthHeight.netHeight;
            break;
        }
      } else {
        // Calculate starting x based on horizontal alignment
        switch (horizontalOption) {
          case horizontalAlignmentOptions[0].text: // left
            currentPositionX = padding.left;
            break;
          case horizontalAlignmentOptions[1].text: // center
            currentPositionX =
              padding.left +
              (predefinedBackgroundWidth -
                (graphicsKeys.length - 1) * spacingValue -
                groupWidthHeight.netWidth) /
                2;
            break;
          case horizontalAlignmentOptions[2].text: // right
            currentPositionX =
              padding.left +
              predefinedBackgroundWidth -
              (graphicsKeys.length - 1) * spacingValue -
              groupWidthHeight.netWidth;
            break;
        }
      }

      for (const [index, graphicsKey] of graphicsKeys.entries()) {
        const drawingFunction: DeferredPixiTypeInterface =
          inputObject[graphicsKey];
        const bounds = await DRAW_Get_Bounds.getDrawingBounds(
          drawingFunction,
          0,
          0,
          new PIXI.Point(0, 0),
          topParentOverrideSettings,
        );

        if (isVertical) {
          switch (inputObject[horizontalAlignmentName]) {
            case horizontalAlignmentOptions[0].text: // left
              currentPositionX = padding.left;
              break;
            case horizontalAlignmentOptions[1].text: // center
              currentPositionX =
                padding.left + predefinedBackgroundWidth / 2 - bounds.width / 2;
              break;
            case horizontalAlignmentOptions[2].text: // right
              currentPositionX =
                padding.left + predefinedBackgroundWidth - bounds.width;
              break;
          }
        } else {
          switch (inputObject[verticalAlignmentName]) {
            case verticalAlignmentOptions[0].text: // top
              currentPositionY = padding.top;
              break;
            case verticalAlignmentOptions[1].text: // center
              currentPositionY =
                padding.top +
                predefinedBackgroundHeight / 2 -
                bounds.height / 2;
              break;
            case verticalAlignmentOptions[2].text: // bottom
              currentPositionY =
                padding.top + predefinedBackgroundHeight - bounds.height;
              break;
          }
        }

        if (
          IsCompatible(
            new DeferredPixiType().getCompatability(drawingFunction).type,
          )
        ) {
          const position = new PIXI.Point(currentPositionX, currentPositionY);
          await drawingFunction.drawFunction(
            container,
            position,
            topParentOverrideSettings,
          );
        }

        if (isVertical) {
          currentPositionY += bounds.height + spacingValue;
        } else {
          currentPositionX += bounds.width + spacingValue;
        }
      }
    }

    const hasMarginOrBackground =
      inputObject[paddingSocketName] > 0 ||
      widthBehaviour === widthHeightFillOptions[2].text || // width is fixed
      heightBehaviour === widthHeightFillOptions[2].text || // height is fixed
      bgColor.getAlpha() > 0;

    if (hasMarginOrBackground) {
      drawBackground(
        bgColor,
        layoutOption,
        container,
        padding,
        predefinedBackgroundWidth,
        predefinedBackgroundHeight,
      );
    }
  }

  // we need new sockets to be called "Graphics" or the logic in here breaks
  public getNewSocketName(
    preferredName: string,
    existingSockets: Socket[] = this.inputSocketArray,
  ): string {
    return super.getNewSocketName(inputGraphicsName);
  }

  public getSocketForNewConnection = (socket: Socket): Socket => {
    return DynamicInputNodeFunctions.getSocketForNewConnection(
      socket,
      this,
      true,
      new DeferredPixiType(),
    );
  };

  public socketCanBeRemoved(socket: Socket): boolean {
    return (
      super.socketCanBeRemoved(socket) &&
      socket.name.includes(inputGraphicsName)
    );
  }

  public inputUnplugged(socket: Socket): void {
    return DynamicInputNodeFunctions.inputUnplugged(socket, this, 0);
  }

  protected getDependentDynamicSockets(socketName: string): Socket[] {
    const suffix = getSuffix(socketName, outputPixiName);
    const offsetName = `${graphicsPositionName}${suffix === '' ? '' : ' ' + suffix}`;
    return [new Socket(SOCKET_TYPE.IN, offsetName, new TwoDVectorType())];
  }
}

export class DRAW_Overlay extends DRAW_Base {
  public getName(): string {
    return 'Overlay objects';
  }

  public getDescription(): string {
    return 'Overlay objects on top of each other - simpler than Combine objects';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputReverseName, new BooleanType(), false),
    ].concat(super.getDefaultIO());
  }

  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
  ): Promise<void> {
    const graphicsKeys = this.inputSocketArray
      .filter((socket) => socket.dataType.getName() == DeferredPixiName)
      .map((socket) => socket.name);

    if (inputObject[inputReverseName]) {
      graphicsKeys.reverse();
    }

    for (const [index, graphicsKey] of graphicsKeys.entries()) {
      const drawingFunction: DeferredPixiTypeInterface =
        inputObject[graphicsKey];
      await drawingFunction.drawFunction(
        container,
        new PIXI.Point(0, 0),
        topParentOverrideSettings,
      );
    }
  }

  public getSocketForNewConnection = (socket: Socket): Socket => {
    const createdSocket = DynamicInputNodeFunctions.getSocketForNewConnection(
      socket,
      this,
      true,
      new DeferredPixiType(),
    );
    return createdSocket;
  };

  public socketCanBeRemoved(selectedSocket: Socket): boolean {
    return (
      super.socketCanBeRemoved(selectedSocket) &&
      selectedSocket.dataType.getName() == DeferredPixiName
    );
  }

  public inputUnplugged(socket: Socket): void {
    DynamicInputNodeFunctions.inputUnplugged(socket, this, 0);
  }
}
