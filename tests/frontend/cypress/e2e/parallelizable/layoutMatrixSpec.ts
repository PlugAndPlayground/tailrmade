import { doWithTestController, openNewGraph } from '../helpers';
import {
  assertCaseInvariants,
  assertNarrowFlipInvariants,
  buildCaseLayout,
  generateMatrixCases,
  measureCaseSync,
  siblingNodeId,
  testedAxis,
  widgetSelector,
  MatrixCase,
  MatrixNodeIds,
} from './layoutMatrixHelpers';

// Shared spec body for the generated UI-surface layout matrix. The full
// combination matrix (~108 its) used to live in one layoutMatrix.cy.ts file,
// which ran ~14min on CI. cypress-split shards at the spec-FILE granularity
// (and, without a timings file, splits the sorted spec list into contiguous
// slices), so a single big file is pinned to one shard no matter how many
// shards exist. Splitting the matrix into one thin spec file per
// sibling-kind-pair (each calling runLayoutMatrix below) lets cypress-split's
// timings mode (SPLIT_FILE) spread them across shards, and lets a human run
// just one pair locally.
//
// Two historical bugs motivated this matrix (see the fix commits touching
// Container.tsx/layoutableHelpers.tsx/hooks.tsx/SurfaceRenderer.tsx):
// (1) flexGrow/flexShrink were derived from the height prop regardless of the
//     parent's direction, instead of the axis the parent actually lays out
//     on; (2) the parent direction reported to children was the *declared*
//     flexDirection, not the *rendered* one (getNewDirection flips row to
//     column under mobileBehavior:'column' on a narrow dashboard).
// 'surface' siblings (embedded UI surfaces) additionally exercise the
// non-craft SurfaceRenderer pipeline, which had its own direction bug.
// generateMatrixCases() (layoutMatrixHelpers.ts) is the single source of
// truth for the combinations exercised below - see it for how to add an
// axis/pairing.

// dashboard width = overlay widthPercentage (35% by default) x window width
// (see useIsDashboardNarrow/hooks.tsx). Comfortably above/below the 600px
// NARROW_DASHBOARD_THRESHOLD in both directions.
const WIDE_VIEWPORT = { width: 2400, height: 1200 }; // -> dashboard ~840px, not narrow
const NARROW_VIEWPORT = { width: 1000, height: 800 }; // -> dashboard ~350px, narrow

const SURFACE_ID = 'layout-matrix-surface';

// A `${kindA}-${kindB}` pairing as produced by generateMatrixCases() /
// MatrixCase.siblingKindPair - the axis each subfile selects on.
export type SiblingKindPair = MatrixCase['siblingKindPair'];

