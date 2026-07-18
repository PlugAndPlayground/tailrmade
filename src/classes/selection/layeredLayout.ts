// Pure, framework-free layered graph layout used by autoAlignNodes.
//
// It replaces the old greedy one-pass placer (inherit-a-neighbour's-coordinate
// then push down) with a small Sugiyama-style pipeline:
//   1. split into connected components,
//   2. assign layers by longest path from sources (this is the x axis; a node
//      always sits right of every input and left of every output),
//   3. order nodes within each layer to minimise edge crossings, breaking ties
//      by socket order so sibling sources/targets stack in socket order,
//   4. assign y by iterated barycentring (each node pulled to the mean of its
//      neighbours) with an exact, order-preserving overlap-removal step so high
//      fan-in/out nodes end up centred on their fan instead of at one extreme,
//   5. space layers proportionally to the vertical spread of the wires crossing
//      each gap, so a tall fan opens with gentle wire angles rather than a
//      dense near-vertical bundle,
//   6. stack disconnected components by their original vertical order with a
//      small proportional gap (no fixed 400px cluster gap).
//
// Everything here is deterministic and depends only on the passed data, so it
// is unit-tested in jest/layeredLayout.test.ts without a browser.
//
// ---------------------------------------------------------------------------
// Glossary (the vocabulary used throughout this file)
// ---------------------------------------------------------------------------
//   node       A box to place. Has an id, width, height and a seed y.
//   edge       A directed wire from one node's output socket to another's
//              input socket. Direction defines flow (source -> target).
//   component  A maximal set of nodes reachable from one another through edges
//              (ignoring direction). Disconnected components are laid out
//              independently, then stacked vertically. What a user perceives as
//              one "segment"/"cluster" on the canvas is a component here.
//   layer      A vertical column of nodes sharing the same flow depth (distance
//              from the sources). Layers are the x axis: layer 0 is leftmost;
//              every edge points from a lower to a higher layer. (In Sugiyama
//              terminology this is a "rank".)
//   row        A node's slot within a layer, i.e. its vertical order in that
//              column. Rows are the y axis, ordering only; actual y comes from
//              barycentring + overlap removal.
//   barycentre The mean position of a node's neighbours. Ordering and y both
//              pull each node toward its barycentre so wires stay short/straight.
//   dummy node A synthetic placeholder inserted on a layer that a long edge
//              (one spanning >1 layer) passes through, so that edge is ordered
//              and spaced like a real node in the columns it crosses. Dropped
//              from the output.
//   chrome     Decoration a *later* pass draws outside a node/component (e.g. a
//              macro container's padding). Passed in as marginTop/marginBottom
//              and reserved when stacking components so neighbours don't overlap.
//
// ---------------------------------------------------------------------------
// Tunables: everything you'd want to adjust lives in DEFAULTS below. Callers can
// override any of them per-call via the LayoutOptions argument.
// ---------------------------------------------------------------------------

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
  // current y, used only to keep the result close to the user's arrangement
  // (component order and within-layer seeding); never as a hard constraint.
  y: number;
  // Extra vertical chrome drawn *outside* the node by a later pass (e.g. a macro
  // container wrapping its content with padding). Reserved when stacking whole
  // components so the chrome of adjacent components doesn't eat the component
  // gap and overlap. Purely a component-boundary allowance; it does not affect
  // within-layer packing. Defaults to 0.
  marginTop?: number;
  marginBottom?: number;
}

export interface LayoutEdge {
  from: string; // source node id
  to: string; // target node id
  fromOut: number; // index of the output socket on the source
  toIn: number; // index of the input socket on the target
}

