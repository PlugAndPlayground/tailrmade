// Case generator + measurement helpers shared by the layoutMatrix.*.cy.ts
// specs (assert invariants, one sibling-kind-pair per file via
// layoutMatrixSpec.ts) and layoutZoo.manual.cy.ts (build one surface with
// every combination for manual eyeballing).
//
// The generator is intentionally data-driven: SIBLING_KIND_PAIRS,
// PARENT_DIRECTIONS and SIZE_PAIRINGS are the three axes described in the
// task, and generateMatrixCases() is their cartesian product. Adding a new
// pairing/kind/direction is a one-line change to one of those arrays - no
// other code needs to change.
import type {
  ContainerSpecItem,
  SurfaceLayoutSpecItem,
} from '../../../../../src/nodes/layout/surfaceLayoutSpec';

export type SizeKind = 'fill' | 'hug' | 'fixed';
// 'surface' = an embedded UI surface node placed as a widget - it renders
// through the SECOND rendering pipeline (SurfaceRenderer.tsx, the non-craft
// preview path), which had its own parent-direction bug, so the matrix must
// cover it alongside the live craft path
export type SiblingKind = 'widget' | 'container' | 'surface';
export type ParentDirection = 'row' | 'column';
export type Axis = 'width' | 'height';

// px values used for "fixed" siblings. Distinct per side so a fixed+fixed
// case can assert each sibling independently (not just their sum), and both
// comfortably clear the simplified spec's own floors (containerDefaultProps
// minWidth/minHeight '80px', dynamicWidgetDefaultProps minWidth/minHeight
// '48px') so those floors never bind and silently inflate a "fixed" size.
export const FIXED_PX_A = 150;
export const FIXED_PX_B = 120;

// gap on the tested parent container. Kept small but non-zero so the
// "siblings don't overlap" check is meaningful (there is a real gap to
// preserve) and the fill-space arithmetic below has a real term to subtract.
export const TESTED_GAP = 8;

// a hug/auto-sized sibling must be at least this tall/wide to count as "not
// collapsed" - well under a real widget's natural content size, well above 0
export const MIN_HUG_SIZE = 20;

export interface SiblingSpec {
  kind: SiblingKind;
  size: SizeKind;
  fixedPx?: number;
}

