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
} from '../helpers';

const constantEditor = '[data-cy="constant-string-editor"]';

// a new Constant String opens its editor; Escape leaves it
const closeEditor = () => {
  cy.get(constantEditor).type('{esc}');
  cy.get(constantEditor).should('not.exist');
};

// double-clicking a Constant String on the canvas edits its text in place
const doubleClickNode = (nodeId: string) => {
  getStableScreenCoordinates((testController) =>
    testController.getNodeCenterById(nodeId),
  ).then(([x, y]) => {
    cy.get('#pixi-container').dblclick(x, y);
  });
};

describe('testText', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('edits a Constant String in place on the canvas', () => {
    const id = 'amber-otter-11';

    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', id, 0, -200);
      testController.setNodeInputValue(id, 'String', 'Initial text');
      await testController.executeNodeByID(id);
    });
    closeEditor();

    doubleClickNode(id);
    cy.get(constantEditor)
      .should('be.visible')
      .and('have.text', 'Initial text')
      .and(($editor) => {
        expect($editor[0].ownerDocument.activeElement).to.eq($editor[0]);
      })
      .type('{selectall}Edited{enter}on two lines');
    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(id, 'String')).to.eq(
        'Edited\non two lines',
      );
    });

    // Escape leaves the editor and shows the canvas text again
    cy.get(constantEditor).type('{esc}');
    cy.get(constantEditor).should('not.exist');
  });

  it('opens a new Constant String ready to type into', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', 'typed-string', 0, 0);
    });
    cy.get(constantEditor)
      .should(($editor) => {
        expect($editor[0].ownerDocument.activeElement).to.eq($editor[0]);
      })
      .type('Typed right away');
    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue('typed-string', 'String')).to.eq(
        'Typed right away',
      );
    });
  });

  it('types a new Constant Number, committing only real numbers', () => {
    const numberEditor = '[data-cy="constant-number-editor"]';
    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_Number', 'typed-number', 0, 0);
    });
    cy.get(numberEditor).type('{selectall}-');
    // "-" is on its way to a number, so the value is unchanged
    shouldWithTestController((testController) => {
      expect(testController.getNodeInputValue('typed-number', 'Number')).to.eq(
        0,
      );
    });
    // letters can never be part of a number, so they are not typed
    cy.get(numberEditor).type('4x.5').should('have.text', '-4.5');
    shouldWithTestController((testController) => {
      expect(testController.getNodeInputValue('typed-number', 'Number')).to.eq(
        -4.5,
      );
    });
    // Enter finishes a number rather than adding a line
    cy.get(numberEditor).type('{enter}');
    cy.get(numberEditor).should('not.exist');
  });

  it('does not edit a Constant String whose value is linked', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'linked-source', -300, 0);
      await testController.addNode('CONSTANT_String', 'linked-string', 0, 0);
      await testController.connectNodesByID(
        'linked-source',
        'linked-string',
        'Out',
        'String',
      );
      await testController.waitForPendingExecution();
    });
    // linking the value closes the editor the new node opened with
    cy.get(constantEditor).should('not.exist');
    doubleClickNode('linked-string');
    cy.get(constantEditor).should('not.exist');
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

  it('undo restores Constant String text edited on the canvas', () => {
    const id = 'scarlet-lynx-33';
    const initialText = 'Initial canvas text';
    const editedText = 'Edited canvas text';

    doWithTestController(async (testController) => {
      await testController.addNode('CONSTANT_String', id, 0, 0);
      testController.setNodeInputValue(id, 'String', initialText);
      await testController.executeNodeByID(id);
    });
    closeEditor();

    doubleClickNode(id);
    cy.get(constantEditor).type(`{selectall}${editedText}`);

    doWithTestController((testController) => {
      expect(testController.getNodeInputValue(id, 'String')).to.eq(editedText);
    });

    // leave the editor before undoing - ctrl+z inside the contenteditable
    // would trigger the browser's own text undo instead of the app's
    cy.get('#pixi-container').click(100, 500);
    cy.get(constantEditor).should('not.exist');

    cy.get('body').type(`${controlOrMetaKey()}z`);

    doWithTestController((testController) => {
      expect(testController.getNodeInputValue(id, 'String')).to.eq(initialText);
    });
  });
});
