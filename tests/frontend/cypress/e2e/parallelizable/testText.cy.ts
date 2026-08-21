import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  doWithTestController,
  exitDashboardEditMode,
  getStableScreenCoordinates,
  openNewGraph,
  shouldWithTestController,
  waitForStableRect,
} from '../helpers';

// the canvas editor is a single element shared by Label and Text, named
// after the socket it edits
const canvasEditorSelector = '#Label-Input';

// double-clicking the node on the canvas opens its text editor there
const editOnCanvas = (nodeId: string, text: string) => {
  getStableScreenCoordinates((testController) =>
    testController.getNodeCenterById(nodeId),
  ).then(([x, y]) => {
    cy.get('#pixi-container').dblclick(x, y);
  });

  cy.get(canvasEditorSelector).should('be.visible').type(`{selectall}${text}`);
};

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

      // the text is edited on the canvas only - the dashboard widget just
      // displays what the node outputs
      cy.get(`${widgetSelector} [contenteditable="true"]`).should('not.exist');

      // adding opened the dashboard in edit mode; leave it and let the panel
      // settle, then bring the node back into the uncovered part of the canvas
      exitDashboardEditMode();
      waitForStableRect('[data-cy="dashboard"]');
      doWithTestController((testController) => {
        testController.zoomToFitNodesById([id]);
      });

      editOnCanvas(id, editedText);

      shouldWithTestController((testController) => {
        expect(testController.getNodeOutputValue(id, 'Output')).to.eq(
          editedText,
        );
      });

      cy.get(widgetSelector).should('contain.text', editedText);
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

    editOnCanvas(id, editedText);

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