export interface LayoutOptions {
  layerGap?: number; // minimum horizontal gap between adjacent layers
  rowGap?: number; // minimum vertical gap between nodes in a layer
  iterations?: number; // barycentre sweeps
  maxLayerGap?: number; // cap on the proportional layer gap
  componentGap?: number; // vertical gap between disconnected components
  // horizontal-gap-per-unit-of-vertical-spread; larger => gentler wire angles
  spreadFactor?: number;
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

interface ResolvedOptions extends Required<LayoutOptions> {}

// The knobs that shape the layout. This is the one place to tune spacing/quality;
// each field is also overridable per-call via computeLayeredLayout's options arg.
const DEFAULTS: ResolvedOptions = {
  // Minimum horizontal gap between two adjacent layers (columns). The actual gap
  // grows past this for tall fans (see spreadFactor); this is the floor.
  layerGap: 120,
  // Minimum vertical gap between two nodes sharing a layer (rows).
  rowGap: 40,
  // Number of barycentre sweeps for y placement. More = tighter convergence,
  // diminishing returns; crossing-minimisation runs iterations/2 sweeps.
  iterations: 8,
  // Upper bound on the proportional layer gap so a very tall fan can't blow the
  // columns absurdly far apart.
  maxLayerGap: 700,
  // Vertical gap between two disconnected components when they are stacked. This
  // is the "same distance between segments" a user sees between clusters.
  componentGap: 400,
  // Horizontal gap added per unit of vertical wire spread crossing a layer
  // boundary: gap = layerGap ... clamp(spreadFactor * fan-spread, maxLayerGap).
  // Larger => gentler wire angles. ~0.85 puts the steepest wire near 50 deg, a
  // middleground between the old too-tight bundle and a too-loose spread.
  spreadFactor: 0.85,
};

// Pool-adjacent-violators: the unique non-decreasing sequence minimising the
// summed squared distance to `targets`. Used to remove overlaps within a layer
// while staying as close as possible to each node's desired position, so the
// layer neither drifts nor loses its order.
function isotonicFit(targets: number[]): number[] {
  const values: number[] = [];
  const counts: number[] = [];
  for (const target of targets) {
    let value = target;
    let count = 1;
    while (values.length > 0 && values[values.length - 1] > value) {
      const prevValue = values.pop() as number;
      const prevCount = counts.pop() as number;
      value = (prevValue * prevCount + value * count) / (prevCount + count);
      count += prevCount;
    }
    values.push(value);
    counts.push(count);
  }
  const result: number[] = [];
  for (let b = 0; b < values.length; b++) {
    for (let k = 0; k < counts[b]; k++) {
      result.push(values[b]);
    }
  }
  return result;
}

// Place ordered nodes so consecutive centres are at least `sep` apart, as close
// as possible to `desired`. Returns centre y per node, in the same order.
function resolveLayer(
  order: string[],
  desiredCenter: Map<string, number>,
  height: Map<string, number>,
  rowGap: number,
): Map<string, number> {
  const centers = new Map<string, number>();
  if (order.length === 0) {
    return centers;
  }
  // prefix[i] = minimum centre of node i relative to node 0 given the gaps
  const prefix: number[] = new Array(order.length).fill(0);
  for (let i = 1; i < order.length; i++) {
    const sep =
      (height.get(order[i - 1]) as number) / 2 +
      rowGap +
      (height.get(order[i]) as number) / 2;
    prefix[i] = prefix[i - 1] + sep;
  }
  const targets = order.map(
    (id, i) => (desiredCenter.get(id) as number) - prefix[i],
  );
  const fitted = isotonicFit(targets);
  order.forEach((id, i) => {
    centers.set(id, fitted[i] + prefix[i]);
  });
  return centers;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Undirected connected components over the edge set, restricted to `ids`.
function connectedComponents(ids: string[], edges: LayoutEdge[]): string[][] {
  const idSet = new Set(ids);
  const adj = new Map<string, Set<string>>();
  ids.forEach((id) => adj.set(id, new Set()));
  edges.forEach((edge) => {
    if (idSet.has(edge.from) && idSet.has(edge.to)) {
      adj.get(edge.from)!.add(edge.to);
      adj.get(edge.to)!.add(edge.from);
    }
  });
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const start of ids) {
    if (seen.has(start)) {
      continue;
    }
    const stack = [start];
    const component: string[] = [];
    seen.add(start);
    while (stack.length) {
      const node = stack.pop() as string;
      component.push(node);
      adj.get(node)!.forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      });
    }
    components.push(component);
  }
  return components;
}

