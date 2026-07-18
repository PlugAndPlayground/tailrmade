import {
  GRAPH_DATA_VERSION,
  migrateGraphDataOnLoad,
} from '../../../src/utils/graphMigrations';
import { surfaceJsonSocketName } from '../../../src/utils/constants_shared';
import type { SerializedGraph } from '../../../src/utils/interfaces';

const makeV3Graph = (layoutData: unknown): SerializedGraph =>
  ({
    version: 3,
    graphSettings: {},
    links: [],
    nodes: [
      {
        id: 'surface-node-1',
        type: 'UISurfaceNode',
        socketArray: [
          { name: surfaceJsonSocketName, data: layoutData },
          { name: 'Visible', data: true },
        ],
      },
      { id: 'orange-stingray-61', type: 'Constant', socketArray: [] },
      { id: 'ai-node-12', type: 'WidgetButton', socketArray: [] },
    ],
  }) as unknown as SerializedGraph;

const makeTree = () => ({
  ROOT: { props: { id: 'canvas' }, nodes: ['w1', 'w2', 'w3'] },
  w1: { props: { id: 'SOCKET_orange-stingray-61-in-My Value' }, nodes: [] },
  w2: { props: { id: 'SOCKET_ai-node-12-out-value' }, nodes: [] },
  w3: { props: { id: 'NODE_orange-stingray-61' }, nodes: [] },
});

const getLayoutData = (graph: SerializedGraph): unknown =>
  (graph.nodes[0].socketArray as Array<{ name: string; data: unknown }>).find(
    (s) => s.name === surfaceJsonSocketName,
  )!.data;

describe('v3 -> v4 socket element id migration', () => {
  it('rewrites legacy socket ids in an envelope-encoded tree', () => {
    const migrated = migrateGraphDataOnLoad(
      makeV3Graph({ version: 1, tree: makeTree() }),
    );

    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    const data = getLayoutData(migrated) as {
      version: number;
      tree: Record<string, { props: { id: string } }>;
    };
    expect(data.version).toBe(1); // envelope preserved
    expect(data.tree.w1.props.id).toBe(
      'SOCKET_orange-stingray-61::in::My Value',
    );
    expect(data.tree.w2.props.id).toBe('SOCKET_ai-node-12::out::value');
    // NODE_ ids are format-unchanged
    expect(data.tree.w3.props.id).toBe('NODE_orange-stingray-61');
    expect(data.tree.ROOT.props.id).toBe('canvas');
  });

  it('preserves JSON-string encoding of the tree', () => {
    const migrated = migrateGraphDataOnLoad(
      makeV3Graph(JSON.stringify({ version: 1, tree: makeTree() })),
    );

    const raw = getLayoutData(migrated);
    expect(typeof raw).toBe('string');
    const data = JSON.parse(raw as string);
    expect(data.tree.w1.props.id).toBe(
      'SOCKET_orange-stingray-61::in::My Value',
    );
  });

  it('handles a bare (non-envelope) tree object', () => {
    const migrated = migrateGraphDataOnLoad(makeV3Graph(makeTree()));

    const tree = getLayoutData(migrated) as Record<
      string,
      { props: { id: string } }
    >;
    expect(tree.w1.props.id).toBe('SOCKET_orange-stingray-61::in::My Value');
  });

  it('leaves non-conforming legacy ids and malformed layout data untouched', () => {
    // "SOCKET_MyButton-in-x" never matched the old production regex, so it
    // never resolved or rendered - the migration must not guess at it
    const treeWithGhost = {
      ROOT: { props: { id: 'canvas' }, nodes: ['w1'] },
      w1: { props: { id: 'SOCKET_MyButton-in-x' }, nodes: [] },
    };
    const migrated = migrateGraphDataOnLoad(
      makeV3Graph({ version: 1, tree: treeWithGhost }),
    );
    const data = getLayoutData(migrated) as {
      tree: Record<string, { props: { id: string } }>;
    };
    // stays as-is - renders the missing-widget placeholder like before
    expect(data.tree.w1.props.id).toBe('SOCKET_MyButton-in-x');

    const malformed = migrateGraphDataOnLoad(makeV3Graph('not json {'));
    expect(getLayoutData(malformed)).toBe('not json {');
    expect(malformed.version).toBe(GRAPH_DATA_VERSION);
  });

  it('does not touch already-migrated ids', () => {
    const newFormatTree = {
      ROOT: { props: { id: 'canvas' }, nodes: ['w1'] },
      w1: { props: { id: 'SOCKET_MyButton::out::value' }, nodes: [] },
    };
    const migrated = migrateGraphDataOnLoad(
      makeV3Graph({ version: 1, tree: newFormatTree }),
    );
    const data = getLayoutData(migrated) as {
      tree: Record<string, { props: { id: string } }>;
    };
    expect(data.tree.w1.props.id).toBe('SOCKET_MyButton::out::value');
  });
});
