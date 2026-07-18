import {
  controlOrMetaKey,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('multi-node editing - basic', () => {
  it('add two CONSTANT_String nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', 'ConstantString1', 0, 0);
      await testController.addNode(
        'CONSTANT_String',
        'ConstantString2',
        200,
        0,
      );
    });
  });

  it('select both nodes via ctrl-a', () => {
    cy.get('body').type(`${controlOrMetaKey()}a`);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('open inspector and see common filter buttons', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('#inspector-filter-common').should('exist');
    cy.get('#inspector-filter-in').should('exist');
    cy.get('#inspector-filter-out').should('exist');
  });

  it('see update behaviour section', () => {
    cy.get('#inspector-common-content').should('exist');
    cy.get('[data-cy="update-now-button"]').should('exist');
  });

  it('click Update now button', () => {
    cy.get('[data-cy="update-now-button"]').click();
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('toggle on load checkbox', () => {
    cy.get('#inspector-common-content')
      .contains('on load')
      .parent()
      .find('input[type="checkbox"]')
      .first()
      .click();
    doWithTestController((testController) => {
      const nodes = testController.getSelectedNodes();
      nodes.forEach((node) => {
        expect(node.updateBehaviour).to.have.property('load');
      });
    });
  });

  it('click In filter to show input sockets', () => {
    cy.get('#inspector-filter-in').click();
    cy.get('body').contains('In').should('exist');
  });

  it('edit socket value on all selected nodes', () => {
    cy.get('[data-cy="textinput"]').eq(0).type('{selectall}Hello');
    cy.wait(100);
    doWithTestController((testController) => {
      const value1 = testController.getNodeOutputValue(
        'ConstantString1',
        'String',
      );
      const value2 = testController.getNodeOutputValue(
        'ConstantString2',
        'String',
      );
      expect(value1).to.eq('Hello');
      expect(value2).to.eq('Hello');
    });
  });

  it('toggle visibility on all selected nodes', () => {
    cy.get('[data-cy="socket-visible-button"]').first().click();
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });
});

describe('multi-node editing - different types', () => {
  it('add nodes of different types', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant1', 0, 0);
      await testController.addNode('Add', 'Add1', 200, 0);
    });
  });

  it('select both nodes', () => {
    cy.get('body').type(`${controlOrMetaKey()}a`);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('open inspector and see update behaviour', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('#inspector-common-content').should('exist');
    cy.get('[data-cy="update-now-button"]').should('exist');
  });
});

describe('multi-node editing - triggers', () => {
  it('add two State nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('State', 'State1', 0, 0);
      await testController.addNode('State', 'State2', 200, 0);
    });
  });

  it('select both nodes', () => {
    cy.get('body').type(`${controlOrMetaKey()}a`);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('open inspector and see trigger tab', () => {
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('#inspector-filter-trigger').should('exist');
  });

  it('click trigger filter to show trigger sockets', () => {
    // under heavy load the previous test's drawer-open state can lag or
    // drop between tests, so reopen defensively instead of assuming it's
    // still open (mirrors exitDashboardEditMode's check-then-toggle
    // pattern in helpers.ts); check the toggle button's own icon rather
    // than the filter element, since the latter's absence can also mean
    // the trigger sockets themselves are still being computed
    cy.get('body').then(($body) => {
      if (
        $body.find('[data-cy="right-drawer-toggle-btn"] svg[data-testid="TuneIcon"]')
          .length > 0
      ) {
        cy.get('[data-cy="right-drawer-toggle-btn"]').click();
      }
    });
    cy.get('#inspector-filter-trigger').should('exist').click();
    cy.get('body').contains('Add').should('exist');
  });
});
