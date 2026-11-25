import {
  doWithTestController,
  openNewGraph,
  serializedGraph,
  serializedNode,
  serializedSocket,
  shouldWithTestController,
} from '../helpers';

// The transforms are covered by tests/frontend/jest/state-migrations and
// label-migration; what only the app can show is the swap itself: same ids,
// links, groups and page placements, replacement nodes running.

const link = (
  sourceNodeId: string,
  sourceSocketName: string,
  targetNodeId: string,
  targetSocketName: string,
) => ({ sourceNodeId, sourceSocketName, targetNodeId, targetSocketName });

const constant = (id: string, value: unknown, y: number) =>
  serializedNode('Constant', id, [serializedSocket('In', value, 'AnyType')], {
    x: -400,
    y,
  });

const numberState = (id: string, value: number, y: number) =>
  serializedNode(
    'NumberState',
    id,
    [
      serializedSocket('State', value, 'NumberType'),
      serializedSocket('State', null, 'NumberType', 'out'),
    ],
    { x: 0, y },
  );

const label = (id: string, text: string, y: number) =>
  serializedNode(
    'Label',
    id,
    [
      serializedSocket('Output', undefined, 'StringType', 'out'),
      serializedSocket('ReactUI', undefined, 'DeferredReactType', 'out'),
      serializedSocket('Input', text),
      serializedSocket('Font size', 64, 'NumberType'),
    ],
    { x: 0, y },
  );

const deprecatedTypes = [
  'label',
  'state',
  'numberstate',
  'stateread',
  'copysocketvalue',
  'localstoragewrite',
];

const load = (graph: string) =>
  doWithTestController(async (testController) => {
    await testController.loadStringifiedGraph(graph);
    await testController.waitForPendingExecution();
  });

const reloadSaved = () =>
  doWithTestController(async (testController) => {
    const saved = testController.getGraph().serialize();
    await testController.loadStringifiedGraph(JSON.stringify(saved));
    await testController.waitForPendingExecution();
  });