// Longest-path layering: layer(source)=0, layer(n)=max(layer(pred)+1). Bounded
// relaxation so cycles (if any) terminate instead of looping forever.
function assignLayers(ids: string[], edges: LayoutEdge[]): Map<string, number> {
  const layer = new Map<string, number>();
  ids.forEach((id) => layer.set(id, 0));
  const cap = ids.length;
  for (let pass = 0; pass < cap; pass++) {
    let changed = false;
    for (const edge of edges) {
      const target = layer.get(edge.to) as number;
      const candidate = (layer.get(edge.from) as number) + 1;
      if (candidate > target && candidate <= cap) {
        layer.set(edge.to, candidate);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return layer;
}

function layoutComponent(
  ids: string[],
  edges: LayoutEdge[],
  node: Map<string, LayoutNodeInput>,
  opts: ResolvedOptions,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const idSet = new Set(ids);
  const realEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));

  const layerOf = assignLayers(ids, realEdges);

  // Route edges that skip layers through dummy nodes, one per intermediate
  // layer. Without them a long edge (e.g. a widget wired straight to a surface
  // two columns away) has no representative in the columns it crosses, so the
  // nodes there order against a far-away target and its socket index — which
  // pollutes the ordering and crosses the wires it passes. Dummies give the
  // long edge a placeholder in each crossed column so it is ordered and spaced
  // like any other node; they are dropped from the returned positions.
  const dummies = new Set<string>();
  const augLayer = new Map<string, number>(layerOf);
  const seedY = new Map<string, number>();
  ids.forEach((id) => seedY.set(id, (node.get(id) as LayoutNodeInput).y));
  const edgesByLayer: LayoutEdge[] = [];
  realEdges.forEach((e) => {
    const lu = layerOf.get(e.from) as number;
    const lv = layerOf.get(e.to) as number;
    if (lv - lu <= 1) {
      edgesByLayer.push(e);
      return;
    }
    const cy = (id: string) =>
      (node.get(id) as LayoutNodeInput).y +
      (node.get(id) as LayoutNodeInput).height / 2;
    const yu = cy(e.from);
    const yv = cy(e.to);
    let prev = e.from;
    for (let l = lu + 1; l < lv; l++) {
      const d = `__dummy__${e.from}__${e.to}__${l}`;
      dummies.add(d);
      augLayer.set(d, l);
      seedY.set(d, yu + ((yv - yu) * (l - lu)) / (lv - lu));
      edgesByLayer.push({
        from: prev,
        to: d,
        fromOut: prev === e.from ? e.fromOut : 0,
        toIn: 0,
      });
      prev = d;
    }
    edgesByLayer.push({
      from: prev,
      to: e.to,
      fromOut: prev === e.from ? e.fromOut : 0,
      toIn: e.toIn,
    });
  });

  const augIds = [...ids, ...dummies];
  const widthOf = (id: string) =>
    dummies.has(id) ? 1 : (node.get(id) as LayoutNodeInput).width;
  const heightOf = (id: string) =>
    dummies.has(id) ? 1 : (node.get(id) as LayoutNodeInput).height;

  const maxLayer = Math.max(...augIds.map((id) => augLayer.get(id) as number));
  const layers: string[][] = [];
  for (let l = 0; l <= maxLayer; l++) {
    layers.push([]);
  }
  augIds.forEach((id) => layers[augLayer.get(id) as number].push(id));

  // adjacency by layer side; each record carries both socket indices so a sweep
  // can tie-break by whichever socket orders the siblings it is arranging.
  type Neighbour = { id: string; fromOut: number; toIn: number };
  const outNeighbours = new Map<string, Neighbour[]>();
  const inNeighbours = new Map<string, Neighbour[]>();
  augIds.forEach((id) => {
    outNeighbours.set(id, []);
    inNeighbours.set(id, []);
  });
  edgesByLayer.forEach((e) => {
    outNeighbours
      .get(e.from)!
      .push({ id: e.to, fromOut: e.fromOut, toIn: e.toIn });
    inNeighbours
      .get(e.to)!
      .push({ id: e.from, fromOut: e.fromOut, toIn: e.toIn });
  });

  // Seed within-layer order by current y so the result stays close to what the
  // user had; a stable id tie-break keeps it deterministic.
  const order = new Map<string, number>();
  layers.forEach((layerIds) => {
    layerIds.sort((a, b) => {
      const dy = (seedY.get(a) as number) - (seedY.get(b) as number);
      return dy !== 0 ? dy : a < b ? -1 : 1;
    });
    layerIds.forEach((id, i) => order.set(id, i));
  });

  const orderByBarycentre = (
    layerIds: string[],
    neighboursOf: (id: string) => { id: string; socket: number }[],
  ) => {
    const key = new Map<string, { bary: number; socket: number }>();
    layerIds.forEach((id) => {
      const neighbours = neighboursOf(id);
      if (neighbours.length === 0) {
        key.set(id, { bary: order.get(id) as number, socket: 0 });
      } else {
        key.set(id, {
          bary: mean(neighbours.map((n) => order.get(n.id) as number)),
          socket: mean(neighbours.map((n) => n.socket)),
        });
      }
    });
    layerIds.sort((a, b) => {
      const ka = key.get(a)!;
      const kb = key.get(b)!;
      if (ka.bary !== kb.bary) return ka.bary - kb.bary;
      if (ka.socket !== kb.socket) return ka.socket - kb.socket;
      return a < b ? -1 : 1;
    });
    layerIds.forEach((id, i) => order.set(id, i));
  };

  // Crossing-minimisation sweeps. Forward orders a layer by its inputs (sibling
  // targets fall into the source's output-socket order); backward orders by its
  // outputs (sibling sources fall into the target's input-socket order).
  const sweeps = Math.max(2, Math.round(opts.iterations / 2));
  for (let s = 0; s < sweeps; s++) {
    // Order each layer by its inputs: sibling targets sharing a source fall into
    // that source's OUTPUT-socket order (fromOut).
    for (let l = 1; l <= maxLayer; l++) {
      orderByBarycentre(layers[l], (id) =>
        inNeighbours.get(id)!.map((n) => ({ id: n.id, socket: n.fromOut })),
      );
    }
    // Order each layer by its outputs: sibling sources feeding one target fall
    // into that target's INPUT-socket order (toIn).
    for (let l = maxLayer - 1; l >= 0; l--) {
      orderByBarycentre(layers[l], (id) =>
        outNeighbours.get(id)!.map((n) => ({ id: n.id, socket: n.toIn })),
      );
    }
  }

  const height = new Map<string, number>();
  augIds.forEach((id) => height.set(id, heightOf(id)));

  // Initial y: stack each layer in order, non-overlapping, centred on 0.
  const centerY = new Map<string, number>();
  layers.forEach((layerIds) => {
    const desired = new Map<string, number>();
    layerIds.forEach((id) => desired.set(id, 0));
    const resolved = resolveLayer(layerIds, desired, height, opts.rowGap);
    resolved.forEach((v, id) => centerY.set(id, v));
  });

  // Barycentre iterations: pull each node toward the mean of all its neighbours,
  // then remove overlaps per layer. isotonicFit keeps it centred (symmetric),
  // so fans don't drift downward the way the old push-down-only pass did.
  for (let iter = 0; iter < opts.iterations; iter++) {
    const forward = iter % 2 === 0;
    const range = forward
      ? [...Array(maxLayer + 1).keys()]
      : [...Array(maxLayer + 1).keys()].reverse();
    for (const l of range) {
      const desired = new Map<string, number>();
      layers[l].forEach((id) => {
        const neighbours = [
          ...inNeighbours.get(id)!.map((n) => n.id),
          ...outNeighbours.get(id)!.map((n) => n.id),
        ];
        desired.set(
          id,
          neighbours.length === 0
            ? (centerY.get(id) as number)
            : mean(neighbours.map((n) => centerY.get(n) as number)),
        );
      });
      const resolved = resolveLayer(layers[l], desired, height, opts.rowGap);
      resolved.forEach((v, id) => centerY.set(id, v));
    }
  }

  // x per layer: cumulative, with the gap widened by the vertical spread of the
  // wires crossing each boundary so tall fans get more horizontal run.
  const layerWidth = layers.map((layerIds) =>
    layerIds.length === 0 ? 0 : Math.max(...layerIds.map((id) => widthOf(id))),
  );
  const layerX: number[] = new Array(layers.length).fill(0);
  for (let l = 1; l <= maxLayer; l++) {
    let maxSpread = 0;
    edgesByLayer.forEach((e) => {
      if ((augLayer.get(e.to) as number) === l) {
        maxSpread = Math.max(
          maxSpread,
          Math.abs(
            (centerY.get(e.to) as number) - (centerY.get(e.from) as number),
          ),
        );
      }
    });
    const gap = Math.min(
      opts.maxLayerGap,
      Math.max(opts.layerGap, opts.spreadFactor * maxSpread),
    );
    layerX[l] = layerX[l - 1] + layerWidth[l - 1] + gap;
  }

  // Only real nodes get positions; dummies were routing placeholders.
  ids.forEach((id) => {
    const l = augLayer.get(id) as number;
    positions.set(id, {
      x: layerX[l],
      y: (centerY.get(id) as number) - (height.get(id) as number) / 2,
    });
  });
  return positions;
}

function boundingBox(
  ids: string[],
  positions: Map<string, { x: number; y: number }>,
  node: Map<string, LayoutNodeInput>,
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  ids.forEach((id) => {
    const p = positions.get(id)!;
    const n = node.get(id) as LayoutNodeInput;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + n.width);
    maxY = Math.max(maxY, p.y + n.height);
  });
  return { minX, minY, maxX, maxY };
}

