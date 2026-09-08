import {
  addToDashboard,
  activateCanvasHybridNode,
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  dragFromAtoB,
  doWithTestController,
  logCypressStep,
  openNewGraph,
  exitDashboardEditMode,
} from '../helpers';

const testText = 'test line';
const testTextDashboard = 'test line dashboard';
const testTextCanvas = 'test line canvas';
const testWord = 'word';

const resultInMarkdown = `word

**word**

***word***

# test line

### test line

##### test line

- test line
- test line

1. test line
2. test line

> test line

\`\`\`javascript
cy.get('body')
  .type('Enter')
\`\`\``;

const resultInHtml = `<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">word</span></p><p class="editor-paragraph" dir="ltr"><b><strong class="editor-text-bold" style="white-space: pre-wrap;">word</strong></b></p><p class="editor-paragraph" dir="ltr"><i><b><strong class="editor-text-bold editor-text-italic" style="white-space: pre-wrap;">word</strong></b></i></p><h1 class="editor-heading-h1" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h1><h3 class="editor-heading-h3" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h3><h5 class="editor-heading-h5" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h5><ul class="editor-list-ul"><li value="1" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li><li value="2" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li></ul><ol class="editor-list-ol"><li value="1" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li><li value="2" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li></ol><blockquote class="editor-quote" dir="ltr"><span style="white-space: pre-wrap;">test line</span></blockquote><pre class="editor-code" spellcheck="false" data-language="javascript" data-highlight-language="javascript"><span style="white-space: pre-wrap;">cy.get('body')
  .type('Enter')</span></pre>`;

const normalizeEditorHtml = (html) =>
  html
    .replace(/ dir="ltr"/g, '')
    .replace(/ data-highlight-language="javascript"/g, '')
    .replace(
      /(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/g,
      (_, open, inner, close) =>
        open +
        inner.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '') +
        close,
    );

const focusEditor = (dataCyId: string, x = 120, y = 40) => {
  logCypressStep('focusEditor', dataCyId, 'FOCUS EDITOR');
  cy.get(`[data-cy="${dataCyId}"]`)
    .should('be.visible')
    .click(x, y, { force: true });
};

const getEditor = (dataCyId: string) => cy.get(`[data-cy="${dataCyId}"]`);

const waitForEditableCanvasEditor = (nodeId: string) => {
  logCypressStep('waitForEditableCanvasEditor', nodeId, 'WAIT EDITABLE');
  cy.get(`#Container-${nodeId}`).should('have.css', 'pointer-events', 'auto');
  getEditor(`${nodeId}-canvas`).should('have.attr', 'contenteditable', 'true');
};

const waitForMentionMenu = () => {
  logCypressStep('waitForMentionMenu', 'text editor mentions', 'WAIT MENTION');
  cy.get('[data-cy="text-editor-mention-menu"]', { timeout: 10000 }).should(
    'be.visible',
  );
  cy.get('[data-cy="text-editor-mention-option"]', { timeout: 10000 })
    .its('length')
    .should('be.gte', 1);
};

