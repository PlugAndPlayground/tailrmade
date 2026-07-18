// TODO flesh out
import { doWithTestController, openNewGraph } from '../helpers';
describe('serializeLogic', () => {
  let serialized = undefined;
  it('Add nodes and connect', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add1');
      await testController.addNode('Add', 'Add2');
    });
    // connect nodes together
    doWithTestController(async (testController) => {
      await testController.moveNodeByID('Add1', -200, 0);
      await testController.connectNodesByID('Add1', 'Add2', 'Added');
    });
  });

  it('clear graph', () => {
    // serialize and clear it
    doWithTestController(async (testController) => {
      serialized = testController.getGraph().getSerializedStoredGraph();
      await testController.getGraph().clear();
      expect(testController.getNodes().length).to.eq(0);
    });
  });

  it('deserialize', () => {
    // deserialize, see if it looks any similar
    doWithTestController(async (testController) => {
      await testController.getGraph().configure(serialized);
    });
    doWithTestController((testController) => {
      expect(testController.getNodes().length).to.eq(2);
    });
  });
});
