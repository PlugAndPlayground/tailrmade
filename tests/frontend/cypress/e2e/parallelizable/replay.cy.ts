import {
  doWithTestController,
  openNewGraph,
  waitForGraphToBeReady,
} from '../helpers';

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
      tc.selectNodesById(['keeper', 'ai-node-1']);

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
      // only the removed node leaves the selection
      expect(tc.getSelectedNodes().map((node) => node.id)).to.deep.eq([
        'keeper',
      ]);

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

  it('steps forward and back one step at a time', () => {
    const steps = [
      { tool: 'subtitle', input: { text: 'Step by step' } },
      {
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'a', x: 0, y: 0 },
      },
      {
        tool: 'set_socket_value',
        input: { node_id: 'a', socket_name: 'In', value: 'Hi' },
      },
      {
        tool: 'add_node',
        input: { node_type: 'Label', node_id: 'b', x: 400, y: 0 },
      },
      {
        tool: 'connect_sockets',
        input: {
          from_node: 'a',
          from_socket: 'Out',
          to_node: 'b',
          to_socket: 'Input',
        },
      },
    ];
    doWithTestController(async (tc) => {
      for (let i = 1; i < steps.length; i++) {
        const progress = await tc.stepReplay(steps, 'next');
        expect(progress).to.deep.eq({ step: i, total: 5, status: 'Paused' });
      }
      expect((await tc.stepReplay(steps, 'next')).status).to.eq('Done');
      expect((await tc.stepReplay(steps, 'next')).status).to.eq('Done');
      expect(tc.getInputLinkSourceNodeID('b', 'Input')).to.eq('a');
    });
    // stepping keeps the caption up
    captionShows('Step by step');

    doWithTestController(async (tc) => {
      expect((await tc.stepReplay(steps, 'back')).step).to.eq(4);
      expect(tc.getInputLinkSourceNodeID('b', 'Input')).to.eq(undefined);
      await tc.stepReplay(steps, 'back');
      expect(tc.getGraph().nodes['b']).to.eq(undefined);
      await tc.stepReplay(steps, 'back');
      expect(tc.getNodeInputValue('a', 'In')).not.to.eq('Hi');
      await tc.stepReplay(steps, 'back');
      expect(tc.getNodes()).to.have.length(0);
      expect((await tc.stepReplay(steps, 'back')).step).to.eq(0);
      expect((await tc.stepReplay(steps, 'back')).status).to.eq('At the start');
    });
    captionHidden();

    // after an edit of its own the history no longer matches, so back rebuilds
    doWithTestController(async (tc) => {
      for (let i = 0; i < steps.length; i++) {
        await tc.stepReplay(steps, 'next');
      }
      await tc.addNodeAction('Constant', 'mine', 0, 400);
      await tc.stepReplay(steps, 'back');
      expect(tc.getInputLinkSourceNodeID('b', 'Input')).to.eq(undefined);
      expect(tc.getNodeInputValue('a', 'In')).to.eq('Hi');
      expect(tc.getGraph().nodes['mine']).not.to.eq(undefined);
    });
  });

  it('carries on from where it was stopped', () => {
    const steps = [
      {
        delay: 0,
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'a', x: 0, y: 0 },
      },
      {
        delay: 100,
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'b', x: 400, y: 0 },
      },
    ];
    doWithTestController(async (tc) => {
      const playing = tc.playReplay(steps);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await tc.stopReplay();
      const stopped = await playing;
      expect(stopped[stopped.length - 1]).to.deep.eq({
        step: 1,
        total: 2,
        status: 'Stopped',
      });
      const resumed = await tc.playReplay(steps);
      expect(resumed[resumed.length - 1].status).to.eq('Done');
      expect(tc.getGraph().nodes['b']).not.to.eq(undefined);
    });
  });

  it('starts over after the last step when looping', () => {
    const steps = [
      {
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'a', x: 0, y: 0 },
      },
    ];
    doWithTestController(async (tc) => {
      const playing = tc.playReplay(steps, 10, true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await tc.stopReplay();
      const reports = await playing;
      expect(
        reports.filter((report) => report.status === 'Done').length,
      ).to.be.greaterThan(1);
      expect(tc.getNodes()).to.have.length.at.most(1);
    });
  });

  it('picks up a change of speed while it plays', () => {
    const steps = [
      {
        delay: 0,
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'a', x: 0, y: 0 },
      },
      // an hour at the starting speed
      {
        delay: 3600,
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'b', x: 400, y: 0 },
      },
    ];
    doWithTestController(async (tc) => {
      const settings = { speed: 1, loop: false, camera: true };
      const playing = tc.playReplayWith(steps, () => settings);
      await new Promise((resolve) => setTimeout(resolve, 300));
      settings.speed = 100000;
      const reports = await playing;
      expect(reports[reports.length - 1].status).to.eq('Done');
    });
  });

  it('starts over on Next after the last step when looping', () => {
    const steps = [
      {
        tool: 'add_node',
        input: { node_type: 'Constant', node_id: 'a', x: 0, y: 0 },
      },
      {
        tool: 'set_socket_value',
        input: { node_id: 'a', socket_name: 'In', value: 'Hi' },
      },
    ];
    doWithTestController(async (tc) => {
      await tc.stepReplay(steps, 'next', true);
      await tc.stepReplay(steps, 'next', true);
      expect(tc.getNodeInputValue('a', 'In')).to.eq('Hi');
      expect(await tc.stepReplay(steps, 'next', true)).to.deep.eq({
        step: 1,
        total: 2,
        status: 'Paused',
      });
      expect(tc.getNodeInputValue('a', 'In')).not.to.eq('Hi');
      expect(tc.getNodes()).to.have.length(1);
    });
  });

  it('leaves the camera alone with Camera off', () => {
    let center: { x: number; y: number };
    doWithTestController(async (tc) => {
      tc.stopViewportAnimations();
      center = tc.getGraph().viewport.center.clone();
      await tc.playReplayWith(
        [
          {
            tool: 'add_node',
            input: {
              node_type: 'Constant',
              node_id: 'far',
              x: Math.round(center.x + 20000),
              y: 0,
            },
          },
          { tool: 'camera', input: { fit: ['far'], duration: 0.1 } },
        ],
        () => ({ speed: 100, loop: false, camera: false }),
      );
    });
    cy.wait(1000);
    doWithTestController((tc) => {
      expect(tc.getGraph().viewport.center.x).to.be.closeTo(center.x, 1);
    });
  });

  it('plays itself when an app with Autoplay opens', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Replay', 'replay', -600, 0);
      tc.setNodeInputValue('replay', 'Speed', 4);
      tc.setNodeInputValue('replay', 'Autoplay', true);
      // saved half built, as an edited app would be
      await tc.callAITool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-1',
      });
      await tc.loadStringifiedGraph(JSON.stringify(tc.getGraph().serialize()));
    });
    waitForGraphToBeReady();
    doWithTestController(async (tc) => {
      for (let tries = 0; tries < 100; tries++) {
        if (tc.getNodeOutputValue('replay', 'Status') === 'Done') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(tc.getNodeOutputValue('replay', 'Status')).to.eq('Done');
      expect(tc.getInputLinkSourceNodeID('ai-node-2', 'Input')).to.eq(
        'ai-node-1',
      );
    });
  });

  it('steps forward when a key press is linked to Next', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Replay', 'replay', -600, 0);
      await tc.addNode('Keyboard', 'keyboard', -1400, 0);
      await tc.addNode('Comparison', 'compare', -1000, 0);
      tc.setNodeInputValue('compare', 'B', 'ArrowRight');
      tc.setNodeInputValue('compare', 'Operator', 'Equal (==)');
      await tc.connectNodesByID('keyboard', 'compare', 'key', 'A');
      await tc.connectNodesByID('compare', 'replay', 'Output', 'Next');
    });
    cy.get('body').trigger('keydown', { key: 'ArrowRight' });
    cy.get('body').trigger('keyup', { key: 'ArrowRight' });
    doWithTestController((tc) => {
      expect(tc.getNodeOutputValue('replay', 'Step')).to.eq(1);
    });
    captionShows('A value and a label');
    cy.get('body').trigger('keydown', { key: 'ArrowRight' });
    cy.get('body').trigger('keyup', { key: 'ArrowRight' });
    doWithTestController((tc) => {
      expect(tc.getNodeOutputValue('replay', 'Step')).to.eq(2);
      expect(tc.getGraph().nodes['ai-node-1']).not.to.eq(undefined);
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
