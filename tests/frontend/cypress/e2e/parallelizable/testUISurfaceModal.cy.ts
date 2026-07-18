import { doWithTestController, openNewGraph } from '../helpers';

const dialogSelector = '[data-cy="modal dialog of NODE_modal-1"]';
const closeBtn = '[data-cy="modal-close-btn-NODE_modal-1"]';

const setOpen = async (testController, value: boolean) => {
  testController.setNodeInputValue('modal-1', 'Open', value);
  await testController.getNodeByID('modal-1').executeOptimizedChain();
  await testController.waitForPendingExecution();
};

describe('UI modal dialog', () => {
  it('setup: a standalone (not embedded) modal node', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('UIModalNode', 'modal-1', 200, 0);
      await testController.waitForPendingExecution();
      testController.setNodeInputValue('modal-1', 'Title', 'My Dialog');
      testController.setShowUnsavedChangesWarning(false);
    });
    // not embedded, no dashboard open — the dialog is hidden
    cy.get(dialogSelector).should('not.exist');
  });

  it('opens the dialog globally even though it is standalone', () => {
    doWithTestController((testController) => setOpen(testController, true));
    cy.get(dialogSelector).should('be.visible');
    cy.get(dialogSelector).should('contain.text', 'My Dialog');
    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('modal-1', 'Is Open')).to.eq(
        true,
      );
    });
  });

  it('closes via the close button', () => {
    cy.get(closeBtn).click({ force: true });
    cy.get(dialogSelector).should('not.exist');
    doWithTestController((testController) => {
      expect(testController.getNodeInputValue('modal-1', 'Open')).to.eq(false);
    });
  });

  it('closes via Escape (dismiss on escape is on by default)', () => {
    doWithTestController((testController) => setOpen(testController, true));
    cy.get(dialogSelector).should('be.visible');
    cy.get('body').type('{esc}');
    cy.get(dialogSelector).should('not.exist');
  });

  it('closes via backdrop click (dismiss on backdrop is on by default)', () => {
    doWithTestController((testController) => setOpen(testController, true));
    cy.get(dialogSelector).should('be.visible');
    // the MUI backdrop sits behind the dialog paper
    cy.get('.MuiBackdrop-root').last().click({ force: true });
    cy.get(dialogSelector).should('not.exist');
  });

  it('respects dismiss toggles (no close when both are off)', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('modal-1', 'Dismiss on Backdrop', false);
      testController.setNodeInputValue('modal-1', 'Dismiss on Escape', false);
      await setOpen(testController, true);
    });
    cy.get(dialogSelector).should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('.MuiBackdrop-root').last().click({ force: true });
    // still open — only the explicit close button (always present) dismisses
    cy.get(dialogSelector).should('be.visible');
    cy.get(closeBtn).click({ force: true });
    cy.get(dialogSelector).should('not.exist');
  });
});
