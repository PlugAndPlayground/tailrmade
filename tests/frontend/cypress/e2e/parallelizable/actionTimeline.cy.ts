import { doWithTestController, openNewGraph } from '../helpers';

describe('Action timeline', () => {
  const openActionTimeline = () => {
    cy.get('[data-cy="actionsButton"]').click();
    cy.get('[data-cy="Action Timeline"]').should('be.visible');
  };

  it('shows human and AI actions and can jump through the action chain', () => {
    openNewGraph();
    doWithTestController((testController) => {
      testController.clearActionHistory();
    });

    openActionTimeline();
    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '0 in chain, 0 applied',
    );
    cy.contains('No actions yet.').should('be.visible');

    doWithTestController(async (testController) => {
      await testController.addNodeAction('Constant', 'timeline-human-node');
    });
    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '1 in chain, 1 applied',
    );

    doWithTestController(async (testController) => {
      await testController.addNodeAction(
        'Constant',
        'timeline-ai-node',
        220,
        0,
        'ai',
      );
    });

    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '2 in chain, 2 applied',
    );
    cy.get('[data-cy="action-timeline-row-0"]')
      .should('contain', 'Add Node')
      .and('contain', 'Human action')
      .find('[data-cy="action-source-human"]')
      .should('exist');
    cy.get('[data-cy="action-timeline-row-1"]')
      .should('contain', 'Add Node')
      .and('contain', 'AI action')
      .find('[data-cy="action-source-ai"]')
      .should('exist');

    cy.get('[data-cy="action-timeline-initial"]').click();
    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '2 in chain, 0 applied',
    );
    doWithTestController((testController) => {
      expect(testController.getNodeByID('timeline-human-node')).to.not.exist;
      expect(testController.getNodeByID('timeline-ai-node')).to.not.exist;
    });

    cy.get('[data-cy="action-timeline-row-0"]').click();
    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '2 in chain, 1 applied',
    );
    doWithTestController((testController) => {
      expect(testController.getNodeByID('timeline-human-node')).to.exist;
      expect(testController.getNodeByID('timeline-ai-node')).to.not.exist;
    });

    cy.get('[data-cy="action-timeline-row-1"]').click();
    cy.get('[data-cy="action-timeline-header"]').should(
      'contain',
      '2 in chain, 2 applied',
    );
    doWithTestController((testController) => {
      expect(testController.getNodeByID('timeline-human-node')).to.exist;
      expect(testController.getNodeByID('timeline-ai-node')).to.exist;
    });
  });
});
