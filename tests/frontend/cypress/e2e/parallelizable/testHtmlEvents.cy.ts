import {
  assertFocusedNodeId,
  clearGraph,
  clickNode,
  closeBothDrawers,
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

const htmlWithClickEvent = `<div class="p-4">
  <button id="testBtn" data-tm-event-click='{"listener": "onButtonClick", "data": {"action": "test-action", "value": 42}}' class="bg-blue-500 text-white p-2 rounded">
    Click Me
  </button>
</div>`;

const htmlWithKeyboardEvent = `<div class="p-4">
  <input id="keyInput"
    data-tm-event-keydown='{"listener": "onKeyPress", "data": {"context": "search"}}'
    type="text"
    class="border p-2"
    placeholder="Press a key..." />
</div>`;

const htmlWithMultipleButtonsTargetingSameListener = `<div class="p-4 space-y-2">
  <button id="btn1" data-tm-event-click='{"listener": "sharedHandler", "data": {"buttonId": 1}}' class="bg-blue-500 text-white p-2 rounded">
    Button 1
  </button>
  <button id="btn2" data-tm-event-click='{"listener": "sharedHandler", "data": {"buttonId": 2}}' class="bg-green-500 text-white p-2 rounded">
    Button 2
  </button>
</div>`;

const htmlTargetingNodeName = `<div class="p-4">
  <button id="testBtn" data-tm-event-click='{"listener": "myCustomListener", "data": {"test": true}}' class="p-2">Click</button>
</div>`;

const htmlWithInputClick = `<div class="p-4">
  <input id="clickableInput"
    data-tm-event-click='{"listener": "onInputClick", "data": {"purpose": "target-test"}}'
    type="text"
    value="test value"
    class="border p-2" />
</div>`;

const htmlWithRenameableListener = `<div class="p-4">
  <button id="testBtn" data-tm-event-click='{"listener": "originalName", "data": {"test": true}}' class="p-2">Click</button>
</div>`;

const enterCanvasHtmlEditMode = (nodeId: string) => {
  clickNode(nodeId);
  cy.wait(350);
  clickNode(nodeId);
  assertFocusedNodeId(nodeId);
};

describe('testHtmlEvents', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('HTMLEventListener receives events when targeted by node name', () => {
    const htmlNodeId = 'teal-tiger-01';
    const listenerNodeId = 'blue-whale-02';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const node = testController.getNodeByID(listenerNodeId);
      node.setNodeName('onButtonClick');

      const htmlNode = await testController.addNode(
        'HtmlRenderer',
        htmlNodeId,
        0,
        0,
      );
      htmlNode.getInputSocketByName('Html').data = htmlWithClickEvent;
      htmlNode.getInputSocketByName('Sanitize input').data = false;
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);

    doWithTestController((testController) => {
      expect(testController.getNodeByID(listenerNodeId).nodeName).to.eq(
        'onButtonClick',
      );
    });
  });

  it('Click event passes correct data through HTMLEventListener', () => {
    const htmlNodeId = 'html-event-test-2';
    const listenerNodeId = 'listener-test-2';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('onButtonClick');

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithClickEvent,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);
    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #testBtn`).click({ force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ action: 'test-action', value: 42 });

      const eventDetails = testController.getNodeOutputValue(
        listenerNodeId,
        'Event Details',
      );
      expect(eventDetails.type).to.eq('click');
      expect(eventDetails).to.have.property('clientX');
      expect(eventDetails).to.have.property('clientY');

      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Event Type'),
      ).to.eq('click');
    });
  });
  it('Keyboard event captures key information', () => {
    const htmlNodeId = 'html-event-test-3';
    const listenerNodeId = 'listener-test-3';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('onKeyPress');

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithKeyboardEvent,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);
    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #keyInput`)
      .click({ force: true })
      .type('A', { force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      const eventDetails = testController.getNodeOutputValue(
        listenerNodeId,
        'Event Details',
      );

      expect(eventDetails.type).to.eq('keydown');
      expect(eventDetails.key).to.eq('A');
      expect(eventDetails.code).to.eq('KeyA');
      expect(eventDetails).to.have.property('shiftKey');
      expect(eventDetails).to.have.property('ctrlKey');
    });
  });
  it('Multiple HTML elements can target the same listener', () => {
    const htmlNodeId = 'html-multi-target';
    const listenerNodeId = 'listener-shared';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('sharedHandler');

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithMultipleButtonsTargetingSameListener,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);
    enterCanvasHtmlEditMode(htmlNodeId);

    cy.get(`#Container-${htmlNodeId} #btn1`).click({ force: true });
    cy.wait(300);
    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ buttonId: 1 });
    });

    cy.get(`#Container-${htmlNodeId} #btn2`).click({ force: true });
    cy.wait(300);
    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ buttonId: 2 });
    });
  });
  it('Listener is identified by node name', () => {
    const htmlNodeId = 'html-node-name-test';
    const listenerNodeId = 'listener-name-test';
    const listenerNodeName = 'myCustomListener';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName(listenerNodeName);

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlTargetingNodeName,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);
    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #testBtn`).click({ force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ test: true });
    });
  });
  it('Events persist after save and reload', () => {
    const htmlNodeId = 'html-event-persist-test';
    const listenerNodeId = 'listener-persist-test';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('onButtonClick');

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithClickEvent,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    saveGraph();
    openExistingGraph();
    closeBothDrawers();

    doWithTestController((testController) => {
      expect(testController.getNodeByID(listenerNodeId).nodeName).to.eq(
        'onButtonClick',
      );
    });

    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #testBtn`).click({ force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ action: 'test-action', value: 42 });
    });
  });
  it('Event details include target element info', () => {
    const htmlNodeId = 'html-event-target-test';
    const listenerNodeId = 'listener-target-test';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('onInputClick');

      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithInputClick,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.wait(500);
    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #clickableInput`).click({ force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      const eventDetails = testController.getNodeOutputValue(
        listenerNodeId,
        'Event Details',
      );

      expect(eventDetails.target).to.not.eq(undefined);
      expect(eventDetails.target.tagName).to.eq('INPUT');
      expect(eventDetails.target.id).to.eq('clickableInput');
      expect(eventDetails.target.value).to.eq('test value');
      expect(eventDetails.target.type).to.eq('text');
    });
  });
  it('HTML content updates when listener is renamed', () => {
    const htmlNodeId = 'html-rename-test';
    const listenerNodeId = 'listener-rename-test';

    doWithTestController(async (testController) => {
      await testController.addNode('HTMLEventListener', listenerNodeId, 400, 0);
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('originalName');
    });
    cy.wait(200);

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Html',
        htmlWithRenameableListener,
      );
      await testController.setNodeInputValue(
        htmlNodeId,
        'Sanitize input',
        false,
      );
      await testController.executeNodeByID(htmlNodeId);
    });
    cy.wait(500);

    doWithTestController((testController) => {
      const listenerNode = testController.getNodeByID(listenerNodeId);
      listenerNode.setNodeName('newName');
    });
    cy.wait(300);

    doWithTestController((testController) => {
      const updatedHtml = testController.getNodeInputValue(htmlNodeId, 'Html');
      expect(updatedHtml).to.contain('"listener": "newName"');
      expect(updatedHtml).to.not.contain('"listener": "originalName"');
    });

    doWithTestController(async (testController) => {
      await testController.executeNodeByID(htmlNodeId);
    });
    cy.wait(300);

    enterCanvasHtmlEditMode(htmlNodeId);
    cy.get(`#Container-${htmlNodeId} #testBtn`).click({ force: true });
    cy.wait(300);

    doWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue(listenerNodeId, 'Custom Data'),
      ).to.deep.eq({ test: true });
    });
  });
});
