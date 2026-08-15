import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';
import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

const getVisibleWidget = (selector: string) =>
  cy.get(selector).filter(':visible').first().should('be.visible');

describe('testSlideshow', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
    cy.showMousePosition();
  });

  beforeEach(() => {
    clearGraph();
  });

  after(() => {
    Cypress.$('#custom-mouse-pointer').remove();
  });

  it('adds a slideshow', () => {
    const hybridNodeId = 'orange-stingray-61';
    const widgetSelector = `[data-cy="widget of NODE_${hybridNodeId}"]`;

    doWithTestController(async (testController) => {
      await testController.addNode('Slideshow', hybridNodeId, -300, -200);
    });

    cy.get('.navigate-right > .controls-arrow').click({ force: true });
    cy.contains(`#Container-${hybridNodeId}`, 'Shortcuts').should('be.visible');

    // adding opens the dashboard in edit mode; the widget's entry is listed
    // in the right drawer's user-interface panel
    addToDashboard(hybridNodeId);
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
    });
    cy.get('[data-cy="interface-settings-tab"]').click({ force: true });

    // the closed toolbox drawer lists the node too, so scope the lookup -
    // an unscoped cy.contains finds that hidden entry first
    cy.get('[data-cy="layers-panel"]')
      .contains('Slideshow generator')
      .should('be.visible')
      .click({ force: true });
    cy.get('[data-cy="exit-dashboard-editor-btn"]').should('be.visible');
    getVisibleWidget(widgetSelector).click({ force: true });
    // selecting the widget mounts its settings; the panel wrapper does not
    // register as :visible for jQuery even when shown, so assert existence
    // and prove the toggle worked through the widget label that appears
    cy.get('[data-cy="dynamic-widget-settings"]').should('exist');
    cy.get('[data-cy="label-switch"]').first().click({ force: true });
    getVisibleWidget(widgetSelector).should(
      'contain.text',
      'Slideshow generator',
    );
  });
});
