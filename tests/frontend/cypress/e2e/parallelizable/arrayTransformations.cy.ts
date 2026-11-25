import { doWithTestController, openNewGraph } from '../helpers';

describe('arrayTransformations', () => {
  it('Add nodes', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', 'Constant');
      await testController.addNode('MapNode', 'MapNode', 200, 100);
      await testController.addNode('Filter', 'Filter', 200, -100);
    });
  });

  it('Set values and connect', () => {
    doWithTestController(async (testController) => {
      await testController.connectNodesByID('Constant', 'MapNode');
      await testController.connectNodesByID('Constant', 'Filter');
      await testController.waitForPendingExecution();
      await testController.setNodeInputValue(
        'MapNode',
        'Code',
        '(a, index) => a+1',
      );
      await testController.setNodeInputValue('Filter', 'Code', '(a) => a < 2');
      await testController.setNodeInputValue('Constant', 'In', [1, 2, 3, 4]);
      await testController.executeNodeByID('Constant');
    });
  });

  it('Check results of map and filter', () => {
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('MapNode', 'Array')[0]).to.eq(2);
      expect(testController.getNodeOutputValue('Filter', 'Array').length).to.eq(
        1,
      );
    });
  });
});

describe('Transform (Map) Array worker errors', () => {
  const failures = [
    {
      name: 'a missing console global at runtime',
      code: '(item) => { console.log(item); return item * 2; }',
      message: /'console' is not defined/,
    },
    {
      name: 'a syntax error in a console.log statement',
      code: '(item) => { console.log(item; return item * 2; }',
      message: /expecting ','/,
    },
  ];

  for (const { name, code, message } of failures) {
    it(`reports ${name} on the node with chunking enabled`, () => {
      openNewGraph();
      doWithTestController(async (controller) => {
        await controller.addNode('MapNode', 'map');
        expect(controller.getNodeInputValue('map', 'Execute in Chunks')).to.be
          .true;
        controller.setNodeInputValue('map', 'Array', [1, 2]);
        controller.setNodeInputValue('map', 'Code', code);
        await controller.executeNodeByID('map');

        expect(controller.getNodeOutputValue('map', 'Array')).to.deep.equal([]);
        const status = controller.getNodeByID('map').status.node;
        expect(status.isError(), 'node has an execution error').to.be.true;
        expect(status.message).to.match(message);
      });
    });
  }
});
