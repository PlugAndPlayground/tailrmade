import PPSocket from './SocketClass';
import * as styles from '../utils/style.module.css';
import { SOCKET_NAME_OVERLAY_OFFSET } from '../utils/constants';

// Screen space label naming the socket the pointer is about to act on.
//
// It is rendered on the html layer rather than into the pixi overlay
// container: hybrid nodes append their own html to #container, which paints
// over the entire canvas, so a canvas drawn label is clipped by any hybrid
// node it happens to overlap. Positioning is exact because pixi screen
// coordinates and #container css pixels are the same coordinate space - the
// same identity mapping HybridNode2 already uses to keep its html glued to
// the canvas (see pixiToContainerNumber).
export default class SocketNameOverlay {
  private element: HTMLDivElement | undefined;
  private nodeNameElement: HTMLSpanElement | undefined;
  private socketNameElement: HTMLSpanElement | undefined;
  private currentLabel = '';
  private currentWidth = 0;
  private isVisible = false;

  private ensureElement(): HTMLDivElement | undefined {
    if (this.element) {
      return this.element;
    }
    const parent = document.getElementById('container');
    if (!parent) {
      return undefined;
    }
    const element = document.createElement('div');
    element.id = 'socket-name-overlay';
    element.className = styles.socketNameOverlay;

    this.nodeNameElement = document.createElement('span');
    this.nodeNameElement.className = styles.socketNameOverlayNodeName;
    this.socketNameElement = document.createElement('span');
    this.socketNameElement.className = styles.socketNameOverlaySocketName;

    element.appendChild(this.nodeNameElement);
    element.appendChild(this.socketNameElement);
    this.element = parent.appendChild(element);
    return this.element;
  }

  showFor(socket: PPSocket): void {
    if (!socket || socket.destroyed) {
      this.hide();
      return;
    }
    const element = this.ensureElement();
    if (!element || !this.nodeNameElement || !this.socketNameElement) {
      return;
    }
    const nodeName = socket.getNode()?.getName() ?? '';
    const label = `${nodeName} ${socket.name}`;
    if (label !== this.currentLabel) {
      this.currentLabel = label;
      this.nodeNameElement.textContent = nodeName;
      this.socketNameElement.textContent = socket.name;
      // measured only when the text changes, not on every pointer move
      element.style.display = 'block';
      this.currentWidth = element.offsetWidth;
    }
    if (!this.isVisible) {
      element.style.display = 'block';
      this.isVisible = true;
    }
    this.positionNextTo(socket, element);
  }

  hide(): void {
    if (this.element && this.isVisible) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  destroy(): void {
    this.element?.remove();
    this.element = undefined;
    this.nodeNameElement = undefined;
    this.socketNameElement = undefined;
    this.currentLabel = '';
    this.isVisible = false;
  }

  // placed on the outward side of the node - inputs sit on the left edge so
  // the label goes further left, outputs on the right edge so it goes right.
  // That keeps it off the node it belongs to, and it is clamped so it stays
  // on screen at the canvas edges
  private positionNextTo(socket: PPSocket, element: HTMLDivElement): void {
    const center = socket.screenPointSocketCenter();
    const rawX = socket.isInput()
      ? center.x - SOCKET_NAME_OVERLAY_OFFSET - this.currentWidth
      : center.x + SOCKET_NAME_OVERLAY_OFFSET;
    const x = Math.max(
      4,
      Math.min(window.innerWidth - this.currentWidth - 4, rawX),
    );
    const y = Math.round(center.y);
    // translateY(-50%) centres it vertically without measuring the height
    element.style.left = `${Math.round(x)}px`;
    element.style.top = `${y}px`;
    element.style.transform = 'translateY(-50%)';
  }
}
