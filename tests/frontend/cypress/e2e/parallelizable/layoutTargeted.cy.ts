import { doWithTestController, openNewGraph } from '../helpers';
import {
  MIN_HUG_SIZE,
  widgetSelector,
} from './layoutMatrixHelpers';

// Targeted layout suites complementing the generated layoutMatrix.*.cy.ts:
// behaviors that need hand-picked constellations rather than a cartesian
// product - the Figma-style vertical equal split, wrapping rows, align/
// justify, the fill-inside-hug paradox (pinned semantics), and min/max
// conflicts. Uses the same harness patterns as the matrix: one reused
// surface, set_surface_layout per test, retrying measurement inside
// cy.document({timeout: 5000}).should(), viewport per test via beforeEach.
const SURFACE_ID = 'layout-targeted-surface';

const WIDE_VIEWPORT = { width: 2400, height: 1200 }; // dashboard ~840px
const NARROW_VIEWPORT = { width: 1000, height: 800 }; // dashboard ~350px

const GAP = 8;
// definite height for the vertical-fill suite's parent container
const PARENT_HEIGHT = 480;

let b1: string;
let b2: string;
let b3: string;
let b4: string;
let embeddedSurfaceId: string;

const applyLayout = (
  children: unknown[],
  rootExtra: Record<string, unknown> = {},
) => {
  doWithTestController(async (tc) => {
    const result = await tc.callAITool('set_surface_layout', {
      node_id: SURFACE_ID,
      layout: { direction: 'column', ...rootExtra, children },
    });
    expect(
      result.is_error,
      `set_surface_layout failed: ${result.content}`,
    ).to.not.equal(true);
  });
};

// ---------------------------------------------------------------------------
// local measurement (sync + throwing, for use inside retrying .should())
// ---------------------------------------------------------------------------

interface SiblingRef {
  id: string;
  // true when the measured element is a container WRAPPING the widget
  // (parent of the widget element) rather than the widget itself
  wrapped?: boolean;
}

const resolveEl = (doc: Document, ref: SiblingRef): HTMLElement => {
  const widget = doc.querySelector(
    widgetSelector(ref.id),
  ) as HTMLElement | null;
  if (!widget) {
    throw new Error(`widget of ${ref.id} not found in the DOM`);
  }
  return ref.wrapped ? (widget.parentElement as HTMLElement) : widget;
};

// all refs must share one parent element (same sanity check as the matrix's
// measureCaseSync: it proves the DOM wiring matches the spec that was sent)
const measureRow = (doc: Document, refs: SiblingRef[]) => {
  const els = refs.map((ref) => resolveEl(doc, ref));
  const parent = els[0].parentElement as HTMLElement;
  els.forEach((el, i) => {
    if (el.parentElement !== parent) {
      throw new Error(
        `sibling ${i} does not share the parent element - DOM wiring does not match the spec`,
      );
    }
  });
  return {
    parent,
    parentRect: parent.getBoundingClientRect(),
    rects: els.map((el) => el.getBoundingClientRect()),
  };
};

const widgetItem = (id: string, extra: Record<string, unknown> = {}) => ({
  widget: id,
  width: '100%',
  height: 'auto',
  ...extra,
});

const containerItem = (
  innerId: string,
  extra: Record<string, unknown> = {},
) => ({
  direction: 'column',
  children: [widgetItem(innerId)],
  ...extra,
});

