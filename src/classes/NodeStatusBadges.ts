import * as PIXI from 'pixi.js';
import PPGraph from './GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { PNPStatus } from './ErrorClass';
import {
  DARK_HEX,
  ERROR_BOUNDARY_SCREEN_OFFSET,
  NODE_MARGIN,
  STATUS_SEVERITY,
} from '../utils/constants';
import { TNodeId } from '../utils/interfaces';
import { getStatusIconTexture } from '../utils/statusIcons';

const STATUS_BADGE_RADIUS = 12;
const STATUS_BADGE_HIT_PADDING = 3;
const STATUS_BADGE_GAP = 4;
export const STATUS_BADGE_CONTAINER_NAME = 'statusBadge';

export interface StatusBadgeHost {
  id: TNodeId;
  nodeWidth: number;
  headerHeight: number;
  comment: string;
  getWorstStatus(): PNPStatus | undefined;
}

function currentViewportScale(): number {
  return PPGraph.currentGraph?.viewportScaleX || 1;
}

export class NodeStatusBadges {
  readonly container: PIXI.Container;

  constructor(
    private readonly host: StatusBadgeHost,
    parent: PIXI.Container,
  ) {
    this.container = parent.addChild(new PIXI.Container());
    this.container.name = STATUS_BADGE_CONTAINER_NAME;
    this.container.eventMode = 'none';
  }

  get isDrawn(): boolean {
    return this.container.children.length > 0;
  }

  private getCenter(radius: number): { x: number; y: number } {
    const screenOffset =
      ERROR_BOUNDARY_SCREEN_OFFSET + STATUS_BADGE_GAP + radius;
    return {
      x:
        NODE_MARGIN +
        this.host.nodeWidth +
        screenOffset / currentViewportScale(),
      y: this.host.headerHeight / 2,
    };
  }

  draw(): void {
    this.container.removeChildren().forEach((child) => child.destroy());
    this.container.eventMode = 'none';

    const worst = this.host.getWorstStatus();
    const hasComment = Boolean(this.host.comment);
    if (!worst && !hasComment) {
      return;
    }

    const radius = STATUS_BADGE_RADIUS;
    let offsetX = 0;
    this.container.eventMode = 'passive';

    const openPopover =
      (kind: 'status' | 'comment') => (event: PIXI.FederatedPointerEvent) => {
        // otherwise the node begins a drag and the popover never opens
        event.stopPropagation();
        InterfaceController.notifyListeners(
          ListenEvent.NodeDetailPopoverRequested,
          { nodeId: this.host.id, kind, x: event.global.x, y: event.global.y },
        );
      };

    const icon = worst
      ? getStatusIconTexture(
          worst.getSeverity() >= STATUS_SEVERITY.ERROR ? 'error' : 'warning',
        )
      : undefined;
    const commentIcon = hasComment
      ? getStatusIconTexture('comment')
      : undefined;

    if (worst && icon) {
      const badge = new PIXI.Container();
      const sprite = new PIXI.Sprite(icon);
      sprite.width = radius * 2;
      sprite.height = radius * 2;
      sprite.anchor.set(0.5);
      sprite.tint = worst.getColor().hexNumber();
      badge.addChild(sprite);
      badge.x = offsetX;
      badge.y = 0;
      badge.eventMode = 'static';
      badge.cursor = 'pointer';
      badge.hitArea = new PIXI.Circle(0, 0, radius + STATUS_BADGE_HIT_PADDING);
      badge.on('pointerdown', openPopover('status'));
      this.container.addChild(badge);
      offsetX += radius * 2 + STATUS_BADGE_GAP;
    }

    if (commentIcon) {
      const bubble = new PIXI.Sprite(commentIcon);
      bubble.width = radius * 2;
      bubble.height = radius * 2;
      bubble.anchor.set(0.5);
      bubble.tint = DARK_HEX;
      bubble.x = offsetX;
      bubble.y = 0;
      bubble.eventMode = 'static';
      bubble.cursor = 'pointer';
      bubble.hitArea = new PIXI.Circle(0, 0, radius + STATUS_BADGE_HIT_PADDING);
      bubble.on('pointerdown', openPopover('comment'));
      this.container.addChild(bubble);
    }

    this.applyTransform();
  }

  applyTransform(): void {
    const center = this.getCenter(STATUS_BADGE_RADIUS);
    this.container.x = center.x;
    this.container.y = center.y;
    this.container.scale.set(1 / currentViewportScale());
  }

  containsPoint(x: number, y: number): boolean {
    const count = this.container.children.length;
    if (!count) {
      return false;
    }
    const scale = this.container.scale.x;
    const reach = (STATUS_BADGE_RADIUS + STATUS_BADGE_HIT_PADDING) * scale;
    const spanRight =
      (count - 1) * (STATUS_BADGE_RADIUS * 2 + STATUS_BADGE_GAP) * scale +
      reach;
    const dx = x - this.container.x;
    const dy = y - this.container.y;
    return dx >= -reach && dx <= spanRight && Math.abs(dy) <= reach;
  }
}
