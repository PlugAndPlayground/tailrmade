import * as PIXI from 'pixi.js';
import PPSocket from './SocketClass';
import { TRgba } from '../utils/color';
import {
  COLOR_DARK,
  COLOR_WHITE_TEXT,
  SOCKET_NAME_OVERLAY_FONTSIZE,
  SOCKET_NAME_OVERLAY_OFFSET,
  SOCKET_NAME_OVERLAY_PADDING,
  TEXT_RESOLUTION,
} from '../utils/constants';

// Screen space label naming the socket the pointer is about to act on.
// It lives in the graph's overlayContainer (stage level, so it keeps its
// size no matter how far the viewport is zoomed out) because that is
// exactly when the node's own label becomes unreadable - and hybrid nodes
// (getShowLabels() === false) never draw a socket label at all.
export default class SocketNameOverlay extends PIXI.Container {
  private _background: PIXI.Graphics;
  private _text: PIXI.Text;
  private _boxWidth = 0;
  private _boxHeight = 0;

  constructor() {
    super();
    this.name = 'SocketNameOverlay';
    this.eventMode = 'none';
    this.visible = false;

    this._background = new PIXI.Graphics();
    this._text = new PIXI.Text({
      text: '',
      style: new PIXI.TextStyle({
        fontSize: SOCKET_NAME_OVERLAY_FONTSIZE,
        fill: COLOR_WHITE_TEXT,
      }),
      resolution: TEXT_RESOLUTION,
    });
    this._text.x = SOCKET_NAME_OVERLAY_PADDING;
    this._text.y = SOCKET_NAME_OVERLAY_PADDING;

    this.addChild(this._background);
    this.addChild(this._text);
  }

  // the node name is included because at the zoom levels this overlay is
  // meant for, the node header is just as unreadable as the socket label
  static getLabel(socket: PPSocket): string {
    const nodeName = socket.getNode()?.getName();
    return nodeName ? `${nodeName} · ${socket.name}` : socket.name;
  }

  showFor(socket: PPSocket): void {
    if (!socket || socket.destroyed) {
      this.hide();
      return;
    }
    const label = SocketNameOverlay.getLabel(socket);
    if (this._text.text !== label) {
      this._text.text = label;
      this.redrawBackground();
    }
    this.positionNextTo(socket);
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }

  private redrawBackground(): void {
    this._boxWidth = this._text.width + SOCKET_NAME_OVERLAY_PADDING * 2;
    this._boxHeight = this._text.height + SOCKET_NAME_OVERLAY_PADDING * 2;
    this._background
      .clear()
      .roundRect(0, 0, this._boxWidth, this._boxHeight, 4)
      .fill({ color: TRgba.fromString(COLOR_DARK).hexNumber(), alpha: 0.85 });
  }

  // placed on the outward side of the node - inputs sit on the left edge so
  // the label goes further left, outputs on the right edge so it goes right.
  // That keeps it off the node it belongs to, and it is clamped so it stays
  // on screen at the canvas edges
  private positionNextTo(socket: PPSocket): void {
    const center = socket.screenPointSocketCenter();
    const x = socket.isInput()
      ? center.x - SOCKET_NAME_OVERLAY_OFFSET - this._boxWidth
      : center.x + SOCKET_NAME_OVERLAY_OFFSET;
    const y = center.y - this._boxHeight / 2;

    this.position.set(
      Math.max(4, Math.min(window.innerWidth - this._boxWidth - 4, x)),
      Math.max(4, Math.min(window.innerHeight - this._boxHeight - 4, y)),
    );
  }
}
