import {
  controlOrMetaKey,
  doWithTestController,
  openNewGraph,
} from '../helpers';

describe('selection', () => {
  it('add nodes', () => {
    openNewGraph();

    doWithTestController(async (testController) => {
      await testController.addNode('Add', 'Add', -100, 0);
      await testController.addNode('Constant', 'Constant', 0, 200);
    });
  });

  it('select one node by clicking directly on it', () => {
    doWithTestController(async (testController) => {
      const [x, y] = testController.getNodeCenterById('Add');
      cy.get('#pixi-container').realClick({ x: x, y: y });
    });
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(1);
    });
  });

  it('see that properties are accessible in inspectorcontainer', () => {
    doWithTestController((testController) => {
      const [x, y] = testController.getNodeCenterById('Add');
      cy.get('#pixi-container').realClick({ x: x, y: y });
    });
    cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    cy.get('body').contains('Addend').should('exist');
    cy.get('#inspector-filter-out').should('exist');
    cy.get('#inspector-filter-in').should('exist');
  });

  it('select all nodes via ctrl-a', () => {
    cy.get('body').type(`${controlOrMetaKey()}a`);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('deselect one node by shift-clicking on it', () => {
    doWithTestController(async (testController) => {
      const [x, y] = testController.getNodeCenterById('Add');
      cy.get('#pixi-container').realMouseDown({ x: x, y: y, shiftKey: true });
      cy.get('#pixi-container').realMouseUp();
      doWithTestController((testController) => {
        expect(testController.getSelectedNodes().length).to.eq(1);
      });
    });
  });

  it('move it', () => {
    cy.wait(100);
    let [prevX, prevY] = [0, 0];
    doWithTestController((testController) => {
      [prevX, prevY] = testController.getNodeCenterById('Add');
      cy.get('#pixi-container').realMouseDown({ x: prevX, y: prevY });
      cy.get('#pixi-container').realMouseMove(prevX + 100, prevY);
      cy.get('#pixi-container').realMouseUp();
    });
    cy.wait(100);
    doWithTestController((testController) => {
      const [x] = testController.getNodeCenterById('Add');
      expect(x - prevX).to.be.within(98, 102); // avoid rounding error
    });
  });

  // is this causing CI to hang?

  it('deselect', () => {
    doWithTestController((testController) => {
      let [prevX, prevY] = testController.getNodeCenterById('Add');
      console.log('PREVX: ' + prevX);

      cy.get('#pixi-container').realMouseMove(prevX, prevY - 100);
      cy.get('#pixi-container').realMouseDown({ x: prevX, y: prevY - 100 });
      cy.get('#pixi-container').realMouseUp({ x: prevX, y: prevY - 100 });
      doWithTestController((testController) => {
        expect(testController.getSelectedNodes().length).to.eq(0);
      });
      // see that inspectorcontainer also lost it
      cy.get('body').contains('Addend').should('not.exist');
      cy.get('#inspector-filter-out').should('not.exist');
      cy.get('#inspector-filter-in').should('not.exist');
    });
  });

  it('select multiple nodes using box', () => {
    cy.wait(100);
    doWithTestController((testController) => {
      const [x, y] = testController.getNodeCenterById('Add');
      const startPosX = x;
      const startPosY = y - 100;

      cy.get('#pixi-container').realMouseMove(startPosX, startPosY);
      cy.get('#pixi-container').realMouseDown({ x: startPosX, y: startPosY });
      cy.get('#pixi-container').realMouseMove(x + 50, y + 200);
      cy.wait(100); // to avoid registering a double click on fast machines which would open node search?!
      cy.get('#pixi-container').realMouseUp();
    });
    // see that they were both selected
    cy.wait(100);
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(2);
    });
  });

  it('drag selection', () => {
    let [prevXAdd, prevYAdd] = [0, 0];
    let [prevXConst, prevYConst] = [0, 0];
    doWithTestController((testController) => {
      [prevXAdd, prevYAdd] = testController.getNodeCenterById('Add');
      [prevXConst, prevYConst] = testController.getNodeCenterById('Constant');
      cy.get('#pixi-container').realMouseMove(prevXAdd, prevYAdd);
      cy.get('#pixi-container').realMouseDown({ x: prevXAdd, y: prevYAdd });
      cy.get('#pixi-container').realMouseMove(prevXAdd, prevYAdd - 100);
      cy.wait(100); // to avoid registering a double click on fast machines which would open node search?!
      cy.get('#pixi-container').realMouseUp();
    });
    cy.wait(100);
    doWithTestController((testController) => {
      const [newXAdd, newYAdd] = testController.getNodeCenterById('Add');
      const [newXConst, newYConst] =
        testController.getNodeCenterById('Constant');
      expect(newYAdd).to.be.within(prevYAdd - 102, prevYAdd - 98);
      expect(newYConst).to.be.within(prevYConst - 102, prevYConst - 98);
    });
  });

  it('see that right menu is always showing information for the selected node', () => {
    cy.wait(100);
    doWithTestController(async (testController) => {
      testController.selectNodesById([]); // deselect
      const [x, y] = testController.getNodeCenterById('Add');
      cy.get('#pixi-container').realClick({ x: x, y: y });
    });
    cy.get('body').contains('Addend');

    doWithTestController(async (testController) => {
      const [x, y] = testController.getNodeCenterById('Constant');
      cy.get('#pixi-container').realClick({ x: x, y: y });
    });
    cy.get('body').contains('Constant');
  });

  it('escape menu then deselect all nodes via 2x escape', () => {
    cy.get('body').type('{esc}{esc}');
    doWithTestController((testController) => {
      expect(testController.getSelectedNodes().length).to.eq(0);
    });
  });
});
