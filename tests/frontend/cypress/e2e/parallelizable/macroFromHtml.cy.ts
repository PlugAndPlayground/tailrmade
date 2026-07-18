import { clickNode, doWithTestController, openNewGraph } from '../helpers';

describe('macro from HTML nodes', () => {
  it('Can call macro from IFrame renderer using window.macro', () => {
    const iframeNodeId = 'IFrameRenderer';

    openNewGraph();
    doWithTestController(async (testController) => {
      // Create a simple macro that adds 1 to input
      await testController.addNode('Macro', 'TestMacro');
      await testController.addNode('Add', 'Add');
      testController.moveNodeByID('Add', 200, 100);
      await testController.connectNodesByID('TestMacro', 'Add', 'Parameter 1');
      await testController.setNodeInputValue('Add', 'Addend 2', 1);
      await testController.connectNodesByID('Add', 'TestMacro', 'Added');

      // Create IFrame renderer with button that calls macro
      await testController.addNode('IFrameRenderer', iframeNodeId, 0, -300);
      const htmlWithMacroCall = `
        <div id="result">waiting</div>
        <button id="testBtn" onclick="macro('Macro0', 5).then(r => document.getElementById('result').textContent = 'result:' + r)">
          Call Macro
        </button>
      `;
      await testController.setNodeInputValue(
        iframeNodeId,
        'Html',
        htmlWithMacroCall,
      );
      await testController.setNodeInputValue(
        iframeNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(iframeNodeId);
    });

    clickNode(iframeNodeId);
    cy.get('body').type('{enter}');

    // Wait for iframe to render and click the button inside it
    cy.get('iframe')
      .its('0.contentDocument.body')
      .should('not.be.empty')
      .then(cy.wrap)
      .find('#testBtn')
      .click();

    // Verify the macro was called and returned 6 (5 + 1)
    cy.get('iframe')
      .its('0.contentDocument.body')
      .should('not.be.empty')
      .then(cy.wrap)
      .find('#result')
      .should('contain', 'result:6');
  });
});
