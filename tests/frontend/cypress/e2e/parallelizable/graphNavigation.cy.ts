import {
  clickSocket,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const shouldSelect = (nodeId: string) =>
  shouldWithTestController((controller) => {
    expect(controller.getSelectedNodes().map((node) => node.id)).to.deep.equal([
      nodeId,
    ]);
  });

const shouldBeOnScreen = (nodeId: string) =>
  shouldWithTestController((controller) => {
    const [x, y] = controller.getNodeCenterById(nodeId);
    expect(x).to.be.within(0, Cypress.config('viewportWidth'));
    expect(y).to.be.within(0, Cypress.config('viewportHeight'));
  });

const select = (nodeId: string) =>
  doWithTestController((controller) => controller.selectNodesById([nodeId]));

const shouldHaveAlpha = (nodeId: string, alpha: number) =>
  shouldWithTestController((controller) => {
    expect(controller.getNodeByID(nodeId).alpha).to.equal(alpha);
  });

// cy.realPress releases every key at the end, so Alt is held through CDP
const ALT = 1;
const KEY_CODES: Record<string, number> = {
  Alt: 18,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};
const dispatchKey = (
  type: 'keyDown' | 'keyUp',
  key: string,
  modifiers: number,
) =>
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Input.dispatchKeyEvent',
      params: {
        type,
        key,
        code: key === 'Alt' ? 'AltLeft' : key,
        windowsVirtualKeyCode: KEY_CODES[key],
        modifiers,
      },
    }),
  );
const holdAlt = () => dispatchKey('keyDown', 'Alt', ALT);
const releaseAlt = () => dispatchKey('keyUp', 'Alt', 0);
const pressWithAlt = (key: string) => {
  dispatchKey('keyDown', key, ALT);
  dispatchKey('keyUp', key, ALT);
};

