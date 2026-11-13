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

describe('graph navigation', () => {
  before(() => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      await controller.addNode('Constant', 'First', -400, 0);
      await controller.addNode('Constant', 'Second', -400, 200);
      await controller.addNode('Add', 'Middle', 0, 0);
      await controller.addNode('Add', 'Far', 3000, 0);
      await controller.addNode('Add', 'Farther', 3000, 400);
      await controller.connectNodesByID('First', 'Middle', 'Out', 'Addend');
      await controller.connectNodesByID('Second', 'Middle', 'Out', 'Addend 2');
      await controller.connectNodesByID('Middle', 'Far', undefined, 'Addend');
      await controller.connectNodesByID(
        'Middle',
        'Farther',
        undefined,
        'Addend',
      );
      controller.zoomToFitNodesById(['First', 'Middle']);
    });
    // key presses go to the app frame only once it has focus
    cy.get('#pixi-container').realClick({ x: 900, y: 600 });
  });

  it('jumps straight to the only node upstream', () => {
    doWithTestController((controller) => controller.selectNodesById(['Far']));
    cy.realPress(['Alt', 'ArrowLeft']);
    shouldSelect('Middle');
  });

  it('offers a picker when several nodes are downstream', () => {
    doWithTestController((controller) =>
      controller.selectNodesById(['Middle']),
    );
    cy.realPress(['Alt', 'ArrowRight']);
    // both targets are called "Add (+)", so they are told apart by id
    cy.get('[data-cy="graph-navigation-picker"]').within(() => {
      cy.get('[data-cy="navigation-target-Far"]').should('be.visible');
      cy.get('[data-cy="navigation-target-Farther"]').should('be.visible');
    });
    cy.realPress('2');
    cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
    shouldSelect('Farther');
    shouldBeOnScreen('Farther');
  });

  it('goes back and forward through the jumps', () => {
    cy.realPress(['Shift', 'Alt', 'ArrowLeft']);
    shouldSelect('Middle');
    cy.realPress(['Shift', 'Alt', 'ArrowRight']);
    shouldSelect('Farther');
  });

  it('closes the picker on Escape without changing the selection', () => {
    doWithTestController((controller) =>
      controller.selectNodesById(['Middle']),
    );
    cy.realPress(['Alt', 'ArrowLeft']);
    cy.get('[data-cy="graph-navigation-picker"]').should('be.visible');
    cy.realPress('Escape');
    cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
    shouldSelect('Middle');
  });

  it('closes the picker on a canvas click and lets digits through again', () => {
    doWithTestController((controller) =>
      controller.selectNodesById(['Middle']),
    );
    cy.realPress(['Alt', 'ArrowRight']);
    cy.get('[data-cy="graph-navigation-picker"]').should('be.visible');
    cy.get('#pixi-container').realClick({ x: 900, y: 600 });
    cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
    cy.realPress('2');
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.realPress('2');
    cy.get('[data-cy="dashboard"]').should('not.be.visible');
  });

  it('closes the picker on any other key, which keeps its meaning', () => {
    doWithTestController((controller) =>
      controller.selectNodesById(['Middle']),
    );
    cy.realPress(['Alt', 'ArrowRight']);
    cy.get('[data-cy="graph-navigation-picker"]').should('be.visible');
    cy.realPress('m');
    cy.get('[data-cy="graph-navigation-picker"]').should('not.exist');
    cy.get('[data-cy="dashboard"]').should('be.visible');
    cy.realPress('m');
    cy.realPress('2');
    cy.get('[data-cy="dashboard"]').should('not.be.visible');
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
      await controller.addNode('ExecuteMacro', 'Caller', -800, 1200);
      controller.setNodeInputValue('Caller', 'Macro', macro.name);
      controller.selectNodesById(['Caller']);
    });
    cy.realPress('Enter');
    shouldSelect('TheMacro');
    cy.realPress(['Shift', 'Enter']);
    shouldSelect('Caller');
  });
});
