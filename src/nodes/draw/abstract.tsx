import * as PIXI from 'pixi.js';
import React from 'react';
import { TRgba } from '../../utils/color';
import { Box } from '@mui/material';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TEXT_RESOLUTION,
} from '../../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../../components/dashboard/dashboardIcons';
import { DashboardContentGate } from '../../components/dashboard/DashboardContentGate';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import {
  TwoDVectorType,
  TwoDVectorTypeInterface,
} from '../datatypes/twoDVectorType';
import {
  DynamicWidgetPixiBody,
  DynamicWidgetContainerNodeProps,
  DeferredPixiType,
  DeferredPixiTypeInterface,
} from '../datatypes/deferredPixiType';
import {
  DashboardIconProps,
  DashboardWidgetProps,
  Layoutable,
  TNodeSource,
  WidgetContentProps,
  WidgetProps,
} from '../../utils/interfaces';
import { formatIfNumber } from '../../utils/utils';
import { removeAndDestroyChild } from '../../pixi/utils-pixi';
import { NodeExecutionError } from '../../classes/ErrorClass';
import { PNPHitArea } from '../../classes/selection/PNPHitArea';
import FlowLogic from '../../classes/FlowLogic';
import PPGraph from '../../classes/GraphClass';
import {
  inputClickMacroInitialParameters,
  inputClickMacroName,
  inputUseClickName,
} from './interactivityConstants';

export const paddingSocketName = 'Padding';
export const widthBehaviourName = 'Width behaviour';
export const heightBehaviourName = 'Height behaviour';
export const offsetName = 'Offset';
export const scaleName = 'Scale';
export const inputRotationName = 'Angle';
export const outputPixiName = 'Graphics';

export const outputMultiplierIndex = 'LastPressedIndex';
export const outputMultiplierPointerDown = 'PointerDown';

export const objectsInteractive = 'Clickable objects';

export const NODE_DRAW_OFFSET_X = 200;

const backgroundColor = TRgba.white();

const defaultProps: WidgetProps = {
  background: backgroundColor.setAlpha(0),
  width: '100%',
  height: '240px',
  minWidth: '48px',
  minHeight: '48px',
};

export abstract class DRAW_Base extends PPNode implements Layoutable {
  deferredGraphics: PIXI.Container;
  listenIDUp = '';
  listenIDMove = '';
  isDragging = false;
  drawID = 0;

  hoverTextLabel: PIXI.Text | undefined = undefined;

  getWidgetProps(): WidgetProps {
    return { ...defaultProps };
  }

  public isLayoutable(): boolean {
    return true;
  }

  public getName(): string {
    return 'Draw';
  }

  public getDescription(): string {
    return 'Draw Base';
  }

  public getTags(): string[] {
    return ['Draw'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DRAW);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  getDashboardId(): string {
    return `NODE_${this.id}`;
  }

  getDashboardName(): string {
    return this.nodeName;
  }

  getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return DEFAULT_DASHBOARD_ICON;
  }

  isContainer(): boolean {
    return false;
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return <DynamicWidgetContainerDrawNode property={this} {...props} />;
  }

  getWidgetContent(props: WidgetContentProps): React.ReactNode {
    throw new Error('Method not implemented.');
  }

  getRelatedNode(): PPNode {
    return this;
  }

  public reactsToCombineDrawKeyBinding(): boolean {
    return true;
  }

