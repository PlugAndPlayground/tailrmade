import PPLink from './LinkClass';
import PPNode from './NodeClass';
import PPSocket from './SocketClass';
import * as styles from '../utils/style.module.css';
import { SOCKET_TYPE } from '../utils/constants';

// how far off the socket the label sits, in screen pixels
const OFFSET = 20;
// shift expands a fanned out connection count into a list, capped so a
// heavily fanned socket cannot grow the label past the viewport. Exported for
// the test, which would otherwise repeat the number
export const MAX_LISTED_CONNECTIONS = 20;
// the pointer has to settle on a socket for this long before the label
// appears, so passing over sockets on the way to a drag stays quiet
const DWELL_MS = 400;
// ...but once it has appeared, it stays eager for this long after hiding, so
// scanning along a row of sockets does not pay the dwell again each time
const WARM_MS = 1000;

type ConnectionRow = { node: string; socket: string };

type ConnectionSummary = {
  direction: string;
  rows: ConnectionRow[];
  more: number;
};

// Screen space label naming the socket the pointer is about to act on.
//
// It is rendered on the html layer rather than into the pixi overlay
// container: hybrid nodes append their own html to #container, which paints
// over the entire canvas, so a canvas drawn label is clipped by any hybrid
// node it happens to overlap. Positioning is exact because pixi screen
// coordinates and #container css pixels are the same coordinate space - the
// same identity mapping HybridNode2 already uses to keep its html glued to
// the canvas (see pixiToContainerNumber).
//
// Layout: a rail carrying the datatype colour down the edge nearest the
// socket, the socket's own name, a quiet second line qualifying it, and a
// band for what it is wired to. Holding shift switches to the detailed
// reading - the owning node instead of the socket's datatype, and a fanned
// out connection count expanded into the actual list.
export default class SocketNameOverlay {
  private element: HTMLDivElement | undefined;
  private railElement: HTMLSpanElement | undefined;
  private socketNameElement: HTMLSpanElement | undefined;
  private subtitleElement: HTMLSpanElement | undefined;
  private connectionsElement: HTMLSpanElement | undefined;
  private currentLabel = '';
  private currentWidth = 0;
  private isVisible = false;
  private isDetailed = false;
  private currentSocket: PPSocket | undefined;
  private detailKeyListener: ((event: KeyboardEvent) => void) | undefined;
  private dwellTimer: ReturnType<typeof setTimeout> | undefined;
  private eagerUntil = 0;

  constructor() {
    // shift is read from the event rather than tracked as a pressed/released
    // pair, so a shift release that happens while the window is unfocused
    // cannot leave the label stuck in its expanded state
    this.detailKeyListener = (event: KeyboardEvent) => {
      const detailed = event.shiftKey;
      if (detailed === this.isDetailed) {
        return;
      }
      this.isDetailed = detailed;
      if (this.isVisible && this.currentSocket) {
        this.showFor(this.currentSocket);
      }
    };
    window.addEventListener('keydown', this.detailKeyListener);
    window.addEventListener('keyup', this.detailKeyListener);
  }

  // The quiet second line. By default it qualifies the socket - its datatype
  // is what you are deciding about mid drag. Shift trades that for the node
  // it belongs to: node.name is what the header shows and what a rename
  // writes to, while getName() is overridden per node class to return the
  // class display name, so the pair reads 'what I called it' then 'what kind
  // it is' - and on a node nobody renamed those are simply the same word.
  static getSubtitle(
    socket: PPSocket,
    detailed: boolean,
    typeName: string,
  ): string {
    if (!detailed) {
      return typeName;
    }
    const node = socket.getNode();
    if (!node) {
      return typeName;
    }
    const name = node.nodeName || node.getName();
    // the class display name ('Constant'), not the registry key ('constant')
    const kind = node.getName() || node.type;
    return name === kind ? name : `${name} • ${kind}`;
  }

  // the far end of a link is an identity, so it is always named rather than
  // typed - and named the same way, or a renamed node would show up here
  // under its class name
  private static describeNode(node: PPNode | undefined): string {
    return node?.nodeName || node?.getName() || '';
  }

  // the ghost socket - the add-input affordance on dynamic input nodes -
  // carries an empty name, which would render as a blank heading
  static getSocketTitle(socket: PPSocket): string {
    if (socket.name) {
      return socket.name;
    }
    return socket.socketType === SOCKET_TYPE.GHOST ? 'Add input' : '';
  }

