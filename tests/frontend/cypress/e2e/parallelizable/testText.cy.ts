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

// the Label's canvas editor is a single element named after the socket it
// edits
const labelEditorSelector = '#Label-Input';

// double-clicking the node on the canvas opens its text editor there
const editLabelOnCanvas = (nodeId: string, text: string) => {
  getStableScreenCoordinates((testController) =>
    testController.getNodeCenterById(nodeId),
  ).then(([x, y]) => {
    cy.get('#pixi-container').dblclick(x, y);
  });

  cy.get(labelEditorSelector).should('be.visible').type(`{selectall}${text}`);
};

describe('testText', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('adds Label node to dashboard and tests editability', () => {
    const id = 'amber-otter-11';
    const initialText = 'Initial Label Text';
    const editedText = 'Edited Label Text';
    const widgetSelector = `[data-cy="widget of NODE_${id}"]`;

    doWithTestController(async (testController) => {
      await testController.addNode('Label', id, 0, -200);
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

    editLabelOnCanvas(id, editedText);

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(id, 'Output')).to.eq(editedText);
    });

    cy.get(widgetSelector).should('contain.text', editedText);
  });

  it('edits a Text node on the canvas and in edit mode, never in the app', () => {
    const id = 'cerulean-heron-22';
    const widgetSelector = `[data-cy="widget of NODE_${id}"]`;
    const canvasEditor = `[data-cy="${id}-canvas"]`;

    doWithTestController(async (testController) => {
      await testController.addNode('Text', id, 0, -200);
    });
    // a new Text node opens straight into editing on the canvas, focused
    cy.get(canvasEditor)
      .should('have.attr', 'contenteditable', 'true')
      .and(($editor) => {
        expect($editor[0].ownerDocument.activeElement).to.eq($editor[0]);
      })
      .type('{selectall}{backspace}Written on canvas', { force: true });
    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(id, 'Output')).to.eq(
        'Written on canvas',
      );
    });

    addToDashboard(id);
    cy.get(widgetSelector).should('contain.text', 'Written on canvas');
    // surface edit mode: the widget's text is editable in place
    cy.get(`${widgetSelector} [contenteditable="true"]`)
      .click({ force: true })
      .type(`${controlOrMetaKey()}a`, { force: true })
      .type('Written in edit mode', { force: true });
    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(id, 'Output')).to.eq(
        'Written in edit mode',
      );
    });

    // the running app only shows the text
    exitDashboardEditMode();
    cy.get(widgetSelector)
      .should('contain.text', 'Written in edit mode')
      .find('[contenteditable]')
      .should('not.exist');

    doWithTestController(async (testController) => {
      testController.setNodeInputValue(id, 'Content', 'Set from the graph');
      await testController.executeNodeByID(id);
    });
    cy.get(widgetSelector).should('contain.text', 'Set from the graph');
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

    editLabelOnCanvas(id, editedText);

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