export function computeLayeredLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdge[],
  options: LayoutOptions = {},
): LayoutResult {
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) {
    return { positions };
  }
  const node = new Map<string, LayoutNodeInput>();
  nodes.forEach((n) => node.set(n.id, n));
  const ids = nodes.map((n) => n.id);

  const components = connectedComponents(ids, edges);
  // Stack components in their existing top-to-bottom order (stability).
  components.sort((a, b) => {
    const ay = Math.min(...a.map((id) => (node.get(id) as LayoutNodeInput).y));
    const by = Math.min(...b.map((id) => (node.get(id) as LayoutNodeInput).y));
    return ay - by;
  });

  let cursorY = 0;
  components.forEach((component) => {
    const local = layoutComponent(component, edges, node, opts);
    const box = boundingBox(component, local, node);
    // Reserve the largest outer chrome any node in the component declares so a
    // macro (or similar) wrapping this component keeps the full component gap to
    // its neighbours instead of overlapping into it.
    const marginTop = Math.max(
      0,
      ...component.map(
        (id) => (node.get(id) as LayoutNodeInput).marginTop ?? 0,
      ),
    );
    const marginBottom = Math.max(
      0,
      ...component.map(
        (id) => (node.get(id) as LayoutNodeInput).marginBottom ?? 0,
      ),
    );
    const topWithChrome = box.minY - marginTop;
    const bottomWithChrome = box.maxY + marginBottom;
    const offsetY = cursorY - topWithChrome;
    const offsetX = -box.minX;
    component.forEach((id) => {
      const p = local.get(id)!;
      positions.set(id, { x: p.x + offsetX, y: p.y + offsetY });
    });
    cursorY += bottomWithChrome - topWithChrome + opts.componentGap;
  });

  return { positions };
}
