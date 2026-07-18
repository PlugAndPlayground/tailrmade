import * as PIXI from 'pixi.js';
import UpdateBehaviourClass from './UpdateBehaviourClass';
import {
  ICON_BADGE_BACKGROUND,
  ICON_BADGE_GAP,
  ICON_BADGE_ICON_TINT,
  ICON_BADGE_SIZE,
  ICON_BADGE_STATIC_ICON_ALPHA,
  ICON_BADGE_SVG_RESOLUTION,
  NODE_MARGIN,
  TEXT_RESOLUTION,
  UPDATEBEHAVIOURHEADER_INTERVAL,
  UPDATEBEHAVIOURHEADER_NOLOAD,
  UPDATEBEHAVIOURHEADER_NOUPDATE,
  UPDATEBEHAVIOURHEADER_UPDATE,
} from '../utils/constants';

const BADGE_SIZE = ICON_BADGE_SIZE;
const BADGE_GAP = ICON_BADGE_GAP;
const BADGE_BG = ICON_BADGE_BACKGROUND;
const ICON_ALPHA = ICON_BADGE_STATIC_ICON_ALPHA;
const ICON_COLOR = ICON_BADGE_ICON_TINT;
const ICON_SIZE = ICON_BADGE_SIZE;
const SVG_ICON_RESOLUTION = ICON_BADGE_SVG_RESOLUTION;
type BadgeIconType = 'stop' | 'noLoad' | 'interval' | 'execute';

const ICON_TEXTURES = {
  execute: UPDATEBEHAVIOURHEADER_UPDATE,
  stop: UPDATEBEHAVIOURHEADER_NOUPDATE,
  noLoad: UPDATEBEHAVIOURHEADER_NOLOAD,
  interval: UPDATEBEHAVIOURHEADER_INTERVAL,
} satisfies Record<BadgeIconType, string>;

export default class UpdateBehaviourGraphics extends PIXI.Container {
  _graphics!: PIXI.Graphics;
  _intervalText: PIXI.Text | null = null;
  _iconSprites!: Record<BadgeIconType, PIXI.Sprite>;
  private initialized = false;

  updateBehaviour: UpdateBehaviourClass;

  constructor(updateBehaviour: UpdateBehaviourClass) {
    super();
    this.updateBehaviour = updateBehaviour;
  }

  redrawAnythingChanging(): void {
    if (!this.initialized) return;

    this._graphics.clear();
    this.hideAllIcons();

    const isHovering = this.updateBehaviour.getNode().isHovering;
    const { load, update, interval } = this.updateBehaviour;
    const hasBadges = !load || !update || interval;
    const intervalBadgeWidth = this.getIntervalBadgeWidth(interval);

    if (isHovering && !hasBadges) {
      this.renderExecuteBadge();
      this.updateHoverHitArea(true);
      return;
    }

    let cursorX = 0;
    let replacedFirst = false;

    for (const [enabled, icon] of [
      [!load, 'noLoad'],
      [!update, 'stop'],
    ] as const) {
      cursorX = this.renderIconBadge(
        cursorX,
        enabled,
        icon,
        isHovering && !replacedFirst,
      );
      if (enabled) replacedFirst = true;
    }

    this.renderIntervalBadgeSlot(
      cursorX,
      interval,
      intervalBadgeWidth,
      isHovering && !replacedFirst,
    );

    this.updateHoverHitArea(isHovering);
  }

  private getIntervalBadgeWidth(showIntervalBadge: boolean): number {
    if (!showIntervalBadge) {
      if (this._intervalText) {
        this._intervalText.text = '';
        this._intervalText.visible = false;
      }

      return BADGE_SIZE;
    }

    const intervalText = this.getOrCreateIntervalText();
    intervalText.text = String(this.updateBehaviour.intervalFrequency);
    intervalText.visible = true;
    intervalText.alpha = ICON_ALPHA;

    return BADGE_SIZE + 4 + intervalText.width + 4;
  }

  private renderExecuteBadge(): void {
    this.drawBadgeBackground(0, BADGE_SIZE);
    this.layoutIcon('execute', 0, BADGE_SIZE);
  }

