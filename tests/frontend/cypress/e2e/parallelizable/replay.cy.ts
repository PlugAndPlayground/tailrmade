import { doWithTestController, openNewGraph } from '../helpers';

const script = [
  {
    delay: 0,
    tool: 'add_node',
    input: { node_type: 'Constant', node_id: 'ai-node-1', x: 100, y: 200 },
  },
  {
    tool: 'set_socket_value',
    input: { node_id: 'ai-node-1', socket_name: 'In', value: 'Hello' },
  },
  {
    tool: 'add_node',
    input: { node_type: 'Label', node_id: 'ai-node-2', x: 600, y: 200 },
  },
  {
    tool: 'connect_sockets',
    input: {
      from_node: 'ai-node-1',
      from_socket: 'Out',
      to_node: 'ai-node-2',
      to_socket: 'Input',
    },
  },
  {
    tool: 'move_nodes',
    input: { nodes: [{ node_id: 'ai-node-2', x: 500, y: 300 }] },
  },
  {
    tool: 'group_nodes',
    input: {
      node_ids: ['ai-node-1', 'ai-node-2'],
      name: 'Greeting',
      group_id: 'greeting',
    },
  },
  {
    tool: 'update_group',
    input: { group_id: 'greeting', name: 'Hello world' },
  },
  { tool: 'camera', input: { fit: ['ai-node-1', 'ai-node-2'], duration: 1 } },
];

// the caption lets pointer events through, which Cypress's visibility check
// reads as being covered by the canvas, so check its fade state instead
const captionShows = (text: string) =>
  cy
    .get('[data-cy="subtitle-overlay"]')
    .should('have.css', 'opacity', '1')
    .and('have.text', text);

const captionHidden = () =>
  cy
    .get('[data-cy="subtitle-overlay"]')
    .should('have.css', 'visibility', 'hidden');