export interface MatrixCase {
  title: string;
  parentDirection: ParentDirection;
  siblingKindPair: `${SiblingKind}-${SiblingKind}`;
  sizePairing: `${SizeKind}-${SizeKind}`;
  siblingA: SiblingSpec;
  siblingB: SiblingSpec;
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

const SIBLING_KIND_PAIRS: [SiblingKind, SiblingKind][] = [
  ['widget', 'widget'],
  ['container', 'container'],
  ['widget', 'container'],
  ['surface', 'surface'],
  ['widget', 'surface'],
  ['container', 'surface'],
];

const PARENT_DIRECTIONS: ParentDirection[] = ['row', 'column'];

const SIZE_PAIRINGS: [SizeKind, SizeKind][] = [
  ['fill', 'fill'],
  ['fill', 'hug'],
  ['fill', 'fixed'],
  ['hug', 'hug'],
  ['hug', 'fixed'],
  ['fixed', 'fixed'],
];

// main-axis behaviour is what this matrix probes (see the task background:
// Container/getBasicLayoutStyles derive flex-grow/shrink from the prop that
// matches the parent's main axis) - the cross axis is always left at its
// spec default (widgets/containers both default to width '100%', height
// 'auto').
export function testedAxis(parentDirection: ParentDirection): Axis {
  return parentDirection === 'row' ? 'width' : 'height';
}

export function generateMatrixCases(): MatrixCase[] {
  const cases: MatrixCase[] = [];
  for (const [kindA, kindB] of SIBLING_KIND_PAIRS) {
    for (const parentDirection of PARENT_DIRECTIONS) {
      for (const [sizeA, sizeB] of SIZE_PAIRINGS) {
        const siblingA: SiblingSpec = {
          kind: kindA,
          size: sizeA,
          fixedPx: sizeA === 'fixed' ? FIXED_PX_A : undefined,
        };
        const siblingB: SiblingSpec = {
          kind: kindB,
          size: sizeB,
          fixedPx: sizeB === 'fixed' ? FIXED_PX_B : undefined,
        };
        cases.push({
          title: `${parentDirection} | ${kindA}+${kindB} | ${sizeA}+${sizeB}`,
          parentDirection,
          siblingKindPair: `${kindA}-${kindB}`,
          sizePairing: `${sizeA}-${sizeB}`,
          siblingA,
          siblingB,
        });
      }
    }
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Simplified-spec builders
// ---------------------------------------------------------------------------

function sizeValue(sibling: SiblingSpec): string {
  switch (sibling.size) {
    case 'fill':
      return '100%';
    case 'hug':
      return 'auto';
    case 'fixed':
      return `${sibling.fixedPx}px`;
  }
}

// set_surface_layout is fully declarative (compileSurfaceSpec rebuilds every
// widget item from defaults on each call - an omitted prop means the
// default, never a value from a previous call), so stating BOTH width and
// height on every widget item is no longer required for correctness. It is
// kept anyway: explicit sizes make each generated case self-describing and
// keep the matrix independent of what the widget node's own preferred
// getWidgetProps() sizing happens to be.
function widgetSpecItem(
  widgetNodeId: string,
  overrides: Partial<Record<Axis, string>> = {},
): SurfaceLayoutSpecItem {
  return {
    widget: widgetNodeId,
    width: overrides.width ?? '100%',
    height: overrides.height ?? 'auto',
  };
}

// The graph nodes each sibling kind draws from. 'widget'/'container'
// siblings place widgetA/widgetB; 'surface' siblings place surfaceA/surfaceB
// (embedded UI surface nodes prepared once in the spec's before() with a
// minimal inner layout). Two of each because a node may appear only once per
// surface.
export interface MatrixNodeIds {
  widgetA: string;
  widgetB: string;
  surfaceA: string;
  surfaceB: string;
}

export function siblingNodeId(
  sibling: SiblingSpec,
  which: 'A' | 'B',
  ids: MatrixNodeIds,
): string {
  if (sibling.kind === 'surface') {
    return which === 'A' ? ids.surfaceA : ids.surfaceB;
  }
  return which === 'A' ? ids.widgetA : ids.widgetB;
}

// One sibling's spec item. A "container" sibling wraps the widget in its own
// container so the CONTAINER carries the size under test (the widget inside
// just fills it via its normal width:'100%'/height:'auto' defaults) - this is
// what exercises Container.tsx's axis-aware flexGrow/flexShrink, as opposed
// to a bare widget which goes through DynamicWidget/getBasicLayoutStyles. A
// "surface" sibling is spec-wise just a widget whose node is a UI surface -
// the size under test goes on its widget spec item - but it renders its
// content through SurfaceRenderer (the non-craft preview pipeline).
export function buildSiblingSpecItem(
  sibling: SiblingSpec,
  axis: Axis,
  nodeId: string,
): SurfaceLayoutSpecItem {
  const value = sizeValue(sibling);
  if (sibling.kind === 'container') {
    return {
      direction: 'column',
      children: [widgetSpecItem(nodeId)],
      [axis]: value,
    };
  }
  return widgetSpecItem(nodeId, { [axis]: value });
}

export interface BuildLayoutOptions {
  // Sets mobileBehavior:'column' on the tested parent container so a narrow
  // dashboard flips a row parent to column (see getNewDirection in
  // layoutableHelpers.tsx). 'column' is also the simplified spec's default
  // (containerDefaultPropsForSpec in surfaceLayoutSpec.ts) - it is stated
  // explicitly here anyway so the flip cases don't silently stop testing
  // the flip if that default ever changes.
  narrowFlip?: boolean;
}

// The single parent container under test (direction = kase.parentDirection)
// holding the two siblings. Reused by both specs: layoutMatrix.*.cy.ts nests it
// directly under a fresh root per case, layoutZoo.cy.ts nests many of these
// (each preceded by a text label) under one shared root.
export function buildParentContainerItem(
  kase: MatrixCase,
  ids: MatrixNodeIds,
  options: BuildLayoutOptions = {},
): ContainerSpecItem {
  const axis = testedAxis(kase.parentDirection);
  const parent: ContainerSpecItem = {
    direction: kase.parentDirection,
    gap: TESTED_GAP,
    children: [
      buildSiblingSpecItem(kase.siblingA, axis, siblingNodeId(kase.siblingA, 'A', ids)),
      buildSiblingSpecItem(kase.siblingB, axis, siblingNodeId(kase.siblingB, 'B', ids)),
    ],
  };
  if (options.narrowFlip) {
    // first-class field since mobileBehavior was promoted out of the props
    // passthrough (surfaceLayoutSpec.ts)
    parent.mobileBehavior = 'column';
  }
  return parent;
}

// A full one-case surface layout: root (always column) > parent container
// under test > the two siblings.
export function buildCaseLayout(
  kase: MatrixCase,
  ids: MatrixNodeIds,
  options: BuildLayoutOptions = {},
): ContainerSpecItem {
  return {
    direction: 'column',
    children: [buildParentContainerItem(kase, ids, options)],
  };
}

// ---------------------------------------------------------------------------
// DOM measurement (layoutMatrix.*.cy.ts)
// ---------------------------------------------------------------------------

export const widgetSelector = (nodeId: string) =>
  `[data-cy="widget of NODE_${nodeId}"]`;

interface ElementMeasurement {
  rect: DOMRect;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface CaseMeasurement {
  parent: ElementMeasurement;
  siblingA: ElementMeasurement;
  siblingB: ElementMeasurement;
}

const measureElement = (el: HTMLElement): ElementMeasurement => ({
  rect: el.getBoundingClientRect(),
  scrollWidth: el.scrollWidth,
  clientWidth: el.clientWidth,
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
});

// Container ids in the compiled tree are randomly generated (compileSurfaceSpec)
// and set_surface_layout's result does not expose them, so the tested parent
// container is located as the relevant DOM ancestor of a known widget instead:
// a bare "widget" sibling's parent IS the tested container; a "container"
// sibling wraps the widget once, so its parent's parent is the tested
// container. A "surface" sibling is measured at its own DynamicWidget - the
// embedded surface renders "widget of NODE_<surfaceNodeId>" like any widget,
// while the widgets INSIDE its preview get "widget preview of ..." data-cys
// (DynamicWidget.tsx), so the selectors cannot collide. Both siblings must
// resolve to the SAME parent element - that is itself a sanity check that
// the case's DOM wiring matches the spec we sent.
//
// Synchronous and throwing so callers can run it inside a cy...should()
// callback: applying a new case re-renders asynchronously while the SAME two
// widgets stay visible from the previous case, so a one-shot measurement can
// catch the old layout - the .should() retry keeps re-measuring until the
// new layout's invariants hold (or times out on a genuine failure). The
// retry also absorbs the embedded surfaces' lazy/async preview rendering.
export const measureCaseSync = (
  doc: Document,
  kase: MatrixCase,
  ids: MatrixNodeIds,
): CaseMeasurement => {
  const nodeIdA = siblingNodeId(kase.siblingA, 'A', ids);
  const nodeIdB = siblingNodeId(kase.siblingB, 'B', ids);
  const widgetA = doc.querySelector(
    widgetSelector(nodeIdA),
  ) as HTMLElement | null;
  const widgetB = doc.querySelector(
    widgetSelector(nodeIdB),
  ) as HTMLElement | null;
  if (!widgetA || !widgetB) {
    throw new Error(
      `measureCase (${kase.title}): widget element(s) not found in the DOM`,
    );
  }

  const elA =
    kase.siblingA.kind === 'container'
      ? (widgetA.parentElement as HTMLElement)
      : widgetA;
  const elB =
    kase.siblingB.kind === 'container'
      ? (widgetB.parentElement as HTMLElement)
      : widgetB;
  const parentEl = elA.parentElement as HTMLElement;

  if (elB.parentElement !== parentEl) {
    throw new Error(
      `measureCase (${kase.title}): siblings do not share a parent element - case DOM wiring does not match the generated spec`,
    );
  }

  return {
    parent: measureElement(parentEl),
    siblingA: measureElement(elA),
    siblingB: measureElement(elB),
  };
};

// ---------------------------------------------------------------------------
// Invariant assertions (layoutMatrix.*.cy.ts)
// ---------------------------------------------------------------------------

const mainAxisSize = (rect: DOMRect, axis: Axis) =>
  axis === 'width' ? rect.width : rect.height;
const mainAxisStart = (rect: DOMRect, axis: Axis) =>
  axis === 'width' ? rect.left : rect.top;
const mainAxisEnd = (rect: DOMRect, axis: Axis) =>
  axis === 'width' ? rect.right : rect.bottom;

export function assertCaseInvariants(
  kase: MatrixCase,
  axis: Axis,
  m: CaseMeasurement,
): void {
  // no overflow, on both axes, regardless of which one is under test
  expect(
    m.parent.scrollWidth,
    `${kase.title}: parent scrollWidth <= clientWidth+1 (no horizontal overflow)`,
  ).to.be.at.most(m.parent.clientWidth + 1);
  expect(
    m.parent.scrollHeight,
    `${kase.title}: parent scrollHeight <= clientHeight+1 (no vertical overflow)`,
  ).to.be.at.most(m.parent.clientHeight + 1);

  const sizeA = mainAxisSize(m.siblingA.rect, axis);
  const sizeB = mainAxisSize(m.siblingB.rect, axis);

  // both widgets visible/sane
  expect(
    m.siblingA.rect.width,
    `${kase.title}: siblingA has non-zero width`,
  ).to.be.greaterThan(0);
  expect(
    m.siblingA.rect.height,
    `${kase.title}: siblingA has non-zero height`,
  ).to.be.greaterThan(0);
  expect(
    m.siblingB.rect.width,
    `${kase.title}: siblingB has non-zero width`,
  ).to.be.greaterThan(0);
  expect(
    m.siblingB.rect.height,
    `${kase.title}: siblingB has non-zero height`,
  ).to.be.greaterThan(0);

  // per-sibling contract, independent of its neighbour
  const checkSibling = (sibling: SiblingSpec, size: number, label: string) => {
    if (sibling.size === 'fixed') {
      expect(
        size,
        `${kase.title}: ${label} fixed size == ${sibling.fixedPx}px`,
      ).to.be.closeTo(sibling.fixedPx as number, 1);
    } else if (sibling.size === 'hug') {
      expect(
        size,
        `${kase.title}: ${label} hug size not collapsed (>= ${MIN_HUG_SIZE}px)`,
      ).to.be.at.least(MIN_HUG_SIZE);
    }
  };
  checkSibling(kase.siblingA, sizeA, 'siblingA');
  checkSibling(kase.siblingB, sizeB, 'siblingB');

  // fill+fill: together (plus the tested gap) the siblings consume the
  // parent's content box within 2px. EQUAL sizes are asserted only on the
  // horizontal axis: row fill siblings share space from identical 100%
  // bases, but vertical fill grows from a CONTENT basis (the deliberate
  // flex-basis 'content' mapping in getBasicLayoutStyles - basis 0 would
  // collapse hug parents), so two vertical fill siblings with different
  // intrinsic sizes (e.g. a 48px button next to an 80px-min embedded
  // surface) legitimately end up content + equal share, not equal.
  if (kase.siblingA.size === 'fill' && kase.siblingB.size === 'fill') {
    if (axis === 'width') {
      expect(
        sizeA,
        `${kase.title}: fill siblings are equal size`,
      ).to.be.closeTo(sizeB, 2);
    }
    const parentMain =
      axis === 'width' ? m.parent.clientWidth : m.parent.clientHeight;
    expect(
      sizeA + sizeB + TESTED_GAP,
      `${kase.title}: fill siblings + gap fill the parent`,
    ).to.be.closeTo(parentMain, 2);
  }

  // exactly one fill sibling: it must take all the space its neighbour
  // leaves over ("100% = as large as possible"), not just its content size
  if ((kase.siblingA.size === 'fill') !== (kase.siblingB.size === 'fill')) {
    const [fillSize, otherSize] =
      kase.siblingA.size === 'fill' ? [sizeA, sizeB] : [sizeB, sizeA];
    const parentMain =
      axis === 'width' ? m.parent.clientWidth : m.parent.clientHeight;
    expect(
      fillSize,
      `${kase.title}: fill sibling takes the remaining space`,
    ).to.be.closeTo(parentMain - otherSize - TESTED_GAP, 2);
  }

  // siblings must not overlap along the tested axis (a little slack for
  // subpixel rounding)
  const startA = mainAxisStart(m.siblingA.rect, axis);
  const endA = mainAxisEnd(m.siblingA.rect, axis);
  const startB = mainAxisStart(m.siblingB.rect, axis);
  const endB = mainAxisEnd(m.siblingB.rect, axis);
  const overlap = Math.min(endA, endB) - Math.max(startA, startB);
  expect(overlap, `${kase.title}: siblings do not overlap`).to.be.at.most(1);
}

// Row-direction cases re-run under a narrow dashboard with mobileBehavior
// forced to 'column' (see BuildLayoutOptions.narrowFlip): the parent renders
// as a column (getNewDirection), so its children should stack top-to-bottom
// without collapsing or overflowing horizontally.
export function assertNarrowFlipInvariants(
  kase: MatrixCase,
  m: CaseMeasurement,
): void {
  expect(
    m.parent.scrollWidth,
    `${kase.title} (narrow): no horizontal overflow`,
  ).to.be.at.most(m.parent.clientWidth + 1);

  expect(
    m.siblingA.rect.height,
    `${kase.title} (narrow): siblingA not collapsed`,
  ).to.be.at.least(MIN_HUG_SIZE);
  expect(
    m.siblingB.rect.height,
    `${kase.title} (narrow): siblingB not collapsed`,
  ).to.be.at.least(MIN_HUG_SIZE);

  // stacked vertically, in spec order (A above B), a little slack for
  // subpixel rounding
  expect(
    m.siblingB.rect.top,
    `${kase.title} (narrow): children stacked vertically (A above B)`,
  ).to.be.at.least(m.siblingA.rect.bottom - 1);
}
