import { doWithTestController, openNewGraph } from '../helpers';
describe('importing third party libraries and using', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('LoadNPM', 'LoadNPM');
      await testController.addNode('CustomFunction', 'CustomFunction');
    });
  });
  it('Set up nodes, connect them', () => {
    doWithTestController(async (testController) => {
      // set it to load chartjs
      testController.setNodeInputValue('LoadNPM', 'Package Name', 'chart.js');
      testController.setNodeInputValue('CustomFunction', 'Main Thread', true);
      testController.moveNodeByID('CustomFunction', 200, 0);

      await testController.connectNodesByID(
        'LoadNPM',
        'CustomFunction',
        'NpmPackage',
        'a',
      );
      await testController.executeNodeByID('LoadNPM');
    });
  });
  it('See that the imported module makes it through as expected (once all is loaded)', () => {
    // see that its there and loaded
    doWithTestController(async (testController) => {
      await testController.executeNodeByID('CustomFunction');
    });
    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue('CustomFunction', 'OutData').Chart
          .register,
      ).to.not.be.undefined; // we check that this function has survived through all this
    });
  });
});