describe('deprecated nodes', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('replace themselves on load, keeping ids, links and groups', () => {
    load(
      JSON.stringify({
        ...JSON.parse(
          serializedGraph(
            [
              numberState('counter', 4, 400),
              serializedNode(
                'StateRead',
                'read',
                [
                  serializedSocket('Storage type', 'Local storage', 'EnumType'),
                  serializedSocket('Persistence', 'Session', 'EnumType'),
                  serializedSocket('Key', 'shared'),
                  serializedSocket('Value', null, 'AnyType', 'out'),
                ],
                { x: 0, y: 600 },
              ),
              serializedNode(
                'CopySocketValue',
                'copy',
                [
                  serializedSocket('Value', 'copied', 'AnyType'),
                  serializedSocket('Input Socket', 'In'),
                  serializedSocket('Value', undefined, 'AnyType', 'out'),
                ],
                { x: 0, y: 800 },
              ),
              constant('target', 'initial', 800),
            ],
            [link('copy', 'Value', 'target', 'In')],
          ),
        ),
        groups: [
          {
            id: 'group',
            name: 'Kept together',
            color: '#888888',
            nodeIds: ['counter', 'copy'],
          },
        ],
      }),
    );

    shouldWithTestController((testController) => {
      const typeOf = (id: string) => testController.getNodeByID(id).type;
      expect(typeOf('counter')).to.eq('storagenumberstate');
      expect(testController.getNodeInputValue('counter', 'State key')).to.eq(
        'counter',
      );
      expect(testController.getNodeOutputValue('counter', 'State')).to.eq(4);

      expect(typeOf('read')).to.eq('storageread');
      expect(testController.getNodeInputValue('read', 'Storage type')).to.eq(
        'Session',
      );
      expect(
        testController
          .getInputSockets('read')
          .some((socket) => socket.name === 'Persistence'),
        'Storage Read migrated its own Persistence input away',
      ).to.eq(false);

      expect(typeOf('copy')).to.eq('storagewrite');
      const reader = testController.getInputLinkSourceNodeID('target', 'In');
      expect(typeOf(reader)).to.eq('storageread');
      const [group] = testController.getGroups();
      expect(group.nodeIds).to.deep.eq(['counter', 'copy', reader]);

      const saved = testController.getGraph().serialize();
      expect(
        saved.nodes.filter((node) =>
          deprecatedTypes.includes(node.type.toLowerCase()),
        ),
      ).to.deep.eq([]);
    });

    reloadSaved();
    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('copy').type).to.eq('storagewrite');
      expect(testController.getNodeOutputValue('counter', 'State')).to.eq(4);
      expect(testController.getGroups()[0].nodeIds).to.have.length(3);
    });
  });

  it('turns a node saved as "default" into the Sequence it loaded as', () => {
    load(
      serializedGraph(
        [
          serializedNode(
            'default',
            'sequence',
            [
              serializedSocket('Trigger', undefined, 'TriggerType', 'trigger'),
              serializedSocket('Sequence 0', 0, 'NumberType', 'out'),
              serializedSocket('Sequence 1', 0, 'NumberType', 'out'),
            ],
            { x: 0, y: 0 },
          ),
          constant('target', 'initial', 0),
        ],
        [link('sequence', 'Sequence 1', 'target', 'In')],
      ),
    );

    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('sequence').type).to.eq('sequence');
      expect(
        testController.getSocketLinks('sequence', 'Sequence 1'),
      ).to.have.length(1);
    });
  });

  it('swaps old storage nodes for Storage nodes', () => {
    load(
      serializedGraph([
        {
          ...serializedNode('LocalStorageWrite', 'legacy', [
            serializedSocket('Local Storage Key', 'namespace'),
            serializedSocket('Object Key', 'item'),
            serializedSocket('Value', 'value', 'AnyType'),
          ]),
          version: 2,
        },
      ]),
    );
    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('legacy').type).to.eq('storagewrite');
      expect(testController.getNodeInputValue('legacy', 'Location')).to.eq(
        'namespace',
      );
      expect(testController.getNodeInputValue('legacy', 'Key')).to.eq('item');
      expect(testController.getNodeInputValue('legacy', 'Storage type')).to.eq(
        'IndexedDB',
      );
    });
  });

  it('stay a stub when pasted, and are replaced the next time the graph loads', () => {
    let paste: Promise<unknown>;
    doWithTestController((testController) => {
      paste = testController.getGraph().perform_action_pasteNodes({
        version: 12,
        nodes: [numberState('pasted', 7, 0)],
        links: [],
      } as any);
    });
    cy.get('[data-cy="confirm-node-paste"]').click();
    cy.then(() => paste);
    doWithTestController(async (testController) => {
      const saved = testController.getGraph().serialize();
      const pasted = saved.nodes.find((node) => node.id === 'pasted');
      expect(pasted.type.toLowerCase()).to.eq('numberstate');
      expect(pasted.version, 'a pasted stub keeps its saved version').to.eq(
        undefined,
      );
      await testController.loadStringifiedGraph(JSON.stringify(saved));
    });
    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('pasted').type).to.eq(
        'storagenumberstate',
      );
    });
  });

  it('cannot be added by the AI', () => {
    doWithTestController(async (testController) => {
      const result = await testController.callAITool('add_node', {
        node_type: 'CopySocketValue',
        node_id: 'from-ai',
      });
      expect(result.is_error).to.eq(true);
    });
  });

  it('replaces Labels with Constant String or Dynamic text', () => {
    load(
      serializedGraph(
        [
          label('note', 'A note', 0),
          constant('sink', '', 0),
          label('shows', 'stale', 200),
          constant('value', 42, 200),
        ],
        [
          link('note', 'Output', 'sink', 'In'),
          link('value', 'Out', 'shows', 'Input'),
        ],
      ),
    );
    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('note').type).to.eq('constant_string');
      expect(testController.getNodeOutputValue('sink', 'Out')).to.eq('A note');
      expect(testController.getInputLinkSourceNodeID('sink', 'In')).to.eq(
        'note',
      );
      expect(testController.getNodeByID('shows').type).to.eq('text');
      expect(testController.getNodeOutputValue('shows', 'Output')).to.eq('42');
    });
  });

  it('keeps a Label on its UI page where it was placed', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('UISurfaceNode', 'page', 600, 0);
      await testController.addNode('Text', 'placed', 0, 0);
      await testController.addNode('WidgetButton', 'button', 0, 300);
      for (const [node, socket] of [
        ['placed', 'Text'],
        ['button', 'Button'],
      ]) {
        const result = await testController.callAITool('connect_sockets', {
          from_node: node,
          from_socket: 'ReactUI',
          to_node: 'page',
          to_socket: socket,
        });
        expect(result.is_error, result.content).to.not.equal(true);
      }
      await testController.waitForPendingExecution();

      // save it as the Label it would have been before Labels were removed
      const saved = testController.getGraph().serialize();
      const placed = saved.nodes.find((node) => node.id === 'placed');
      Object.assign(placed, label('placed', 'On the page', 0));
      await testController.loadStringifiedGraph(JSON.stringify(saved));
      await testController.waitForPendingExecution();
    });

    shouldWithTestController((testController) => {
      expect(testController.getNodeByID('placed').type).to.eq('text');
      expect(testController.getSocketLinks('placed', 'ReactUI')).to.have.length(
        1,
      );
      const tree = testController.getNodeInputValue('page', 'Layout JSON').tree;
      const ids = tree.ROOT.nodes.map((item: string) => tree[item].props.id);
      expect(ids).to.deep.eq(['NODE_placed', 'NODE_button']);
    });
  });
});
