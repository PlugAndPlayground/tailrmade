import { doWithTestController, openNewGraph } from '../helpers';
import {
  buildParentContainerItem,
  generateMatrixCases,
  widgetSelector,
  MatrixNodeIds,
  SiblingSpec,
} from './layoutMatrixHelpers';

// Visual "zoo" of every case generateMatrixCases() produces (the
// layoutMatrix.*.cy.ts specs assert geometry invariants on these same
// combinations; this spec is for a human to look at). Builds ONE UI surface
// with a text label + the tested parent container for every combination, then
// leaves the app open and interactive so a person running `yarn test-editor`
// can resize the window and drag the dashboard divider to watch the mobile
// flip live.
//
// The `.manual.cy.ts` suffix keeps this out of the automated `yarn test` run
// (see the excludeSpecPattern in package.json's "test" script) - it is not a
// regression gate, only a manual eyeballing aid. It still appears in
// `yarn test-editor` (open mode uses the config specPattern, no exclude).
const SURFACE_ID = 'layout-zoo-surface';

describe('UI surface layout zoo (visual - run via yarn test-editor)', () => {
  it('builds one surface containing every generated layout-matrix combination', () => {
    openNewGraph();
    const cases = generateMatrixCases();
    let firstWidgetAId = '';

    doWithTestController(async (tc) => {
      // added FIRST so it becomes the default (displayed) surface
      await tc.addNode('UISurfaceNode', SURFACE_ID, 0, 0);

      let y = 0;
      // a placeable node per sibling: WidgetButton for 'widget'/'container'
      // siblings, a fresh embeddable UI surface (one WidgetButton inside)
      // for 'surface' siblings - fresh nodes per section because one node
      // may appear only once per surface. ids left to default (hri.random())
      // - set_surface_layout rejects non-resolvable hand-picked ids.
      const makeSiblingNode = async (sibling: SiblingSpec, x: number) => {
        const nodeY = (y += 90);
        if (sibling.kind !== 'surface') {
          const node = await tc.addNode('WidgetButton', undefined, x, nodeY);
          return node.id;
        }
        const surf = await tc.addNode('UISurfaceNode', undefined, x, nodeY);
        const inner = await tc.addNode(
          'WidgetButton',
          undefined,
          x + 400,
          nodeY,
        );
        const result = await tc.callAITool('set_surface_layout', {
          node_id: surf.id,
          layout: { direction: 'column', children: [{ widget: inner.id }] },
        });
        expect(
          result.is_error,
          `inner surface layout failed: ${result.content}`,
        ).to.not.equal(true);
        return surf.id;
      };

      const sections: unknown[] = [];
      for (const kase of cases) {
        const idA = await makeSiblingNode(kase.siblingA, 500);
        const idB = await makeSiblingNode(kase.siblingB, 900);
        if (!firstWidgetAId) {
          firstWidgetAId = idA;
        }

        // both siblings resolve through the same MatrixNodeIds shape the
        // matrix spec uses; A and B here are always distinct fresh nodes,
        // so the widget and surface slots can safely alias
        const ids: MatrixNodeIds = {
          widgetA: idA,
          widgetB: idB,
          surfaceA: idA,
          surfaceB: idB,
        };

        sections.push({ text: kase.title, fontWeight: 'bold', fontSize: 14 });
        sections.push(
          buildParentContainerItem(kase, ids, {
            // pre-set the mobile-flip prop everywhere too (it is also the
            // spec default now): with the dashboard divider dragged narrow,
            // every row section visibly flips to a column, which is the
            // whole point of eyeballing this
            narrowFlip: true,
          }),
        );
      }

      const layout = {
        direction: 'column',
        gap: 24,
        padding: 16,
        children: sections,
      };

      const result = await tc.callAITool('set_surface_layout', {
        node_id: SURFACE_ID,
        layout,
      });
      expect(
        result.is_error,
        `set_surface_layout failed: ${result.content}`,
      ).to.not.equal(true);

      tc.toggleDashboard('OPEN');
    });

    // Minimal assertions only - this spec exists for manual eyeballing, not
    // as a regression gate (layoutMatrix.cy.ts is the gate).
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.get('#ROOT').should(($root) => {
      const root = $root[0];
      expect(
        root.scrollWidth,
        'root does not overflow horizontally',
      ).to.be.at.most(root.clientWidth + 1);
    });
    cy.then(() => {
      cy.get(widgetSelector(firstWidgetAId)).should('be.visible');
    });

    // Intentionally no cy.reload/teardown after this - the app is left open
    // and interactive so a person can resize the window/drag the dashboard
    // divider narrower than 600px and watch row sections flip to column.
  });
});