describe('Replay', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('builds the same graph every time it plays', () => {
    doWithTestController(async (tc) => {
      const reports = await tc.playReplay(script);
      expect(reports[reports.length - 1].status).to.eq('Done');

      const label = tc.getNodeByID('ai-node-2');
      expect([
        tc.getNodeByID('ai-node-1').x,
        tc.getNodeByID('ai-node-1').y,
      ]).to.deep.eq([100, 200]);
      expect([label.x, label.y]).to.deep.eq([500, 300]);
      expect(tc.getNodeInputValue('ai-node-1', 'In')).to.eq('Hello');
      expect(tc.getInputLinkSourceNodeID('ai-node-2', 'Input')).to.eq(
        'ai-node-1',
      );
      const group = tc.getGroups().find((g) => g.id === 'greeting');
      expect(group?.name).to.eq('Hello world');

      const history = tc.getActionHistory();
      expect(history.entries.length).to.be.greaterThan(0);
      history.entries.forEach((entry) => expect(entry.source).to.eq('replay'));
    });
  });

  it('keeps the camera still while what it edits is in view', () => {
    let center: { x: number; y: number };
    doWithTestController(async (tc) => {
      tc.stopViewportAnimations();
      center = tc.getGraph().viewport.center.clone();
      const x = Math.round(center.x - 150);
      const y = Math.round(center.y - 50);
      await tc.playReplay([
        {
          tool: 'add_node',
          input: { node_type: 'Constant', node_id: 'near', x, y },
        },
        {
          tool: 'set_socket_value',
          input: { node_id: 'near', socket_name: 'In', value: 1 },
        },
      ]);
    });
    // longer than ensureVisible's animation
    cy.wait(1000);
    doWithTestController((tc) => {
      const now = tc.getGraph().viewport.center;
      expect(now.x).to.be.closeTo(center.x, 1);
      expect(now.y).to.be.closeTo(center.y, 1);
    });

    doWithTestController(async (tc) => {
      await tc.playReplay([
        {
          tool: 'add_node',
          input: {
            node_type: 'Constant',
            node_id: 'far',
            x: Math.round(center.x + 20000),
            y: Math.round(center.y),
          },
        },
      ]);
    });
    cy.wait(1000);
    doWithTestController((tc) => {
      expect(tc.getGraph().viewport.center.x).to.be.greaterThan(
        center.x + 10000,
      );
    });
  });

  it('refuses to play over its own nodes, and reset removes only those', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'keeper');
      await tc.playReplay(script);

      let refusal = '';
      try {
        await tc.playReplay(script);
      } catch (error) {
        refusal = (error as Error).message;
      }
      expect(refusal).to.include('Reset first');

      await tc.resetReplay(script);
      expect(tc.getNodes().map((node) => node.id)).to.deep.eq(['keeper']);
      expect(tc.getGroups()).to.have.length(0);

      const reports = await tc.playReplay(script);
      expect(reports[reports.length - 1].status).to.eq('Done');
    });
  });

  it('stops at the first failing step and says which one', () => {
    doWithTestController(async (tc) => {
      const reports = await tc.playReplay([
        script[0],
        {
          tool: 'connect_sockets',
          input: {
            from_node: 'ai-node-1',
            from_socket: 'Out',
            to_node: 'missing',
            to_socket: 'In',
          },
        },
        script[2],
      ]);
      expect(reports[reports.length - 1].status).to.match(
        /^Step 2 \(connect_sockets\) failed/,
      );
      expect(tc.getNodes().map((node) => node.id)).to.deep.eq(['ai-node-1']);
    });
  });

  it('shows subtitle steps over the canvas until stop clears them', () => {
    doWithTestController(async (tc) => {
      await tc.playReplay([
        { tool: 'subtitle', input: { text: 'First we fetch the weather' } },
        script[0],
      ]);
    });
    captionShows('First we fetch the weather');
    doWithTestController((tc) => tc.resetReplay(script));
    captionHidden();
  });

  it('hides a subtitle step after its duration', () => {
    doWithTestController((tc) =>
      tc.playReplay(
        [{ tool: 'subtitle', input: { text: 'Briefly', duration: 2 } }],
        1,
      ),
    );
    captionShows('Briefly');
    captionHidden();
  });

  it('shows the Subtitle node text until the node is removed', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Subtitle', 'subtitle');
      tc.setNodeInputValue('subtitle', 'Text', 'From a node');
      await tc.executeNodeByID('subtitle');
    });
    captionShows('From a node');
    doWithTestController((tc) => tc.removeNode('subtitle'));
    captionHidden();
  });

  it('records editing, and plays it back after a reset', () => {
    type ReplayNode = {
      record(): Promise<void>;
      stop(): Promise<void>;
      reset(): Promise<void>;
      play(): Promise<void>;
    };
    doWithTestController(async (tc) => {
      await tc.addNode('Replay', 'replay', -800, 0);
      const replay = tc.getNodeByID('replay') as unknown as ReplayNode;
      tc.setNodeInputValue('replay', 'Speed', 4);
      await replay.record();

      // by hand, and through the AI's tools, which recording treats alike
      await tc.addNodeAction('Constant', 'city', 0, 0);
      await tc.addNodeAction('Label', 'title', 300, 0);
      await tc.connectNodesByIDAction('city', 'title', 'Out', 'Input');
      for (const value of ['V', 'Vi', 'Vienna']) {
        await tc.callMCPTool('set_socket_value', {
          node_id: 'city',
          socket_name: 'In',
          value,
        });
      }
      await tc.callMCPTool('move_nodes', {
        nodes: [{ node_id: 'title', x: 700, y: 100 }],
      });
      await tc.callMCPTool('group_nodes', {
        node_ids: ['city', 'title'],
        name: 'Weather',
        group_id: 'weather',
      });
      // undone before stopping, so it is not in the replay
      await tc.addNodeAction('Constant', 'mistake', 0, 300);
      await tc.undo();
      const city = tc.getNodeByID('city');
      const recordedCity = [city.x, city.y];

      let refusal = '';
      try {
        await tc.playReplay([]);
      } catch (error) {
        refusal = (error as Error).message;
      }
      expect(refusal).to.eq('Stop recording first');

      await replay.stop();
      expect(tc.getNodeOutputValue('replay', 'Status')).to.match(
        /^Recorded \d+ steps$/,
      );
      const recorded = tc.getNodeInputValue('replay', 'Script') as {
        tool: string;
        input: Record<string, unknown>;
      }[];
      // the burst of typing is one step
      expect(
        recorded.filter((step) => step.tool === 'set_socket_value'),
      ).to.have.length(1);

      await replay.reset();
      expect(tc.getNodes().map((node) => node.id)).to.deep.eq(['replay']);

      await replay.play();
      expect(tc.getNodeOutputValue('replay', 'Status')).to.eq('Done');
      expect(
        tc
          .getNodes()
          .map((node) => node.id)
          .sort(),
      ).to.deep.eq(['city', 'replay', 'title']);
      expect([tc.getNodeByID('city').x, tc.getNodeByID('city').y]).to.deep.eq(
        recordedCity,
      );
      expect([tc.getNodeByID('title').x, tc.getNodeByID('title').y]).to.deep.eq(
        [700, 100],
      );
      expect(tc.getNodeInputValue('city', 'In')).to.eq('Vienna');
      expect(tc.getInputLinkSourceNodeID('title', 'Input')).to.eq('city');
      expect(tc.getGroups().map((group) => group.name)).to.deep.eq(['Weather']);
    });
  });

  it('plays the Replay node example script from its Play trigger', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Replay', 'replay', -600, 0);
      tc.setNodeInputValue('replay', 'Speed', 4);
      await (
        tc.getNodeByID('replay') as unknown as { play(): Promise<void> }
      ).play();
      expect(tc.getNodeOutputValue('replay', 'Status')).to.eq('Done');
      expect(tc.getInputLinkSourceNodeID('ai-node-2', 'Input')).to.eq(
        'ai-node-1',
      );
    });
  });
});
