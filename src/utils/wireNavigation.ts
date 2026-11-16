import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import PPGraph from '../classes/GraphClass';
import type PPLink from '../classes/LinkClass';
import InterfaceController from '../InterfaceController';
import { showNode } from './graphNavigation';

// how close to a wire counts as on it, in screen pixels
const HIT_DISTANCE_PX = 6;
const CLICK_SLOP_PX = 4;
const SAMPLES = 24;

type WireHit = {
  link: PPLink;
  distance: number;
  // 0 at the source, 1 at the target
  t: number;
};

export const bezierAt = (curve: PIXI.Point[], t: number): PIXI.Point => {
  const u = 1 - t;
  const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return new PIXI.Point(
    curve.reduce((sum, point, i) => sum + weights[i] * point.x, 0),
    curve.reduce((sum, point, i) => sum + weights[i] * point.y, 0),
  );
};

// distance to the segment ab, and how far along it the closest point lies
const toSegment = (p: PIXI.Point, a: PIXI.Point, b: PIXI.Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const s =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared),
        );
  return {
    distance: Math.hypot(p.x - (a.x + s * dx), p.y - (a.y + s * dy)),
    s,
  };
};

const hitLink = (
  link: PPLink,
  point: PIXI.Point,
  tolerance: number,
): WireHit | undefined => {
  // the drawn bounds are cached, so most wires are ruled out without the curve
  const drawn = link._connectionRef;
  const box = drawn.bounds;
  const x = point.x - drawn.x;
  const y = point.y - drawn.y;
  if (
    x < box.minX - tolerance ||
    x > box.maxX + tolerance ||
    y < box.minY - tolerance ||
    y > box.maxY + tolerance
  ) {
    return undefined;
  }
  const curve = link.getCurve();
  let best: WireHit | undefined;
  let previous = curve[0];
  for (let i = 1; i <= SAMPLES; i++) {
    const next = bezierAt(curve, i / SAMPLES);
    const { distance, s } = toSegment(point, previous, next);
    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { link, distance, t: (i - 1 + s) / SAMPLES };
    }
    previous = next;
  }
  return best;
};

const wireAt = (global: PIXI.Point): WireHit | undefined => {
  const graph = PPGraph.currentGraph;
  const point = graph.viewport.toWorld(global);
  const tolerance = HIT_DISTANCE_PX / graph.viewportScaleX;
  let best: WireHit | undefined;
  Object.values(graph.nodes).forEach((node) =>
    node.outputSocketArray.forEach((socket) =>
      socket.links.forEach((link) => {
        const hit = link.visible && hitLink(link, point, tolerance);
        if (hit && (!best || hit.distance < best.distance)) {
          best = hit;
        }
      }),
    ),
  );
  return best;
};

// wires lie under the nodes, so they are reachable on the canvas and groups
const isOverWire = (event: PIXI.FederatedPointerEvent) =>
  event.target === PPGraph.currentGraph.viewport ||
  event.target?.parent === PPGraph.currentGraph.groupLayer;

let hovered: PPLink | undefined;

const setHovered = (link: PPLink | undefined) => {
  if (link !== hovered) {
    // the hovered wire may be gone with the graph it was in
    if (hovered && !hovered.destroyed) {
      hovered.unhighlight();
    }
    link?.highlight();
    hovered = link;
  }
};

// Clicking a wire shows both its ends and selects the target, or the source
// when clicked in the third at the target end.
// Dragging from a wire still pans or selects as on the empty canvas
export const initWireNavigation = (viewport: Viewport): void => {
  let pressed: { hit: WireHit; global: PIXI.Point } | undefined;

  // after the canvas and groups have set their cursor
  viewport.addEventListener('pointermove', (event) => {
    const hit =
      event.buttons === 0 &&
      !PPGraph.currentGraph.selectedSocket &&
      isOverWire(event)
        ? wireAt(event.global)
        : undefined;
    setHovered(hit?.link);
    if (hit) {
      (event.target as PIXI.Container).cursor = 'pointer';
    } else if (event.target === viewport) {
      viewport.cursor = undefined;
    }
  });

  // on the way down, as groups stop presses from reaching the canvas
  viewport.addEventListener(
    'pointerdown',
    (event) => {
      const hit =
        event.button === 0 &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        isOverWire(event)
          ? wireAt(event.global)
          : undefined;
      pressed = hit && { hit, global: event.global.clone() };
    },
    { capture: true },
  );

  // groups stop taps from reaching the canvas, so this listens on the way down
  viewport.addEventListener(
    'pointertap',
    (event) => {
      const press = pressed;
      pressed = undefined;
      if (
        !press ||
        event.detail > 1 ||
        InterfaceController.isInAppView() ||
        Math.hypot(
          event.global.x - press.global.x,
          event.global.y - press.global.y,
        ) > CLICK_SLOP_PX
      ) {
        return;
      }
      const { link, t } = press.hit;
      const source = link.getSource().getNode();
      const target = link.getTarget().getNode();
      // a third of the wire at the target end goes back to the source
      const nearTarget = t > 2 / 3;
      const [far, near] = nearTarget ? [source, target] : [target, source];
      showNode(far, { center: true, alongWith: [near] });
    },
    { capture: true },
  );
};
