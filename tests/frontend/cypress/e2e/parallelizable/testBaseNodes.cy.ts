import { doWithTestController, openNewGraph } from '../helpers';

describe('testBaseNodes', () => {
  it('Comparison', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('Comparison', 'Comparison');
    });
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('Comparison', 'A', 400);
      testController.setNodeInputValue('Comparison', 'B', 300);
      await testController.executeNodeByID('Comparison');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Comparison', 'Output')).to.eq(
        true,
      );
      await testController.setNodeInputValue('Comparison', 'A', 200);
      await testController.executeNodeByID('Comparison');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Comparison', 'Output')).to.eq(
        false,
      );
      testController.setNodeInputValue(
        'Comparison',
        'Operator',
        'Logical AND (&&)',
      );
      testController.setNodeInputValue('Comparison', 'A', true);
      testController.setNodeInputValue('Comparison', 'B', true);
      await testController.executeNodeByID('Comparison');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('Comparison', 'Output')).to.eq(
        true,
      );
      testController.setNodeInputValue('Comparison', 'A', true);
      testController.setNodeInputValue('Comparison', 'B', false);
      await testController.executeNodeByID('Comparison');
    });
    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('Comparison', 'Output')).to.eq(
        false,
      );
    });
  });

  it('IsValid', () => {
    openNewGraph();
    doWithTestController(async (testController) => {
      await testController.addNode('IsValid', 'IsValid');
    });
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('IsValid', 'A', null);
      await testController.executeNodeByID('IsValid');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('IsValid', 'Output')).to.eq(
        true,
      );
      testController.setNodeInputValue('IsValid', 'A', undefined);
      await testController.executeNodeByID('IsValid');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('IsValid', 'Output')).to.eq(
        true,
      );
      testController.setNodeInputValue('IsValid', 'A', 1);
      await testController.executeNodeByID('IsValid');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('IsValid', 'Output')).to.eq(
        false,
      );
      testController.setNodeInputValue(
        'IsValid',
        'Condition',
        'is NOT undefined',
      );
      testController.setNodeInputValue('IsValid', 'A', undefined);
      await testController.executeNodeByID('IsValid');
    });
    doWithTestController(async (testController) => {
      expect(testController.getNodeOutputValue('IsValid', 'Output')).to.eq(
        false,
      );
      testController.setNodeInputValue('IsValid', 'A', true);
      await testController.executeNodeByID('IsValid');
    });
    doWithTestController((testController) => {
      expect(testController.getNodeOutputValue('IsValid', 'Output')).to.eq(
        true,
      );
    });
  });
});
