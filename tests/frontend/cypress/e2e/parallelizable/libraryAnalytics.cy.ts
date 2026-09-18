import {
  doWithTestController,
  openNewGraph,
  waitForStableRect,
} from '../helpers';

describe('library-backed charts and statistics', () => {
  before(() => openNewGraph());

  it('calculates through the real worker and updates outputs', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Statistics', 'stats');
      tc.setNodeInputValue('stats', 'Values', [4, 1, 3, 2]);
      await tc.executeNodeByID('stats');
      expect(tc.getNodeOutputValue('stats', 'Mean')).to.equal(2.5);
      expect(tc.getNodeOutputValue('stats', 'Variance')).to.equal(1.25);
      tc.setNodeInputValue('stats', 'Sample', true);
      await tc.executeNodeByID('stats');
      expect(tc.getNodeOutputValue('stats', 'Variance')).to.be.closeTo(
        5 / 3,
        1e-10,
      );
      tc.setNodeInputValue('stats', 'Values', []);
      await tc.executeNodeByID('stats');
      expect(tc.getNodeOutputValue('stats', 'Mean')).to.equal(null);
    });
  });

  it('renders and updates Plotly without a CustomFunction', () => {
    cy.viewport(1280, 900);
    doWithTestController(async (tc) => {
      await tc.addNode('PlotlyChart', 'chart');
      tc.setNodeInputValue('chart', 'Traces', [
        { type: 'bar', x: ['A', 'B'], y: [10, 20] },
      ]);
      tc.setNodeInputValue('chart', 'Layout', {
        title: { text: 'Library chart' },
      });
      await tc.executeNodeByID('chart');
      tc.centerNodeAtScreenPoint('chart', 700, 450);
    });
    cy.get('[data-testid="plotly-chart"] .barlayer .point', {
      timeout: 60000,
    }).should('have.length', 2);
    cy.get('[data-testid="plotly-chart"]').should(($plot) => {
      expect(($plot[0] as any).data[0].y).to.deep.equal([10, 20]);
      expect($plot[0].getBoundingClientRect().width).to.be.greaterThan(100);
    });
    cy.screenshot('library-chart-desktop');
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('chart', 'Traces', [
        { type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [3, 2, 5] },
      ]);
      await tc.executeNodeByID('chart');
    });
    cy.get('[data-testid="plotly-chart"] .scatterlayer .point').should(
      'have.length',
      3,
    );
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('chart', 'Traces', []);
      await tc.executeNodeByID('chart');
    });
    cy.contains('[role="status"]', 'No data').should('be.visible');
    doWithTestController(async (tc) => {
      await tc.removeNode('chart');
      await tc.removeNode('stats');
    });
    cy.get('[data-testid="plotly-chart"]').should('not.exist');
  });

  it('guides the AI toward library nodes instead of legacy charts', () => {
    doWithTestController(async (tc) => {
      const prompt = await tc.getAISystemPrompt();
      expect(prompt).to.include('PlotlyChart (Chart (Plotly))');
      expect(prompt).to.include('Statistics (Statistics)');
      expect(prompt).not.to.include('Load versioned packages with "LoadNPM"');
    });
  });

  it('renders interactively on a surface, resizes, and recovers from errors', () => {
    cy.viewport(1100, 650);
    doWithTestController(async (tc) => {
      await tc.addNode('PlotlyChart', 'surface-chart');
      await tc.addNode('UISurfaceNode', 'chart-surface');
      tc.setNodeInputValue('surface-chart', 'Traces', [
        { type: 'bar', x: ['A', 'B'], y: [10, 20] },
      ]);
      await tc.connectNodesByID('surface-chart', 'chart-surface', 'ReactUI');
      await tc.executeNodeByID('surface-chart');
      await tc.waitForPendingExecution();
      tc.getNodeByID('chart-surface').onEnterKeyPressed();
    });
    const chart = '[data-cy="dashboard"] [data-testid="plotly-chart"]';
    cy.get(chart)
      .find('.barlayer .point', { timeout: 30000 })
      .should('have.length', 2);
    cy.get(chart).should(($plot) => {
      expect(($plot[0] as any)._context.staticPlot).to.equal(false);
      expect(($plot[0] as any)._fullLayout.width).to.equal(
        Math.floor($plot[0].clientWidth),
      );
    });
    cy.get(chart).screenshot('library-chart-surface-desktop');
    cy.viewport(390, 700);
    cy.get(chart).should(($plot) => {
      expect($plot[0].clientWidth).to.be.within(100, 380);
      expect(($plot[0] as any)._fullLayout.width).to.equal(
        Math.floor($plot[0].clientWidth),
      );
    });
    waitForStableRect(chart);
    cy.get(chart).parent().find('[role="status"]').should('not.exist');
    cy.get(chart).find('.barlayer .point').should('have.length', 2);
    cy.screenshot('library-chart-surface-mobile', {
      capture: 'viewport',
      disableTimersAndAnimations: false,
    });
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('surface-chart', 'Layout', []);
      await tc.executeNodeByID('surface-chart');
    });
    cy.get(chart)
      .parent()
      .find('[role="status"]')
      .should('have.text', 'Layout must be an object.');
    doWithTestController(async (tc) => {
      tc.setNodeInputValue('surface-chart', 'Layout', {
        title: { text: 'Recovered' },
      });
      await tc.executeNodeByID('surface-chart');
    });
    cy.get(chart).find('.barlayer .point').should('have.length', 2);
    cy.get(chart).find('.gtitle').should('have.text', 'Recovered');
    doWithTestController(async (tc) => {
      await tc.removeNode('surface-chart');
      await tc.removeNode('chart-surface');
    });
    cy.get(chart).should('not.exist');
  });
});