// Registers the whole matrix describe tree for the given sibling-kind-pairs.
// Called at load time from a thin per-pair spec file. Passing the pairs (not a
// full predicate) keeps each spec file a one-liner and makes the coverage it
// owns obvious from its call.
export function runLayoutMatrix(kindPairs: SiblingKindPair[]): void {
  const cases = generateMatrixCases().filter((kase) =>
    kindPairs.includes(kase.siblingKindPair),
  );

  let ids: MatrixNodeIds;

  const applyCase = (kase: MatrixCase, narrowFlip = false) => {
    doWithTestController(async (tc) => {
      const layout = buildCaseLayout(kase, ids, { narrowFlip });
      const result = await tc.callAITool('set_surface_layout', {
        node_id: SURFACE_ID,
        layout,
      });
      expect(
        result.is_error,
        `set_surface_layout failed for "${kase.title}": ${result.content}`,
      ).to.not.equal(true);
    });
  };

  const assertSiblingsVisible = (kase: MatrixCase) => {
    cy.get(widgetSelector(siblingNodeId(kase.siblingA, 'A', ids))).should(
      'be.visible',
    );
    cy.get(widgetSelector(siblingNodeId(kase.siblingB, 'B', ids))).should(
      'be.visible',
    );
  };

  describe(`UI surface layout matrix (generated) - ${kindPairs.join(', ')}`, () => {
    before(() => {
      openNewGraph();
      doWithTestController(async (tc) => {
        // added FIRST so it becomes the default (displayed) surface
        await tc.addNode('UISurfaceNode', SURFACE_ID, 0, 0);
        // ids left to default (hri.random()) for realism; hand-picked ids
        // would work too - getLayoutableElement resolves against the ids
        // present in the graph, not a pattern
        const nodeA = await tc.addNode('WidgetButton', undefined, 400, 0);
        const nodeB = await tc.addNode('WidgetButton', undefined, 400, 200);
        // two embeddable UI surfaces for the 'surface' sibling kind, each
        // given a minimal inner layout (one WidgetButton)
        const surfA = await tc.addNode('UISurfaceNode', undefined, 800, 0);
        const surfB = await tc.addNode('UISurfaceNode', undefined, 800, 400);
        const innerA = await tc.addNode('WidgetButton', undefined, 1200, 0);
        const innerB = await tc.addNode('WidgetButton', undefined, 1200, 400);
        for (const [surf, inner] of [
          [surfA, innerA],
          [surfB, innerB],
        ]) {
          const result = await tc.callAITool('set_surface_layout', {
            node_id: surf.id,
            layout: { direction: 'column', children: [{ widget: inner.id }] },
          });
          expect(
            result.is_error,
            `inner surface layout failed: ${result.content}`,
          ).to.not.equal(true);
        }
        ids = {
          widgetA: nodeA.id,
          widgetB: nodeB.id,
          surfaceA: surfA.id,
          surfaceB: surfB.id,
        };
      });
    });

    describe('main-axis geometry (wide dashboard, no mobile flip)', () => {
      before(() => {
        doWithTestController((tc) => {
          tc.toggleDashboard('OPEN');
        });
      });

      // Cypress resets the viewport to the config default (1000x660 - which
      // makes the dashboard NARROW) before every test, so the viewport must be
      // (re)set per test, not once in before(). With mobileBehavior:'column'
      // being the spec default, a narrow dashboard silently flips every row
      // parent to column and the whole "wide" section measures the wrong axis.
      beforeEach(() => {
        cy.viewport(WIDE_VIEWPORT.width, WIDE_VIEWPORT.height);
      });

      cases.forEach((kase) => {
        it(kase.title, () => {
          applyCase(kase);
          assertSiblingsVisible(kase);
          // .should() retries the measurement: the same widgets stay visible
          // across cases, so the new layout may not have rendered yet on the
          // first measurement (see measureCaseSync). 5s instead of the global
          // 15s: a legit settle takes 1-3s even under 15x CPU throttle, and
          // with many generated cases a genuine failure at 15s x2 attempts
          // makes a fully-red matrix take far too long to report
          cy.document({ timeout: 5000 }).should((doc) => {
            const m = measureCaseSync(doc, kase, ids);
            assertCaseInvariants(kase, testedAxis(kase.parentDirection), m);
          });
        });
      });
    });

    // mobileBehavior:'column' (stated explicitly - see BuildLayoutOptions in
    // layoutMatrixHelpers.ts) plus a narrow dashboard flips a row parent to
    // column (getNewDirection); only row-direction cases are re-run here since
    // a column parent's rendered direction never changes.
    describe('mobile flip on a narrow dashboard (row cases only)', () => {
      before(() => {
        doWithTestController((tc) => {
          tc.toggleDashboard('OPEN');
        });
      });

      // per test, not once - see the wide section
      beforeEach(() => {
        cy.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
      });

      cases
        .filter((kase) => kase.parentDirection === 'row')
        .forEach((kase) => {
          it(`${kase.title} (narrow -> column)`, () => {
            applyCase(kase, true);
            assertSiblingsVisible(kase);
            cy.document({ timeout: 5000 }).should((doc) => {
              const m = measureCaseSync(doc, kase, ids);
              assertNarrowFlipInvariants(kase, m);
            });
          });
        });
    });
  });
}
