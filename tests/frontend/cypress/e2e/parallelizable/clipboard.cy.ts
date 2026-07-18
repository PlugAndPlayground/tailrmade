import { openNewGraph } from '../helpers';

describe('clipboard', () => {
  it('copies selected nodes after interacting with a node even if document text was selected', () => {
    openNewGraph();

    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'write').as('clipboardWrite').resolves();
    });

    cy.window()
      .its('testController', { timeout: 120000 })
      .then(async (testController) => {
        testController.setShowUnsavedChangesWarning(false);
        await testController.addNode('Constant', 'CopyCandidate');
        testController.selectNodesById(['CopyCandidate']);
      });

    cy.window().then((win) => {
      const marker = win.document.createElement('div');
      marker.id = 'copy-repro-marker';
      marker.textContent = 'STALE_SELECTION_MARKER';
      marker.style.position = 'absolute';
      marker.style.left = '20px';
      marker.style.top = '20px';
      win.document.body.appendChild(marker);

      const range = win.document.createRange();
      range.selectNodeContents(marker);
      const selection = win.document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      expect(selection?.toString()).to.eq('STALE_SELECTION_MARKER');
    });

    cy.window()
      .its('testController')
      .then((testController) =>
        testController.getNodeCenterById('CopyCandidate'),
      )
      .then(([x, y]) => {
        cy.get('body').click(x, y);
      });

    cy.window().then((win) => {
      win.document.dispatchEvent(
        new win.Event('copy', { bubbles: true, cancelable: true }),
      );
    });

    cy.get('@clipboardWrite')
      .should('have.been.calledOnce')
      .then(async (clipboardWrite) => {
        const clipboardItems = clipboardWrite.getCall(0).args[0];
        const textBlob = await clipboardItems[0].getType('text/plain');
        const clipboardText = await textBlob.text();

        expect(clipboardText).to.contain('"nodes"');
        expect(clipboardText).to.contain('CopyCandidate');
        expect(clipboardText).not.to.contain('STALE_SELECTION_MARKER');
      });
  });
});
