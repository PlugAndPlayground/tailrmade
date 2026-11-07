import {
  addToDashboard,
  assertOnlySelectedNodeId,
  assertSelectedNodesCount,
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  getNodeCenterById,
  getSocketCenterByNodeIDAndSocketName,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';
import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';

const textNodeId = 'text-with-widget';
const secondTextNodeId = 'second-text-with-widget';
const plainNodeId = 'plain-without-widget';
const socketsNodeId = 'node-with-socket-widgets';
const ASSERT_TIMEOUT = 8000;

const widget = (elementId: string) => `[data-cy="widget of ${elementId}"]`;
const indicator = (elementId: string) =>
  `[data-cy="indicatorbox of ${elementId}"]`;

const clickWidget = (elementId: string) =>
  cy.get(widget(elementId)).filter(':visible').first().click({ force: true });

// a person's press lasts long enough for the viewport to react to it, which a
// simulated click does not
const pressNode = (nodeId: string, options = {}) => {
  getNodeCenterById(nodeId).then(([x, y]) => {
    cy.get('body').realMouseDown({ x, y, ...options });
    cy.wait(200);
    cy.get('body').realMouseUp({ x, y, ...options });
  });
};

// keeps every node clear of the dashboard panel; selecting a widget reopens the
// drawer, so this also runs between presses
const frameNodes = (nodeIds = [textNodeId, secondTextNodeId, plainNodeId]) => {
  doWithTestController((testController) => {
    testController.toggleRightSideDrawer(VISIBILITY_ACTION.CLOSE);
    testController.zoomToFitNodesById(nodeIds);
    testController.getGraph().viewport.zoomPercent(-0.5, true);
  });
};

const viewportPosition = (testController) => {
  const { x, y } = testController.getGraph().viewport;
  return [Math.round(x), Math.round(y)];
};

const nodeIds = (testController) =>
  testController.getNodes().map((node) => node.id);

describe('Graph selection while editing the UI', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    cy.viewport(1600, 900);
    clearGraph();
    closeBothDrawers();
    doWithTestController(async (testController) => {
      await testController.addNode('Text', textNodeId, -400, -300);
      await testController.addNode('Text', secondTextNodeId, -400, 300);
      await testController.addNode('Constant', plainNodeId, 600, 300);
    });
    addToDashboard(textNodeId);
    addToDashboard(secondTextNodeId);
    frameNodes();
    doWithTestController((testController) => {
      testController.unselectDashboardItems();
      testController.selectNodesById([]);
    });
    cy.get(indicator(`NODE_${secondTextNodeId}`)).should('not.exist');
  });

  it('selects a node and its widget on click, without moving the graph', () => {
    cy.window()
      .its('testController')
      .then((testController) => {
        const before = viewportPosition(testController);
        pressNode(textNodeId);
        assertOnlySelectedNodeId(textNodeId, ASSERT_TIMEOUT);
        cy.get(indicator(`NODE_${textNodeId}`)).should('be.visible');
        // long enough for the viewport's 750ms move to have got somewhere
        cy.wait(300);
        shouldWithTestController((controller) => {
          expect(viewportPosition(controller)).to.deep.eq(before);
        });
        assertOnlySelectedNodeId(textNodeId, ASSERT_TIMEOUT);
      });
  });

  it('still brings the node into view when its widget is selected', () => {
    cy.window()
      .its('testController')
      .then((testController) => {
        const before = viewportPosition(testController);
        clickWidget(`NODE_${secondTextNodeId}`);
        assertOnlySelectedNodeId(secondTextNodeId, ASSERT_TIMEOUT);
        shouldWithTestController((controller) => {
          expect(viewportPosition(controller)).not.to.deep.eq(before);
        });
      });
  });

  it('deletes the selected node, not the widget selected before it', () => {
    clickWidget(`NODE_${textNodeId}`);
    cy.get(indicator(`NODE_${textNodeId}`)).should('be.visible');
    frameNodes();

    pressNode(plainNodeId);
    assertOnlySelectedNodeId(plainNodeId, ASSERT_TIMEOUT);
    cy.get(indicator(`NODE_${textNodeId}`)).should('not.exist');

    cy.realPress('Delete');

    shouldWithTestController((testController) => {
      expect(nodeIds(testController)).not.to.include(plainNodeId);
    });
    cy.get(widget(`NODE_${textNodeId}`)).should('exist');
  });

  it('drops the widget selection when several nodes are selected', () => {
    pressNode(textNodeId);
    cy.get(indicator(`NODE_${textNodeId}`)).should('be.visible');
    frameNodes();

    pressNode(plainNodeId, { shiftKey: true });
    assertSelectedNodesCount(2, ASSERT_TIMEOUT);
    cy.get(indicator(`NODE_${textNodeId}`)).should('not.exist');

    cy.realPress('Delete');

    shouldWithTestController((testController) => {
      const remaining = nodeIds(testController);
      expect(remaining).not.to.include(textNodeId);
      expect(remaining).not.to.include(plainNodeId);
    });
  });

  it('drops the widget selection when the graph selection is cleared', () => {
    pressNode(textNodeId);
    cy.get(indicator(`NODE_${textNodeId}`)).should('be.visible');

    doWithTestController((testController) => {
      testController.selectNodesById([]);
    });
    cy.get(indicator(`NODE_${textNodeId}`)).should('not.exist');
  });

  it('copes with widgets that have no node', () => {
    const staticText = '[data-cy="dashboard"] [data-cy="static-text"]';
    const deleteButton = '[data-cy="indicatorbox-delete-widget-btn"]';
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="vertical-toolbox"]:visible').length === 0) {
        cy.get('[data-cy="toggle-toolbox-btn"]').click({ force: true });
      }
    });
    cy.get('[data-cy="tool-text"]').click({ force: true });
    cy.get(deleteButton).should('be.visible');
    frameNodes();

    pressNode(plainNodeId);
    assertOnlySelectedNodeId(plainNodeId, ASSERT_TIMEOUT);
    cy.get(deleteButton).should('not.exist');

    // a selection that was deleted must not trip up the next one
    cy.get(staticText).first().realClick();
    cy.get(deleteButton).trigger('mousedown', { force: true });
    cy.get(staticText).should('not.exist');
    frameNodes();
    pressNode(textNodeId);
    assertOnlySelectedNodeId(textNodeId, ASSERT_TIMEOUT);
    cy.get(indicator(`NODE_${textNodeId}`)).should('be.visible');
  });

  // both widgets belong to one node: selecting either selects that node, which
  // must not make the selection jump to the node's first widget
  it('keeps the chosen socket widget selected', () => {
    const stringWidget = `SOCKET_${socketsNodeId}::in::String`;
    const booleanWidget = `SOCKET_${socketsNodeId}::in::Boolean`;
    const addSocketWidget = (socketName: string, elementId: string) => {
      doWithTestController((testController) => {
        testController.toggleDashboard(VISIBILITY_ACTION.CLOSE);
        testController.toggleRightSideDrawer(VISIBILITY_ACTION.CLOSE);
        testController.zoomToFitNodesById([socketsNodeId]);
      });
      cy.get('body').should(($body) => {
        expect($body.find('[data-cy="dashboard"]:visible').length).to.eq(0);
      });
      getSocketCenterByNodeIDAndSocketName(socketsNodeId, socketName).then(
        ([x, y]) => {
          cy.get('#pixi-container').click(x, y, { shiftKey: true });
        },
      );
      cy.get(widget(elementId)).should('exist');
    };

    doWithTestController(async (testController) => {
      await testController.addNode('TestDataTypes', socketsNodeId, 0, 800);
    });
    addSocketWidget('String', stringWidget);
    addSocketWidget('Boolean', booleanWidget);
    doWithTestController((testController) => {
      testController.toggleDashboard(VISIBILITY_ACTION.OPEN);
    });

    clickWidget(booleanWidget);
    assertOnlySelectedNodeId(socketsNodeId, ASSERT_TIMEOUT);
    // the craft selection and the selection it causes on the graph have settled
    cy.wait(300);
    cy.get(indicator(booleanWidget)).should('be.visible');
    cy.get(indicator(stringWidget)).should('not.exist');
  });
});
