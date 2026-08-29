import PPLink from './LinkClass';
import PPNode from './NodeClass';
import PPSocket from './SocketClass';
import * as styles from '../utils/style.module.css';
import { SOCKET_TYPE } from '../utils/constants';

// how far off the socket the label sits, in screen pixels
const OFFSET = 20;
// exported for the test, which would otherwise repeat the number
export const MAX_LISTED_CONNECTIONS = 20;
// the pointer has to settle this long before the label appears, so crossing
// sockets on the way to a drag stays quiet - but scanning along a row of them
// should not pay the dwell each time
const DWELL_MS = 400;
const WARM_MS = 1000;

type ConnectionRow = { node: string; socket: string };

type ConnectionSummary = {
  direction: string;
  rows: ConnectionRow[];
  more: number;
};

type Parts = {
  root: HTMLDivElement;
  rail: HTMLSpanElement;
  name: HTMLSpanElement;
  subtitle: HTMLSpanElement;
  connections: HTMLSpanElement;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}

// Screen space label naming the socket the pointer is about to act on. On the
// html layer rather than in the pixi overlay container: hybrid nodes append
// their own html to #container, so a canvas drawn label is clipped by any
// hybrid node it overlaps. Pixi screen coordinates and #container css pixels
// are the same space, so positioning stays exact.
export default class SocketNameOverlay {
  private parts: Parts | undefined;
  private currentLabel = '';
  private currentWidth = 0;
  private isVisible = false;
  private isDetailed = false;
  private currentSocket: PPSocket | undefined;
  private detailKeyListener: ((event: KeyboardEvent) => void) | undefined;
  private dwellTimer: ReturnType<typeof setTimeout> | undefined;
  private eagerUntil = 0;

  constructor() {
    // read from the event rather than tracked as a pressed/released pair, so a
    // release while the window is unfocused cannot leave the label expanded
    this.detailKeyListener = (event: KeyboardEvent) => {
      if (event.shiftKey === this.isDetailed) {
        return;
      }
      this.isDetailed = event.shiftKey;
      if (this.isVisible && this.currentSocket) {
        this.showFor(this.currentSocket);
      }
    };
    window.addEventListener('keydown', this.detailKeyListener);
    window.addEventListener('keyup', this.detailKeyListener);
  }

  // The quiet second line: the datatype, or under shift the owning node -
  // nodeName is what a rename writes to, getName() the class display name.
  static getSubtitle(
    socket: PPSocket,
    detailed: boolean,
    typeName: string,
  ): string {
    const node = socket.getNode();
    if (!detailed || !node) {
      return typeName;
    }
    const name = node.nodeName || node.getName();
    const kind = node.getName() || node.type;
    return name === kind ? name : `${name} • ${kind}`;
  }

  // named the same way everywhere, or a renamed node shows up as its class
  private static describeNode(node: PPNode | undefined): string {
    return node?.nodeName || node?.getName() || '';
  }

  // the ghost socket - the add-input affordance - carries an empty name
  static getSocketTitle(socket: PPSocket): string {
    if (socket.name) {
      return socket.name;
    }
    return socket.socketType === SOCKET_TYPE.GHOST ? 'Add input' : '';
  }

  // What the socket is wired to. A single connection is just its row - which
  // way it runs is already carried by the label's side. A fan out gets a count
  // line, the list only behind shift, sorted so repeats land adjacent.
  static getConnectionSummary(
    socket: PPSocket,
    detailed: boolean,
  ): ConnectionSummary {
    const links = socket.links ?? [];
    if (links.length === 0) {
      return { direction: '', rows: [], more: 0 };
    }
    const isIncoming = socket.isInput();
    const rows = links
      .map((link: PPLink) => {
        const other = isIncoming ? link.getSource() : link.getTarget();
        return {
          node: SocketNameOverlay.describeNode(other.getNode()),
          socket: other.name,
        };
      })
      .sort(
        (a, b) =>
          a.node.localeCompare(b.node) || a.socket.localeCompare(b.socket),
      );
    if (rows.length === 1) {
      return { direction: '', rows, more: 0 };
    }
    const direction = `${rows.length} connections`;
    if (!detailed) {
      return { direction, rows: [], more: 0 };
    }
    const listed = rows.slice(0, MAX_LISTED_CONNECTIONS);
    return { direction, rows: listed, more: rows.length - listed.length };
  }

  // Waits for the pointer to settle before appearing, then stays instant for a
  // grace period. `immediate` skips the wait, which is what a live drag wants.
  showFor(socket: PPSocket, immediate = false): void {
    if (immediate || this.isVisible || Date.now() < this.eagerUntil) {
      this.clearDwell();
      this.render(socket);
      return;
    }
    // keep the latest socket, but do not restart the clock: the pointer is
    // still settling within the same run of sockets
    this.currentSocket = socket;
    if (this.dwellTimer === undefined) {
      this.dwellTimer = setTimeout(() => {
        this.dwellTimer = undefined;
        if (this.currentSocket) {
          this.render(this.currentSocket);
        }
      }, DWELL_MS);
    }
  }

