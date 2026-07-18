import { doWithTestController, openNewGraph } from '../helpers';

describe('checkNodesForErrors', () => {
  let numNodes = 0;
  it('add one of each node', () => {
    openNewGraph();

    doWithTestController((testController) =>
      testController.getAllDefinedNodeTypes(),
    ).then((allNodeTypes) => {
      cy.log('all node types: ' + JSON.stringify(allNodeTypes));
      numNodes = allNodeTypes.length;

      return cy.wrap(allNodeTypes).each((nodeType, index) => {
        cy.log(
          `[${index + 1}/${allNodeTypes.length}] Adding node: ${nodeType}`,
        );

        return doWithTestController(async (testController) => {
          const node = await testController.addNode(nodeType, nodeType);

          const rawNode = testController.getNodeByID(node.id);
          const timesExecuted = rawNode.debug_timesExecuted;
          const timesExecutedChildren = rawNode.debug_timesExecutedChildren;
          const totalTimesExecuted = timesExecuted + timesExecutedChildren;
          const hasError = testController.doesNodeHaveError(node.id);

          cy.log(
            `  ${nodeType}: hasError=${hasError}, timesExecuted=${timesExecuted}, timesExecutedChildren=${timesExecutedChildren}, total=${totalTimesExecuted}`,
          );

          expect(hasError, node.name + ', any errors?').to.eq(false);
          expect(
            totalTimesExecuted,
            `${nodeType}: expected total executions < 2, got timesExecuted=${timesExecuted} + timesExecutedChildren=${timesExecutedChildren}`,
          ).to.be.below(2);

          await testController.removeNode(node.id);
        });
      });
    });
  });
});
