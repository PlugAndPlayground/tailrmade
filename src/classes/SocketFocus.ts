// Socket focus: which socket the pointer would act on, and everything that
// shows it. Owns the hovered socket, the magnetic snap target, the ring drawn
// on the overlay container and the html name overlay, so that a socket reached
// by hovering and one reached by snapping always behave and look the same.

import * as PIXI from 'pixi.js';

import InterfaceController from '../InterfaceController';
import { TRgba } from '../utils/color';
import {
  COLOR_MAIN,
  SOCKET_CORNERRADIUS,
  SOCKET_TYPE,
  SOCKET_WIDTH,
} from '../utils/constants';
import {
  SnapCandidate,
  SnapPoint,
  SnapSocketInfo,
  SocketSnapDirection,
  findNearestSnapCandidate,
  isPointerNearNodeBounds,
  isSnappingSuppressed,
} from '../utils/socketSnapping';
import PPNode from './NodeClass';
import PPSocket from './SocketClass';
import SocketNameOverlay from './SocketNameOverlay';

const SNAP_SCREEN_RADIUS = 48;
const HIGHLIGHT_SCREEN_WIDTH = 2;
// a socket that already carries a link fills in, so hovering shows there is
// something to pick up. Denser rather than a second colour - every other
// colour on a socket is its datatype's
const FILL_ALPHA = 0.2;
const FILL_ALPHA_CONNECTED = 0.7;

// what the snap search needs to know about the world it searches
export type SnapContext = {
  pointer: SnapPoint;
  nodes: { [key: string]: PPNode };
  scale: number;
  // the node search pinned the wire to a stored cursor position
  hasPinnedCursorPosition: boolean;
};

// describes a socket for the pure snapping rules in socketSnapping
function toSnapInfo(socket: PPSocket): SnapSocketInfo {
  let direction: SocketSnapDirection = 'ghost';
  if (socket.socketType !== SOCKET_TYPE.GHOST) {
    direction = socket.isInput() ? 'input' : 'output';
  }
  return { nodeId: socket.getNode().id, direction };
}

export default class SocketFocus {
  // html layer, not a child of the overlay container
  readonly nameOverlay: SocketNameOverlay;
  // ring, moved to whichever socket has focus
  private readonly ring: PIXI.Graphics;
  private readonly getConnectionSource: () => undefined | PPSocket;
  private hoveredSocket: undefined | PPSocket;
  private snappedSocket: undefined | PPSocket;

  constructor(
    overlayContainer: PIXI.Container,
    getConnectionSource: () => undefined | PPSocket,
  ) {
    this.getConnectionSource = getConnectionSource;
    this.ring = new PIXI.Graphics();
    this.ring.name = 'SocketFocusRing';
    this.ring.eventMode = 'none';
    overlayContainer.addChild(this.ring);
    this.nameOverlay = new SocketNameOverlay();
  }

  get hovered(): undefined | PPSocket {
    return this.hoveredSocket;
  }

  // The socket the pointer would act on, either the one under the pointer or
  // the one snapped to.
  get focused(): undefined | PPSocket {
    const hovered =
      this.hoveredSocket === this.getConnectionSource()
        ? undefined
        : this.hoveredSocket;
    return hovered ?? this.snappedSocket;
  }

  hoverOver(socket: PPSocket): void {
    this.hoveredSocket = socket;
    document.body.style.cursor = 'grab';
    this.apply();
  }

  hoverOut(socket: PPSocket): void {
    if (socket == this.hoveredSocket) this.hoveredSocket = undefined;
    if (this.getConnectionSource() == undefined) {
      document.body.style.cursor = 'default';
    }
    // mid drag the wire may still be snapped to something else
    this.apply();
  }

  // Called from Socket.destroy
  forgetSocket(socket: PPSocket): void {
    // the socket inspector lives on the react side and holds its own
    // reference, so it has to be told rather than discovered
    InterfaceController.closeTooltipIfShowing(socket);
    if (socket === this.snappedSocket) {
      this.snappedSocket = undefined;
    }
    // clears the hover reference, restores the cursor and reapplies the focus
    this.hoverOut(socket);
  }

  // Sockets are about to be destroyed - drop the references to them
  forgetAll(): void {
    this.hoveredSocket = undefined;
    this.snappedSocket = undefined;
    this.apply();
  }

  updateSnapTarget(context: SnapContext): void {
    const source = this.getConnectionSource();
    // a directly hovered socket always wins over snapping and while the node
    // search is open the wire is pinned to the stored cursor position
    const snappingDisabled = isSnappingSuppressed({
      hasPinnedCursorPosition: context.hasPinnedCursorPosition,
      hoversOtherSocket:
        this.hoveredSocket !== undefined && this.hoveredSocket !== source,
    });
    this.snappedSocket =
      snappingDisabled || !source
        ? undefined
        : this.findSnapTarget(source, context);
    this.apply();
  }

  clearSnapTarget(): void {
    this.snappedSocket = undefined;
    // a socket still under the pointer stays focused after the drag ends
    this.apply();
  }

  // redraw where the focus is, after the viewport moved under it
  refresh(): void {
    this.apply();
  }

  // The one place that turns socket focus on and off.
  private apply(): void {
    const socket = this.focused;
    this.drawRing(socket);
    if (socket) {
      this.nameOverlay.showFor(socket, Boolean(this.getConnectionSource()));
    } else {
      this.nameOverlay.hide();
    }
  }

  // The nearest socket the dragged wire could connect to
  private findSnapTarget(
    source: PPSocket,
    context: SnapContext,
  ): undefined | PPSocket {
    const candidates: SnapCandidate<PPSocket>[] = [];

    Object.values(context.nodes).forEach((node) => {
      const nodePos = node.getGlobalPosition();
      const withinReach = isPointerNearNodeBounds(
        context.pointer,
        {
          x: nodePos.x,
          y: nodePos.y,
          width: node.nodeWidth * context.scale,
          height: node.nodeHeight * context.scale,
        },
        SNAP_SCREEN_RADIUS,
      );
      if (!withinReach) {
        return;
      }
      node.getAllSockets().forEach((socket) => {
        if (!socket.visible) {
          return;
        }
        candidates.push({
          ref: socket,
          center: socket.screenPointSocketCenter(),
          ...toSnapInfo(socket),
        });
      });
    });

    return findNearestSnapCandidate(
      context.pointer,
      toSnapInfo(source),
      candidates,
      SNAP_SCREEN_RADIUS,
    );
  }

  // A ring the size of the socket's pointer target
  private drawRing(socket: undefined | PPSocket): void {
    this.ring.clear();
    this.ring.visible = socket !== undefined;
    if (!socket) {
      return;
    }
    const center = socket.screenPointSocketCenter();
    const color = TRgba.fromString(COLOR_MAIN).hexNumber();
    const size = PPSocket.screenHitRadius() * 2;
    const radius = socket.dataType.roundedCorners()
      ? size * (SOCKET_CORNERRADIUS / SOCKET_WIDTH)
      : 0;
    this.ring
      .roundRect(center.x - size / 2, center.y - size / 2, size, size, radius)
      .fill({
        color,
        alpha: socket.hasLink() ? FILL_ALPHA_CONNECTED : FILL_ALPHA,
      })
      .stroke({ width: HIGHLIGHT_SCREEN_WIDTH, color, alpha: 0.9 });
  }
}
