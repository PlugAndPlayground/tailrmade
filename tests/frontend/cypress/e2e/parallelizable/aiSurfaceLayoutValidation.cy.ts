import { doWithTestController, openNewGraph } from '../helpers';

// set_surface_layout must be loud about widget ids that would render as
// nothing: the dashboard resolves widgets via getLayoutableElement(NODE_<id>),
// which requires an existing, layoutable node. A spec that references
// anything else used to be applied silently and the widget just never
// appeared - malformed input must error for the LLM instead (and a layout
// that goes stale AFTER being applied must render a visible "missing widget"
// placeholder, not blank space). Node ids themselves are arbitrary strings -
// resolution matches against the ids present in the graph, not a pattern.
describe('AI set_surface_layout widget id validation', () => {
  before(() => {
    openNewGraph();
  });

  it('rejects a widget id that does not exist, without applying the layout', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'val-surface-1', 0, 0);

      const result = await tc.callAITool('set_surface_layout', {
        node_id: 'val-surface-1',
        layout: {
          direction: 'column',
          children: [{ widget: 'ghost-widget-99' }],
        },
      });

      expect(result.is_error, 'unknown widget id should error').to.equal(true);
      expect(result.content, 'error names the offending id').to.contain(
        'ghost-widget-99',
      );

      const surf = await tc.callAITool('inspect_surface', {
        node_id: 'val-surface-1',
      });
      const parsed = JSON.parse(surf.content);
      expect(
        parsed.connected_widgets,
        'nothing was connected',
      ).to.have.length(0);
      expect(
        parsed.layout.children,
        'layout was not applied',
      ).to.have.length(0);
    });
  });

  it('accepts an existing widget node regardless of its id shape and renders it', () => {
    doWithTestController(async (tc) => {
      // a real WidgetButton with a hand-picked id: node ids are arbitrary
      // unique strings, so this must resolve and render like any hri id
      // (getLayoutableElement used to hard-code the human-readable-id
      // word-word-number shape and silently rendered nothing for this)
      await tc.addNode('WidgetButton', 'MyButton', 300, 0);

      const result = await tc.callAITool('set_surface_layout', {
        node_id: 'val-surface-1',
        layout: {
          direction: 'column',
          children: [{ widget: 'MyButton' }],
        },
      });
      expect(
        result.is_error,
        `arbitrary id applies: ${result.content}`,
      ).to.not.equal(true);

      const surf = await tc.callAITool('inspect_surface', {
        node_id: 'val-surface-1',
      });
      expect(
        JSON.parse(surf.content).connected_widgets,
        'widget was connected',
      ).to.have.length(1);
      tc.toggleDashboard('OPEN');
    });
    cy.then(() => {
      cy.get('[data-cy="widget of NODE_MyButton"]').should('be.visible');
    });
  });

  it('still applies a valid layout, and a later-stale widget renders a visible placeholder', () => {
    let buttonId: string;
    doWithTestController(async (tc) => {
      const button = await tc.addNode('WidgetButton', undefined, 300, 200);
      buttonId = button.id;

      const result = await tc.callAITool('set_surface_layout', {
        node_id: 'val-surface-1',
        layout: {
          direction: 'column',
          children: [{ widget: button.id }],
        },
      });
      expect(
        result.is_error,
        `valid layout applies: ${result.content}`,
      ).to.not.equal(true);
      tc.toggleDashboard('OPEN');
    });
    cy.then(() => {
      cy.get(`[data-cy="widget of NODE_${buttonId}"]`).should('be.visible');
    });

    // Simulate the layout going stale (a saved surface whose node is gone):
    // rewrite the stored tree so the widget item points at a node id that no
    // longer resolves. NOTE: this cannot be produced by deleting the node -
    // syncWidgetsToLinks would then remove the widget item entirely (the
    // healthy path) - only a stale/hand-edited stored layout gets here.
    doWithTestController((tc) => {
      const surface = tc.getNodeByID('val-surface-1');
      const tree = surface.getSurfaceTree();
      Object.values(tree).forEach((item: any) => {
        if (item?.props?.id === `NODE_${buttonId}`) {
          item.props.id = 'NODE_ghost-widget-99';
        }
      });
      surface.setSurfaceTree(tree);
    });

    cy.get('[data-cy="missing-widget of NODE_ghost-widget-99"]')
      .filter(':visible')
      .should('exist')
      .and('contain.text', 'Missing widget');
  });
});
