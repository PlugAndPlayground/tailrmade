import React from 'react';
import * as PIXI from 'pixi.js';
import DOMPurify from 'dompurify';
import { TRgba } from '../../utils/color';
import { fitAndPosition } from 'object-fit-math';
import type { FitMode } from 'object-fit-math/dist/types';
import PPGraph from '../../classes/GraphClass';
import { isImageDataURL, saveBase64AsImage } from '../../utils/utils';
import {
  DashboardIconProps, TNodeSource, WidgetProps, Layoutable, DashboardWidgetProps, WidgetContentProps } from '../../utils/interfaces';
import {
  DEFAULT_IMAGE,
  NODE_TYPE_COLOR,
  NODE_MARGIN,
  NODE_SOURCE,
  OBJECT_FIT_OPTIONS,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
  SANITIZE_NAME,
} from '../../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../../components/dashboard/dashboardIcons';
import Socket from '../../classes/SocketClass';
import { ImageType } from '../datatypes/imageType';
import PPNode from '../../classes/NodeClass';
import { JSONType } from '../datatypes/jsonType';
import { EnumType } from '../datatypes/enumType';
import { TriggerType } from '../datatypes/triggerType';
import { NumberType } from '../datatypes/numberType';
import { DynamicWidgetContainerNode } from '../layout/dynamicLayout';
import {
  convertSvgToBase64,
  convertSvgToBase64WithResolution,
  SvgImageType,
} from '../datatypes/svgImageType';
import { BooleanType } from '../datatypes/booleanType';

const imageInputName = 'Image';
const imageObjectFit = 'Object fit';
const imageResetSize = 'Reset size';
const imageExport = 'Save image';
export const imageOutputName = 'Image';
export const imageSizeName = 'Size';
const imageOutputDetails = 'Details';

function isValidImageSource(source: unknown): source is string {
  if (typeof source !== 'string' || source.trim() === '') {
    return false;
  }

  const trimmedSource = source.trim();
  if (!isImageDataURL(trimmedSource)) {
    return true;
  }

  const payload = trimmedSource
    .slice(trimmedSource.indexOf(',') + 1)
    .replace(/\s/g, '');
  if (payload.length === 0) {
    return false;
  }

  try {
    window.atob(payload);
    return true;
  } catch (_error) {
    return false;
  }
}

// Default widget props
const defaultProps: WidgetProps = {
  background: TRgba.fromString(NODE_TYPE_COLOR.INPUT).setAlpha(0),
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: '48px',
};

export class Image extends PPNode implements Layoutable {
  sprite: PIXI.Sprite;
  texture: PIXI.Texture;
  maskRef: PIXI.Graphics;

  public getName(): string {
    return 'Image';
  }

