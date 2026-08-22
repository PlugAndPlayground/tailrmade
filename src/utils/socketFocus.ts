// The scene facing half of socket focus and magnetic snapping.

import * as PIXI from 'pixi.js';

import PPNode from '../classes/NodeClass';
import PPSocket from '../classes/SocketClass';
import { TRgba } from './color';
import {
  COLOR_MAIN,
  SOCKET_CORNERRADIUS,
  SOCKET_TYPE,
  SOCKET_WIDTH,
} from './constants';
import {
  SnapCandidate,
  SnapPoint,
  SnapSocketInfo,
  SocketSnapDirection,
  findNearestSnapCandidate,
  isPointerNearNodeBounds,
} from './socketSnapping';

const SNAP_SCREEN_RADIUS = 48;
const HIGHLIGHT_SCREEN_WIDTH = 2;
// a socket that already carries a link fills in, so hovering shows there is
// something to pick up. Denser rather than a second colour - every other
// colour on a socket is its datatype's
const FILL_ALPHA = 0.2;
const FILL_ALPHA_CONNECTED = 0.7;

// describes a socket for the pure snapping rules in socketSnapping
export function toSnapInfo(socket: PPSocket): SnapSocketInfo {
  let direction: SocketSnapDirection = 'ghost';
  if (socket.socketType !== SOCKET_TYPE.GHOST) {
    direction = socket.isInput() ? 'input' : 'output';
  }
  return { nodeId: socket.getNode().id, direction };
}

// The nearest socket the dragged wire could connect to
export function findSnapTarget(
  pointer: SnapPoint,
  source: PPSocket,
  nodes: { [key: string]: PPNode },
  scale: number,
): PPSocket | undefined {
  const candidates: SnapCandidate<PPSocket>[] = [];

  Object.values(nodes).forEach((node) => {
    const nodePos = node.getGlobalPosition();
    const withinReach = isPointerNearNodeBounds(
      pointer,
      {
        x: nodePos.x,
        y: nodePos.y,
        width: node.nodeWidth * scale,
        height: node.nodeHeight * scale,
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
    pointer,
    toSnapInfo(source),
    candidates,
    SNAP_SCREEN_RADIUS,
  );
}

// A ring the size of the socket's pointer target
export function drawFocusRing(
  ring: PIXI.Graphics,
  socket: undefined | PPSocket,
): void {
  ring.clear();
  ring.visible = socket !== undefined;
  if (!socket) {
    return;
  }
  const center = socket.screenPointSocketCenter();
  const color = TRgba.fromString(COLOR_MAIN).hexNumber();
  const size = PPSocket.screenHitRadius() * 2;
  const radius = socket.dataType.roundedCorners()
    ? size * (SOCKET_CORNERRADIUS / SOCKET_WIDTH)
    : 0;
  ring
    .roundRect(center.x - size / 2, center.y - size / 2, size, size, radius)
    .fill({
      color,
      alpha: socket.hasLink() ? FILL_ALPHA_CONNECTED : FILL_ALPHA,
    })
    .stroke({ width: HIGHLIGHT_SCREEN_WIDTH, color, alpha: 0.9 });
}
