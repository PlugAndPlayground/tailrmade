import {
  addToDashboard,
  assertFocusedNodeId,
  clickNode,
  closeBothDrawers,
  doWithTestController,
  exitDashboardEditMode,
  openNewGraph,
} from '../helpers';

const testText = 'This is a test line';
const testTextDashboard = 'This is a test line from dashboard';
const testTextCanvas = 'This is a test line from canvas';

const ignoreMonacoCanceledRejections = () => {
  cy.window().then((window) => {
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason?.name === 'Canceled') {
        event.preventDefault();
      }
    });
  });
};

const focusCodeEditor = (dataCyId: string, x = 80, y = 20) => {
  cy.get(`[data-cy="${dataCyId}"]`)
    .should('be.visible')
    .find('.view-lines')
    .click(x, y, { force: true });
};

const focusCodeEditorInput = (dataCyId: string) => {
  cy.get(`[data-cy="${dataCyId}"]`)
    .should('be.visible')
    .find('.native-edit-context')
    .click({ force: true });
};

const assertCodeEditorContainsText = (dataCyId: string, text: string) => {
  cy.get(`[data-cy="${dataCyId}"]`)
    .find('.view-lines')
    .should(($el) => {
      const normalizedText = $el.text().replace(/\u00a0/g, ' ');
      expect(normalizedText).to.contain(text);
    });
};

const waitForPendingExecution = () => {
  doWithTestController(async (testController) => {
    await testController.waitForPendingExecution();
  });
};

const selectAllInFocusedEditor = () => {
  cy.realPress(
    Cypress.platform === 'darwin' ? ['Meta', 'A'] : ['Control', 'A'],
  );
  cy.wait(50);
};

const typeIntoFocusedEditor = (text: string, addTrailingNewline = false) => {
  selectAllInFocusedEditor();
  cy.realType(text, { delay: 40 });

  if (addTrailingNewline) {
    cy.realPress('Enter');
  }
};

const typeIntoDashboardCodeEditor = (
  dataCyId: string,
  text: string,
  addTrailingNewline = false,
) => {
  focusCodeEditor(dataCyId);
  focusCodeEditorInput(dataCyId);
  cy.document().should((doc) => {
    const activeElement = doc.activeElement;
    expect(activeElement?.closest(`[data-cy="${dataCyId}"]`)).to.not.eq(null);
  });
  typeIntoFocusedEditor(text, addTrailingNewline);

  cy.get('body').click(20, 20, { force: true });
  waitForPendingExecution();
};

const typeIntoCanvasCodeEditor = (
  nodeId: string,
  text: string,
  addTrailingNewline = false,
) => {
  clickNode(nodeId);
  cy.wait(350);
  clickNode(nodeId);
  assertFocusedNodeId(nodeId);
  focusCodeEditorInput(`${nodeId}-canvas`);
  typeIntoFocusedEditor(text, addTrailingNewline);
  cy.get('body').type('{esc}', { force: true });
  waitForPendingExecution();
};

const assertCodeEditorOutputEquals = (nodeId: string, text: string) => {
  doWithTestController((testController) => {
    const output = testController.getNodeOutputValue(nodeId, 'output');
    expect(output.replace(/\r\n/g, '\n')).to.eq(text);
  });
};

describe('testCodeEditor', () => {
  beforeEach(() => {
    openNewGraph();
    closeBothDrawers();
    ignoreMonacoCanceledRejections();
  });

  it('Adds node and writes', () => {
    const nodeId = 'CodeEditor';

    doWithTestController(async (testController) => {
      await testController.addNode('CodeEditor', nodeId, 0, 0);
    });

    typeIntoCanvasCodeEditor(nodeId, testText);

    assertCodeEditorContainsText(`${nodeId}-canvas`, testText);
    doWithTestController((testController) => {
      expect(testController.getNodeInputValue(nodeId, 'input')).to.eq(testText);
      expect(testController.getNodeOutputValue(nodeId, 'output')).to.eq(
        testText,
      );
    });
  });

  it('Adds node to dashboard and tests syncing both ways', () => {
    const nodeId = 'orange-stingray-61';

    doWithTestController(async (testController) => {
      await testController.addNode('CodeEditor', nodeId, 0, 0);
    });

    cy.get('[data-cy="toggle-dashboard-btn"]').click({ force: true });
    addToDashboard(nodeId);

    typeIntoCanvasCodeEditor(nodeId, testText, true);

    assertCodeEditorOutputEquals(nodeId, `${testText}\n`);

    exitDashboardEditMode();
    typeIntoDashboardCodeEditor(`${nodeId}-dashboard`, testTextDashboard);

    assertCodeEditorOutputEquals(nodeId, testTextDashboard);
    assertCodeEditorContainsText(`${nodeId}-canvas`, testTextDashboard);

    typeIntoCanvasCodeEditor(nodeId, testTextCanvas);

    assertCodeEditorOutputEquals(nodeId, testTextCanvas);
    assertCodeEditorContainsText(`${nodeId}-dashboard`, testTextCanvas);
  });
});
