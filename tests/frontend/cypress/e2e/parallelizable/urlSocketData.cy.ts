import {
  doWithTestController,
  openGraphWithURLParams,
  openNewGraph,
  saveGraph,
  shouldWithTestController,
} from '../helpers';

const hackedCode = '() => "hacked"';

describe('setSocketData links', () => {
  let graphId: string;

  // Targets a graph saved in this browser, the case where a crafted link does
  // the most damage
  const openWithSocketData = (entries: object[]) =>
    openGraphWithURLParams(
      `loadLocalGraph=${graphId}&setSocketData=${encodeURIComponent(
        JSON.stringify(entries),
      )}`,
    );

  before(() => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'code');
      await testController.addNode('Constant', 'constant');
    });
    saveGraph();
    doWithTestController((testController) => {
      graphId = testController.getGraph().id;
    });
  });

  it('refuses a link that changes code, and applies none of its changes', () => {
    openWithSocketData([
      { node: 'constant', socket: 'In', data: 42 },
      { node: 'code', socket: 'Code', data: hackedCode },
    ]);
    cy.contains('This link tried to change code in').should('exist');
    cy.get('[data-cy="urlSocketDataDialog"]').should('not.exist');
    doWithTestController((testController) => {
      expect(testController.getNodeInputValue('code', 'Code')).not.to.equal(
        hackedCode,
      );
      expect(testController.getNodeInputValue('constant', 'In')).not.to.equal(
        42,
      );
    });
  });

  it('refuses a link that changes a protected setting', () => {
    openWithSocketData([{ node: 'code', socket: 'Main Thread', data: true }]);
    cy.contains('This link tried to change a protected setting in').should(
      'exist',
    );
    cy.get('[data-cy="urlSocketDataDialog"]').should('not.exist');
  });

  it('leaves the app unchanged when the user opens without changes', () => {
    openWithSocketData([{ node: 'constant', socket: 'In', data: 42 }]);
    cy.get('[data-cy="urlSocketDataOpenUnchangedButton"]').click();
    cy.get('[data-cy="urlSocketDataDialog"]').should('not.exist');
    doWithTestController((testController) => {
      expect(testController.getNodeInputValue('constant', 'In')).not.to.equal(
        42,
      );
    });
  });

  it('applies plain data when the user opens with changes', () => {
    openWithSocketData([{ node: 'constant', socket: 'In', data: 42 }]);
    cy.get('[data-cy="urlSocketDataDialog"]').should('contain', 'In');
    cy.get('[data-cy="urlSocketDataOpenButton"]').click();
    cy.get('[data-cy="urlSocketDataDialog"]').should('not.exist');
    shouldWithTestController((testController) => {
      expect(testController.getNodeInputValue('constant', 'In')).to.equal(42);
    });
  });
});
