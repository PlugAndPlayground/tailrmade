import {
  controlOrMetaKey,
  doWithTestController,
  dragFromAtoB,
  getNodeCenterById,
  getStableScreenCoordinates,
  openExistingGraph,
  openNewGraph,
  saveGraph,
  shouldWithTestController,
} from '../helpers';

const getGroupHeaderCenter = (groupId: string) =>
  doWithTestController((tc) => tc.getGroupHeaderCenter(groupId));

const getPositions = (tc, ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, { x: tc.getNodeByID(id).x, y: tc.getNodeByID(id).y }]),
  );

describe('node groups', () => {
  let groupId = '';
  let beforeDrag: Record<string, { x: number; y: number }> = {};

  it('groups the selection from the context menu', () => {
    openNewGraph();
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'A', -200, 0);
      await tc.addNode('Constant', 'B', 100, 0);
      await tc.addNode('Constant', 'C', -200, 300);
      tc.selectNodesById(['A', 'B']);
    });
    getNodeCenterById('A').then(([x, y]) => {
      cy.get('#pixi-container').rightclick(x, y);
    });
    cy.get('#node-contextmenu').contains('Group').click();

    shouldWithTestController((tc) => {
      const groups = tc.getGroups();
      expect(groups).to.have.length(1);
      expect(groups[0].nodeIds).to.deep.eq(['A', 'B']);
      groupId = groups[0].id;
    });
  });

  it('dragging the header moves the members and nothing else', () => {
    doWithTestController((tc) => {
      tc.selectNodesById([]);
      beforeDrag = getPositions(tc, ['A', 'B', 'C']);
    });
    getGroupHeaderCenter(groupId).then(([x, y]) => {
      dragFromAtoB(x, y, x + 120, y + 80);
    });

    shouldWithTestController((tc) => {
      const after = getPositions(tc, ['A', 'B', 'C']);
      const deltaX = after.A.x - beforeDrag.A.x;
      const deltaY = after.A.y - beforeDrag.A.y;
      expect(deltaX).to.be.greaterThan(10);
      expect(deltaY).to.be.greaterThan(10);
      expect(after.B.x - beforeDrag.B.x).to.be.closeTo(deltaX, 0.5);
      expect(after.B.y - beforeDrag.B.y).to.be.closeTo(deltaY, 0.5);
      expect(after.C).to.deep.eq(beforeDrag.C);
      expect(tc.getSelectedNodes().map((node) => node.id)).to.have.members([
        'A',
        'B',
      ]);
    });
  });

  it('ungroups with the shortcut, and undo restores group then position', () => {
    cy.get('body').type(`${controlOrMetaKey()}{shift}g`);
    shouldWithTestController((tc) => {
      expect(tc.getGroups()).to.have.length(0);
    });

    cy.get('body').type(`${controlOrMetaKey()}z`);
    shouldWithTestController((tc) => {
      const groups = tc.getGroups();
      expect(groups).to.have.length(1);
      expect(groups[0].id).to.eq(groupId);
      expect(groups[0].nodeIds).to.deep.eq(['A', 'B']);
    });

    cy.get('body').type(`${controlOrMetaKey()}z`);
    shouldWithTestController((tc) => {
      expect(getPositions(tc, ['A', 'B', 'C'])).to.deep.eq(beforeDrag);
    });
  });

  it('dragging a member moves only that member and the frame follows', () => {
    let frameBefore;
    doWithTestController((tc) => {
      tc.selectNodesById([]);
      beforeDrag = getPositions(tc, ['A', 'B']);
      frameBefore = tc.getGroups()[0].getFrame();
    });
    getNodeCenterById('B').then(([x, y]) => {
      dragFromAtoB(x, y, x + 150, y);
    });
    shouldWithTestController((tc) => {
      const after = getPositions(tc, ['A', 'B']);
      expect(after.A).to.deep.eq(beforeDrag.A);
      expect(after.B.x).to.be.greaterThan(beforeDrag.B.x + 10);
      expect(tc.getGroups()[0].getFrame().width).to.be.greaterThan(
        frameBefore.width + 10,
      );
    });
  });

  it('renames the group by double-clicking its title', () => {
    getGroupHeaderCenter(groupId).then(([x, y]) => {
      cy.get('#pixi-container').dblclick(x, y);
    });
    cy.get('#group-title-input').clear().type('Inputs{enter}');
    shouldWithTestController((tc) => {
      expect(tc.getGroups()[0].name).to.eq('Inputs');
    });
    cy.get('#group-title-input').should('not.exist');
  });

  it('survives save and reload', () => {
    saveGraph();
    openExistingGraph();
    shouldWithTestController((tc) => {
      const groups = tc.getGroups();
      expect(groups).to.have.length(1);
      expect(groups[0].id).to.eq(groupId);
      expect(groups[0].name).to.eq('Inputs');
      expect(groups[0].nodeIds).to.deep.eq(['A', 'B']);
    });
  });

  it('copies a whole group with a duplicate, but not part of one', () => {
    doWithTestController(async (tc) => {
      tc.selectNodesById(['A']);
      await tc.duplicateSelection();
      expect(tc.getGroups()).to.have.length(1);

      tc.selectNodesById(['A', 'B']);
      await tc.duplicateSelection();
      const groups = tc.getGroups();
      expect(groups).to.have.length(2);
      const copiedNodeIds = tc.getSelectedNodes().map((node) => node.id);
      expect(groups[1].nodeIds).to.have.members(copiedNodeIds);
      expect(groups[1].name).to.eq('Inputs');
      expect(groups[1].id).to.not.eq(groupId);
    });
  });

  it('deleting a member and undoing restores the membership', () => {
    doWithTestController(async (tc) => {
      tc.selectNodesById(['B']);
      await tc.getGraph().perform_action_DeleteSelectedNodes();
      expect(tc.getGraph().groupLayer.getGroup(groupId).nodeIds).to.deep.eq([
        'A',
      ]);
    });
    cy.get('body').type(`${controlOrMetaKey()}z`);
    shouldWithTestController((tc) => {
      expect(tc.getGraph().groupLayer.getGroup(groupId).nodeIds).to.deep.eq([
        'A',
        'B',
      ]);
    });
  });

  it('auto-aligning everything keeps each group as one block', () => {
    let inner;
    doWithTestController(async (tc) => {
      inner = {
        x: tc.getNodeByID('B').x - tc.getNodeByID('A').x,
        y: tc.getNodeByID('B').y - tc.getNodeByID('A').y,
      };
      tc.getGraph().selection.selectAllNodes();
      await tc.getGraph().selection.perform_action_alignNodes('Align auto');
      expect(tc.getNodeByID('B').x - tc.getNodeByID('A').x).to.be.closeTo(
        inner.x,
        0.5,
      );
      expect(tc.getNodeByID('B').y - tc.getNodeByID('A').y).to.be.closeTo(
        inner.y,
        0.5,
      );
    });
  });

  it('lets the AI group, recolour and ungroup', () => {
    doWithTestController(async (tc) => {
      const nested = await tc.callMCPTool('group_nodes', {
        node_ids: ['A', 'C'],
        name: 'Nope',
      });
      expect(nested.is_error).to.eq(true);

      const created = await tc.callMCPTool('group_nodes', {
        node_ids: ['C'],
        name: 'Output',
      });
      const aiGroupId = JSON.parse(created.content as string).group_id;

      await tc.callMCPTool('update_group', {
        group_id: aiGroupId,
        color: '#A45140',
      });
      const aiGroup = tc.getGraph().groupLayer.getGroup(aiGroupId);
      expect(aiGroup.name).to.eq('Output');
      expect(aiGroup.color).to.eq('#A45140');

      const graph = JSON.parse(
        (await tc.callMCPTool('inspect_graph', {})).content as string,
      );
      expect(
        graph.groups.find((group) => group.id === aiGroupId).node_ids,
      ).to.deep.eq(['C']);

      await tc.callMCPTool('ungroup', { group_id: aiGroupId });
      expect(tc.getGraph().groupLayer.getGroup(aiGroupId)).to.eq(undefined);
    });
  });

  it('keeps the header readable when zoomed out', () => {
    const setZoom = (tc, zoom: number) => {
      const viewport = tc.getGraph().viewport;
      viewport.setZoom(zoom, true);
      viewport.emit('moved', { viewport, type: 'pinch' });
    };
    let beforeDrag: { x: number; y: number };
    doWithTestController((tc) => {
      setZoom(tc, 0.25);
      const header = tc.getGraph().groupLayer.getGroup(groupId).getHeader();
      expect(header.height * 0.25, 'on-screen header height').to.be.closeTo(
        32,
        0.5,
      );
      tc.selectNodesById([]);
      beforeDrag = getPositions(tc, ['A']).A;
    });

    getGroupHeaderCenter(groupId).then(([x, y]) => {
      dragFromAtoB(x, y, x + 50, y);
    });
    shouldWithTestController((tc) => {
      expect(getPositions(tc, ['A']).A.x).to.be.closeTo(beforeDrag.x + 200, 1);
    });

    getGroupHeaderCenter(groupId).then(([x, y]) => {
      cy.get('#pixi-container').dblclick(x, y);
    });
    cy.get('#group-title-input')
      .invoke('outerHeight')
      .should('be.closeTo', 32, 1);
    cy.get('#group-title-input').type('{esc}');

    doWithTestController((tc) => {
      setZoom(tc, 0.05);
      const header = tc.getGraph().groupLayer.getGroup(groupId).getHeader();
      expect(header.height, 'stops growing below 10% zoom').to.eq(32 * 10);
    });

    doWithTestController((tc) => {
      setZoom(tc, 2);
      const header = tc.getGraph().groupLayer.getGroup(groupId).getHeader();
      expect(header.height, 'zoomed in, it scales with the content').to.eq(32);
      setZoom(tc, 1);
    });
  });

  it('picks a colour from the icon in the selected group header', () => {
    let colorBefore = '';
    let positionsBefore;
    doWithTestController((tc) => {
      tc.zoomToFitNodesById(['A', 'B'], 0.8);
      tc.selectNodesById([]);
      const group = tc.getGraph().groupLayer.getGroup(groupId);
      colorBefore = group.color;
      positionsBefore = getPositions(tc, ['A', 'B']);
      const [x, y] = tc.getGroupColorIconCenter(groupId);
      const point = tc.getGraph().viewport.toWorld(x, y);
      expect(group.isOnColorIcon(point.x, point.y), 'hidden').to.eq(false);
    });

    getStableScreenCoordinates((tc) => tc.getGroupHeaderCenter(groupId)).then(
      ([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      },
    );
    doWithTestController((tc) => tc.getGroupColorIconCenter(groupId)).then(
      ([x, y]) => {
        cy.get('#pixi-container').realClick({ x, y });
      },
    );
    cy.get('#group-color-picker').should('be.visible');
    shouldWithTestController((tc) => {
      expect(getPositions(tc, ['A', 'B'])).to.deep.eq(positionsBefore);
    });

    cy.get('#group-color-picker [title="#B0683A"]').click();
    shouldWithTestController((tc) => {
      expect(
        tc.getGraph().groupLayer.getGroup(groupId).color.toLowerCase(),
      ).to.eq('#b0683a');
    });

    cy.get('body').type('{esc}');
    cy.get('#group-color-picker').should('not.exist');
    cy.get('body').type(`${controlOrMetaKey()}z`);
    shouldWithTestController((tc) => {
      expect(tc.getGraph().groupLayer.getGroup(groupId).color).to.eq(
        colorBefore,
      );
    });
  });
});
