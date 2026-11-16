import * as PIXI from 'pixi.js';
import PPGraph from '../classes/GraphClass';
import type PPLink from '../classes/LinkClass';
import type PPNode from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { SELECTION_COLOR_HEX } from './constants';
import {
  ARROW_DIRECTIONS,
  ArrowDirection,
  arrowsBelongToTarget,
  isGraphOwningKeyboard,
  pulseNode,
  showNode,
} from './graphNavigation';
import { getNodesBounds } from '../pixi/utils-pixi';

// While Alt is held, the node selected when it was pressed (the origin) and
// the nodes wired to it stay lit and everything else, groups included, dims. Its sources are
// numbered in input order, its targets by position on the canvas. Alt+Arrow
// left/right move between the sources, the origin and the targets, and past
// them make the source or target the new origin; up/down cycle through the
// sources or targets. Releasing Alt ends it.

const DIM_ALPHA = 0.2;

type Column = 'sources' | 'origin' | 'targets';

type Focus = {
  origin: PPNode;
  sources: PPNode[];
  targets: PPNode[];
  column: Column;
  // the source and target last visited, so crossing the origin returns there
  index: Record<'sources' | 'targets', number>;
  labelLayer: PIXI.Container;
  labels: { node: PPNode; view: PIXI.Container }[];
  highlighted: PPLink[];
};

let focus: Focus | undefined;

const unique = (nodes: PPNode[]) => [...new Set(nodes)];

const byPosition = (a: PPNode, b: PPNode) => a.y - b.y || a.x - b.x;

const sourcesOf = (node: PPNode) =>
  unique(
    node
      .getAllInputSocketsInDisplayOrder()
      .flatMap((socket) =>
        socket.links.map((link) => link.getSource().getNode()),
      ),
  ).filter((source) => source !== node);

const targetsOf = (node: PPNode) =>
  unique(
    node.outputSocketArray.flatMap((socket) =>
      socket.links.map((link) => link.getTarget().getNode()),
    ),
  )
    .filter((target) => target !== node)
    .sort(byPosition);

const allLinks = () =>
  Object.values(PPGraph.currentGraph.nodes).flatMap((node) =>
    node.outputSocketArray.flatMap((socket) => socket.links),
  );

const touches = (link: PPLink, node: PPNode) =>
  link.getSource().getNode() === node || link.getTarget().getNode() === node;

const setNodeAlpha = (node: PPNode, alpha: number) => {
  node.alpha = alpha;
  node.fadeAllNonPIXIParts(alpha);
};

const currentNode = (current: Focus) =>
  current.column === 'origin'
    ? current.origin
    : current[current.column][current.index[current.column]];

const placeLabels = () => {
  if (!focus) {
    return;
  }
  const viewport = PPGraph.currentGraph.viewport;
  // labels of a node that is both source and target sit side by side
  const nextX = new Map<PPNode, number>();
  focus.labels.forEach(({ node, view }) => {
    const bounds = getNodesBounds([node]);
    const corner = viewport.toScreen(bounds.x, bounds.y);
    const x = nextX.get(node) ?? corner.x;
    view.position.set(x, corner.y - view.height - 4);
    nextX.set(node, x + view.width + 4);
  });
};

const drawLabels = (current: Focus) => {
  current.labelLayer.removeChildren().forEach((view) => view.destroy(true));
  current.labels = [];
  const selected = currentNode(current);
  const add = (node: PPNode, text: string) => {
    const isSelected = node === selected;
    const view = new PIXI.Container();
    const caption = new PIXI.Text({
      text,
      style: {
        fontSize: 13,
        fontWeight: 'bold',
        fill: isSelected ? 0xffffff : SELECTION_COLOR_HEX,
      },
    });
    caption.position.set(6, 2);
    view.addChild(
      new PIXI.Graphics()
        .roundRect(0, 0, caption.width + 12, caption.height + 4, 6)
        .fill(isSelected ? SELECTION_COLOR_HEX : 0xffffff)
        .stroke({ width: 1, color: SELECTION_COLOR_HEX }),
      caption,
    );
    current.labelLayer.addChild(view);
    current.labels.push({ node, view });
  };
  add(
    current.origin,
    `← ${current.sources.length} · Origin · ${current.targets.length} →`,
  );
  // with the total, as the others may be off screen
  current.sources.forEach((node, i, all) =>
    add(node, `← ${i + 1}/${all.length}`),
  );
  current.targets.forEach((node, i, all) =>
    add(node, `→ ${i + 1}/${all.length}`),
  );
  placeLabels();
};

// the wires between the origin and the selected node stand out
const highlightWires = (current: Focus) => {
  current.highlighted.forEach((link) => link.unhighlight());
  const selected = currentNode(current);
  current.highlighted =
    selected === current.origin
      ? []
      : allLinks().filter(
          (link) => touches(link, current.origin) && touches(link, selected),
        );
  current.highlighted.forEach((link) => link.highlight());
};