describe('UI surface targeted layout suites', () => {
  before(() => {
    openNewGraph();
    doWithTestController(async (tc) => {
      // added FIRST so it becomes the default (displayed) surface
      await tc.addNode('UISurfaceNode', SURFACE_ID, 0, 0);
      // ids left to default (hri.random()) - set_surface_layout rejects
      // non-resolvable hand-picked ids
      b1 = (await tc.addNode('WidgetButton', undefined, 400, 0)).id;
      b2 = (await tc.addNode('WidgetButton', undefined, 400, 150)).id;
      b3 = (await tc.addNode('WidgetButton', undefined, 400, 300)).id;
      b4 = (await tc.addNode('WidgetButton', undefined, 400, 450)).id;
      // one embeddable surface (one inner button) for the embedded case
      const surf = await tc.addNode('UISurfaceNode', undefined, 800, 0);
      const inner = await tc.addNode('WidgetButton', undefined, 1200, 0);
      const result = await tc.callAITool('set_surface_layout', {
        node_id: surf.id,
        layout: { direction: 'column', children: [{ widget: inner.id }] },
      });
      expect(
        result.is_error,
        `inner surface layout failed: ${result.content}`,
      ).to.not.equal(true);
      embeddedSurfaceId = surf.id;
      tc.toggleDashboard('OPEN');
    });
  });

  beforeEach(() => {
    // per test, never in before() - Cypress resets the viewport to the
    // config default (1000x660 -> dashboard NARROW) before every test
    cy.viewport(WIDE_VIEWPORT.width, WIDE_VIEWPORT.height);
  });

  // -------------------------------------------------------------------------
  // 1. Vertical equal split (Figma-style fill) in a DEFINITE-height parent.
  // flex-basis 'auto' makes all height:'100%' bases identical (100% of the
  // parent), so siblings shrink to an equal split regardless of their
  // intrinsic content sizes - the behavior that used to diverge (48px button
  // vs 80px-min container/embedded surface) under basis 'content'.
  // -------------------------------------------------------------------------
  describe('vertical fill in a definite-height parent (equal split)', () => {
    const definiteColumn = (children: unknown[]) => [
      {
        direction: 'column',
        gap: GAP,
        height: `${PARENT_HEIGHT}px`,
        children,
      },
    ];

    it('widget + container with unequal intrinsic sizes split equally', () => {
      applyLayout(
        definiteColumn([
          widgetItem(b1, { height: '100%' }),
          containerItem(b2, { height: '100%' }),
        ]),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2, wrapped: true }]);
        const [a, b] = m.rects;
        expect(a.height, 'siblings split equally').to.be.closeTo(b.height, 2);
        expect(
          a.height + b.height + GAP,
          'fill siblings + gap consume the parent',
        ).to.be.closeTo(m.parent.clientHeight, 2);
      });
    });

    it('widget + embedded surface split equally', () => {
      applyLayout(
        definiteColumn([
          widgetItem(b1, { height: '100%' }),
          widgetItem(embeddedSurfaceId, { height: '100%' }),
        ]),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: embeddedSurfaceId }]);
        const [a, b] = m.rects;
        expect(a.height, 'siblings split equally').to.be.closeTo(b.height, 2);
      });
    });

    it('fill takes the rest next to a fixed sibling', () => {
      applyLayout(
        definiteColumn([
          widgetItem(b1, { height: '100%' }),
          widgetItem(b2, { height: '120px' }),
        ]),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        expect(b.height, 'fixed sibling keeps its size').to.be.closeTo(120, 1);
        expect(a.height, 'fill sibling takes the rest').to.be.closeTo(
          m.parent.clientHeight - 120 - GAP,
          2,
        );
      });
    });

    it('fill takes the rest next to a hug sibling', () => {
      applyLayout(
        definiteColumn([
          widgetItem(b1, { height: '100%' }),
          widgetItem(b2, { height: 'auto' }),
        ]),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        expect(b.height, 'hug sibling not collapsed').to.be.at.least(
          MIN_HUG_SIZE,
        );
        expect(a.height, 'fill sibling takes the rest').to.be.closeTo(
          m.parent.clientHeight - b.height - GAP,
          2,
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Wrapping rows (mobileBehavior 'wrap'). The flex fix deliberately kept
  // flex-basis 'auto' for width:'100%' children SO THAT wrap keeps putting
  // each of them on its own full-width line - a regression to basis 0 would
  // merge them onto one shared line.
  // -------------------------------------------------------------------------
  describe('wrapping rows', () => {
    const wrapRow = (children: unknown[]) => [
      { direction: 'row', gap: GAP, mobileBehavior: 'wrap', children },
    ];

    it('two 100%-width children wrap onto one full-width line each', () => {
      applyLayout(wrapRow([widgetItem(b1), widgetItem(b2)]));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        expect(
          b.top,
          '100% children stack on separate lines',
        ).to.be.at.least(a.bottom - 1);
        expect(a.width, 'first child spans the line').to.be.at.least(
          m.parent.clientWidth - 3,
        );
        expect(b.width, 'second child spans the line').to.be.at.least(
          m.parent.clientWidth - 3,
        );
        expect(
          m.parent.scrollWidth,
          'no horizontal overflow',
        ).to.be.at.most(m.parent.clientWidth + 1);
      });
    });

    it('fixed-width children flow and wrap onto multiple lines', () => {
      applyLayout(
        wrapRow([b1, b2, b3, b4].map((id) => widgetItem(id, { width: '300px' }))),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(
          doc,
          [b1, b2, b3, b4].map((id) => ({ id })),
        );
        m.rects.forEach((r, i) => {
          expect(r.width, `child ${i} keeps its fixed width`).to.be.closeTo(
            300,
            1,
          );
        });
        // ~840px dashboard fits two 300px children per line -> 2 lines
        const lineTops = m.rects
          .map((r) => Math.round(r.top))
          .filter((top, i, tops) => tops.findIndex((t) => Math.abs(t - top) <= 2) === i);
        expect(lineTops.length, 'children wrapped onto 2 lines').to.equal(2);
        expect(
          m.parent.scrollWidth,
          'no horizontal overflow',
        ).to.be.at.most(m.parent.clientWidth + 1);
      });
    });

    it('wrap does not flip to a column on a narrow dashboard', () => {
      cy.viewport(NARROW_VIEWPORT.width, NARROW_VIEWPORT.height);
      applyLayout(
        wrapRow([
          widgetItem(b1, { width: '120px' }),
          widgetItem(b2, { width: '120px' }),
        ]),
      );
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        // getNewDirection only flips mobileBehavior 'column'; a wrap row
        // stays a row - the ~350px dashboard still fits 2x120px+gap, so the
        // children share one line instead of being force-stacked
        expect(
          Math.abs(a.top - b.top),
          'children share one line (no column flip)',
        ).to.be.at.most(2);
        expect(
          m.parent.scrollWidth,
          'no horizontal overflow',
        ).to.be.at.most(m.parent.clientWidth + 1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. align / justify
  // -------------------------------------------------------------------------
  describe('alignment', () => {
    const hugRow = (justify: string, align = 'flex-start') => [
      {
        direction: 'row',
        gap: GAP,
        justify,
        align,
        children: [
          widgetItem(b1, { width: 'auto' }),
          containerItem(b2, { width: 'auto' }),
        ],
      },
    ];
    // built lazily: b1/b2 are only assigned once before() has run
    const refs = (): SiblingRef[] => [{ id: b1 }, { id: b2, wrapped: true }];

    it('justify flex-start places the pair at the left edge', () => {
      applyLayout(hugRow('flex-start'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        expect(m.rects[0].left, 'first child at left edge').to.be.closeTo(
          m.parentRect.left,
          3,
        );
      });
    });

    it('justify center centers the pair', () => {
      applyLayout(hugRow('center'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        const pairCenter = (m.rects[0].left + m.rects[1].right) / 2;
        const parentCenter = (m.parentRect.left + m.parentRect.right) / 2;
        expect(pairCenter, 'pair centered in the parent').to.be.closeTo(
          parentCenter,
          3,
        );
      });
    });

    it('justify flex-end places the pair at the right edge', () => {
      applyLayout(hugRow('flex-end'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        expect(m.rects[1].right, 'last child at right edge').to.be.closeTo(
          m.parentRect.right,
          3,
        );
      });
    });

    it('justify space-between pushes the children to both edges', () => {
      applyLayout(hugRow('space-between'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        expect(m.rects[0].left, 'first child at left edge').to.be.closeTo(
          m.parentRect.left,
          3,
        );
        expect(m.rects[1].right, 'last child at right edge').to.be.closeTo(
          m.parentRect.right,
          3,
        );
      });
    });

    it('align flex-start keeps unequal heights; align stretch equalizes them', () => {
      // widget hugs to ~48px, the container sibling floors at its default
      // minHeight 80px - a real height difference for align to act on
      applyLayout(hugRow('flex-start', 'flex-start'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        expect(
          m.rects[1].height - m.rects[0].height,
          'flex-start: container sibling is taller (heights hug)',
        ).to.be.at.least(10);
      });

      applyLayout(hugRow('flex-start', 'stretch'));
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, refs());
        expect(
          m.rects[0].height,
          'stretch: both children equal the line height',
        ).to.be.closeTo(m.rects[1].height, 2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Fill inside a HUG parent - the circular-sizing paradox. PINNED
  // SEMANTICS, not derived truth: a percentage size cannot resolve against
  // an indefinite parent, so fill children fall back to their content size
  // and the parent hugs their sum. (Figma resolves fill->hug in this
  // situation; CSS gets to the same place via flex-basis 'auto'.)
  // -------------------------------------------------------------------------
  describe('fill inside a hug parent (pinned semantics)', () => {
    it('column: fill children are content-sized, the parent hugs their sum', () => {
      applyLayout([
        {
          direction: 'column',
          gap: GAP,
          height: 'auto',
          children: [
            widgetItem(b1, { height: '100%' }),
            widgetItem(b2, { height: '100%' }),
          ],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        expect(a.height, 'first child not collapsed').to.be.at.least(
          MIN_HUG_SIZE,
        );
        expect(b.height, 'second child not collapsed').to.be.at.least(
          MIN_HUG_SIZE,
        );
        expect(
          m.parent.clientHeight,
          'parent hugs the children',
        ).to.be.closeTo(a.height + b.height + GAP, 3);
      });
    });

    it('row: fill children in a hug-width parent are content-sized, no overflow', () => {
      applyLayout([
        {
          direction: 'row',
          gap: GAP,
          width: 'auto',
          children: [widgetItem(b1), widgetItem(b2)],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }]);
        const [a, b] = m.rects;
        expect(a.width, 'first child not collapsed').to.be.at.least(
          MIN_HUG_SIZE,
        );
        expect(b.width, 'second child not collapsed').to.be.at.least(
          MIN_HUG_SIZE,
        );
        const overlap =
          Math.min(a.right, b.right) - Math.max(a.left, b.left);
        expect(overlap, 'children do not overlap').to.be.at.most(1);
        expect(
          m.parent.scrollWidth,
          'no horizontal overflow',
        ).to.be.at.most(m.parent.clientWidth + 1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. min/max conflicts
  // -------------------------------------------------------------------------
  describe('min/max constraints', () => {
    it('two fill siblings whose minWidths cannot fit: floors win, parent scrolls', () => {
      applyLayout([
        {
          direction: 'row',
          gap: GAP,
          children: [
            containerItem(b1, { width: '100%', props: { minWidth: '500px' } }),
            containerItem(b2, { width: '100%', props: { minWidth: '500px' } }),
          ],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [
          { id: b1, wrapped: true },
          { id: b2, wrapped: true },
        ]);
        const [a, b] = m.rects;
        expect(a.width, 'first floor holds').to.be.at.least(498);
        expect(b.width, 'second floor holds').to.be.at.least(498);
        const overlap =
          Math.min(a.right, b.right) - Math.max(a.left, b.left);
        expect(overlap, 'children do not overlap').to.be.at.most(1);
        // the opposite of the matrix invariant, and EXPECTED here: the two
        // floors cannot fit the ~840px dashboard, so the parent overflows
        // and scrolls rather than crushing the children below their minWidth
        expect(
          m.parent.scrollWidth,
          'parent overflows (scrollable) instead of violating the floors',
        ).to.be.greaterThan(m.parent.clientWidth + 1);
      });
    });

    it('a maxWidth-capped fill sibling stays capped, the other takes the rest', () => {
      applyLayout([
        {
          direction: 'row',
          gap: GAP,
          children: [
            containerItem(b1, { width: '100%', props: { maxWidth: '200px' } }),
            containerItem(b2, { width: '100%' }),
          ],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [
          { id: b1, wrapped: true },
          { id: b2, wrapped: true },
        ]);
        const [a, b] = m.rects;
        expect(a.width, 'capped sibling stays at its maxWidth').to.be.at.most(
          202,
        );
        expect(b.width, 'uncapped sibling takes the rest').to.be.closeTo(
          m.parent.clientWidth - a.width - GAP,
          3,
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Three or more siblings. The generated matrix only ever pairs two
  // children; a third exercises that the axis-aware flex mapping keeps
  // distributing space (not just splitting a lone pair).
  // -------------------------------------------------------------------------
  describe('three or more siblings', () => {
    it('row: three fill children split into equal thirds', () => {
      applyLayout([
        {
          direction: 'row',
          gap: GAP,
          children: [b1, b2, b3].map((id) => widgetItem(id, { width: '100%' })),
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }, { id: b3 }]);
        const [a, b, c] = m.rects;
        expect(a.width, 'first == second').to.be.closeTo(b.width, 2);
        expect(b.width, 'second == third').to.be.closeTo(c.width, 2);
        expect(
          a.width + b.width + c.width + 2 * GAP,
          'three fills + gaps consume the row',
        ).to.be.closeTo(m.parent.clientWidth, 3);
        expect(
          m.parent.scrollWidth,
          'no horizontal overflow',
        ).to.be.at.most(m.parent.clientWidth + 1);
      });
    });

    it('row: fill + fixed + hug — fill absorbs what fixed and hug leave', () => {
      applyLayout([
        {
          direction: 'row',
          gap: GAP,
          children: [
            widgetItem(b1, { width: '100%' }),
            widgetItem(b2, { width: '150px' }),
            widgetItem(b3, { width: 'auto' }),
          ],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const m = measureRow(doc, [{ id: b1 }, { id: b2 }, { id: b3 }]);
        const [fill, fixed, hug] = m.rects;
        expect(fixed.width, 'fixed keeps its size').to.be.closeTo(150, 1);
        expect(hug.width, 'hug not collapsed').to.be.at.least(MIN_HUG_SIZE);
        expect(fill.width, 'fill takes the remaining space').to.be.closeTo(
          m.parent.clientWidth - 150 - hug.width - 2 * GAP,
          3,
        );
        // adjacent pairs do not overlap (fill|fixed, fixed|hug)
        expect(
          Math.min(fill.right, fixed.right) - Math.max(fill.left, fixed.left),
          'fill|fixed do not overlap',
        ).to.be.at.most(1);
        expect(
          Math.min(fixed.right, hug.right) - Math.max(fixed.left, hug.left),
          'fixed|hug do not overlap',
        ).to.be.at.most(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Deeper nesting. The matrix nests one level (parent > two siblings);
  // verify the fill mapping still composes through three container levels on
  // both axes without collapsing the leaf or overflowing.
  // -------------------------------------------------------------------------
  describe('deep nesting (3 container levels)', () => {
    // wraps `leaf` in `depth` nested column containers, each carrying perLevel
    const nest = (
      depth: number,
      leaf: unknown,
      perLevel: Record<string, unknown>,
    ): unknown => {
      let node: unknown = leaf;
      for (let i = 0; i < depth; i++) {
        node = { direction: 'column', gap: 0, children: [node], ...perLevel };
      }
      return node;
    };

    it('width fill chain: leaf fills its container through 3 levels, no overflow', () => {
      applyLayout([
        nest(3, widgetItem(b1, { width: '100%' }), { width: '100%' }),
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const widget = doc.querySelector(
          `[data-cy="widget of NODE_${b1}"]`,
        ) as HTMLElement | null;
        if (!widget) throw new Error('leaf widget not found');
        const container = widget.parentElement as HTMLElement;
        expect(
          widget.getBoundingClientRect().width,
          'leaf fills its immediate container width',
        ).to.be.closeTo(container.getBoundingClientRect().width, 2);
        const root = doc.querySelector('#ROOT') as HTMLElement;
        expect(
          root.scrollWidth,
          'no horizontal overflow anywhere in the nest',
        ).to.be.at.most(root.clientWidth + 1);
      });
    });

    it('height fill chain: leaf fills a definite-height 3-level nest', () => {
      applyLayout([
        {
          direction: 'column',
          height: `${PARENT_HEIGHT}px`,
          children: [
            nest(3, widgetItem(b1, { height: '100%' }), { height: '100%' }),
          ],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const widget = doc.querySelector(
          `[data-cy="widget of NODE_${b1}"]`,
        ) as HTMLElement | null;
        if (!widget) throw new Error('leaf widget not found');
        // container defaults have zero padding, so the definite height should
        // propagate through all three levels essentially intact
        expect(
          widget.getBoundingClientRect().height,
          'leaf fills the definite-height nest (does not collapse to content)',
        ).to.be.at.least(PARENT_HEIGHT * 0.9);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 8. Root maxWidth presets + customStyles passthrough. ROOT maps maxWidth to
  // an MUI breakpoint (getRootMaxWidth) and self-centers via margin '0 auto';
  // customStyles must reach the container sx. (customStyles media queries are
  // deliberately left out — they are viewport-coupled and flaky under the
  // per-test cy.viewport reset.)
  // -------------------------------------------------------------------------
  describe('root maxWidth presets + customStyles', () => {
    const rootEl = ($dash: JQuery<HTMLElement>): HTMLElement => {
      const r = $dash[0].querySelector('#ROOT') as HTMLElement | null;
      if (!r) throw new Error('#ROOT not found inside the dashboard');
      return r;
    };

    it("maxWidth 'sm' caps ROOT at the breakpoint and centers it", () => {
      applyLayout([widgetItem(b1)], { props: { maxWidth: 'sm' } });
      cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
        const root = rootEl($dash);
        const rootRect = root.getBoundingClientRect();
        const dashRect = $dash[0].getBoundingClientRect();
        // default MUI 'sm' breakpoint = 600px (no theme override in this app)
        expect(rootRect.width, "ROOT capped at the 'sm' breakpoint").to.be.closeTo(
          600,
          3,
        );
        expect(
          $dash[0].clientWidth,
          'panel is wider than the cap (so the cap is meaningful here)',
        ).to.be.greaterThan(620);
        // centered: gap to the left edge ~ gap to the content right edge
        // (content right excludes the vertical scrollbar via clientWidth)
        const leftGap = rootRect.left - dashRect.left;
        const rightGap = dashRect.left + $dash[0].clientWidth - rootRect.right;
        expect(leftGap, 'ROOT horizontally centered').to.be.closeTo(rightGap, 4);
        expect(leftGap, 'ROOT inset from the panel edge').to.be.greaterThan(20);
      });
    });

    it('default (unset maxWidth) fills the panel width', () => {
      applyLayout([widgetItem(b1)]);
      cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
        const rootRect = rootEl($dash).getBoundingClientRect();
        expect(
          rootRect.width,
          'ROOT fills the available panel width',
        ).to.be.closeTo($dash[0].clientWidth, 3);
      });
    });

    it('customStyles on a container reach the rendered DOM', () => {
      applyLayout([
        {
          direction: 'column',
          props: { customStyles: { borderRadius: '13px' } },
          children: [widgetItem(b1)],
        },
      ]);
      cy.document({ timeout: 5000 }).should((doc) => {
        const widget = doc.querySelector(
          `[data-cy="widget of NODE_${b1}"]`,
        ) as HTMLElement | null;
        if (!widget) throw new Error('leaf widget not found');
        const container = widget.parentElement as HTMLElement;
        expect(
          doc.defaultView!.getComputedStyle(container).borderRadius,
          'customStyles.borderRadius applied to the container',
        ).to.equal('13px');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Embedded surface previews must not duplicate the live dashboard #ROOT.
  // The top surface renders through the craft <Frame> (root id "ROOT"); an
  // embedded surface renders through SurfaceRenderer, which now namespaces its
  // preview DOM ids (preview-<instance>-ROOT) so getElementById('ROOT') and
  // the layers panel's id lookups can't hit a preview element.
  // -------------------------------------------------------------------------
  describe('embedded surface preview does not shadow the live #ROOT', () => {
    it('exactly one #ROOT in the dashboard; the preview root is namespaced', () => {
      applyLayout([widgetItem(embeddedSurfaceId)]);
      cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
        // wait for the embedded preview to have rendered its (namespaced) root
        const previewRoots = $dash[0].querySelectorAll('[id$="-ROOT"]');
        expect(
          previewRoots.length,
          'embedded surface preview rendered a namespaced root',
        ).to.be.at.least(1);
        // the live craft root is the ONLY element whose id is exactly "ROOT"
        const liveRoots = $dash[0].querySelectorAll('#ROOT');
        expect(
          liveRoots.length,
          'exactly one live #ROOT (no preview collision)',
        ).to.equal(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 10. ROOT height. The Frame wrapper in DashboardEditor grows (flex: 1) so
  // the definite-height chain from the 100dvh panel reaches ROOT - height
  // '100%' fills the available panel area exactly (unlike '100dvh', which
  // would overflow by the breadcrumb/banner height in edit mode), while
  // 'auto' keeps hugging.
  //
  // The two non-edit-mode cases below ARE the deployed/app rendering path:
  // route-driven "app mode" and the editor both render the displayed surface
  // through the same craft <Frame> with isEditMode=false (there is no separate
  // deploy renderer), so this doubles as the deployed-page ROOT-height check.
  // -------------------------------------------------------------------------
  describe('ROOT height', () => {
    // the live craft root is the only element whose id is exactly "ROOT"
    // (SurfaceRenderer previews now namespace theirs as preview-<id>-ROOT), so
    // '#ROOT' scoped to the dashboard resolves the live root unambiguously
    const dashboardRoot = ($dash: JQuery<HTMLElement>): HTMLElement => {
      const root = $dash[0].querySelector('#ROOT') as HTMLElement | null;
      if (!root) {
        throw new Error('#ROOT not found inside the dashboard');
      }
      return root;
    };

    it("ROOT height '100%' fills the dashboard panel without scrolling", () => {
      applyLayout([widgetItem(b1)], { height: '100%' });
      cy.window().then((win) => {
        cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
          const root = dashboardRoot($dash);
          expect(
            root.getBoundingClientRect().height,
            'ROOT fills the panel height',
          ).to.be.at.least(win.innerHeight - 5);
          expect(
            $dash[0].scrollHeight,
            'the panel does not get a vertical scrollbar',
          ).to.be.at.most($dash[0].clientHeight + 2);
        });
      });
    });

    it("ROOT height 'auto' keeps hugging", () => {
      applyLayout([widgetItem(b1)], { height: 'auto' });
      cy.window().then((win) => {
        cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
          const rect = dashboardRoot($dash).getBoundingClientRect();
          expect(
            rect.height,
            'ROOT hugs instead of filling the panel',
          ).to.be.at.most(win.innerHeight * 0.6);
          expect(rect.height, 'ROOT not collapsed').to.be.at.least(
            MIN_HUG_SIZE,
          );
        });
      });
    });

    it("edit mode: ROOT height '100%' still fits inside the panel", () => {
      applyLayout([widgetItem(b1)], { height: '100%' });
      cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
      // edit mode is really on (guards against a retry inheriting the edit
      // mode a failed earlier attempt left behind and toggling it back off)
      cy.get('[data-cy="surface-breadcrumb"]').should('be.visible');
      cy.get('[data-cy="dashboard"]', { timeout: 5000 }).should(($dash) => {
        const rootRect = dashboardRoot($dash).getBoundingClientRect();
        const dashRect = $dash[0].getBoundingClientRect();
        // 100% adapts to the space left after the breadcrumb, where 100dvh
        // would overhang the panel by the breadcrumb height.
        expect(
          rootRect.bottom,
          'ROOT bottom stays inside the panel',
        ).to.be.at.most(dashRect.bottom + 2);
        expect(
          rootRect.height,
          'ROOT still fills most of the panel',
        ).to.be.at.least(dashRect.height * 0.7);
        // the edit-mode Toolbox sidebar no longer overhangs the panel, so the
        // whole panel stays scrollbar-free (regression guard for the sidebar
        // calc-height fix)
        expect(
          $dash[0].scrollHeight,
          'the panel does not get a vertical scrollbar in edit mode',
        ).to.be.at.most($dash[0].clientHeight + 2);
      });
    });

    // runs even when the edit-mode test fails mid-way: never leak edit mode
    // into other tests/attempts
    afterEach(() => {
      cy.get('body').then(($body) => {
        if ($body.find('[data-cy="surface-breadcrumb"]:visible').length > 0) {
          cy.get('[data-cy="toggle-edit-mode-btn"]')
            .first()
            .click({ force: true });
        }
      });
    });
  });
});
