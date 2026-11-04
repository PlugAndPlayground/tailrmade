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
