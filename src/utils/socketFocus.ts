// The scene facing half of socket focus and magnetic snapping.

import * as PIXI from 'pixi.js';

import PPNode from '../classes/NodeClass';
import PPSocket from '../classes/SocketClass';
import { TRgba } from './color';
import { COLOR_MAIN, SOCKET_TYPE } from './constants';
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
  ring
    .circle(center.x, center.y, PPSocket.screenHitRadius())
    .fill({ color, alpha: 0.2 })
    .stroke({ width: HIGHLIGHT_SCREEN_WIDTH, color, alpha: 0.9 });
}