  // you probably want to maintain this output in children
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputRotationName,
        new NumberType(true, -180, 180),
        0,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        scaleName,
        new TwoDVectorType(),
        { x: 1, y: 1 },
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        offsetName,
        new TwoDVectorType(),
        { x: 0, y: 0 },
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outputPixiName, new DeferredPixiType()),
    ].concat(super.getDefaultIO());
  }

  public getVersion(): number {
    return 2;
  }

  // we changed default offset to 0
  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 2) {
      this.setInputData(offsetName, { x: 0, y: 0 });
    }
  }

  // if you are a child you likely want to use this instead of normal execute
  async drawOnContainer(
    inputObject: any,
    container: PIXI.Container,
    topParentOverrideSettings: any,
    inDashboard: boolean = false,
  ): Promise<void> {}

  private async getContainer(
    inputObject: any,
    offset: PIXI.Point,
    topParentOverrideSettings: any,
  ): Promise<PIXI.Container> {
    const myContainer = new PIXI.Container();
    myContainer.name = `${this.id}-container`;
    inputObject = {
      ...inputObject,
      ...topParentOverrideSettings,
    };
    await this.drawOnContainer(
      inputObject,
      myContainer,
      topParentOverrideSettings,
    );

    this.positionScaleAndBackground(myContainer, inputObject, offset);

    return myContainer;
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const baseDrawFunction = async (
      container,
      position = new PIXI.Point(),
      topParentOverrideSettings = {},
    ): Promise<void> => {
      const offset: TwoDVectorTypeInterface = inputObject[offsetName];

      const bakedX = position.x + offset.x;
      const bakedY = position.y + offset.y;

      const newOffset = !this.shouldDraw()
        ? new PIXI.Point(bakedX, bakedY)
        : new PIXI.Point(bakedX + NODE_DRAW_OFFSET_X, bakedY); // we start drawing at X offset to not be inside the node
      if (container) {
        container.addChild(
          await this.getContainer(
            inputObject,
            newOffset,
            topParentOverrideSettings,
          ),
        );
      } else {
        console.error('container is undefined for some reason');
      }
    };
    const output: DeferredPixiTypeInterface = {
      drawFunction: baseDrawFunction,
    };
    outputObject[outputPixiName] = output;
    await this.handleDrawing(output);
  }

  protected setOffsets(offsets: PIXI.Point) {
    this.setInputData(offsetName, { x: offsets.x, y: offsets.y });
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    this.deferredGraphics = new PIXI.Container();

    await super.onNodeAdded(source);
    this._ForegroundRef.addChild(this.deferredGraphics);
  }

  public getSelectionBounds(): PIXI.Rectangle[] {
    const normalBounds = super.getSelectionBounds()[0];
    const allBounds: PIXI.Rectangle[] = [normalBounds];
    if (this.shouldDraw()) {
      const drawnBounds = this.getDrawnBounds();
      drawnBounds.x += this.x;
      drawnBounds.y += this.y;
      allBounds.push(drawnBounds);
    }
    return allBounds;
  }

  private getDrawnBounds(): PIXI.Rectangle {
    const offset = this.getInputData(offsetName);
    return new PIXI.Rectangle(
      this.deferredGraphics.x + offset.x + NODE_DRAW_OFFSET_X,
      this.deferredGraphics.y + offset.y,
      this.deferredGraphics.width,
      this.deferredGraphics.height,
    );
  }

  protected getHitArea(): PNPHitArea {
    if (!this.shouldDraw()) {
      return super.getHitArea();
    } else {
      const baseRect = super.getHitArea();

      const toReturn = new PNPHitArea((x, y) => {
        const drawnRect = this.getDrawnBounds();
        return baseRect.contains(x, y) || drawnRect.contains(x, y);
      });
      return toReturn;
    }
  }

  protected drawImmediately() {
    return false;
  }

  private async handleDrawing(
    drawingFunction: DeferredPixiTypeInterface,
  ): Promise<void> {
    let passedInOverrideSettings = {};
    const draw = async () => {
      if (this.hasBeenAdded) {
        this.deferredGraphics.removeChildren();
      }
      if (
        this.hasBeenAdded &&
        !this.deferredGraphics.destroyed &&
        this.shouldDraw()
      ) {
        try {
          await drawingFunction.drawFunction(
            this.deferredGraphics,
            new PIXI.Point(0, 0),
            passedInOverrideSettings,
          );
          this.hitArea = this.getHitArea();
        } catch (error) {
          this.setStatus(new NodeExecutionError(error.stack));
          return;
        }
        return 'DRAW_' + this.id;
      } else {
        this.hitArea = this.getHitArea();
      }
    };
    if (this.drawImmediately()) {
      await draw();
    } else {
      cancelAnimationFrame(this.drawID);
      this.drawID = requestAnimationFrame(draw);
    }
  }

  protected positionScaleAndBackground(
    toModify: PIXI.Container,
    inputObject: any,
    offset: PIXI.Point,
  ): void {
    // get bounds with reset pivot
    toModify.pivot.x = 0;
    toModify.pivot.y = 0;
    const myContainerBounds = toModify.getBounds();

    const scale: TwoDVectorTypeInterface = inputObject[scaleName];

    toModify.updateTransform({
      x: offset.x,
      y: offset.y,
      scaleX: scale.x,
      scaleY: scale.y,
      rotation: (inputObject[inputRotationName] * Math.PI) / 180,
      skewX: 0,
      skewY: 0,
      pivotX: myContainerBounds.x,
      pivotY: myContainerBounds.y,
      originX: myContainerBounds.width / 2,
      originY: myContainerBounds.height / 2,
    });
  }

  public async outputPlugged(socket: Socket): Promise<void> {
    await this.executeOptimizedChain();
  }
  public outputUnplugged(): void {
    FlowLogic.addPendingExecution(this.id);
  }

  protected shouldDraw(): boolean {
    return !this.getOutputSocketByName(outputPixiName).hasLink();
  }

  protected addHoverInfoListenTarget(
    graphicsToListenTo: PIXI.Graphics | PIXI.Container,
    graphicsToDrawOn: PIXI.Graphics | PIXI.Container,
    label: string,
    fontSize = 16,
    textColor = new TRgba(0, 0, 0, 1),
    backDrop = false,
  ) {
    graphicsToListenTo.interactive = true;

    graphicsToListenTo.addEventListener('pointerover', (e) => {
      graphicsToListenTo.alpha = 0.7;
      if (label.trim().length) {
        if (this.hoverTextLabel == undefined || this.hoverTextLabel.destroyed) {
          this.hoverTextLabel = new PIXI.Text({
            resolution: TEXT_RESOLUTION,
          });
          this.hoverTextLabel.interactive = false;
          this.hoverTextLabel.style.align = 'center';
        }
        this.hoverTextLabel.style.fontSize = fontSize;
        //this.hoverTextLabel.size
        this.hoverTextLabel.alpha = 1;

        // To position the label correctly, we first find the top-center
        // of the hovered element in global coordinates.
        const bounds = graphicsToListenTo.getBounds();
        const globalTopCenter = new PIXI.Point(
          bounds.x + bounds.width / 2,
          bounds.y,
        );

        // Then, we convert this global point into the local coordinate
        // system of the container where the label will be drawn.
        const localPos = graphicsToDrawOn.toLocal(globalTopCenter);

        this.hoverTextLabel.position.copyFrom(localPos);
        // Center horizontally, and position just above the point.
        this.hoverTextLabel.anchor.set(0.5, 1.0);
        this.hoverTextLabel.text = label;
        this.hoverTextLabel.style.fill = textColor.hexNumber();
        if (backDrop) {
          this.hoverTextLabel.style.stroke = {
            width: fontSize / 8,
            color: 0x000000f,
          };
        }
        graphicsToDrawOn.addChild(this.hoverTextLabel);
      }
    });

    graphicsToListenTo.addEventListener('pointerout', (e) => {
      if (this.hoverTextLabel != undefined) {
        graphicsToDrawOn.removeChild(this.hoverTextLabel);
      }
      graphicsToListenTo.alpha = 1;
    });

    graphicsToListenTo.on('destroyed', () => {
      graphicsToListenTo.removeAllListeners();
    });
  }

  protected potentiallyAddClickInteraction(target, inputObject, lastArgument) {
    if (inputObject[inputUseClickName]) {
      target.addEventListener('click', () => {
        void PPGraph.currentGraph.invokeMacro(
          inputObject[inputClickMacroName],
          inputObject[inputClickMacroInitialParameters].concat([lastArgument]),
        );
      });
    }
  }

  protected addHoverInfoListenTargetGraph(
    graphicsToListenTo: PIXI.Graphics,
    graphicsToDrawOn: PIXI.Container,
    label: string,
    value1: number | undefined = undefined,
    value2: number | undefined = undefined,
  ) {
    let text = label;
    if (value1 != undefined) {
      text += '\n' + formatIfNumber(value1);
    }
    if (value2 != undefined) {
      text += '\n' + formatIfNumber(value2);
    }

    this.addHoverInfoListenTarget(graphicsToListenTo, graphicsToDrawOn, text);
  }

  public allowResize(): boolean {
    return false;
  }
}

export abstract class DRAW_Interactive_Base extends DRAW_Base {
  // you probably want to maintain this output in children
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, objectsInteractive, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.OUT,
        outputMultiplierIndex,
        new NumberType(true),
        -1,
        () => this.getInputData(objectsInteractive),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.OUT,
        outputMultiplierPointerDown,
        new BooleanType(),
        false,
        () => this.getInputData(objectsInteractive),
      ),
    ].concat(super.getDefaultIO());
  }
}

const DynamicWidgetContainerDrawNode: React.FunctionComponent<
  Partial<DynamicWidgetContainerNodeProps> & {
    property: PPNode;
    isSurfacePreview?: boolean;
  }
> = (props) => {
  return (
    <Box
      id={`inspector-node-${props.property.getName()}`}
      sx={{
        height: '100%',
        width: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <DashboardContentGate
        disabled={props.disabled}
        isSurfacePreview={props.isSurfacePreview}
      >
        <DynamicWidgetPixiBody
          property={props.property}
          disabled={props.disabled}
          width={props.width}
          height={props.height}
        />
      </DashboardContentGate>
    </Box>
  );
};
