import {
  doWithTestController,
  getNodeCenterById,
  openNewGraph,
} from '../helpers';

const focusTable = () => {
  getNodeCenterById('Table2').then(([x, y]) => {
    cy.get('#pixi-container').dblclick(x, y + 40);
  });
};

describe('table', () => {
  beforeEach(() => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Table2', 'Table2', -300, -150);
      testController.setNodeInputValue('Table2', 'Data', [
        { TestColumn1: 1, TestColumn2: 2 },
      ]);
      testController.setNodeInputValue('Table2', 'Column Meta', {
        TestColumn1: { width: 100 },
      });
    });
  });

  it('Adds a table to the graph', () => {
    doWithTestController((testController) => {
      expect(
        testController.getNodes().some((node) => node.id === 'Table2'),
      ).to.eq(true);
    });
  });

  it('Try to input null into the graph via a custom node, see that input gets turned into an array', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'CustomFunction', 0, -250);
      testController.setNodeInputValue(
        'CustomFunction',
        'Code',
        '() => {return null}',
      );
      await testController.executeNodeByID('CustomFunction');

      await testController.connectNodesByID(
        'CustomFunction',
        'Table2',
        'OutData',
      );
      await testController.waitForPendingExecution();

      expect(testController.getNodeInputValue('Table2', 'Data').length).to.eq(
        1,
      );
    });
  });

  it('focus on the table', () => {
    focusTable();
  });

  it('see that table internals are visible', () => {
    focusTable();
    cy.get('.dvn-scroller').should('be.visible');
  });

  it('try deleting all data in table', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('Table2', 'Data', []);
      await testController.executeNodeByID('Table2');
      expect(
        Object.keys(testController.getNodeOutputValue('Table2', 'JSON Array'))
          .length,
      ).to.eq(0);
    });
  });

  it('Add a column back', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('Table2', 'Data', []);
      await testController.executeNodeByID('Table2');
      await testController.getNodeByID('Table2').perform_action_addColumn();
      expect(
        Object.keys(testController.getNodeOutputValue('Table2', 'JSON Array'))
          .length,
      ).to.eq(1);
    });
  });

  it('Test duplicating the table', () => {
    doWithTestController(async (testController) => {
      testController.selectNodesById(['Table2']);
      await testController.duplicateSelection();
      const tableNodes = testController
        .getNodes()
        .filter((node) => node.type?.toLowerCase?.() === 'table2');
      expect(tableNodes.length).to.eq(2);
      testController.moveNodeByID('Table2', 0, -200);
    });
  });

  it('Test writing in table', () => {
    doWithTestController(async (testController) => {
      await testController
        .getNodeByID('Table2')
        .updateCellData(0, 'TestColumn1', 'testinput');
      expect(
        testController.getNodeOutputValue('Table2', 'JSON Array')[0][
          'TestColumn1'
        ],
      ).to.eq('testinput');
    });
  });

  it('See that the duplicated table is not affected by changes to first table', () => {
    doWithTestController(async (testController) => {
      testController.selectNodesById(['Table2']);
      await testController.duplicateSelection();
      const duplicatedTableId = testController
        .getNodes()
        .find(
          (node) =>
            node.id !== 'Table2' && node.type?.toLowerCase?.() === 'table2',
        )?.id;
      expect(duplicatedTableId).to.not.eq(undefined);

      testController.setNodeInputValue('Table2', 'Data', [
        { TestColumn1: 'changed', TestColumn2: 2 },
      ]);
      await testController.executeNodeByID('Table2');

      expect(
        testController.getNodeOutputValue(duplicatedTableId, 'JSON Array')[0][
          'TestColumn1'
        ],
      ).to.eq(1);
    });
  });
});