// lights the origin and its neighbours, and starts at the origin again
const setOrigin = (current: Focus, origin: PPNode) => {
  const sources = sourcesOf(origin);
  const targets = targetsOf(origin);
  const lit = new Set([origin, ...sources, ...targets]);
  Object.values(PPGraph.currentGraph.nodes).forEach((node) =>
    setNodeAlpha(node, lit.has(node) ? 1 : DIM_ALPHA),
  );
  allLinks().forEach((link) => {
    link.alpha = touches(link, origin) ? 1 : DIM_ALPHA;
  });
  Object.assign(current, {
    origin,
    sources,
    targets,
    column: 'origin',
    index: { sources: 0, targets: 0 },
  });
};

const startFocus = (origin: PPNode) => {
  const graph = PPGraph.currentGraph;
  const labelLayer = new PIXI.Container();
  labelLayer.eventMode = 'none';
  graph.overlayContainer.addChild(labelLayer);
  // groups only frame nodes, so they recede whatever they hold
  graph.groupLayer.alpha = DIM_ALPHA;
  focus = {
    origin,
    sources: [],
    targets: [],
    column: 'origin',
    index: { sources: 0, targets: 0 },
    labelLayer,
    labels: [],
    highlighted: [],
  };
  setOrigin(focus, origin);
  graph.viewport.addEventListener('moved', placeLabels);
  drawLabels(focus);
};

const endFocus = () => {
  if (!focus) {
    return;
  }
  const graph = PPGraph.currentGraph;
  Object.values(graph.nodes).forEach((node) => setNodeAlpha(node, 1));
  allLinks().forEach((link) => {
    link.alpha = 1;
  });
  graph.groupLayer.alpha = 1;
  focus.highlighted.forEach((link) => link.unhighlight());
  graph.viewport.removeEventListener('moved', placeLabels);
  focus.labelLayer.destroy(true);
  focus = undefined;
};

const move = (current: Focus, direction: ArrowDirection) => {
  if (direction === 'left' || direction === 'right') {
    const ahead = direction === 'left' ? 'sources' : 'targets';
    const behind = ahead === 'sources' ? 'targets' : 'sources';
    if (current.column === ahead) {
      // past the outer column the node becomes the origin and the walk goes
      // on; going back the other way returns to the previous origin
      const previous = current.origin;
      setOrigin(current, currentNode(current));
      current.index[behind] = Math.max(0, current[behind].indexOf(previous));
      if (current[ahead].length) {
        current.column = ahead;
      }
    } else if (current.column === behind) {
      current.column = 'origin';
    } else if (current[ahead].length) {
      current.column = ahead;
    } else {
      pulseNode(currentNode(current));
      return;
    }
  } else if (current.column === 'origin') {
    pulseNode(current.origin);
    return;
  } else {
    // wraps around, as the numbers show where it will land
    const count = current[current.column].length;
    const step = direction === 'down' ? 1 : -1;
    current.index[current.column] =
      (current.index[current.column] + step + count) % count;
  }
  showNode(currentNode(current));
  highlightWires(current);
  drawLabels(current);
};

const selectedSingle = () => {
  const selected = PPGraph.currentGraph.selection.selectedNodes;
  return selected.length === 1 ? selected[0] : undefined;
};

const mayFocus = (event: KeyboardEvent) =>
  !InterfaceController.isInAppView() &&
  isGraphOwningKeyboard() &&
  !arrowsBelongToTarget(event) &&
  !event.shiftKey &&
  !event.metaKey &&
  !event.ctrlKey;

export const handleConnectionFocusKey = (event: KeyboardEvent): boolean => {
  if (event.key === 'Alt') {
    const origin = selectedSingle();
    if (!focus && !event.repeat && mayFocus(event) && origin) {
      startFocus(origin);
    }
    return false;
  }
  const direction = ARROW_DIRECTIONS[event.code];
  if (!direction || !event.altKey) {
    return false;
  }
  if (!mayFocus(event)) {
    // Alt+Shift+Arrow selects a whole branch, which the labels don't describe
    endFocus();
    return false;
  }
  if (!focus) {
    const origin = selectedSingle();
    if (!origin) {
      return false;
    }
    startFocus(origin);
  }
  move(focus!, direction);
  event.preventDefault();
  return true;
};

export const initConnectionFocus = (): void => {
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Alt' && focus) {
      // keeps Windows browsers from moving focus to their menu bar
      event.preventDefault();
      endFocus();
    }
  });
  window.addEventListener('blur', endFocus);
  // Alt+drag duplicates nodes, and clicks pick a node of their own
  window.addEventListener('pointerdown', endFocus, true);
  InterfaceController.addListener(ListenEvent.GraphChanged, endFocus);
};
