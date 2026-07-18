import * as PIXI from 'pixi.js';
import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import { ICON_BADGE_BACKGROUND, MAIN_COLOR } from '../utils/constants';
import { TRgba } from '../utils/color';

type ButtonOptions = {
  badge?: boolean;
  tint?: number;
  defaultAlpha?: number;
  hoverAlpha?: number;
  svgResolution?: number;
  badgeBackground?: {
    color: number;
    alpha: number;
  };
};

export default class Button extends PIXI.Container {
  graph!: PPGraph;
  node!: PPNode;
  up!: boolean;
  down!: boolean;
  private icon: PIXI.Sprite;
  private defaultAlpha: number;
  private hoverAlpha: number;

  constructor(texture: PIXI.Texture, size = 24, options: ButtonOptions = {}) {
    super();

    const tint =
      options.tint ??
      new PIXI.Color(TRgba.fromString(MAIN_COLOR).darken(0.7).hex()).toNumber();

    this.defaultAlpha = options.defaultAlpha ?? 0.5;
    this.hoverAlpha = options.hoverAlpha ?? 1.0;

    if (options.badge) {
      const badgeBackground = options.badgeBackground ?? ICON_BADGE_BACKGROUND;
      const background = new PIXI.Graphics();
      background.rect(0, 0, size, size).fill(badgeBackground);
      this.addChild(background);
    }

    this.icon = this.addChild(new PIXI.Sprite(texture));
    this.icon.width = size;
    this.icon.height = size;
    this.icon.tint = tint;
    this.icon.alpha = this.defaultAlpha;

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new PIXI.Rectangle(0, 0, size, size);
    this.addEventListener('pointerover', this.onPointerOver.bind(this));
    this.addEventListener('pointerout', this.onPointerOut.bind(this));
  }

  static async create(
    imageURL: string,
    size = 24,
    options: ButtonOptions = {},
  ): Promise<Button> {
    if (options.svgResolution && imageURL.endsWith('.svg')) {
      await PIXI.Assets.load({
        src: imageURL,
        data: {
          resolution: options.svgResolution,
          parseAsGraphicsContext: false,
        },
      });
    } else {
      await PIXI.Assets.load(imageURL);
    }

    const texture = PIXI.Texture.from(imageURL);
    return new Button(texture, size, options);
  }

  // SETUP

  onPointerOver(): void {
    this.icon.alpha = this.hoverAlpha;
    this.cursor = 'pointer';
  }

  onPointerOut(): void {
    this.icon.alpha = this.defaultAlpha;
    this.cursor = 'default';
  }
}
