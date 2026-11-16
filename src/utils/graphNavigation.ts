import * as PIXI from 'pixi.js';
import FlowLogic from '../classes/FlowLogic';
import PPGraph from '../classes/GraphClass';
import type PPNode from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { SELECTION_COLOR_HEX } from './constants';
import {
  calculateOverlayOffsets,
  findVisibleFit,
  getNodesBounds,
  getVisibleCanvasBounds,
  smoothMoveViewport,
} from '../pixi/utils-pixi';

export type NavigationTarget = {
  node: PPNode;
  // shown after the node name, e.g. "Calls this macro"
  detail: string;
};

export type NavigationPickerRequest = {
  title: string;
  targets: NavigationTarget[];
  // screen point the picker opens from, towards the wires it follows
  x: number;
  y: number;
  opensTo: 'left' | 'right';
  onPick: (node: PPNode) => void;
};

// macro id -> id of the caller it was last entered from
const macroEnteredFrom = new Map<string, string>();

const isFullyVisible = (bounds: PIXI.Rectangle): boolean => {
  const viewport = PPGraph.currentGraph.viewport;
  const topLeft = viewport.toScreen(bounds.x, bounds.y);
  const bottomRight = viewport.toScreen(
    bounds.x + bounds.width,
    bounds.y + bounds.height,
  );
  const { left, right } = getVisibleCanvasBounds();
  return (
    topLeft.x >= left &&
    bottomRight.x <= right &&
    topLeft.y >= 0 &&
    bottomRight.y <= viewport.screenHeight
  );
};

// leaves some room around nodes it has to zoom out for
const FIT_MARGIN = 0.8;

// pans at the current zoom so the jump stays easy to follow; only zooms out
// as far as needed to fit the nodes
const centerNodes = (nodes: PPNode[]) => {
  const bounds = getNodesBounds(nodes);
  const fit = findVisibleFit(bounds) * FIT_MARGIN;
  const scale = fit < PPGraph.currentGraph.viewportScaleX ? fit : undefined;
  smoothMoveViewport(
    new PIXI.Point(
      bounds.x + bounds.width / 2 - calculateOverlayOffsets(scale),
      bounds.y + bounds.height / 2,
    ),
    scale,
  );
};

const PULSE_MS = 700;
const PULSE_SPREAD_PX = 48;

// a ring that grows out of the node in screen pixels, so the landing spot
// is easy to find at any zoom
export const pulseNode = (node: PPNode): void => {
  const graph = PPGraph.currentGraph;
  const bounds = getNodesBounds([node]);
  const ring = new PIXI.Graphics();
  ring.eventMode = 'none';
  graph.viewport.addChild(ring);
  const start = performance.now();
  const frame = (now: number) => {
    if (ring.destroyed) {
      return;
    }
    const progress = Math.min(1, (now - start) / PULSE_MS);
    const scale = graph.viewportScaleX;
    const spread = (4 + PULSE_SPREAD_PX * progress) / scale;
    ring
      .clear()
      .roundRect(
        bounds.x - spread,
        bounds.y - spread,
        bounds.width + 2 * spread,
        bounds.height + 2 * spread,
        12 / scale,
      )
      .stroke({
        width: 3 / scale,
        color: SELECTION_COLOR_HEX,
        alpha: 1 - progress,
      });
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      ring.destroy();
    }
  };
  requestAnimationFrame(frame);
};

type ShowOptions = {
  // moves the view even when the nodes are already in it
  center?: boolean;
  // kept in view with the node, without being selected or pulsed
  alongWith?: PPNode[];
};

export const showNode = (
  node: PPNode,
  { center = false, alongWith = [] }: ShowOptions = {},
): void => {
  const nodes = [node, ...alongWith];
  PPGraph.currentGraph.selection.selectNodes([node]);
  if (center || !isFullyVisible(getNodesBounds(nodes))) {
    centerNodes(nodes);
  }
  pulseNode(node);
};

export type ArrowDirection = 'left' | 'right' | 'up' | 'down';

const gapBetween = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) => Math.max(0, bStart - aEnd, aStart - bEnd);

