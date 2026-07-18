import {
  controlOrMetaKey,
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

const customCode = '(Bingus) => {return Bingus;}';

describe('widget nodes', () => {
  it('add node', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('CustomFunction', 'CustomFunction', 100, 0);
      testController.setNodeInputValue('CustomFunction', 'Code', customCode);
    });
  });
  it('Add widget node in front of it', () => {
    doWithTestController(async (testController) => {
      const socket = testController
        .getNodeByID('CustomFunction')
        .getInputSocketByName('Code');
      await testController
        .getGraph()
        .perform_action_addConnectedNode(socket, 'CodeEditor');
    });
  });
  it('verify node was created and with the right value', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodes().length).to.eq(2);
      const id =
        testController.getNodes()[testController.getNodes().length - 1].id;
      expect(testController.getNodeOutputValue(id, 'output')).to.eq(customCode);
    });
  });

  it('Add toggle node', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('WidgetSwitch', 'WidgetSwitch', 0, -200);
    });
  });
  it('Set toggle to enable', () => {
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('WidgetSwitch', 'Initial Value', true);
      await testController.executeNodeByID('WidgetSwitch');
    });
  });

  it('save and reload', () => {
    saveGraph();
    openExistingGraph();
  });
  it('check that switch is enabled ', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('WidgetSwitch', 'Out')).to.eq(
        true,
      );
    });
  });
});
