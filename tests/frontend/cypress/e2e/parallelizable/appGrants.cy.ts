import { doWithTestController, openNewGraph } from '../helpers';

const nothingGranted = {
  fullAccess: false,
  keys: [],
  hosts: [],
  companion: false,
  storage: [],
  ai: false,
  intervals: false,
};
const rawHtml = '<img src="x" onerror="window.ranInlineHandler = true">';

describe('App grants', () => {
  before(() => {
    openNewGraph();
  });

  it('blocks code, requests and unsanitised HTML that were not granted', () => {
    doWithTestController(async (testController) => {
      testController.setAppGrants(nothingGranted);
      await testController.addNode('CustomFunction', 'code');
      await testController.addNode('HTTPNode', 'http');
      await testController.addNode('HtmlRenderer', 'html');
      testController.setNodeInputValue(
        'code',
        'Code',
        '() => {\n\treturn "ran";\n}',
      );
      testController.setNodeInputValue('html', 'Html', rawHtml);
      testController.setNodeInputValue('html', 'Sanitize input', false);
      await testController.executeNodeByID('code');
      await testController.executeNodeByID('http');
      await testController.executeNodeByID('html');

      expect(testController.getNodeOutputValue('code', 'OutData')).not.to.equal(
        'ran',
      );
      expect(testController.getNodeByID('code').status.node.message).to.equal(
        'Off for this app: running code',
      );
      expect(testController.getNodeByID('http').status.node.message).to.equal(
        'Off for this app: connecting to tailrmade.app',
      );
      expect(
        testController.getNodeOutputValue('html', 'Parsed Html'),
      ).not.to.contain('onerror');
    });
  });

  it('runs them once everything is granted', () => {
    doWithTestController(async (testController) => {
      testController.setAppGrants('all');
      await testController.executeNodeByID('code');
      await testController.executeNodeByID('html');

      expect(testController.getNodeOutputValue('code', 'OutData')).to.equal(
        'ran',
      );
      expect(
        testController.getNodeOutputValue('html', 'Parsed Html'),
      ).to.contain('onerror');
    });
  });
});
