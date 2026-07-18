import { clearGraph, closeBothDrawers, openNewGraph } from '../helpers';

const openDashboardInspector = () => {
  cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
  cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
  cy.get('[data-cy="dashboard"]').should('be.visible');
  cy.get('[data-cy="right-drawer-toggle-btn"]').first().click({ force: true });
};

const withRootContainer = (assertion: ($root: JQuery<HTMLElement>) => void) => {
  cy.get('#ROOT').should('exist').then(assertion);
};

describe('Root Container CSS Tests', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
    cy.showMousePosition();
  });

  after(() => {
    Cypress.$('#custom-mouse-pointer').remove();
  });

  it('tests root container has custom CSS properties field', () => {
    openDashboardInspector();
    cy.contains('Additional CSS Properties').scrollIntoView().should('exist');
  });

  it('tests root container max width presets', () => {
    const maxWidthPresets = ['xs', 'sm', 'md', 'lg', 'xl', 'false'];

    openDashboardInspector();

    maxWidthPresets.forEach((preset) => {
      cy.get('body').then(($body) => {
        const $button = $body.find(`button[value="${preset}"]`).first();
        if (!$button.length || !$button.is(':visible')) {
          return;
        }

        cy.wrap($button).click();
        withRootContainer(($root) => {
          const maxWidth = getComputedStyle($root[0]).maxWidth;
          expect(maxWidth).to.not.eq('');
        });
      });
    });
  });

  it('tests root container gap control', () => {
    openDashboardInspector();

    cy.get('body').then(($body) => {
      const $slider = $body.find('input[type="range"]').first();
      if (!$slider.length || !$slider.is(':visible')) {
        return;
      }

      cy.wrap($slider).invoke('val', 48).trigger('input').trigger('change');
      cy.wait(300);
      withRootContainer(($root) => {
        expect(getComputedStyle($root[0]).gap).to.contain('48px');
      });
    });
  });

  it('tests root container width and height controls', () => {
    openDashboardInspector();

    cy.get('body').then(($body) => {
      const $widthInput = $body.find('input[label="Width"]').first();
      if ($widthInput.length && $widthInput.is(':visible')) {
        cy.wrap($widthInput).clear().type('90%');
        withRootContainer(($root) => {
          expect(getComputedStyle($root[0]).width).to.not.eq('');
        });
      }

      const $heightInput = $body.find('input[label="Height"]').first();
      if ($heightInput.length && $heightInput.is(':visible')) {
        cy.wrap($heightInput).clear().type('100vh');
        withRootContainer(($root) => {
          expect(getComputedStyle($root[0]).height).to.not.eq('');
        });
      }
    });
  });
});
