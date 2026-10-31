import { doWithTestController, openNewGraph } from '../helpers';

// Simple axis-aligned bounding box overlap check, mirroring the box
// deOverlap()/autoAlignNodes() work with (node.x/y is the top-left corner,
// nodeWidth/nodeHeight the box size).
const boxesOverlap = (
  a: { x: number; y: number; nodeWidth: number; nodeHeight: number },
  b: { x: number; y: number; nodeWidth: number; nodeHeight: number },
) =>
  a.x < b.x + b.nodeWidth &&
  a.x + a.nodeWidth > b.x &&
  a.y < b.y + b.nodeHeight &&
  a.y + a.nodeHeight > b.y;

const getPositions = (tc, ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, { x: tc.getNodeByID(id).x, y: tc.getNodeByID(id).y }]),
  );

// The AI supplies unique ids so later calls in the same ordered tool batch can
// refer to new nodes without a model round trip. Placement remains automatic:
// nodes start at the viewport center (getDefaultNewNodeLocation) and
// de-overlaps immediately, and TailrmadeMCPServer's begin/finishAgentTurn
// scope an end-of-turn flow-aware auto-alignment (SelectionClass.autoAlignNodes)
// to only the nodes the AI created this turn.
describe('AI node placement (no overlap, scoped auto-alignment)', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('uses caller-supplied ai-node ids and de-overlaps added nodes', () => {
    doWithTestController(async (tc) => {
      const mintedIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await tc.callMCPTool('add_node', {
          node_type: 'Constant',
          node_id: `ai-node-${i + 1}`,
        });
        expect(
          result.is_error,
          `add_node ${i} failed: ${result.content}`,
        ).to.not.eq(true);
        mintedIds.push(JSON.parse(result.content).node_id);
      }
      expect(mintedIds).to.deep.eq(['ai-node-1', 'ai-node-2', 'ai-node-3']);

      const nodes = mintedIds.map((id) => tc.getNodeByID(id));
      nodes.forEach((node, i) => {
        expect(node, `node ${i} exists`).to.exist;
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          expect(
            boxesOverlap(nodes[i], nodes[j]),
            `node ${nodes[i].id} overlaps node ${nodes[j].id}`,
          ).to.eq(false);
        }
      }
    });
  });

  it('auto-aligns only the nodes created during the agent turn', () => {
    doWithTestController(async (tc) => {
      // pre-existing node, placed before the agent turn starts - must be left
      // untouched by finishAgentTurn (the scoping guarantee)
      await tc.addNode('Constant', 'pre-existing-node', 2000, 2000);
      const preExistingBefore = {
        x: tc.getNodeByID('pre-existing-node').x,
        y: tc.getNodeByID('pre-existing-node').y,
      };

      tc.beginAIAgentTurn();

      const sourceResult = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-10',
      });
      expect(sourceResult.is_error).to.not.eq(true);
      const sourceId = JSON.parse(sourceResult.content).node_id;
      const targetResult = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-11',
      });
      expect(targetResult.is_error).to.not.eq(true);
      const targetId = JSON.parse(targetResult.content).node_id;

      const connectResult = await tc.callMCPTool('connect_sockets', {
        from_node: sourceId,
        from_socket: 'Out',
        to_node: targetId,
        to_socket: 'In',
      });
      expect(
        connectResult.is_error,
        `connect_sockets failed: ${connectResult.content}`,
      ).to.not.eq(true);

      await tc.finishAIAgentTurn();

      // autoAlignNodes animates the move over ~10 frames of 16ms each; give
      // it a little buffer before reading final positions
      await new Promise((resolve) => setTimeout(resolve, 400));

      const source = tc.getNodeByID(sourceId);
      const target = tc.getNodeByID(targetId);
      expect(
        source.x + source.nodeWidth,
        'source right edge is left of target x',
      ).to.be.lessThan(target.x);
      expect(boxesOverlap(source, target), 'source overlaps target').to.eq(
        false,
      );

      const preExistingAfter = tc.getNodeByID('pre-existing-node');
      expect(preExistingAfter.x, 'pre-existing node x unchanged').to.eq(
        preExistingBefore.x,
      );
      expect(preExistingAfter.y, 'pre-existing node y unchanged').to.eq(
        preExistingBefore.y,
      );
    });
  });
  it('lays out finished sections as separate blocks, left to right', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'pre-existing-node', 2000, 2000);
      const preExistingBefore = {
        x: tc.getNodeByID('pre-existing-node').x,
        y: tc.getNodeByID('pre-existing-node').y,
      };
      tc.beginAIAgentTurn();

      const addConstant = async (nodeId: string) => {
        const result = await tc.callMCPTool('add_node', {
          node_type: 'Constant',
          node_id: nodeId,
        });
        expect(result.is_error, `add_node failed: ${result.content}`).to.not.eq(
          true,
        );
      };
      const connect = async (fromNode: string, toNode: string) => {
        const result = await tc.callMCPTool('connect_sockets', {
          from_node: fromNode,
          from_socket: 'Out',
          to_node: toNode,
          to_socket: 'In',
        });
        expect(result.is_error, `connect failed: ${result.content}`).to.not.eq(
          true,
        );
      };

      await addConstant('ai-node-20');
      await addConstant('ai-node-21');
      await connect('ai-node-20', 'ai-node-21');
      const firstResult = await tc.callMCPTool('finish_section', {
        title: 'First',
        node_ids: ['ai-node-20', 'ai-node-21', 'pre-existing-node'],
      });
      expect(
        firstResult.is_error,
        `finish_section failed: ${firstResult.content}`,
      ).to.not.eq(true);
      expect(JSON.parse(firstResult.content).skipped_node_ids).to.deep.eq([
        'pre-existing-node',
      ]);

      await addConstant('ai-node-22');
      await addConstant('ai-node-23');
      await connect('ai-node-22', 'ai-node-23');
      const secondResult = await tc.callMCPTool('finish_section', {
        title: 'Second',
        node_ids: ['ai-node-22', 'ai-node-23'],
      });
      expect(secondResult.is_error).to.not.eq(true);

      // a node already in a section can't be claimed again
      const againResult = await tc.callMCPTool('finish_section', {
        title: 'Again',
        node_ids: ['ai-node-20'],
      });
      expect(againResult.is_error).to.eq(true);

      await tc.finishAIAgentTurn();

      const first = ['ai-node-20', 'ai-node-21'].map((id) =>
        tc.getNodeByID(id),
      );
      const second = ['ai-node-22', 'ai-node-23'].map((id) =>
        tc.getNodeByID(id),
      );
      const firstRight = Math.max(...first.map((n) => n.x + n.nodeWidth));
      const secondLeft = Math.min(...second.map((n) => n.x));
      expect(
        secondLeft,
        'second section starts right of the first',
      ).to.be.greaterThan(firstRight);
      expect(first[0].x + first[0].nodeWidth).to.be.lessThan(first[1].x);
      expect(second[0].x + second[0].nodeWidth).to.be.lessThan(second[1].x);

      expect(
        tc.getGroups().map((group) => [group.name, group.nodeIds]),
        'each section is framed as a group named after it',
      ).to.deep.eq([
        ['First', ['ai-node-20', 'ai-node-21']],
        ['Second', ['ai-node-22', 'ai-node-23']],
      ]);

      const preExisting = tc.getNodeByID('pre-existing-node');
      expect(preExisting.x, 'pre-existing node x unchanged').to.eq(
        preExistingBefore.x,
      );
      expect(preExisting.y, 'pre-existing node y unchanged').to.eq(
        preExistingBefore.y,
      );
    });
  });
  it('restructures existing nodes only when asked, as one undoable move', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'existing-a', 0, 0);
      await tc.addNode('Constant', 'existing-b', 0, 400);
      await tc.connectNodesByIDAction('existing-a', 'existing-b', 'Out', 'In');
      const before = ['existing-a', 'existing-b'].map((id) => ({
        x: tc.getNodeByID(id).x,
        y: tc.getNodeByID(id).y,
      }));
      tc.beginAIAgentTurn();

      const refused = await tc.callMCPTool('finish_section', {
        title: 'Data',
        node_ids: ['existing-a', 'existing-b'],
      });
      expect(refused.is_error).to.eq(true);

      const result = await tc.callMCPTool('finish_section', {
        title: 'Data',
        node_ids: ['existing-a', 'existing-b'],
        restructure: true,
        color: '#A45140',
      });
      expect(result.is_error, result.content).to.not.eq(true);
      await tc.finishAIAgentTurn();

      const a = tc.getNodeByID('existing-a');
      const b = tc.getNodeByID('existing-b');
      expect(a.x, 'section starts right of the old graph').to.be.greaterThan(
        before[0].x + a.nodeWidth,
      );
      expect(a.x + a.nodeWidth).to.be.lessThan(b.x);
      expect(tc.getGroups().map((group) => group.name)).to.deep.eq(['Data']);
      expect(tc.getGroups()[0].color).to.eq('#A45140');

      await tc.undo();
      ['existing-a', 'existing-b'].forEach((id, i) => {
        expect(tc.getNodeByID(id).x, `${id} x restored`).to.eq(before[i].x);
        expect(tc.getNodeByID(id).y, `${id} y restored`).to.eq(before[i].y);
      });
      expect(tc.getGroups(), 'the same undo removes the group').to.have.length(
        0,
      );
    });
  });
  it('moves an existing group as one block when placing one member', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'grouped-a', 0, 0);
      await tc.addNode('Constant', 'grouped-b', 0, 400);
      await tc.callMCPTool('group_nodes', {
        node_ids: ['grouped-a', 'grouped-b'],
        name: 'Mine',
      });
      const before = getPositions(tc, ['grouped-a', 'grouped-b']);
      tc.beginAIAgentTurn();

      const result = await tc.callMCPTool('finish_section', {
        title: 'Theirs',
        node_ids: ['grouped-a'],
        restructure: true,
      });
      await tc.finishAIAgentTurn();

      const content = JSON.parse(result.content);
      expect(content.group_id).to.eq(undefined);
      expect(content.not_grouped_reason).to.be.a('string');
      const mine = tc.getGroups().filter((group) => group.name === 'Mine');
      expect(mine).to.have.length(1);
      expect(mine[0].nodeIds).to.deep.eq(['grouped-a', 'grouped-b']);
      const after = getPositions(tc, ['grouped-a', 'grouped-b']);
      expect(after['grouped-a'].x - before['grouped-a'].x).to.be.closeTo(
        after['grouped-b'].x - before['grouped-b'].x,
        0.5,
      );
      expect(after['grouped-a'].y - before['grouped-a'].y).to.be.closeTo(
        after['grouped-b'].y - before['grouped-b'].y,
        0.5,
      );
      expect(tc.getGroups().some((group) => group.name === 'Theirs')).to.eq(
        false,
      );
    });
  });
});
