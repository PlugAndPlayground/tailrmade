import {
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  openNewGraph,
} from '../helpers';
import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';

const nodeIds = ['zoom-left', 'zoom-right'];

// The pixi canvas fills the window behind the docked panels, so Shift+1/2
// have to frame the nodes inside the visible canvas strip, not the window
const assertNodesFramedInCanvasStrip = () => {
  cy.get('[data-cy="canvas-strip"]').then(($strip) => {
    const strip = $strip[0].getBoundingClientRect();
    doWithTestController((testController) => {
      const rects = nodeIds.map(
        (id) => testController.getNodeByID(id).getBounds().rectangle,
      );
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      expect(left, 'nodes start inside the strip').to.be.gte(strip.left);
      expect(right, 'nodes end inside the strip').to.be.lte(strip.right);
      // nodes draw some chrome at a fixed screen size, so their bounds grow
      // a little as the zoom-out shrinks them
      expect((left + right) / 2, 'nodes centred in the strip').to.be.closeTo(
        (strip.left + strip.right) / 2,
        16,
      );
    });
  });
};

describe('Zoom to fit frames the visible canvas', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    cy.viewport(1600, 900);
    clearGraph();
    closeBothDrawers();
    doWithTestController(async (testController) => {
      await testController.addNode('Constant', nodeIds[0], -600, 0);
      await testController.addNode('Constant', nodeIds[1], 600, 0);
    });
  });

  it('with the menu panel, dashboard and inspector open', () => {
    doWithTestController((testController) => {
      testController.toggleLeftSideDrawer(VISIBILITY_ACTION.OPEN);
      testController.toggleDashboard(VISIBILITY_ACTION.OPEN);
      testController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
      testController.selectNodesById(nodeIds);
    });
    cy.wait(300);
    cy.get('body').type('{shift}2');
    assertNodesFramedInCanvasStrip();
    cy.get('body').type('{shift}1');
    assertNodesFramedInCanvasStrip();
  });

  it('with only the rail', () => {
    doWithTestController((testController) => {
      testController.selectNodesById(nodeIds);
    });
    cy.get('body').type('{shift}2');
    assertNodesFramedInCanvasStrip();
  });
});
