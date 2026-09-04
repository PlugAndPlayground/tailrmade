import { openNewGraph } from '../helpers';

// The shell has two layouts and one rule choosing between them: can this
// window hold a row of columns? Below md it cannot, and everything that used
// to negotiate for space there - rail, drawers, sheets - is simply absent.
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const TABLET_PORTRAIT = { width: 820, height: 1180 };
const TABLET_LANDSCAPE = { width: 1180, height: 820 };
const DESKTOP = { width: 1440, height: 900 };

const STACK_SIZES = [
  ['phone portrait', PHONE],
  ['phone landscape', PHONE_LANDSCAPE],
  ['tablet portrait', TABLET_PORTRAIT],
] as const;

const COLUMN_SIZES = [
  ['tablet landscape', TABLET_LANDSCAPE],
  ['desktop', DESKTOP],
] as const;

describe('responsive shell', () => {
  before(() => {
    openNewGraph();
  });

  afterEach(() => {
    cy.viewport(DESKTOP.width, DESKTOP.height);
  });

  describe('which layout a window gets', () => {
    // width, not device class - the same tablet stacks in portrait and gets
    // columns turned sideways, because width is what runs out
    STACK_SIZES.forEach(([name, size]) => {
      it(`stacks on ${name}`, () => {
        cy.viewport(size.width, size.height);
        cy.get('[data-cy="bottom-bar"]').should('be.visible');
        cy.get('[data-cy="shell-rail"]').should('not.exist');
        cy.get('[data-cy="menu-panel-column"]').should('not.exist');
        cy.get('[data-cy="inspector-column"]').should('not.exist');
      });
    });

    COLUMN_SIZES.forEach(([name, size]) => {
      it(`keeps columns on ${name}`, () => {
        cy.viewport(size.width, size.height);
        cy.get('[data-cy="shell-rail"]').should('be.visible');
        cy.get('[data-cy="bottom-bar"]').should('not.exist');
      });
    });
  });

  describe('the bottom bar', () => {
    beforeEach(() => {
      cy.viewport(PHONE.width, PHONE.height);
    });

    it('lands on the app UI, which is what a phone came for', () => {
      cy.get('[data-cy="stack-view"]').should(
        'have.attr',
        'data-stack-view',
        'ui',
      );
    });

    it('switches between one full-screen view at a time', () => {
      cy.get('[data-cy="bottom-bar-ai"]').click();
      cy.get('[data-cy="stack-view"]').should(
        'have.attr',
        'data-stack-view',
        'ai',
      );

      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.get('[data-cy="stack-view"]').should(
        'have.attr',
        'data-stack-view',
        'apps',
      );
      cy.get('#graphs-list').should('be.visible');

      cy.get('[data-cy="bottom-bar-ui"]').click();
      cy.get('[data-cy="stack-view"]').should(
        'have.attr',
        'data-stack-view',
        'ui',
      );
    });

    // the canvas is behind the whole shell already, so showing it means
    // putting nothing in front of it
    it('renders nothing over the canvas on the canvas view', () => {
      cy.get('[data-cy="bottom-bar-canvas"]').click();
      cy.get('[data-cy="stack-view"]').should('not.exist');
      cy.get('[data-cy="bottom-bar"]').should('be.visible');
    });

    it('never lets a view render under its own navigation', () => {
      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.get('[data-cy="stack-view"]').then(($view) => {
        cy.get('[data-cy="bottom-bar"]').then(($bar) => {
          const view = $view[0].getBoundingClientRect();
          const bar = $bar[0].getBoundingClientRect();
          expect(view.bottom).to.be.at.most(bar.top + 1);
        });
      });
    });

    it('opens the share menu upwards, clear of the bar', () => {
      cy.get('[data-cy="bottom-bar-share"]').click();
      cy.get('[data-cy="bottom-bar-share-scrim"]').should('exist');
      cy.get('[data-cy="bottom-bar-share-scrim"]').click({ force: true });
      cy.get('[data-cy="bottom-bar-share-scrim"]').should('not.exist');
    });

    // every destination is a thumb target, so each gets the same floor the app
    // theme puts on controls
    it('gives every destination a full-width thumb target', () => {
      cy.get('[data-cy="bottom-bar"]')
        .children('button')
        .should('have.length', 5)
        .each(($button) => {
          expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
        });
    });
  });
});
