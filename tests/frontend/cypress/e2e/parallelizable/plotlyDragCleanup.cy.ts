import { doWithTestController, openNewGraph } from '../helpers';

describe('Plotly drag cleanup', () => {
  beforeEach(() => {
    openNewGraph();
    doWithTestController(async (tc) => {
      await tc.addNode('PlotlyChart', 'drag-chart');
      await tc.addNode('UISurfaceNode', 'drag-surface');
      tc.setNodeInputValue('drag-chart', 'Traces', [
        { type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [2, 4, 3] },
      ]);
      await tc.connectNodesByID('drag-chart', 'drag-surface', 'ReactUI');
      await tc.executeNodeByID('drag-chart');
      await tc.waitForPendingExecution();
      tc.getNodeByID('drag-surface').onEnterKeyPressed();
    });
    cy.get('[data-cy="dashboard"] [data-testid="plotly-chart"]')
      .as('plot')
      .should(($plot) => {
        expect(($plot[0] as any).on).to.be.a('function');
      })
      .then(($plot) => {
        // Keep this library lifecycle test independent of editor selection timers.
        $plot[0].addEventListener('mousedown', (event) =>
          event.stopPropagation(),
        );
        ($plot[0] as any).on('plotly_click', cy.stub().as('plotClick'));
      })
      .find('.nsewdrag', { timeout: 30000 })
      .trigger('mousedown', {
        eventConstructor: 'MouseEvent',
        clientX: 200,
        clientY: 180,
        button: 0,
        buttons: 1,
        force: true,
      });
    cy.get('@plot').then(($plot) => {
      expect(($plot[0] as any)._dragging).to.equal(true);
      cy.wrap($plot[0], { log: false }).as('draggedPlot', { type: 'static' });
    });
  });

  function moveAfterPurge() {
    cy.get('@draggedPlot').should((plot) => {
      expect((plot[0] as any)._fullLayout).to.equal(undefined);
    });
    cy.document().trigger('mousemove', {
      eventConstructor: 'MouseEvent',
      clientX: 260,
      clientY: 240,
      buttons: 1,
      force: true,
    });
    cy.document().trigger('mouseup', {
      eventConstructor: 'MouseEvent',
      force: true,
    });
    cy.get('.dragcover').should('not.exist');
    cy.get('@plotClick').should('not.have.been.called');
  }

  it('removes document drag handlers before an active chart is removed', () => {
    doWithTestController(async (tc) => {
      await tc.removeNode('drag-chart');
    });
    moveAfterPurge();
  });

  it('cancels dragging on render failure and can render again', () => {
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('drag-chart', 'Layout', []);
      await tc.executeNodeByID('drag-chart');
    });
    moveAfterPurge();
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('drag-chart', 'Layout', {});
      await tc.executeNodeByID('drag-chart');
    });
    cy.get(
      '[data-cy="dashboard"] [data-testid="plotly-chart"] .scatterlayer .point',
    ).should('have.length', 3);
  });

  it('cancels dragging before applying new chart data', () => {
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('drag-chart', 'Traces', [
        { type: 'bar', x: ['A', 'B'], y: [10, 20] },
      ]);
      await tc.executeNodeByID('drag-chart');
    });
    cy.get(
      '[data-cy="dashboard"] [data-testid="plotly-chart"] .barlayer .point',
    ).should('have.length', 2);
    cy.get('@draggedPlot').should((plot) => {
      expect((plot[0] as any)._dragging).not.to.equal(true);
    });
    cy.document().trigger('mousemove', {
      eventConstructor: 'MouseEvent',
      clientX: 260,
      clientY: 240,
      buttons: 1,
      force: true,
    });
    cy.get('.dragcover').should('not.exist');
    cy.get('@plotClick').should('not.have.been.called');
  });
});
