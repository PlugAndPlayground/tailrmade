import * as PIXI from 'pixi.js';
import PPGraph from '../classes/GraphClass';
import type PPNode from '../classes/NodeClass';
import type Socket from '../classes/SocketClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  calculateOverlayOffsets,
  ensureVisible,
  getNodesBounds,
  getVisibleCanvasBounds,
  smoothMoveViewport,
} from '../pixi/utils-pixi';

export type NavigationDirection = 'upstream' | 'downstream';

export type NavigationTarget = {
  node: PPNode;
  // the wires leading there, e.g. "Output → Input"
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

type Place = {
  graphId: string;
  nodeIds: string[];
  center: PIXI.Point;
  scale: number;
};

const MAX_HISTORY = 50;
const backStack: Place[] = [];
const forwardStack: Place[] = [];
// macro id -> id of the caller it was last entered from
const macroEnteredFrom = new Map<string, string>();

// one entry per linked node, listing every wire between the two
const groupByNode = (pairs: [Socket, Socket][]): NavigationTarget[] => {
  const byNode = new Map<PPNode, string[]>();
  pairs.forEach(([own, other]) => {
    const wire = own.isInput()
      ? `${other.name} → ${own.name}`
      : `${own.name} → ${other.name}`;
    const node = other.getNode();
    byNode.set(node, [...(byNode.get(node) ?? []), wire]);
  });
  return [...byNode].map(([node, wires]) => ({
    node,
    detail: wires.join(', '),
  }));
};

const linkedPairs = (sockets: Socket[]): [Socket, Socket][] =>
  sockets.flatMap((socket) =>
    socket.links.map((link): [Socket, Socket] => [
      socket,
      socket.isInput() ? link.getSource() : link.getTarget(),
    ]),
  );

export const getSocketTargets = (socket: Socket): NavigationTarget[] =>
  groupByNode(linkedPairs([socket]));

export const getNodeTargets = (
  node: PPNode,
  direction: NavigationDirection,
): NavigationTarget[] =>
  groupByNode(
    linkedPairs(
      direction === 'upstream'
        ? node.getAllInputSocketsInDisplayOrder()
        : node.outputSocketArray,
    ),
  ).filter((target) => target.node !== node);

const currentPlace = (): Place => {
  const graph = PPGraph.currentGraph;
  return {
    graphId: graph.id,
    nodeIds: graph.selection.selectedNodes.map((node) => node.id),
    center: graph.viewport.center.clone(),
    scale: graph.viewportScaleX,
  };
};

const pushBounded = (stack: Place[], place: Place) => {
  stack.push(place);
  if (stack.length > MAX_HISTORY) {
    stack.shift();
  }
};

// places from a graph that is no longer open are dropped on the way
const popPlace = (stack: Place[]): Place | undefined => {
  const graphId = PPGraph.currentGraph.id;
  let place = stack.pop();
  while (place && place.graphId !== graphId) {
    place = stack.pop();
  }
  return place;
};

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

// pans at the current zoom so the jump stays easy to follow; only zooms out
// when the node would not fit
const bringIntoView = (node: PPNode) => {
  const bounds = getNodesBounds([node]);
  if (isFullyVisible(bounds)) {
    return;
  }
  const { left, right } = getVisibleCanvasBounds();
  const graph = PPGraph.currentGraph;
  const fits =
    bounds.width * graph.viewportScaleX <= right - left &&
    bounds.height * graph.viewportScaleX <= graph.viewport.screenHeight;
  if (!fits) {
    void ensureVisible([node]);
    return;
  }
  smoothMoveViewport(
    new PIXI.Point(
      bounds.x + bounds.width / 2 - calculateOverlayOffsets(),
      bounds.y + bounds.height / 2,
    ),
    undefined,
  );
};

export const jumpToNode = (node: PPNode): void => {
  pushBounded(backStack, currentPlace());
  forwardStack.length = 0;
  PPGraph.currentGraph.selection.selectNodes([node]);
  bringIntoView(node);
};

const restorePlace = (place: Place) => {
  const graph = PPGraph.currentGraph;
  graph.selection.selectNodes(
    place.nodeIds.map((id) => graph.nodes[id]).filter(Boolean),
  );
  smoothMoveViewport(place.center, place.scale);
};

export const goBack = (): void => {
  const place = popPlace(backStack);
  if (place) {
    pushBounded(forwardStack, currentPlace());
    restorePlace(place);
  }
};

export const goForward = (): void => {
  const place = popPlace(forwardStack);
  if (place) {
    pushBounded(backStack, currentPlace());
    restorePlace(place);
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

export const followConnections = (
  node: PPNode,
  direction: NavigationDirection,
): void => {
  goToOneOf(
    getNodeTargets(node, direction),
    direction === 'upstream' ? 'Go upstream' : 'Go downstream',
    node,
    direction === 'upstream' ? 'left' : 'right',
    jumpToNode,
  );
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
      jumpToNode(macro);
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
    jumpToNode,
  );
};

let graphClickedAfterDashboard = true;

// The UI editor binds Enter and Alt+arrows to its selected widget too; it
// keeps them only while it was clicked more recently than the graph
export const trackKeyboardOwner = (): void => {
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

export const isGraphNavigationKey = (event: KeyboardEvent): boolean =>
  event.key === 'Enter' ||
  (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.code));

export const isGraphOwningKeyboard = (): boolean => graphClickedAfterDashboard;

// Alt+←/→ follow wires, Alt+Shift+←/→ go back/forward, Shift+Enter leaves
// a macro. Plain Enter goes through node.onEnterKeyPressed
export const handleGraphNavigationKey = (event: KeyboardEvent): boolean => {
  if (InterfaceController.isInAppView()) {
    return false;
  }
  const selected = PPGraph.currentGraph.selection.selectedNodes;
  const single = selected.length === 1 ? selected[0] : undefined;

  if (event.altKey && event.code === 'ArrowLeft') {
    if (event.shiftKey) {
      goBack();
    } else if (single) {
      followConnections(single, 'upstream');
    }
  } else if (event.altKey && event.code === 'ArrowRight') {
    if (event.shiftKey) {
      goForward();
    } else if (single) {
      followConnections(single, 'downstream');
    }
  } else if (event.shiftKey && event.key === 'Enter' && single) {
    exitToMacroCaller(single);
  } else {
    return false;
  }
  event.preventDefault();
  return true;
};
