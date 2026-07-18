import {
  addToDashboard,
  clearGraph,
  closeBothDrawers,
  closeGraphsList,
  doWithTestController,
  openExistingGraph,
  openNewGraph,
  saveGraph,
} from '../helpers';

const initialHtml = `<div class="p-4 text-black">
<h2>{{title}}</h2>
<p>{{message}}</p>
</div>`;

const updatedHtml = `<div class="p-4 text-black">
<h2>{{title}}</h2>
<p>{{message}}</p>
<button>{{buttonText}}</button>
</div>`;

const renamedHtml = `<div class="p-4 text-black">
<h2>{{title}}</h2>
<p>{{message}}</p>
<button>{{newButtonText}}</button>
</div>`;

describe('testHtmlRenderer', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('Adds handlebar, creates socket, and updates data in HTML output', () => {
    const htmlNodeId = 'html-test-123';

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(htmlNodeId, 'Html', initialHtml);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Background color',
        'rgba(0, 0, 0, 0.5)',
      );
      await testController.executeNodeByID(htmlNodeId);
    });

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(htmlNodeId, 'Data', {
        title: 'Hello World',
        message: 'This is a test message',
      });
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Hello World')
      .and('contain.text', 'This is a test message');

    saveGraph();
    openExistingGraph();
    closeGraphsList();

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Hello World')
      .and('contain.text', 'This is a test message');
  });

  it('Connects constant to handlebar socket and handles renaming handlebars', () => {
    const htmlNodeId = 'amber-otter-31';
    const constantId = 'constant-test-456';
    const initialData = {
      title: 'Connected Title Value',
      message: 'Connected Message Value',
      buttonText: 'Button Text Value',
    };

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.addNode('Constant', constantId, -200, 0);
      await testController.setNodeInputValue(htmlNodeId, 'Html', initialHtml);
      await testController.setNodeInputValue(
        htmlNodeId,
        'Background color',
        'rgba(0, 0, 0, 0.5)',
      );
      await testController.executeNodeByID(htmlNodeId);
      await testController.setNodeInputValue(constantId, 'In', initialData);
      await testController.connectNodesByID(
        constantId,
        htmlNodeId,
        'Out',
        'Data',
      );
      await testController.executeNodeByID(constantId);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('contain.text', 'Connected Message Value');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(htmlNodeId, 'Html', updatedHtml);
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('contain.text', 'Connected Message Value')
      .and('contain.text', 'Button Text Value');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(htmlNodeId, 'Html', renamedHtml);
      await testController.executeNodeByID(htmlNodeId);
    });

    doWithTestController((testController) => {
      expect(testController.getSocketLinks(htmlNodeId, 'Data').length).to.eq(1);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('not.contain.text', 'Button Text Value');

    saveGraph();
    openExistingGraph();
    closeGraphsList();

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('not.contain.text', 'Button Text Value');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(htmlNodeId, 'Html', updatedHtml);
      await testController.executeNodeByID(htmlNodeId);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('contain.text', 'Button Text Value');

    saveGraph();
    openExistingGraph();
    closeGraphsList();

    doWithTestController((testController) => {
      expect(testController.getSocketLinks(htmlNodeId, 'Data').length).to.eq(1);
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Connected Title Value')
      .and('contain.text', 'Button Text Value');
  });

  it('Renders handlebar variables on both canvas and dashboard views', () => {
    const htmlNodeId = 'cerulean-heron-41';
    const initialSuffix = 'Click me';
    const updatedSuffix = 'Updated!';
    const widgetSelector = `[data-cy="widget of NODE_${htmlNodeId}"]`;
    const buttonHtml = `<div class="p-4 text-black">
<button>Button {{buttonSuffix}}</button>
</div>`;

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(htmlNodeId, 'Html', buttonHtml);
      await testController.setNodeInputValue(htmlNodeId, 'Data', {
        buttonSuffix: initialSuffix,
      });
      await testController.executeNodeByID(htmlNodeId);
      await testController.waitForPendingExecution();
    });

    cy.get(`#Container-${htmlNodeId}`).should(
      'contain.text',
      `Button ${initialSuffix}`,
    );

    addToDashboard(htmlNodeId);
    cy.get(widgetSelector).should('contain.text', `Button ${initialSuffix}`);

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(htmlNodeId, 'Data', {
        buttonSuffix: updatedSuffix,
      });
      await testController.executeNodeByID(htmlNodeId);
      testController.getNodeByID(htmlNodeId).forceRerender(false);
      await testController.waitForPendingExecution();
    });

    cy.get(`#Container-${htmlNodeId}`).should(
      'contain.text',
      `Button ${updatedSuffix}`,
    );
    cy.get(widgetSelector).should('contain.text', `Button ${updatedSuffix}`);

    saveGraph();
    openExistingGraph();
    closeGraphsList();

    cy.get(`#Container-${htmlNodeId}`).should(
      'contain.text',
      `Button ${updatedSuffix}`,
    );
    cy.get(widgetSelector).should('contain.text', `Button ${updatedSuffix}`);
  });

  it('Supports nested path syntax in handlebar variables', () => {
    const htmlNodeId = 'golden-ibis-51';
    const constantId = 'json-data-123';
    const widgetSelector = `[data-cy="widget of NODE_${htmlNodeId}"]`;
    const jsonPathHtml = `<div class="p-4 text-black">
  <h2>{{title}}</h2>
  <p>{{description}}</p>
  <ul>
    {{#each items}}
    <li>{{name}}</li>
    {{/each}}
  </ul>
  <p>First item: {{items.[0].name}}</p>
  <p>Deep property: {{nested.deep.property}}</p>
</div>`;

    const jsonData = {
      title: 'JSONPath Test',
      description: 'Testing nested property access',
      items: [
        { name: 'First Item', type: 'normal' },
        { name: 'Important Item', type: 'important' },
        { name: 'Last Item', type: 'normal' },
      ],
      nested: {
        array: [
          ['A', 'B'],
          ['C', 'D'],
        ],
        deep: {
          property: 'Deep Value',
        },
      },
    };

    doWithTestController(async (testController) => {
      await testController.addNode('HtmlRenderer', htmlNodeId, 0, 0);
      await testController.setNodeInputValue(htmlNodeId, 'Html', jsonPathHtml);
      await testController.executeNodeByID(htmlNodeId);
      await testController.addNode('Constant', constantId, -200, 0);
      await testController.setNodeInputValue(constantId, 'In', jsonData);
      await testController.connectNodesByID(
        constantId,
        htmlNodeId,
        'Out',
        'Data',
      );
      await testController.executeNodeByID(constantId);
      await testController.executeNodeByID(htmlNodeId);
      await testController.waitForPendingExecution();
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'JSONPath Test')
      .and('contain.text', 'Testing nested property access')
      .and('contain.text', 'First Item')
      .and('contain.text', 'Important Item')
      .and('contain.text', 'Last Item')
      .and('contain.text', 'First item: First Item')
      .and('contain.text', 'Deep property: Deep Value');

    addToDashboard(htmlNodeId);
    cy.get(widgetSelector)
      .should('contain.text', 'JSONPath Test')
      .and('contain.text', 'First Item')
      .and('contain.text', 'First item: First Item')
      .and('contain.text', 'Deep property: Deep Value');

    doWithTestController(async (testController) => {
      await testController.setNodeInputValue(constantId, 'In', {
        ...jsonData,
        title: 'Updated JSONPath Test',
        nested: {
          ...jsonData.nested,
          deep: {
            property: 'Updated Deep Value',
          },
        },
      });
      await testController.executeNodeByID(constantId);
      await testController.executeNodeByID(htmlNodeId);
      testController.getNodeByID(htmlNodeId).forceRerender(false);
      await testController.waitForPendingExecution();
    });

    cy.get(`#Container-${htmlNodeId}`)
      .should('contain.text', 'Updated JSONPath Test')
      .and('contain.text', 'Deep property: Updated Deep Value');
    cy.get(widgetSelector)
      .should('contain.text', 'Updated JSONPath Test')
      .and('contain.text', 'Deep property: Updated Deep Value');
  });
});