  // What the socket is wired to, from its own point of view - following a
  // wire by eye is exactly what is impossible at the zoom levels this label
  // exists for. A single connection is just its row: which way it runs is
  // already carried by the socket's own name and by the side the label sits
  // on. A fan out gets one count line, so no row pays for a marker. Outputs
  // fan out, where a count reads better than a list that grows the box, so
  // the list is behind shift.
  //
  // Rows are not grouped by node - a fan out where two links land on one node
  // is rare enough that a comma list is not worth a second render path - but
  // they are sorted by node, so when it does happen the repeats land adjacent
  // and collapse by eye.
  static getConnectionSummary(
    socket: PPSocket,
    detailed: boolean,
  ): ConnectionSummary {
    const links = socket.links ?? [];
    const empty: ConnectionSummary = { direction: '', rows: [], more: 0 };
    if (links.length === 0) {
      return empty;
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

  // The label waits for the pointer to settle before appearing, so that
  // crossing a socket on the way to a click-and-drag does not flash it up.
  // Once it is up, moving to another socket is instant - scanning a row is
  // the other thing this label is for - and it stays instant for a grace
  // period after hiding, so a brief gap between sockets does not re-arm the
  // wait. `immediate` skips the wait outright, which is what a live drag
  // wants: the pointer is already committed.
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
    const element = this.ensureElement();
    if (
      !element ||
      !this.railElement ||
      !this.socketNameElement ||
      !this.subtitleElement ||
      !this.connectionsElement
    ) {
      console.error(
        'Socket name overlay could not be rendered, its elements are missing:',
        element
          ? 'the host element is there but its parts are not'
          : 'no #container to attach to',
      );
      return;
    }
    this.currentSocket = socket;
    const socketName = SocketNameOverlay.getSocketTitle(socket);
    const isGhostSocket = socket.socketType === SOCKET_TYPE.GHOST;
    // the ghost socket has no datatype, and no name either - getSocketTitle
    // already supplies 'Add input'
    const typeName = isGhostSocket
      ? 'any type'
      : (socket.dataType?.getName() ?? '');
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
      // the rail hugs the edge nearest the socket, so a label to the left of
      // a left edge socket carries its rail on the right
      element.className = `${styles.socketNameOverlay} ${
        onLeftEdge
          ? styles.socketNameOverlaySocketLeft
          : styles.socketNameOverlaySocketRight
      }`;
      this.socketNameElement.textContent = socketName;
      this.subtitleElement.textContent = subtitle;
      // The datatype colour goes on the rail, exactly as the socket is drawn,
      // and the text stays neutral. Datatype colours are picked to sit on the
      // canvas rather than on a near black pill, so several of them
      // (FileType, ImageResourceMapType) are unreadable as text here - as a
      // rail any colour works, and none of them get distorted
      this.railElement.className = isGhostSocket
        ? `${styles.socketNameOverlayRail} ${styles.socketNameOverlayRailGhost}`
        : styles.socketNameOverlayRail;
      this.railElement.style.backgroundColor = isGhostSocket
        ? ''
        : socket.dataType.getColor().hex();
      this.renderConnections(summary);
      // measured only when the content changes, not on every pointer move.
      // Both side variants pad to the same total, so the flip does not
      // invalidate this
      element.style.display = 'block';
      this.currentWidth = element.offsetWidth;
    }
    if (!this.isVisible) {
      element.style.display = 'block';
      this.isVisible = true;
    }
    this.positionNextTo(socket, element);
  }

  // The on-screen box, for anything that wants to sit with the label rather
  // than compute its own placement - the click-to-open inspector aligns to
  // this so the two read as one stack. Undefined while it is not showing.
  getFrameRect(): DOMRect | undefined {
    if (!this.element || !this.isVisible) {
      return undefined;
    }
    return this.element.getBoundingClientRect();
  }

  hide(): void {
    this.currentSocket = undefined;
    this.clearDwell();
    if (this.element && this.isVisible) {
      this.element.style.display = 'none';
      this.isVisible = false;
      // it was actually up, so stay eager for a moment - the gap between two
      // sockets should not cost the dwell again. A label that never made it
      // past the wait leaves no warmth behind
      this.eagerUntil = Date.now() + WARM_MS;
    }
  }