// The nearest node in the arrow's direction, connected or not. Being out of
// line counts double, so the node in the same row or column wins
const nearestInDirection = (
  node: PPNode,
  direction: ArrowDirection,
): PPNode | undefined => {
  const from = getNodesBounds([node]);
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;
  let best: PPNode | undefined;
  let bestScore = Infinity;
  Object.values(PPGraph.currentGraph.nodes).forEach((candidate) => {
    if (candidate === node) {
      return;
    }
    const to = getNodesBounds([candidate]);
    const along = horizontal
      ? to.x + to.width / 2 - (from.x + from.width / 2)
      : to.y + to.height / 2 - (from.y + from.height / 2);
    if (along * sign <= 0) {
      return;
    }
    const gap = horizontal
      ? gapBetween(from.x, from.right, to.x, to.right)
      : gapBetween(from.y, from.bottom, to.y, to.bottom);
    const offLine = horizontal
      ? gapBetween(from.y, from.bottom, to.y, to.bottom)
      : gapBetween(from.x, from.right, to.x, to.right);
    const score = gap + 2 * offLine + Math.abs(along) / 1000;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
};

const nodeNearestToViewCenter = (): PPNode | undefined => {
  const center = PPGraph.currentGraph.viewport.center;
  const distance = (node: PPNode) => {
    const bounds = getNodesBounds([node]);
    return Math.hypot(
      bounds.x + bounds.width / 2 - center.x,
      bounds.y + bounds.height / 2 - center.y,
    );
  };
  return Object.values(PPGraph.currentGraph.nodes).sort(
    (a, b) => distance(a) - distance(b),
  )[0];
};

export const moveSpatially = (
  node: PPNode | undefined,
  direction: ArrowDirection,
): void => {
  if (!node) {
    const start = nodeNearestToViewCenter();
    if (start) {
      showNode(start);
    }
    return;
  }
  const next = nearestInDirection(node, direction);
  if (next) {
    showNode(next);
  } else {
    pulseNode(node);
  }
};

// one target jumps straight there, several open the picker beside the node
const goToOneOf = (
  targets: NavigationTarget[],
  title: string,
  from: PPNode,
  opensTo: 'left' | 'right',
  onPick: (node: PPNode) => void,
) => {
  if (targets.length === 1) {
    onPick(targets[0].node);
  } else if (targets.length > 1) {
    const bounds = getNodesBounds([from]);
    const anchor = PPGraph.currentGraph.viewport.toScreen(
      opensTo === 'left' ? bounds.x : bounds.x + bounds.width,
      bounds.y,
    );
    const request: NavigationPickerRequest = {
      title,
      targets,
      x: anchor.x,
      y: anchor.y,
      opensTo,
      onPick,
    };
    InterfaceController.notifyListeners(
      ListenEvent.GraphNavigationPickerRequested,
      request,
    );
  }
};

const macrosCalledBy = (node: PPNode): PPNode[] =>
  PPGraph.currentGraph.macros.filter(
    (macro) => macro !== node && node.isCallingMacro(macro.name),
  );

// returns false when the node calls no macro, so Enter keeps its other uses
export const enterCalledMacro = (caller: PPNode): boolean => {
  const macros = macrosCalledBy(caller);
  goToOneOf(
    macros.map((macro) => ({ node: macro, detail: 'Macro' })),
    'Go to macro',
    caller,
    'right',
    (macro) => {
      macroEnteredFrom.set(macro.id, caller.id);
      showNode(macro);
    },
  );
  return macros.length > 0;
};

// the macro itself, or the macro whose body holds the node
const enclosingMacro = (node: PPNode): PPNode | undefined =>
  PPGraph.currentGraph.macros.find(
    (macro) => macro === node || macro.getInsideNodes().includes(node),
  );

// back to the caller the macro was entered from, otherwise to one of its callers
export const exitToMacroCaller = (node: PPNode): void => {
  const macro = enclosingMacro(node);
  if (!macro) {
    return;
  }
  const callers = Object.values(PPGraph.currentGraph.nodes).filter(
    (candidate) => candidate !== macro && candidate.isCallingMacro(macro.name),
  );
  const enteredFrom = callers.find(
    (caller) => caller.id === macroEnteredFrom.get(macro.id),
  );
  goToOneOf(
    (enteredFrom ? [enteredFrom] : callers).map((caller) => ({
      node: caller,
      detail: 'Calls this macro',
    })),
    'Go to caller',
    macro,
    'left',
    showNode,
  );
};

let graphClickedAfterDashboard = true;

export const initGraphNavigation = (): void => {
  // The UI editor binds Enter and the arrow keys to its selected widget
  // too; it keeps them only while it was clicked more recently than the graph
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest('#pixi-container')) {
        graphClickedAfterDashboard = true;
      } else if (event.target.closest('[data-cy="dashboard-column"]')) {
        graphClickedAfterDashboard = false;
      }
    },
    true,
  );
};

const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export const ARROW_DIRECTIONS: Record<string, ArrowDirection> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export const isGraphNavigationKey = (event: KeyboardEvent): boolean =>
  event.key === 'Enter' || ARROW_KEYS.includes(event.code);

export const isGraphOwningKeyboard = (): boolean => graphClickedAfterDashboard;

// node content, the UI and widgets like sliders use the arrow keys themselves
const ARROW_KEY_OWNERS =
  '[id^="Container-"], [data-cy="dashboard-column"], [contenteditable="true"], [role="slider"], [role="grid"], [role="listbox"], [role="menu"], [role="tablist"], [role="tree"], select';

export const arrowsBelongToTarget = (event: KeyboardEvent): boolean =>
  event.target instanceof Element &&
  event.target.closest(ARROW_KEY_OWNERS) !== null;

// Arrows move to the nearest node on the canvas, Alt+Shift+left/right select
// everything upstream/downstream like the node header's buttons. Shift+Enter
// leaves a macro, plain Enter goes through node.onEnterKeyPressed
export const handleGraphNavigationKey = (event: KeyboardEvent): boolean => {
  if (InterfaceController.isInAppView() || event.metaKey || event.ctrlKey) {
    return false;
  }
  const selected = PPGraph.currentGraph.selection.selectedNodes;
  const single = selected.length === 1 ? selected[0] : undefined;
  const direction = ARROW_DIRECTIONS[event.code];

  if (direction) {
    const horizontal = direction === 'left' || direction === 'right';
    if (arrowsBelongToTarget(event) || selected.length > 1) {
      return false;
    } else if (event.altKey && event.shiftKey) {
      if (!single || !horizontal) {
        return false;
      }
      PPGraph.currentGraph.selection.selectNodes(
        FlowLogic.getAllUpDownstreamNodes(
          single,
          direction === 'left',
          direction === 'right',
          false,
        ),
      );
    } else if (event.altKey || event.shiftKey) {
      return false;
    } else {
      moveSpatially(single, direction);
    }
  } else if (event.shiftKey && event.key === 'Enter' && single) {
    exitToMacroCaller(single);
  } else {
    return false;
  }
  event.preventDefault();
  return true;
};
