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

const select = (nodeId: string) =>
  doWithTestController((controller) => controller.selectNodesById([nodeId]));

// First and Second feed Middle; Loner sits below Middle without any wires
describe('graph navigation', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      await controller.addNode('Constant', 'First', -400, 200);
      await controller.addNode('Constant', 'Second', -400, 0);
      await controller.addNode('Add', 'Middle', 0, 0);
      await controller.addNode('Add', 'Loner', 0, 400);
      await controller.connectNodesByID('First', 'Middle', 'Out', 'Addend');
      await controller.connectNodesByID('Second', 'Middle', 'Out', 'Addend 2');
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

  it('leaves Alt+Arrow to the nodes', () => {
    cy.realPress(['Alt', 'ArrowLeft']);
    shouldSelect('TheMacro');
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