  private clearDwell(): void {
    if (this.dwellTimer !== undefined) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = undefined;
    }
  }

  destroy(): void {
    this.clearDwell();
    if (this.detailKeyListener) {
      window.removeEventListener('keydown', this.detailKeyListener);
      window.removeEventListener('keyup', this.detailKeyListener);
      this.detailKeyListener = undefined;
    }
    this.element?.remove();
    this.element = undefined;
    this.railElement = undefined;
    this.socketNameElement = undefined;
    this.subtitleElement = undefined;
    this.connectionsElement = undefined;
    this.currentSocket = undefined;
    this.currentLabel = '';
    this.isVisible = false;
  }

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
    // showFor rewrites this with the side variant, but the first paint has to
    // be styled too
    element.className = styles.socketNameOverlay;

    // the datatype colour, drawn on the edge nearest the socket
    this.railElement = document.createElement('span');
    this.railElement.className = styles.socketNameOverlayRail;
    element.appendChild(this.railElement);

    // identity: the socket, then the quiet line that shift swaps out
    const identity = document.createElement('span');
    identity.className = `${styles.socketNameOverlayZone}`;
    this.socketNameElement = document.createElement('span');
    this.socketNameElement.className = styles.socketNameOverlaySocketName;
    this.subtitleElement = document.createElement('span');
    this.subtitleElement.className = styles.socketNameOverlaySubtitle;
    identity.appendChild(this.socketNameElement);
    identity.appendChild(this.subtitleElement);

    // what it is wired to, in its own band
    this.connectionsElement = document.createElement('span');
    this.connectionsElement.className = `${styles.socketNameOverlayZone} ${styles.socketNameOverlayConnections}`;

    element.appendChild(identity);
    element.appendChild(this.connectionsElement);
    this.element = parent.appendChild(element);
    return this.element;
  }

  private renderConnections(summary: ConnectionSummary): void {
    const container = this.connectionsElement;
    if (!container) {
      return;
    }
    container.textContent = '';
    // an unconnected socket says nothing rather than 'not connected', and the
    // band goes with it. A single connection has no count line, so the rows
    // decide this as well
    const hasContent = summary.rows.length > 0 || Boolean(summary.direction);
    container.style.display = hasContent ? 'block' : 'none';
    if (!hasContent) {
      return;
    }
    if (summary.direction) {
      const direction = document.createElement('span');
      direction.className = styles.socketNameOverlayDirection;
      direction.textContent = summary.direction;
      container.appendChild(direction);
    }
    summary.rows.forEach((row) => {
      const line = document.createElement('span');
      line.className = styles.socketNameOverlayConnection;
      const node = document.createElement('span');
      node.textContent = row.node;
      const socket = document.createElement('span');
      socket.className = styles.socketNameOverlayConnectionSocket;
      socket.textContent = row.socket;
      line.appendChild(node);
      line.appendChild(socket);
      container.appendChild(line);
    });
    if (summary.more > 0) {
      const more = document.createElement('span');
      more.className = styles.socketNameOverlayMore;
      more.textContent = `+${summary.more} more`;
      container.appendChild(more);
    }
  }

  // Which side of its node the socket physically sits on, decided from its
  // position rather than from isInput(). A GHOST socket (the add-input
  // affordance on dynamic input nodes) draws itself at the input x position
  // but reports isInput() === false, and macro nodes lay sockets out in
  // their own left and right blocks - geometry is right in every case.
  private static sitsOnLeftEdge(socket: PPSocket): boolean {
    const node = socket.getNode();
    if (!node) {
      return socket.isInput();
    }
    // node local, so no viewport scale or global lookup is involved
    const socketX = socket.x + socket.getSocketLocation().x;
    return socketX <= node.nodeWidth / 2;
  }

  // Where a box of this width belongs for this socket: on the outward side
  // of the node, so a socket on the left edge gets it further left and one on
  // the right edge further right. That keeps it off the node it belongs to,
  // and it is clamped so it stays on screen at the canvas edges.
  //
  // Geometry only - it answers the same whether or not the label happens to
  // be showing, which is what lets the socket inspector place itself by this
  // same rule instead of measuring the label and hoping it is up.
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

  private positionNextTo(socket: PPSocket, element: HTMLDivElement): void {
    const { left, centerY } = this.anchorFor(socket, this.currentWidth);
    // translateY(-50%) centres it vertically without measuring the height
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(centerY)}px`;
    element.style.transform = 'translateY(-50%)';
  }
}
