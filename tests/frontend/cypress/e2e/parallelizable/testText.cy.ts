import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('testText', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  [
    { name: 'Label', id: 'amber-otter-11' },
    { name: 'Text', id: 'cerulean-heron-22' },
  ].forEach(({ name, id }) => {
    it(`adds ${name} node to dashboard and tests editability`, () => {
      const initialText = `Initial ${name} Text`;
      const editedText = `Edited ${name} Text`;
      const widgetSelector = `[data-cy="widget of NODE_${id}"]`;

      doWithTestController(async (testController) => {
        await testController.addNode(name, id, 0, -200);
        await testController.setNodeInputValue(id, 'Font size', 80);
        await testController.setNodeInputValue(id, 'Input', initialText);
        await testController.executeNodeByID(id);
      });

      doWithTestController((testController) => {
        expect(testController.getNodeOutputValue(id, 'Output')).to.eq(
          initialText,
        );
      });

      addToDashboard(id);

      cy.get('[data-cy="dashboard"]').should('be.visible');
      cy.get(widgetSelector)
        .should('be.visible')
        .and('contain.text', initialText);

      cy.get(`${widgetSelector} div[contenteditable="true"]`)
        .first()
        .should('be.visible')
        .click({ force: true })
        .type('{selectall}')
        .type(editedText)
        .type('{enter}');

      doWithTestController((testController) => {
        expect(testController.getNodeOutputValue(id, 'Output')).to.eq(
          editedText,
        );
      });

      cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });

      cy.get(`${widgetSelector} div[contenteditable="false"]`)
        .first()
        .should('be.visible')
        .and('contain.text', editedText);
    });
  });

  it('undo restores Label text edited on the canvas', () => {
    const id = 'scarlet-lynx-33';
    const initialText = 'Initial canvas text';
    const editedText = 'Edited canvas text';

    doWithTestController(async (testController) => {
      await testController.addNode('Label', id, 0, 0);
      await testController.setNodeInputValue(id, 'Input', initialText);
      await testController.executeNodeByID(id);
    });

    doWithTestController((testController) => {
      const [x, y] = testController.getNodeCenterById(id);
      cy.get('#pixi-container').dblclick(x, y);
    });

    cy.get('#Label-Input')
      .should('be.visible')
      .type(`{selectall}${editedText}`);

    doWithTestController((testController) => {
      expect(testController.getNodeInputValue(id, 'Input')).to.eq(editedText);
    });

    // leave the editor before undoing - ctrl+z inside the contenteditable
    // would trigger the browser's own text undo instead of the app's
    cy.get('#pixi-container').click(100, 500);

    cy.get('body').type(`${controlOrMetaKey()}z`);

    doWithTestController((testController) => {
      expect(testController.getNodeInputValue(id, 'Input')).to.eq(initialText);
    });
  });
});
