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
  shouldWithTestController,
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

\`\`\`
cy.get('body')
  .type('Enter')
\`\`\``;

const resultInHtml = `<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">word</span></p><p class="editor-paragraph" dir="ltr"><b><strong class="editor-text-bold" style="white-space: pre-wrap;">word</strong></b></p><p class="editor-paragraph" dir="ltr"><i><b><strong class="editor-text-bold editor-text-italic" style="white-space: pre-wrap;">word</strong></b></i></p><h1 class="editor-heading-h1" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h1><h3 class="editor-heading-h3" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h3><h5 class="editor-heading-h5" dir="ltr"><span style="white-space: pre-wrap;">test line</span></h5><ul class="editor-list-ul"><li value="1" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li><li value="2" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li></ul><ol class="editor-list-ol"><li value="1" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li><li value="2" class="editor-listitem" dir="ltr"><span style="white-space: pre-wrap;">test line</span></li></ol><blockquote class="editor-quote" dir="ltr"><span style="white-space: pre-wrap;">test line</span></blockquote><pre class="editor-code" spellcheck="false"><span style="white-space: pre-wrap;">cy.get('body')
  .type('Enter')</span></pre>`;

const normalizeEditorHtml = (html) =>
  html
    .replace(/ dir="ltr"/g, '')
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

// leaves canvas interaction mode AND drops DOM focus - a focused editor
// ignores externally loaded markdown
const leaveCanvasEditor = (nodeId: string) => {
  cy.window().then((win) =>
    (win.document.activeElement as HTMLElement)?.blur(),
  );
  doWithTestController(async (testController) => {
    await (testController.getNodeByID(nodeId) as any).disableInteraction();
  });
  getEditor(`${nodeId}-canvas`).should('have.attr', 'contenteditable', 'false');
};

const externalMarkdown = `# Title

**bold** and *italic* with [a link](https://example.com) and \`code\`

- one
- two

1. first
2. second

\`\`\`
const x = 1;
\`\`\`

| a | b |
| --- | --- |
| 1 | 2 |`;

const waitForMentionMenu = () => {
  logCypressStep('waitForMentionMenu', 'text editor mentions', 'WAIT MENTION');
  cy.get('[data-cy="text-token-picker"]', { timeout: 10000 }).should(
    'be.visible',
  );
  cy.get('[data-cy="text-token-picker-option"]', { timeout: 10000 })
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
    shouldWithTestController((testController) => {
      // the chip is visual only: plain text is the value, the markdown the path
      expect(testController.getNodeOutputValue('TextEditor2', 'Plain')).to.eq(
        '42',
      );
      expect(
        testController.getNodeOutputValue('TextEditor2', 'Markdown'),
      ).to.eq('# {{Input}}');
    });
  });

  it('Loads external markdown into the editor and all three outputs', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TextEditor2', 'TextEditor2', -400, -300);
    });
    waitForEditableCanvasEditor('TextEditor2');
    leaveCanvasEditor('TextEditor2');

    doWithTestController(async (testController) => {
      testController.setNodeInputValue(
        'TextEditor2',
        'Markdown',
        externalMarkdown,
      );
      await testController.executeNodeByID('TextEditor2');
    });

    getEditor('TextEditor2-canvas').within(() => {
      cy.contains('h1', 'Title');
      cy.contains('strong', 'bold');
      cy.contains('em', 'italic');
      cy.get('a[href="https://example.com"]').should('contain.text', 'a link');
      cy.get('ul li').should('have.length', 2);
      cy.get('ol li').should('have.length', 2);
      cy.contains('code', 'code');
      // the editor renders code blocks as <code>; <pre> is the HTML export
      cy.contains('code.editor-code', 'const x = 1;');
    });

    shouldWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue('TextEditor2', 'Markdown'),
      ).to.eq(externalMarkdown);
      const plain = testController.getNodeOutputValue('TextEditor2', 'Plain');
      expect(plain).to.contain('Title');
      expect(plain).to.contain('bold and italic with a link and code');
      expect(plain).to.contain('const x = 1;');
      expect(plain).to.contain('| a | b |');
      const html = testController.getNodeOutputValue('TextEditor2', 'HTML');
      expect(html).to.contain('<h1');
      expect(html).to.contain('editor-text-bold');
      expect(html).to.contain('editor-text-italic');
      expect(html).to.contain('href="https://example.com"');
      expect(html).to.contain('<ul');
      expect(html).to.contain('<ol');
      expect(html).to.contain('<pre');
    });
  });

  it('Is editable on the canvas only in interaction mode and in the running app only', () => {
    const nodeId = 'editable-text-editor';
    doWithTestController(async (testController) => {
      await testController.addNode('TextEditor2', nodeId, -400, -300);
    });
    waitForEditableCanvasEditor(nodeId);
    leaveCanvasEditor(nodeId);

    addToDashboard(nodeId);
    // edit mode gates the widget content so craft owns the pointer
    cy.get(`[data-cy="${nodeId}-dashboard"]`)
      .closest('[inert]')
      .should('exist');

    exitDashboardEditMode();
    getEditor(`${nodeId}-dashboard`)
      .should('have.attr', 'contenteditable', 'true')
      .click({ force: true })
      .type(testTextDashboard, { force: true });
    cy.get('[data-cy="toggle-app-button"]').click({ force: true });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue(nodeId, 'Plain')).to.contain(
        testTextDashboard,
      );
    });
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