  public getDescription(): string {
    return 'Display an image. Drag in a file to import it; Shift+drag onto a selected image to replace it.';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        imageInputName,
        new ImageType(),
        DEFAULT_IMAGE,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        imageObjectFit,
        new EnumType(OBJECT_FIT_OPTIONS, undefined, true),
        'cover',
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        imageResetSize,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'resetNodeSize'),
        0,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        imageExport,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'saveImage'),
        0,
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        imageOutputName,
        new ImageType(),
        DEFAULT_IMAGE,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        imageOutputDetails,
        new JSONType(),
        undefined,
        false,
      ),
    ];
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getOpacity(): number {
    return 0.2;
  }

  public getShrinkOnSocketRemove(): boolean {
    return false;
  }

  public getDefaultNodeWidth() {
    return !this.texture ? super.getDefaultNodeWidth() : this.texture.width;
  }

  public getDefaultNodeHeight() {
    return !this.texture ? super.getDefaultNodeHeight() : this.texture.height;
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this.sprite = new PIXI.Sprite();
    this._ForegroundRef.addChild(this.sprite);

    this.maskRef = new PIXI.Graphics();
    this._ForegroundRef.addChild(this.maskRef);
    this.sprite.mask = this.maskRef;

    const texture = await this.loadTexture(this.getInputData('Image'));
    this.texture = new PIXI.Texture(texture);
    this.sprite.texture = this.texture;
    this.sprite.texture.update();

    this.maskRef
      .rect(0, 0, this.texture.width, this.texture.height)
      .fill(0xffffff);
    this.maskRef.x = NODE_MARGIN;

    if (source !== NODE_SOURCE.SERIALIZED) {
      this.setInitialNodeSize();
    } else {
      this.hasBeenDrawn = false;
      super.resizeAndDraw();
    }
  }

  setInitialNodeSize = () => {
    if (this.texture !== undefined) {
      this.setMinNodeHeight();
      this.resizeAndDraw(
        this.getMinNodeWidth() * 2,
        this.getMinNodeHeight() * 2,
      );
      PPGraph.currentGraph.selection.drawRectanglesFromSelection();
    }
  };

  resetNodeSize = () => {
    if (this.texture !== undefined) {
      this.setMinNodeHeight();
      this.resizeAndDraw(this.texture.width, this.texture.height);
      PPGraph.currentGraph.selection.drawRectanglesFromSelection();
    }
  };

  setMinNodeHeight = () => {
    const aspectRatio = this.texture.width / this.texture.height;
    this.getMinNodeHeight = () => {
      return this.getMinNodeWidth() / aspectRatio;
    };
  };

  loadTexture = async (imageSource: unknown): Promise<PIXI.TextureSource> => {
    const safeSource = isValidImageSource(imageSource)
      ? imageSource
      : DEFAULT_IMAGE;
    try {
      return await PIXI.Assets.load(safeSource);
    } catch (error) {
      console.warn('Failed to load image source, using default image:', error);
      return PIXI.Assets.load(DEFAULT_IMAGE);
    }
  };

  onNodeResize = (newWidth, newHeight) => {
    if (this.maskRef && this.texture) {
      const objectFit = this.getInputData(imageObjectFit);
      this.doFitAndPosition(newWidth, newHeight, objectFit);
      this.maskRef.width = newWidth;
      this.maskRef.height = newHeight;
      this.setOutputData(imageOutputDetails, {
        textureWidth: this.texture.width,
        textureHeight: this.texture.height,
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    }
  };

  doFitAndPosition = (
    newWidth: number,
    newHeight: number,
    objectFit: FitMode,
  ): void => {
    const parentSize = {
      width: newWidth,
      height: newHeight,
    };
    const childSize = {
      width: this.texture.width,
      height: this.texture.height,
    };
    const rect = fitAndPosition(parentSize, childSize, objectFit, '50%', '50%');
    this.sprite.x = rect.x + NODE_MARGIN;
    this.sprite.y = rect.y;
    this.sprite.width = rect.width;
    this.sprite.height = rect.height;
  };

  // Modify updateTexture to trigger child updates
  updateTexture = async (base64: string): Promise<void> => {
    if (this.sprite) {
      const safeBase64 = isValidImageSource(base64) ? base64 : DEFAULT_IMAGE;
      this.setInputData(imageOutputName, safeBase64);
      const texture = await this.loadTexture(safeBase64);

      this.texture = new PIXI.Texture(texture);
      this.sprite.texture = this.texture;
      this.sprite.texture.update();

      const objectFit = this.getInputData(imageObjectFit);
      this.doFitAndPosition(this.maskRef.width, this.maskRef.height, objectFit);
      this.setOutputData(imageOutputName, safeBase64);
      this.setOutputData(imageOutputDetails, {
        textureWidth: this.texture.width,
        textureHeight: this.texture.height,
        width: Math.round(this.maskRef.width),
        height: Math.round(this.maskRef.height),
      });
    }
  };

  setDirtyAndUpdateTexture = async (base64: string): Promise<void> => {
    this.hasBeenDrawn = false;
    await this.updateTexture(base64);
  };

  updateAndExecute = async (base64: string): Promise<void> => {
    await this.setDirtyAndUpdateTexture(base64);
    await this.executeChildren();
  };

  onExecute = async function (input) {
    const base64 = input[imageInputName];
    await this.setDirtyAndUpdateTexture(base64);
  };

  saveImage = async () => {
    const base64 = this.getInputData(imageOutputName);
    await saveBase64AsImage(base64, this.name);
  };

  // Implement Layoutable interface
  public isLayoutable(): boolean {
    return true;
  }

  isContainer(): boolean {
    return false;
  }

  getWidgetProps(): WidgetProps {
    return { ...defaultProps };
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

  getRelatedNode(): PPNode {
    return this;
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return <DynamicWidgetContainerNode property={this} {...props} />;
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <ImageComponent {...props} />;
  }
}

export class SvgImage extends PPNode {
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Svg Image', new SvgImageType()),
      new Socket(
        SOCKET_TYPE.IN,
        imageSizeName,
        new NumberType(true),
        512,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, SANITIZE_NAME, new BooleanType(), true, false),
      new Socket(SOCKET_TYPE.OUT, imageOutputName, new ImageType()),
    ];
  }

  public getName(): string {
    return 'Svg Image to Base64';
  }

  public getDescription(): string {
    return 'Converts an SVG image to a rasterized Base64 image at specified size (maintains aspect ratio)';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const svg = input['Svg Image'];
    let parsedSvg = svg;
    const size = input[imageSizeName];

    // Sanitize SVG if enabled
    if (input[SANITIZE_NAME]) {
      parsedSvg = DOMPurify.sanitize(svg);
    }

    try {
      const base64 = await convertSvgToBase64WithResolution(parsedSvg, size);
      output[imageOutputName] = base64;
    } catch (error) {
      console.error('Error converting SVG to Base64:', error);
      // Fallback to simple conversion
      output[imageOutputName] = convertSvgToBase64(parsedSvg);
    }
  }
}

// A React component for the dashboard display
const ImageComponent: React.FC<WidgetContentProps> = (props) => {
  const node = props.node;
  const nodeComponentId = `${node.id}-dashboard`;

  return (
    <div id={nodeComponentId} style={{ width: '100%', height: '100%' }}>
      <img
        src={props[imageOutputName]}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = DEFAULT_IMAGE;
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: props[imageObjectFit],
        }}
      />
    </div>
  );
};
