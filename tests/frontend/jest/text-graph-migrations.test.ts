import {
  GRAPH_DATA_VERSION,
  migrateGraphDataOnLoad,
} from '../../../src/utils/graphMigrations';
import type { SerializedGraph } from '../../../src/utils/interfaces';
import { surfaceJsonSocketName } from '../../../src/utils/constants_shared';

const legacyTextTree = () => ({
  ROOT: {
    type: { resolvedName: 'Container' },
    props: { color: 'inherit' },
    nodes: ['t1'],
  },
  t1: {
    type: { resolvedName: 'Text' },
    props: {
      text: 'Hi <i>there</i>',
      fontSize: 30,
      fontWeight: '700',
      textAlign: 'right',
      color: { r: 1, g: 2, b: 3, a: 1 },
    },
    parent: 'ROOT',
    nodes: [],
  },
});

const surfaceGraph = (layoutData: unknown) =>
  makeGraph([
    {
      id: 'surface',
      type: 'UISurfaceNode',
      socketArray: [{ name: surfaceJsonSocketName, data: layoutData }],
    },
  ]);

const makeGraph = (nodes: unknown[], links: unknown[] = []): SerializedGraph =>
  ({
    version: 5,
    graphSettings: {},
    links,
    nodes,
  }) as unknown as SerializedGraph;

const socketData = (graph: SerializedGraph, nodeId: string, name: string) =>
  graph.nodes
    .find((node) => node.id === nodeId)!
    .socketArray.find((socket) => socket.name === name)?.data;

describe('text editor mention migration', () => {
  it('rewrites persisted mentions to Handlebars tokens', () => {
    const migrated = migrateGraphDataOnLoad(
      makeGraph([
        {
          id: 'editor',
          type: 'TextEditor2',
          socketArray: [
            {
              socketType: 'in',
              name: 'Markdown',
              data: '# @[42](socket:Input)\n\n**@[old](socket:Input 2)**',
            },
            { socketType: 'in', name: 'Input', data: 42 },
          ],
        },
        {
          id: 'other',
          type: 'Constant',
          socketArray: [
            { socketType: 'in', name: 'Markdown', data: '@[1](socket:x)' },
          ],
        },
      ]),
    );

    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(socketData(migrated, 'editor', 'Markdown')).toBe(
      '# {{Input}}\n\n**{{[Input 2]}}**',
    );
    expect(socketData(migrated, 'editor', 'Input')).toBe(42);
    expect(socketData(migrated, 'other', 'Markdown')).toBe('@[1](socket:x)');
  });
});

describe('static Text migration', () => {
  const expectMigrated = (tree: Record<string, any>) => {
    const props = tree.t1.props;
    expect(props.content).toBe('Hi *there*');
    expect(props.alignment).toBe('right');
    expect(props.customStyles).toEqual({
      fontSize: '30px',
      fontWeight: '700',
      lineHeight: 1.2,
      color: 'rgb(1, 2, 3)',
    });
    expect(props).not.toHaveProperty('text');
    expect(tree.ROOT).toEqual(legacyTextTree().ROOT);
  };

  it('migrates an envelope-encoded tree', () => {
    const migrated = migrateGraphDataOnLoad(
      surfaceGraph({ version: 1, tree: legacyTextTree() }),
    );
    const data = socketData(migrated, 'surface', surfaceJsonSocketName) as any;
    expect(data.version).toBe(1);
    expectMigrated(data.tree);
  });

  it('migrates a bare tree', () => {
    const migrated = migrateGraphDataOnLoad(surfaceGraph(legacyTextTree()));
    expectMigrated(
      socketData(migrated, 'surface', surfaceJsonSocketName) as any,
    );
  });

  it('migrates a JSON string and keeps it a string', () => {
    const migrated = migrateGraphDataOnLoad(
      surfaceGraph(JSON.stringify({ version: 1, tree: legacyTextTree() })),
    );
    const raw = socketData(migrated, 'surface', surfaceJsonSocketName);
    expect(typeof raw).toBe('string');
    expectMigrated(JSON.parse(raw as string).tree);
  });

  it('runs the Text node migration as part of loading', () => {
    const migrated = migrateGraphDataOnLoad(
      makeGraph([
        {
          id: 'old-text',
          type: 'Text',
          socketArray: [
            { socketType: 'in', name: 'Input', data: 'hello' },
            { socketType: 'in', name: 'Font size', data: 18 },
          ],
        },
      ]),
    );
    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(socketData(migrated, 'old-text', 'Content')).toBe('hello');
    expect(socketData(migrated, 'old-text', 'Custom styles')).toMatchObject({
      fontSize: '18px',
    });
  });

  it('leaves malformed layout data alone', () => {
    const migrated = migrateGraphDataOnLoad(surfaceGraph('not json {'));
    expect(socketData(migrated, 'surface', surfaceJsonSocketName)).toBe(
      'not json {',
    );
  });
});
