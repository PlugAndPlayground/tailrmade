import { doWithTestController, openNewGraph } from '../helpers';

describe('Number Field grouping and Text Field keyboard', () => {
  it('Add the fields', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('WidgetNumberField', 'Year', 0, 0);
      await testController.addNode('WidgetTextField', 'Zip', 0, 300);
      testController.setNodeInputValue('Year', 'Initial Value', 2026);
      testController.setNodeInputValue('Zip', 'Initial Value', '01234');
      await testController.executeNodeByID('Year');
      await testController.executeNodeByID('Zip');
    });
  });

  it('Groups digits by default', () => {
    cy.get('#Container-Year input').should('have.value', '2,026');
  });

  it('Shows the plain number with Digit Grouping off', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('Year', 'Digit Grouping', false);
      await testController.executeNodeByID('Year');
    });
    cy.get('#Container-Year input').should('have.value', '2026');
    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('Year', 'Out')).to.eq(2026);
    });
  });

  it('Asks for a numeric keypad and keeps the value as text', () => {
    cy.get('#Container-Zip input').should('not.have.attr', 'inputmode');
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('Zip', 'Keyboard', 'numeric');
      await testController.executeNodeByID('Zip');
    });
    cy.get('#Container-Zip input').should('have.attr', 'inputmode', 'numeric');
    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('Zip', 'Out')).to.eq('01234');
    });
  });
});
