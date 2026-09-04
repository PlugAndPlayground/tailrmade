import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';
import { clearGraph, doWithTestController, openNewGraph } from '../helpers';

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

  // Between md and lg two panels leave the canvas ~500px and a third leaves
  // under 200 - narrower than a single node, so the canvas stops being
  // something you can work against.
  describe('the two-panel cap on tablet landscape', () => {
    const openAll = () =>
      doWithTestController((tc) => {
        tc.toggleLeftSideDrawer(VISIBILITY_ACTION.OPEN);
        tc.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
        tc.toggleDashboard(VISIBILITY_ACTION.OPEN);
      });

    // A `.then` reads the DOM once, before React has committed the toggles.
    // `.should` retries the whole callback until the layout settles.
    const expectOpenPanels = (expected: number) =>
      cy.get('[data-cy="shell-layout"]').should(($shell) => {
        const open = [
          'menu-panel-column',
          'inspector-column',
          'dashboard-column',
        ].filter((name) => {
          const el = $shell[0].querySelector(`[data-cy="${name}"]`);
          return el ? el.getBoundingClientRect().width > 1 : false;
        });
        expect(open.length, `open panels (${open.join(', ')})`).to.equal(
          expected,
        );
      });

    afterEach(() => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      doWithTestController((tc) => {
        tc.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
        tc.toggleRightSideDrawer(VISIBILITY_ACTION.CLOSE);
        tc.toggleDashboard(VISIBILITY_ACTION.CLOSE);
      });
    });

    it('keeps at most two open', () => {
      cy.viewport(TABLET_LANDSCAPE.width, TABLET_LANDSCAPE.height);
      openAll();
      expectOpenPanels(2);
    });

    // the panel you just asked for is the one worth keeping
    it('closes the oldest rather than the newest', () => {
      cy.viewport(TABLET_LANDSCAPE.width, TABLET_LANDSCAPE.height);
      doWithTestController((tc) =>
        tc.toggleLeftSideDrawer(VISIBILITY_ACTION.OPEN),
      );
      cy.get('[data-cy="menu-panel-column"]').should('be.visible');
      doWithTestController((tc) =>
        tc.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN),
      );
      doWithTestController((tc) => tc.toggleDashboard(VISIBILITY_ACTION.OPEN));

      cy.get('[data-cy="dashboard-column"]').should('be.visible');
      cy.get('[data-cy="menu-panel-column"]').should('not.be.visible');
    });

    it('lifts the cap on a desktop', () => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      openAll();
      expectOpenPanels(3);
    });

    // the window can cross the breakpoint with all three already open, which
    // no toggle went through
    it('applies the cap when the window shrinks into the band', () => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      openAll();
      expectOpenPanels(3);
      cy.viewport(TABLET_LANDSCAPE.width, TABLET_LANDSCAPE.height);
      expectOpenPanels(2);
    });
  });

  // Exploring is in scope on a phone and editing is not, but reading a node's
  // values sits between them - and it is the difference between a canvas you
  // can navigate and one you can understand.
  describe('reading a node on the canvas', () => {
    beforeEach(() => {
      cy.viewport(PHONE.width, PHONE.height);
      clearGraph();
      cy.get('[data-cy="bottom-bar-canvas"]').click();
    });

    it('shows nothing until something is selected', () => {
      cy.get('[data-cy="canvas-peek"]').should('not.exist');
    });

    it('names the node and lists its values', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'PEEK1');
        tc.selectNodesById(['PEEK1']);
      });

      cy.get('[data-cy="canvas-peek"]').should('be.visible');
      cy.get('[data-cy="canvas-peek-name"]').should('not.be.empty');
      // a name and a hint alone would not be worth a panel - the values are
      // the reason it exists
      cy.get('[data-cy="canvas-peek-row"]').should('have.length.at.least', 1);
    });

    // the whole point of it not being the inspector
    it('offers nothing editable', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'PEEK2');
        tc.selectNodesById(['PEEK2']);
      });

      cy.get('[data-cy="canvas-peek"]').should('be.visible');
      cy.get('[data-cy="canvas-peek"]').find('input').should('not.exist');
      cy.get('[data-cy="canvas-peek"]').find('textarea').should('not.exist');
      cy.get('[data-cy="canvas-peek"]')
        .find('[contenteditable="true"]')
        .should('not.exist');
    });

    // the reference the phone owes the reader: where it stops, and where it
    // carries on
    it('says where editing happens', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'PEEK3');
        tc.selectNodesById(['PEEK3']);
      });
      cy.get('[data-cy="canvas-peek-desktop-hint"]').should('be.visible');
    });

    it('closes without deselecting anything else', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'PEEK4');
        tc.selectNodesById(['PEEK4']);
      });
      cy.get('[data-cy="canvas-peek-close"]').click();
      cy.get('[data-cy="canvas-peek"]').should('not.exist');
    });

    it('stays clear of the bottom bar', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'PEEK5');
        tc.selectNodesById(['PEEK5']);
      });
      cy.get('[data-cy="canvas-peek"]').then(($peek) => {
        cy.get('[data-cy="bottom-bar"]').then(($bar) => {
          expect($peek[0].getBoundingClientRect().bottom).to.be.at.most(
            $bar[0].getBoundingClientRect().top,
          );
        });
      });
    });
  });
});