  private render(socket: PPSocket): void {
    const parts = this.ensureParts();
    if (!parts) {
      return;
    }
    this.currentSocket = socket;
    const socketName = SocketNameOverlay.getSocketTitle(socket);
    const isGhost = socket.socketType === SOCKET_TYPE.GHOST;
    // the ghost socket has no datatype, and no name either
    const typeName = isGhost ? 'any type' : (socket.dataType?.getName() ?? '');
    const subtitle = SocketNameOverlay.getSubtitle(
      socket,
      this.isDetailed,
      typeName,
    );
    const onLeftEdge = SocketNameOverlay.sitsOnLeftEdge(socket);
    const summary = SocketNameOverlay.getConnectionSummary(
      socket,
      this.isDetailed,
    );
    const label = [
      socketName,
      subtitle,
      onLeftEdge ? 'L' : 'R',
      summary.direction,
      summary.more,
      ...summary.rows.map((row) => `${row.node}/${row.socket}`),
    ].join('|');

    if (label !== this.currentLabel) {
      this.currentLabel = label;
      // the rail hugs the edge nearest the socket
      parts.root.className = `${styles.socketNameOverlay} ${
        onLeftEdge
          ? styles.socketNameOverlaySocketLeft
          : styles.socketNameOverlaySocketRight
      }`;
      parts.name.textContent = socketName;
      parts.subtitle.textContent = subtitle;
      // colour on the rail, text neutral: several datatype colours are picked
      // for the canvas and are unreadable as text on a near black pill
      parts.rail.className = isGhost
        ? `${styles.socketNameOverlayRail} ${styles.socketNameOverlayRailGhost}`
        : styles.socketNameOverlayRail;
      parts.rail.style.backgroundColor = isGhost
        ? ''
        : socket.dataType.getColor().hex();
      this.renderConnections(parts.connections, summary);
      // measured only when the content changes, not on every pointer move -
      // both side variants pad to the same total, so the flip is safe
      parts.root.style.display = 'block';
      this.currentWidth = parts.root.offsetWidth;
    }
    if (!this.isVisible) {
      parts.root.style.display = 'block';
      this.isVisible = true;
    }
    // translateY(-50%) centres it vertically without measuring the height
    const { left, centerY } = this.anchorFor(socket, this.currentWidth);
    parts.root.style.left = `${Math.round(left)}px`;
    parts.root.style.top = `${Math.round(centerY)}px`;
    parts.root.style.transform = 'translateY(-50%)';
  }

  // The on-screen box, so the click-to-open inspector can align to the label
  // rather than compute its own placement. Undefined while it is not showing.
  getFrameRect(): DOMRect | undefined {
    if (!this.parts || !this.isVisible) {
      return undefined;
    }
    return this.parts.root.getBoundingClientRect();
  }

  hide(): void {
    this.currentSocket = undefined;
    this.clearDwell();
    if (this.parts && this.isVisible) {
      this.parts.root.style.display = 'none';
      this.isVisible = false;
      // only a label that was actually up leaves warmth behind
      this.eagerUntil = Date.now() + WARM_MS;
    }
  }

  private clearDwell(): void {
    clearTimeout(this.dwellTimer);
    this.dwellTimer = undefined;
  }

  destroy(): void {
    this.clearDwell();
    if (this.detailKeyListener) {
      window.removeEventListener('keydown', this.detailKeyListener);
      window.removeEventListener('keyup', this.detailKeyListener);
      this.detailKeyListener = undefined;
    }
    this.parts?.root.remove();
    this.parts = undefined;
    this.currentSocket = undefined;
    this.currentLabel = '';
    this.isVisible = false;
  }

  private ensureParts(): Parts | undefined {
    if (this.parts) {
      return this.parts;
    }
    const parent = document.getElementById('container');
    if (!parent) {
      console.error('Socket name overlay has no #container to attach to');
      return undefined;
    }
    const root = el('div', styles.socketNameOverlay);
    root.id = 'socket-name-overlay';
    const rail = el('span', styles.socketNameOverlayRail, root);
    const identity = el('span', styles.socketNameOverlayZone, root);
    const name = el('span', styles.socketNameOverlaySocketName, identity);
    const subtitle = el('span', styles.socketNameOverlaySubtitle, identity);
    const connections = el(
      'span',
      `${styles.socketNameOverlayZone} ${styles.socketNameOverlayConnections}`,
      root,
    );
    parent.appendChild(root);
    this.parts = { root, rail, name, subtitle, connections };
    return this.parts;
  }

  private renderConnections(
    container: HTMLSpanElement,
    summary: ConnectionSummary,
  ): void {
    container.textContent = '';
    // an unconnected socket says nothing rather than 'not connected'
    const hasContent = summary.rows.length > 0 || Boolean(summary.direction);
    container.style.display = hasContent ? 'block' : 'none';
    if (summary.direction) {
      el('span', styles.socketNameOverlayDirection, container).textContent =
        summary.direction;
    }
    summary.rows.forEach((row) => {
      const line = el('span', styles.socketNameOverlayConnection, container);
      el('span', '', line).textContent = row.node;
      el('span', styles.socketNameOverlayConnectionSocket, line).textContent =
        row.socket;
    });
    if (summary.more > 0) {
      el('span', styles.socketNameOverlayMore, container).textContent =
        `+${summary.more} more`;
    }
  }

  // Decided from position rather than isInput(): a GHOST socket draws at the
  // input x but reports isInput() === false, and macros lay out their own blocks.
  private static sitsOnLeftEdge(socket: PPSocket): boolean {
    const node = socket.getNode();
    if (!node) {
      return socket.isInput();
    }
    // node local, so no viewport scale or global lookup is involved
    return socket.x + socket.getSocketLocation().x <= node.nodeWidth / 2;
  }

  // Where a box of this width belongs: on the outward side of the node,
  // clamped to stay on screen. Geometry only, so it answers the same whether
  // or not the label happens to be showing.
  anchorFor(
    socket: PPSocket,
    width: number,
  ): { left: number; centerY: number } {
    const center = socket.screenPointSocketCenter();
    const rawX = SocketNameOverlay.sitsOnLeftEdge(socket)
      ? center.x - OFFSET - width
      : center.x + OFFSET;
    return {
      left: Math.max(4, Math.min(window.innerWidth - width - 4, rawX)),
      centerY: center.y,
    };
  }
}