  private renderIconBadge(
    x: number,
    enabled: boolean,
    icon: 'noLoad' | 'stop',
    replaceWithExecute: boolean,
  ): number {
    if (!enabled) {
      return x;
    }

    this.drawBadgeBackground(x, BADGE_SIZE);
    if (replaceWithExecute) {
      this.layoutIcon('execute', x, BADGE_SIZE);
    } else {
      this.layoutIcon(icon, x, BADGE_SIZE);
    }

    return x + BADGE_SIZE + BADGE_GAP;
  }

  private renderIntervalBadgeSlot(
    x: number,
    enabled: boolean,
    width: number,
    replaceWithExecute: boolean,
  ): void {
    if (!enabled) {
      return;
    }

    this.drawBadgeBackground(x, width);
    if (replaceWithExecute) {
      this.layoutIcon('execute', x, BADGE_SIZE);
    } else {
      this.layoutIntervalBadge(x, width);
    }
  }

  private updateHoverHitArea(isHovering: boolean): void {
    const firstBadgeRect = new PIXI.Rectangle(0, 0, BADGE_SIZE, BADGE_SIZE);
    this.cursor = isHovering ? 'pointer' : 'default';
    this.hitArea = isHovering ? firstBadgeRect : new PIXI.Rectangle(0, 0, 0, 0);
  }

  private getOrCreateIntervalText(): PIXI.Text {
    if (!this._intervalText) {
      this._intervalText = new PIXI.Text({
        text: '',
        style: new PIXI.TextStyle({ fontSize: 10, fill: ICON_COLOR }),
        resolution: TEXT_RESOLUTION,
      });
      this.addChild(this._intervalText);
    }

    return this._intervalText;
  }

  private hideAllIcons(): void {
    Object.values(this._iconSprites).forEach((sprite) => {
      sprite.visible = false;
    });
  }

  private drawBadgeBackground(x: number, width: number): void {
    this._graphics.rect(x, 0, width, BADGE_SIZE).fill(BADGE_BG);
  }

  private layoutIntervalBadge(x: number, width: number): void {
    const intervalText = this.getOrCreateIntervalText();
    this.layoutIcon('interval', x, BADGE_SIZE);

    intervalText.x = x + BADGE_SIZE + 2;
    intervalText.y = (BADGE_SIZE - intervalText.height) / 2;
    intervalText.visible = true;
    intervalText.alpha = ICON_ALPHA;

    if (width <= BADGE_SIZE) {
      intervalText.visible = false;
    }
  }

  private layoutIcon(type: BadgeIconType, x: number, width: number): void {
    const sprite = this._iconSprites[type];
    sprite.visible = true;
    sprite.width = ICON_SIZE;
    sprite.height = ICON_SIZE;
    sprite.x = x + (width - ICON_SIZE) / 2;
    sprite.y = (BADGE_SIZE - ICON_SIZE) / 2;
  }

  private createIconSprite(texture: string): PIXI.Sprite {
    const sprite = PIXI.Sprite.from(texture);
    sprite.visible = false;
    sprite.tint = ICON_COLOR;
    sprite.alpha = ICON_ALPHA;
    this.addChild(sprite);
    return sprite;
  }

  private async loadIconTextures(): Promise<void> {
    await PIXI.Assets.load(
      Object.values(ICON_TEXTURES).map((src) => ({
        src,
        data: {
          resolution: SVG_ICON_RESOLUTION,
          parseAsGraphicsContext: false,
        },
      })),
    );
  }

  private createIconSprites(): Record<BadgeIconType, PIXI.Sprite> {
    return {
      execute: this.createIconSprite(ICON_TEXTURES.execute),
      stop: this.createIconSprite(ICON_TEXTURES.stop),
      noLoad: this.createIconSprite(ICON_TEXTURES.noLoad),
      interval: this.createIconSprite(ICON_TEXTURES.interval),
    };
  }

  onPointerDown(): void {
    void this.updateBehaviour.getNode().executeOptimizedChain();
  }

  async init(): Promise<void> {
    this._graphics = this.addChild(new PIXI.Graphics());
    await this.loadIconTextures();
    this._iconSprites = this.createIconSprites();

    this.on('destroyed', () => {
      this.removeAllListeners();
    });

    if (this.updateBehaviour.getNode().getShouldShowHoverActions()) {
      this.updateBehaviour.getNode()._BackgroundRef.addChild(this);
    }
    this.x = NODE_MARGIN;
    this.y = -22;

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.addEventListener('pointerdown', this.onPointerDown.bind(this));

    this.initialized = true;
    this.hideAllIcons();
    this.redrawAnythingChanging();
  }
}
