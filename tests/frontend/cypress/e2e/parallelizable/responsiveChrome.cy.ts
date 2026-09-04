import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';
import {
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';

// The shell's side panels are docked columns on a desktop and bottom sheets
// below the md breakpoint. The sheet layout is the one that cannot be checked
// by looking at a developer's screen, so it is checked here instead.
const DESKTOP = { width: 1280, height: 800 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const PHONE = { width: 390, height: 844 };

const RAIL_WIDTH = 48;

const openInspector = () =>
  doWithTestController((testController) =>
    testController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN),
  );

const openMenuPanel = () =>
  doWithTestController((testController) =>
    testController.toggleLeftSideDrawer(VISIBILITY_ACTION.OPEN),
  );

describe('responsive shell chrome', () => {
  before(() => {
    openNewGraph();
  });

  // testIsolation is off suite-wide, so the window size and the open panels are
  // whatever the spec before this one left behind
  beforeEach(() => {
    cy.viewport(DESKTOP.width, DESKTOP.height);
    closeBothDrawers();
  });

  afterEach(() => {
    cy.viewport(DESKTOP.width, DESKTOP.height);
  });

  // The sheet layout arrives a render after cy.viewport - useMediaQuery reports
  // the new width on the next commit - and the height then ANIMATES from the
  // column's 100dvh down to the sheet's. Both have to finish before the height
  // means anything, and a threshold cannot tell a settled sheet from a tall one
  // still on its way down, so this waits for two consecutive reads to agree.
  const settledSheetHeight = () => {
    let previous = Number.NaN;
    return cy
      .get('[data-cy="inspector-column"]')
      .should('have.attr', 'data-panel-layout', 'sheet')
      .should(($panel) => {
        const height = $panel[0].getBoundingClientRect().height;
        const settled = Math.abs(height - previous) < 0.5;
        previous = height;
        expect(settled, `sheet height settled (last read ${height})`).to.equal(
          true,
        );
      })
      .then(($panel) => $panel[0].getBoundingClientRect().height);
  };

  it('keeps the inspector a docked column on a desktop', () => {
    cy.viewport(DESKTOP.width, DESKTOP.height);
    openInspector();
    cy.get('[data-cy="inspector-column"]').should(
      'have.attr',
      'data-panel-layout',
      'column',
    );
    cy.get('[data-cy="panel-sheet-handle"]').should('not.exist');
  });

  // the point of the sheet: on a tablet a 240px minimum column left a canvas
  // strip barely wider than a node, and on a phone the panel covered the
  // canvas outright - you cannot inspect a node you cannot see
  [TABLET_PORTRAIT, PHONE].forEach((viewport) => {
    it(`shows the inspector as a bottom sheet at ${viewport.width}px`, () => {
      cy.viewport(viewport.width, viewport.height);
      openInspector();

      cy.get('[data-cy="inspector-column"]')
        .should('have.attr', 'data-panel-layout', 'sheet')
        .then(($panel) => {
          const rect = $panel[0].getBoundingClientRect();
          // anchored to the bottom, clear of the rail, and leaving the canvas
          // visible above it
          expect(rect.bottom).to.be.closeTo(viewport.height, 1);
          expect(rect.left).to.equal(RAIL_WIDTH);
          expect(rect.right).to.be.closeTo(viewport.width, 1);
          expect(rect.top).to.be.greaterThan(0);
        });
    });
  });

  it('expands and collapses the sheet from its handle', () => {
    cy.viewport(PHONE.width, PHONE.height);
    openInspector();

    let peekHeight = 0;
    settledSheetHeight().then((height) => {
      peekHeight = height;
      // a peek sheet leaves most of the canvas showing - if this ever caught
      // the column's full height the rest of the test would be meaningless
      expect(peekHeight).to.be.lessThan(PHONE.height * 0.7);
    });

    cy.get('[data-cy="panel-sheet-handle"]').click();
    cy.get('[data-cy="inspector-column"]').should(($panel) => {
      expect($panel[0].getBoundingClientRect().height).to.be.greaterThan(
        peekHeight,
      );
    });

    cy.get('[data-cy="panel-sheet-handle"]').click();
    cy.get('[data-cy="inspector-column"]').should(($panel) => {
      expect($panel[0].getBoundingClientRect().height).to.be.closeTo(
        peekHeight,
        1,
      );
    });
  });

  // both sheets occupy the same strip along the bottom, so a second one would
  // simply be drawn on top of the first
  it('opens only one sheet at a time', () => {
    cy.viewport(PHONE.width, PHONE.height);
    openInspector();
    cy.get('[data-cy="inspector-column"]').should('be.visible');

    openMenuPanel();
    cy.get('#graphs-list').should('be.visible');
    cy.get('[data-cy="inspector-column"]').should('not.be.visible');
  });

  // as columns they are neighbours, so there is nothing to close
  it('still allows both columns at once on a desktop', () => {
    cy.viewport(DESKTOP.width, DESKTOP.height);
    openInspector();
    openMenuPanel();
    cy.get('#graphs-list').should('be.visible');
    cy.get('[data-cy="inspector-column"]').should('be.visible');
  });

  // the rail has no inspector button, so this is the only way to open it -
  // it has to survive the switch to a sheet
  it('keeps the inspector reachable in sheet layout', () => {
    cy.viewport(PHONE.width, PHONE.height);
    cy.get('[data-cy="right-drawer-toggle-btn"]').should('be.visible').click();
    cy.get('[data-cy="inspector-column"]')
      .should('be.visible')
      .and('have.attr', 'data-panel-layout', 'sheet');
  });
});
