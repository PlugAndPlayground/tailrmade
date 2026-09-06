import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';
import {
  addToDashboard,
  clearGraph,
  clickNode,
  doWithTestController,
  exitDashboardEditMode,
  getNodeCenterById,
  openNewGraph,
  saveGraph,
  shouldWithTestController,
} from '../helpers';

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

// what BottomBar waits out before closing itself
const AUTO_COLLAPSE_MS = 4000;

const COLUMN_SIZES = [
  ['tablet landscape', TABLET_LANDSCAPE],
  ['desktop', DESKTOP],
] as const;

// The bar starts collapsed to the logo in the corner, so every test that
// wants a destination has to open it first.
const openBottomBar = () => {
  // it may already be open - the store outlives a test, and toggling a bar
  // that is open would close it
  cy.get('[data-cy="bottom-bar"]').then(($bar) => {
    if ($bar.attr('data-expanded') !== 'true') {
      cy.get('[data-cy="bottom-bar-toggle"]').click();
    }
  });
  cy.get('[data-cy="bottom-bar"]').should('have.attr', 'data-expanded', 'true');
};

const closeBottomBar = () => {
  cy.get('[data-cy="bottom-bar"]').then(($bar) => {
    if ($bar.attr('data-expanded') === 'true') {
      cy.get('[data-cy="bottom-bar-toggle"]').click();
    }
  });
  cy.get('[data-cy="bottom-bar"]').should(
    'have.attr',
    'data-expanded',
    'false',
  );
};

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

    // an app that owns the screen should own all of it - what is left of the
    // bar until you ask for it is the logo in the corner
    it('keeps the destinations behind the logo', () => {
      cy.get('[data-cy="bottom-bar"]').should(
        'have.attr',
        'data-expanded',
        'false',
      );
      cy.get('[data-cy="bottom-bar-ui"]').should('not.exist');
      cy.get('[data-cy="bottom-bar"]').then(($bar) => {
        expect($bar[0].getBoundingClientRect().width).to.be.at.most(72);
      });

      openBottomBar();
      cy.get('[data-cy="bottom-bar-ui"]').should('be.visible');
      cy.get('[data-cy="bottom-bar"]').should(($bar) => {
        expect($bar[0].getBoundingClientRect().width).to.equal(PHONE.width);
      });
    });

    // the bar grows and shrinks AROUND the logo - the logo is the one thing
    // on screen that was in the same place before the tap
    it('does not move the logo when it opens or closes', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-ui"]').click();
      closeBottomBar();

      let collapsed: DOMRect;
      cy.get('[data-cy="bottom-bar-toggle"]').then(($logo) => {
        collapsed = $logo[0].getBoundingClientRect();
      });
      openBottomBar();
      cy.get('[data-cy="bottom-bar-toggle"]').should(($logo) => {
        const open = $logo[0].getBoundingClientRect();
        expect([open.left, open.top, open.width]).to.deep.equal([
          collapsed.left,
          collapsed.top,
          collapsed.width,
        ]);
      });
    });

    it('switches between one full-screen view at a time', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-ai"]').click();
      cy.get('[data-cy="stack-view"]').should(
        'have.attr',
        'data-stack-view',
        'ai',
      );

      // picking a destination does not dismiss the bar - each tap restarts
      // its idle timer, so a second choice costs one tap, not two
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
    it('renders nothing over the canvas on the graph view', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-graph"]').click();
      cy.get('[data-cy="stack-view"]').should('not.exist');
      cy.get('[data-cy="bottom-bar"]').should('be.visible');
    });

    // which app you are looking at, on the one view that has no other way to
    // say it - and a label, not a control
    it('names the app over the canvas', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-graph"]').click();
      cy.get('[data-cy="stack-app-name"]')
        .should('exist')
        .should('not.be.empty');
      // over the canvas, at the top, clear of everything else
      cy.get('[data-cy="stack-app-name"]').then(($name) => {
        expect($name[0].getBoundingClientRect().top).to.be.at.most(60);
      });
    });

    it('closes itself when you go back to what is underneath', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-ui"]').click();
      cy.get('[data-cy="stack-view"]').click('center');
      cy.get('[data-cy="bottom-bar"]').should(
        'have.attr',
        'data-expanded',
        'false',
      );
    });

    // the apps list and the AI panel end above the bar anyway, so there is
    // nothing for it to get out of the way of
    it('stays open on the apps and AI tabs', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.wait(AUTO_COLLAPSE_MS + 1000);
      cy.get('[data-cy="bottom-bar"]').should(
        'have.attr',
        'data-expanded',
        'true',
      );

      cy.get('[data-cy="bottom-bar-ai"]').click();
      cy.get('[data-cy="stack-view"]').click('center');
      cy.get('[data-cy="bottom-bar"]').should(
        'have.attr',
        'data-expanded',
        'true',
      );
    });

    // opened by accident, gone without being dismissed
    it('closes itself after a while of nothing happening', () => {
      openBottomBar();
      // ...on a view that it is in the way of
      cy.get('[data-cy="bottom-bar-ui"]').click();
      cy.get('[data-cy="bottom-bar"]', { timeout: 10000 }).should(
        'have.attr',
        'data-expanded',
        'false',
      );
    });

    it('opens the share menu as a full-width sheet over the bar', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-share"]').click();
      cy.get('[data-cy="bottom-bar-share-menu"]').should('be.visible');
      cy.get('[data-cy="bottom-bar-share-menu"]').should(($sheet) => {
        // the same width as the overflow sheet, not anchored to its own slot
        expect($sheet[0].getBoundingClientRect().width).to.be.greaterThan(
          PHONE.width - 40,
        );
      });
      cy.get('[data-cy="bottom-bar-share-scrim"]').should('exist');
      cy.get('[data-cy="bottom-bar-share-scrim"]').click({ force: true });
      cy.get('[data-cy="bottom-bar-share-scrim"]').should('not.exist');
    });

    // the overflow menu is not a menu of its own - it is the top of the graph
    // context menu, which is where saving and renaming live
    it("offers the app's own actions in the overflow menu", () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar-more"]').click();
      cy.get('[data-cy="bottom-bar-more-menu"]').should('be.visible');
      cy.get('[data-cy="menu-save"]').should('be.visible');
      cy.get('[data-cy="menu-edit-details"]').should('be.visible');
      cy.get('[data-cy="bottom-bar-more-scrim"]').click({ force: true });
      cy.get('[data-cy="bottom-bar-more-menu"]').should('not.exist');
    });

    // every destination is a thumb target, so each gets the same floor the app
    // theme puts on controls
    it('gives every destination a full-width thumb target', () => {
      openBottomBar();
      cy.get('[data-cy="bottom-bar"]')
        .children('button')
        .should('have.length.at.least', 6)
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

  // A widget's own popup is a Popper: it is portalled onto the body, so it is
  // not stacked against the widget but against everything the shell puts on
  // the screen - and under the stack layout that includes a full-screen view
  // the popup has to clear.
  describe("a widget's own popup", () => {
    it('opens the colour picker over the app UI', () => {
      // the add-to-dashboard flow works off the node's header buttons on the
      // canvas, so the setup happens at a width that has one
      cy.viewport(DESKTOP.width, DESKTOP.height);
      clearGraph();
      const pickerId = 'phone-colorpicker';
      doWithTestController(async (tc) => {
        await tc.addNode('WidgetColorPicker', pickerId, 0, -200);
      });
      addToDashboard(pickerId);
      exitDashboardEditMode();

      cy.viewport(PHONE.width, PHONE.height);
      openBottomBar();
      cy.get('[data-cy="bottom-bar-ui"]').click();

      cy.get(`[data-cy="widget of NODE_${pickerId}"] button`)
        .filter(':visible')
        .first()
        .click({ force: true });
      cy.get('.chrome-picker').should('be.visible');
    });
  });

  // Picking an app out of the list is the one navigation the phone does on
  // your behalf. Loading an app fires GraphConfigured twice - once from the
  // clear() that empties the old graph, once for the app itself - and acting
  // on the first sent every app to the graph view, because at that moment
  // every app is empty.
  describe('opening an app from the list', () => {
    it('lands on the UI when the app has one', () => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      clearGraph();
      const widgetId = 'handover-widget';
      doWithTestController(async (tc) => {
        await tc.addNode('WidgetColorPicker', widgetId, 0, -200);
      });
      addToDashboard(widgetId);
      exitDashboardEditMode();
      saveGraph();

      let appName = '';
      doWithTestController((tc) => {
        appName = tc.getGraph().name;
      });

      cy.viewport(PHONE.width, PHONE.height);
      openBottomBar();
      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.get('#graphs-list').should('be.visible');
      cy.then(() => {
        cy.get('#graphs-list').contains(appName).click();
      });

      cy.get('[data-cy="stack-view"]', { timeout: 30000 }).should(
        'have.attr',
        'data-stack-view',
        'ui',
      );
    });
  });

  // The saved view is a scale chosen on the window the app was saved from,
  // which is almost always a desktop - restoring it as-is on a phone opens the
  // app deep inside itself.
  describe('framing a loaded graph on a phone', () => {
    it('fits the whole graph on screen', () => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      clearGraph();
      // far enough apart that no desktop-saved view could have them both on a
      // phone screen at scale 1, but not so far that fitting them would go
      // below the floor
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'FRAME1', -400, -250);
        await tc.addNode('Constant', 'FRAME2', 400, 250);
      });
      saveGraph();

      let appName = '';
      doWithTestController((tc) => {
        appName = tc.getGraph().name;
      });

      cy.viewport(PHONE.width, PHONE.height);
      openBottomBar();
      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.get('#graphs-list').should('be.visible');
      cy.then(() => {
        cy.get('#graphs-list').contains(appName).click();
      });
      cy.get('[data-cy="stack-view"]', { timeout: 30000 }).should('exist');

      // both ends of the graph are on the screen, and the scale is one a
      // finger can still make sense of
      shouldWithTestController((tc) => {
        const scale = tc.getGraph().viewportScaleX;
        expect(scale, 'scale').to.be.within(0.15, 1);
        ['FRAME1', 'FRAME2'].forEach((id) => {
          const [x, y] = tc.getNodeCenterById(id);
          expect(x, `${id} x`).to.be.within(0, PHONE.width);
          expect(y, `${id} y`).to.be.within(0, PHONE.height);
        });
      });
    });

    // the other branch: a graph too big to fit legibly keeps the author's own
    // centre - on a graph that does not fit, where they left the view is
    // better information than the middle of its bounding box
    it('stops zooming out at the floor when the graph is too big', () => {
      cy.viewport(DESKTOP.width, DESKTOP.height);
      clearGraph();
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'HUGE1', -4000, -2500);
        await tc.addNode('Constant', 'HUGE2', 4000, 2500);
      });
      saveGraph();

      let appName = '';
      doWithTestController((tc) => {
        appName = tc.getGraph().name;
      });

      cy.viewport(PHONE.width, PHONE.height);
      openBottomBar();
      cy.get('[data-cy="bottom-bar-apps"]').click();
      cy.get('#graphs-list').should('be.visible');
      cy.then(() => {
        cy.get('#graphs-list').contains(appName).click();
      });
      cy.get('[data-cy="stack-view"]', { timeout: 30000 }).should('exist');

      shouldWithTestController((tc) => {
        expect(tc.getGraph().viewportScaleX, 'scale').to.be.closeTo(0.15, 0.01);
      });
    });
  });

  // A phone explores the graph: pan and zoom answer, and nothing else does.
  // Selecting, dragging, wiring and the context menus all need precision, a
  // second button or a keyboard - and a tap that moves a node by accident is a
  // change you cannot see you made.
  describe('the canvas is explore-only', () => {
    beforeEach(() => {
      cy.viewport(PHONE.width, PHONE.height);
      clearGraph();
      openBottomBar();
      cy.get('[data-cy="bottom-bar-graph"]').click();
    });

    it('says so, next to the app name', () => {
      cy.get('[data-cy="stack-explore-only"]')
        .should('exist')
        .should('contain.text', 'desktop');
    });

    it('does not select a node that is tapped', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'EXPLORE1');
      });
      clickNode('EXPLORE1');
      shouldWithTestController((tc) => {
        expect(tc.getSelectedNodes()).to.have.length(0);
      });
    });

    it('does not move a node that is dragged', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'EXPLORE2');
      });
      // the centre is read through getStableScreenCoordinates, so the node has
      // stopped settling by the time its position is recorded
      getNodeCenterById('EXPLORE2').then(([x, y]) => {
        let before: [number, number];
        doWithTestController((tc) => {
          const node = tc.getNodeByID('EXPLORE2');
          before = [node.x, node.y];
        });
        cy.get('body')
          .trigger('pointerdown', x, y, { force: true })
          .trigger('pointermove', x + 80, y + 60, { force: true })
          .trigger('pointerup', x + 80, y + 60, { force: true });
        // a tolerance, not equality: a freshly added node settles by about a
        // pixel after it is first drawn. A drag would have moved it by the 80
        // and 60 the pointer travelled, in the same direction as the pointer.
        shouldWithTestController((tc) => {
          const node = tc.getNodeByID('EXPLORE2');
          expect(Math.abs(node.x - before[0]), 'x moved').to.be.lessThan(5);
          expect(Math.abs(node.y - before[1]), 'y moved').to.be.lessThan(5);
        });
      });
    });

    it('opens no context menu on a right click', () => {
      doWithTestController(async (tc) => {
        await tc.addNode('Constant', 'EXPLORE3');
      });
      getNodeCenterById('EXPLORE3').then(([x, y]) => {
        cy.get('body').rightclick(x, y, { force: true });
      });
      cy.get('#graph-contextmenu').should('not.exist');
      cy.get('#node-contextmenu').should('not.exist');
    });
  });
});