describe('testTextEditor', () => {
  before(() => {
    openNewGraph();
  });
  beforeEach(() => {
    cy.showMousePosition();
    clearGraph();
    closeBothDrawers();
  });

  it('Drags link and displays value', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TextEditor2', 'TextEditor2', -100, -200);
      await testController.addNode('Constant', 'Constant', -400, -200);
    });
    cy.wait(1000);
    cy.get('body').click(300, 300, { force: true });

    doWithTestController((testController) => {
      const [startX, startY] =
        testController.getSocketCenterByNodeIDAndSocketName('Constant', 'Out');
      const [endX, endY] = testController.getNodeCenterById('TextEditor2');
      dragFromAtoB(startX, startY, endX, endY, true);
    });
    dragFromAtoB(100, 400, 100, 450, true);

    doWithTestController((testController) => {
      const [x, y] = testController.getNodeCenterById('TextEditor2');
      cy.get('body').dblclick(x, y + 40);
    });
    waitForEditableCanvasEditor('TextEditor2');
    focusEditor('TextEditor2-canvas');
    getEditor('TextEditor2-canvas')
      .type(`${controlOrMetaKey()}{alt}1`)
      .type('@');
    waitForMentionMenu();
    getEditor('TextEditor2-canvas').type('{enter}{esc}');

    cy.get('#Container-TextEditor2').should('contain.text', '0');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue('Constant', 'In', 42);
      await testController.executeNodeByID('Constant');
    });

    cy.get('#Container-TextEditor2').should('contain.text', '42');
  });
  // it('Adds node to dashboard and tests syncing both ways', () => {
  //   const nodeId = 'orange-stingray-61';

  //   doWithTestController(async (testController) => {
  //     await testController.addNode('TextEditor2', nodeId, -100, -300);
  //   });

  //   cy.wait(1000);
  //   cy.get(`[data-cy="${nodeId}-canvas"]`).should('be.visible');

  //   getEditor(`${nodeId}-canvas`)
  //     .type(testText, { force: true })
  //     .type('{enter}{esc}', { force: true });

  //   cy.get(`#Container-${nodeId}`).should('contain.text', testText);
  //   doWithTestController((testController) => {
  //     expect(testController.getNodeOutputValue(nodeId, 'Plain')).to.eq(
  //       testText,
  //     );
  //   });

  //   addToDashboard(nodeId);
  //   exitDashboardEditMode();

  //   focusEditor(`${nodeId}-dashboard`);
  //   cy.focused().type(testTextDashboard, { force: true });
  //   cy.get('[data-cy="toggle-app-button"]').click({ force: true });

  //   doWithTestController((testController) => {
  //     expect(testController.getNodeOutputValue(nodeId, 'Plain')).to.contain(
  //       testTextDashboard,
  //     );
  //   });
  //   activateCanvasHybridNode(nodeId);
  //   waitForEditableCanvasEditor(nodeId);
  //   cy.get(`[data-cy="${nodeId}-canvas"]`).should(
  //     'contain.text',
  //     testTextDashboard,
  //   );

  //   activateCanvasHybridNode(nodeId);
  //   waitForEditableCanvasEditor(nodeId);
  //   getEditor(`${nodeId}-canvas`)
  //     .type(testTextCanvas, { force: true })
  //     .type('{esc}', { force: true });
  //   cy.get('[data-cy="toggle-app-button"]').click({ force: true });
  //   cy.get(`[data-cy="${nodeId}-canvas"]`).should(
  //     'contain.text',
  //     testTextCanvas,
  //   );
  //   cy.get(`[data-cy="${nodeId}-dashboard"]`).should(
  //     'contain.text',
  //     testTextCanvas,
  //   );
  // });

  it('Adds node and writes', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TextEditor2', 'TextEditor2', -400, -300);
    });

    // cy.wait(1000);
    waitForEditableCanvasEditor('TextEditor2');
    cy.get('[data-cy="TextEditor2-canvas"]')
      .should('be.visible')
      .type(testText)
      .type('{enter}')
      .type(`${controlOrMetaKey()}b`)
      .type(testText)
      .type('{esc}');

    cy.get('#Container-TextEditor2').should('contain.text', testText);

    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('TextEditor2', 'Plain')).to.eq(
        `${testText}\n\n${testText}`,
      );
    });
  });

  it('Applies all formatting options', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TextEditor2', 'TextEditor2', -400, -300);
    });
    waitForEditableCanvasEditor('TextEditor2');
    cy.get('[data-cy="TextEditor2-canvas"]')
      .should('be.visible')
      .type(testWord)
      .type('{enter}')
      .type(`${controlOrMetaKey()}b`)
      .type(testWord)
      .type('{enter}')
      .type(`${controlOrMetaKey()}i`)
      .type(testWord)
      .type(`${controlOrMetaKey()}b`)
      .type(`${controlOrMetaKey()}i`)
      .type('{enter}')
      .type(`${controlOrMetaKey()}{alt}1`)
      .type(testText)
      .type('{enter}')
      .type(`${controlOrMetaKey()}{alt}3`)
      .type(testText)
      .type('{enter}')
      .type(`${controlOrMetaKey()}{alt}5`)
      .type(testText)
      .type('{enter}')
      .type(`${controlOrMetaKey()}{shift}8`)
      .type(testText)
      .type('{enter}')
      .type(testText)
      .type('{enter}')
      .type('{enter}')
      .type('{enter}')
      .type(`${controlOrMetaKey()}{shift}7`)
      .type(testText)
      .type('{enter}')
      .type(testText)
      .type('{enter}')
      .type('{enter}')
      .type('{enter}> ')
      .type(testText)
      .type('{enter}')
      .type('{enter}``` ')
      .type(`cy.get('body')\n  .type('Enter')`)
      .type('{esc}');

    cy.get('#Container-TextEditor2').should('contain.text', testText);

    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue('TextEditor2', 'Markdown'),
      ).to.eq(resultInMarkdown);
      expect(
        normalizeEditorHtml(
          testController.getNodeOutputValue('TextEditor2', 'HTML'),
        ),
      ).to.eq(normalizeEditorHtml(resultInHtml));
    });
  });

  // it('Creates link manually using toolbar button and verifies markdown', () => {
  //   const nodeId = 'link-test-manual';
  //   const linkText = 'Click here';
  //   const testUrl = 'https://example.com';

  //   doWithTestController(async (testController) => {
  //     await testController.addNode('TextEditor2', nodeId, -100, -300);
  //   });

  //   activateCanvasHybridNode(nodeId);
  //   waitForEditableCanvasEditor(nodeId);
  //   focusEditor(`${nodeId}-canvas`);
  //   getEditor(`${nodeId}-canvas`)
  //     .type(linkText, { force: true })
  //     .type(`${controlOrMetaKey()}a`, { force: true });
  //   cy.get('[data-cy="link-button"]')
  //     .should('be.visible')
  //     .and('not.be.disabled')
  //     .realClick();
  //   cy.get('[data-cy="link-input"]')
  //     .should('be.visible')
  //     .and('not.be.disabled')
  //     .clear({ force: true })
  //     .type(testUrl, { force: true });
  //   cy.get('body').type('{enter}{esc}');

  //   doWithTestController((testController) => {
  //     expect(testController.getNodeOutputValue(nodeId, 'Markdown')).to.eq(
  //       `[${linkText}](${testUrl})`,
  //     );
  //   });
  // });

  // it('Creates link manually using keyboard shortcut and verifies markdown', () => {
  //   const nodeId = 'link-test-shortcut';
  //   const linkText = 'Visit our site';
  //   const testUrl = 'https://tailrmade.app';

  //   doWithTestController(async (testController) => {
  //     await testController.addNode('TextEditor2', nodeId, -100, -300);
  //   });

  //   activateCanvasHybridNode(nodeId);
  //   waitForEditableCanvasEditor(nodeId);
  //   focusEditor(`${nodeId}-canvas`);
  //   getEditor(`${nodeId}-canvas`)
  //     .type(linkText, { force: true })
  //     .type(`${controlOrMetaKey()}a`, { force: true })
  //     .type(`${controlOrMetaKey()}k`, { force: true });
  //   cy.get('[data-cy="link-input"]')
  //     .should('be.visible')
  //     .and('not.be.disabled')
  //     .clear()
  //     .type(testUrl);
  //   cy.get('[title="Add link"]').click({ force: true });
  //   cy.get('body').type('{esc}');

  //   doWithTestController((testController) => {
  //     expect(testController.getNodeOutputValue(nodeId, 'Markdown')).to.eq(
  //       `[${linkText}](${testUrl})`,
  //     );
  //   });
  // });
});