// First and Second feed Middle (First into the top input, though it sits
// lower); Middle feeds Far and Farther; Loner sits below Middle without wires
describe('graph navigation', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      await controller.addNode('Constant', 'First', -400, 200);
      await controller.addNode('Constant', 'Second', -400, 0);
      await controller.addNode('Add', 'Middle', 0, 0);
      await controller.addNode('Add', 'Loner', 0, 400);
      await controller.addNode('Add', 'Far', 500, -150);
      await controller.addNode('Add', 'Farther', 500, 250);
      await controller.connectNodesByID('First', 'Middle', 'Out', 'Addend');
      await controller.connectNodesByID('Second', 'Middle', 'Out', 'Addend 2');
      // connected lower node first, so the order comes from position
      await controller.connectNodesByID(
        'Middle',
        'Farther',
        undefined,
        'Addend',
      );
      await controller.connectNodesByID('Middle', 'Far', undefined, 'Addend');
      controller.zoomToFitNodesById(['First', 'Middle', 'Loner']);
    });
    // key presses go to the app frame only once it has focus
    cy.get('#pixi-container').realClick({ x: 900, y: 600 });
  });

  it('moves to the nearest node on the canvas, connected or not', () => {
    select('Middle');
    cy.realPress('ArrowDown');
    shouldSelect('Loner');
    cy.realPress('ArrowUp');
    shouldSelect('Middle');
    cy.realPress('ArrowLeft');
    shouldSelect('Second');
  });

  it('starts at a node near the middle of the view when nothing is selected', () => {
    doWithTestController((controller) => controller.selectNodesById([]));
    cy.realPress('ArrowRight');
    shouldWithTestController((controller) => {
      expect(controller.getSelectedNodes()).to.have.length(1);
    });
  });

  it('links to the other end of a wire from the socket inspector', () => {
    doWithTestController((controller) => {
      controller.selectNodesById([]);
      controller.zoomToFitNodesById(['First', 'Middle']);
    });
    cy.wait(900);
    clickSocket('First', 'Out');
    cy.get('[data-cy="socket-connections"]')
      .should('be.visible')
      .and('contain', 'To')
      .and('contain', 'Out → Addend');
    cy.get('[data-cy="navigation-target-Middle"]').click();
    shouldSelect('Middle');
  });

  it('enters a macro with Enter and leaves it with Shift+Enter', () => {
    doWithTestController(async (controller) => {
      const macro = await controller.addNode('Macro', 'TheMacro', 0, 1200);
      await controller.addNode('ExecuteMacro', 'MacroCall', -800, 1200);
      controller.setNodeInputValue('MacroCall', 'Macro', macro.name);
      controller.selectNodesById(['MacroCall']);
    });
    cy.realPress('Enter');
    shouldSelect('TheMacro');
    cy.realPress(['Shift', 'Enter']);
    shouldSelect('MacroCall');
  });

  it('goes back and forward through the jumps', () => {
    cy.realPress(['Alt', 'Shift', 'ArrowLeft']);
    shouldSelect('TheMacro');
    cy.realPress(['Alt', 'Shift', 'ArrowLeft']);
    shouldSelect('MacroCall');
    cy.realPress(['Alt', 'Shift', 'ArrowRight']);
    shouldSelect('TheMacro');
  });

  describe('holding Alt', () => {
    beforeEach(() => select('Middle'));

    it('dims all but the node and the nodes wired to it', () => {
      holdAlt();
      shouldHaveAlpha('Loner', 0.2);
      shouldHaveAlpha('First', 1);
      shouldHaveAlpha('Far', 1);
      releaseAlt();
      shouldHaveAlpha('Loner', 1);
    });

    it('walks the sources and targets of that node, as one jump', () => {
      holdAlt();
      pressWithAlt('ArrowRight');
      shouldSelect('Far');
      pressWithAlt('ArrowDown');
      shouldSelect('Farther');
      pressWithAlt('ArrowDown');
      shouldSelect('Farther');
      pressWithAlt('ArrowLeft');
      shouldSelect('Middle');
      // sources in the order of the inputs
      pressWithAlt('ArrowLeft');
      shouldSelect('First');
      pressWithAlt('ArrowDown');
      shouldSelect('Second');
      pressWithAlt('ArrowRight');
      shouldSelect('Middle');
      pressWithAlt('ArrowRight');
      shouldSelect('Farther');
      releaseAlt();
      shouldHaveAlpha('Loner', 1);
      cy.realPress(['Alt', 'Shift', 'ArrowLeft']);
      shouldSelect('Middle');
    });

    it('starts from the newly selected node the next time', () => {
      select('First');
      holdAlt();
      shouldHaveAlpha('Second', 0.2);
      pressWithAlt('ArrowRight');
      shouldSelect('Middle');
      releaseAlt();
    });
  });

  describe('wires', () => {
    // the First → Middle wire, near its source or near its target
    const wirePoint = (t: number) =>
      doWithTestController((controller) =>
        controller.getWirePoint('First', 'Out', t),
      );
    const wireThickness = () =>
      doWithTestController(
        (controller) =>
          controller.getSocketLinks('First', 'Out')[0].lineThickness,
      );

    before(() => {
      doWithTestController((controller) => {
        controller.selectNodesById([]);
        controller.zoomToFitNodesById(['First', 'Second', 'Middle']);
      });
      cy.wait(900);
    });

    // Pixi counts canvas clicks within 200ms as a double click, wherever
    // they land, and a double click opens the node search
    beforeEach(() => cy.wait(300));

    it('thickens a wire under the pointer', () => {
      wirePoint(0.3).then(([x, y]) => {
        cy.get('#pixi-container').realHover({ position: { x, y } });
      });
      wireThickness().should('equal', 5);
      cy.get('#pixi-container').realHover({ position: { x: 900, y: 40 } });
      wireThickness().should('equal', 2);
    });

    it('goes to the target when clicked near the source', () => {
      wirePoint(0.15).then(([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      });
      shouldSelect('Middle');
      shouldWithTestController((controller) => {
        const [x, y] = controller.getNodeCenterById('Middle');
        // centered on the node's bounds, which take in its socket labels
        expect(x).to.be.closeTo(Cypress.config('viewportWidth') / 2, 50);
        expect(y).to.be.closeTo(Cypress.config('viewportHeight') / 2, 50);
      });
    });

    it('goes to the source when clicked near the target', () => {
      wirePoint(0.85).then(([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      });
      shouldSelect('First');
    });

    it('goes back to where the wire was clicked from', () => {
      cy.realPress(['Alt', 'Shift', 'ArrowLeft']);
      shouldSelect('Middle');
    });

    it('shows both ends but selects the far one when clicked in the middle', () => {
      wirePoint(0.6).then(([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      });
      shouldSelect('First');
      shouldBeOnScreen('First');
      shouldBeOnScreen('Middle');
    });

    it('still drags a selection from a wire', () => {
      select('Second');
      wirePoint(0.15).then(([x, y]) => {
        cy.get('#pixi-container')
          .realMouseDown({ x, y })
          .realMouseMove(x + 30, y + 30)
          .realMouseUp({ x: x + 30, y: y + 30 });
      });
      shouldWithTestController((controller) => {
        expect(
          controller.getSelectedNodes().map((node) => node.id),
        ).not.to.include('Middle');
      });
    });
  });

  describe('picker for a macro with several callers', () => {
    // a macro that was never entered, so Shift+Enter has no caller to return to
    before(() => {
      doWithTestController(async (controller) => {
        const macro = await controller.addNode('Macro', 'Shared', 0, 2200);
        for (const [id, y] of [
          ['Caller', 2200],
          ['OtherCaller', 2500],
        ] as const) {
          await controller.addNode('ExecuteMacro', id, -800, y);
          controller.setNodeInputValue(id, 'Macro', macro.name);
        }
      });
    });

    const openPicker = () => {
      doWithTestController((controller) => {
        controller.zoomToFitNodesById(['Shared', 'Caller', 'OtherCaller']);
        controller.selectNodesById(['Shared']);
      });
      cy.realPress(['Shift', 'Enter']);
      cy.get('[data-cy="graph-navigation-picker"]').within(() => {
        cy.get('[data-cy="navigation-target-Caller"]').should('be.visible');
        cy.get('[data-cy="navigation-target-OtherCaller"]').should(
          'be.visible',
        );
      });
    };

    it('picks a caller by number', () => {
      openPicker();
      cy.realPress('2');
      cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
      shouldSelect('OtherCaller');
    });

    it('closes on Escape without changing the selection', () => {
      openPicker();
      cy.realPress('Escape');
      cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
      shouldSelect('Shared');
    });

    it('closes on a canvas click and lets digits through again', () => {
      openPicker();
      cy.get('#pixi-container').realClick({ x: 900, y: 600 });
      cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
      cy.realPress('2');
      cy.get('[data-cy="dashboard"]').should('be.visible');
      cy.realPress('2');
      cy.get('[data-cy="dashboard"]').should('not.be.visible');
    });

    it('closes on any other key, which keeps its meaning', () => {
      openPicker();
      cy.realPress('m');
      cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
      cy.get('[data-cy="dashboard"]').should('be.visible');
      cy.realPress('m');
      cy.realPress('2');
      cy.get('[data-cy="dashboard"]').should('not.be.visible');
    });
  });
});
