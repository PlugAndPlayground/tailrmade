// Every persisted-text migration in one place: the props model the migrations
// target, legacy static Text items, legacy Text nodes, and the load path that
// runs them all.
import {
  migrateLegacyStaticTextProps,
  migrateStaticTextItemsInTree,
} from '../../../src/text/migrations';
import {
  normalizeTextProps,
  resolveTextElementStyle,
  textDefaultProps,
} from '../../../src/text/model';
import { migrateLegacyTextNodes } from '../../../src/text/nodeMigrations';
import {
  TEXT_NODE_SOCKETS,
  textPropsFromSocketValues,
} from '../../../src/text/nodeSockets';
import { surfaceJsonSocketName } from '../../../src/utils/constants_shared';
import {
  GRAPH_DATA_VERSION,
  migrateGraphDataOnLoad,
} from '../../../src/utils/graphMigrations';
import type {
  SerializedGraph,
  SerializedNode,
} from '../../../src/utils/interfaces';

const socket = (
  name: string,
  data: unknown,
  cls = 'StringType',
  socketType = 'in',
) => ({ socketType, name, dataType: `{"class":"${cls}"}`, data });

const legacyTextNode = (id: string, input: unknown): SerializedNode =>
  ({
    type: 'Text',
    id,
    x: 10,
    y: 20,
    width: 150,
    height: 60,
    updateBehaviour: { load: true, update: true, interval: false },
    socketArray: [
      socket('Output', undefined, 'StringType', 'out'),
      socket('ReactUI', undefined, 'DeferredReactType', 'out'),
      socket('Input', input),
      socket('Font size', 40, 'NumberType'),
      socket('Width', 0, 'NumberType'),
      socket('Text alignment', 'Center', 'EnumType'),
      socket('Font weight', 'Bold', 'EnumType'),
      socket('Text color', { r: 10, g: 200, b: 30, a: 1 }, 'ColorType'),
      socket('Background Color', { r: 0, g: 0, b: 0, a: 0 }, 'ColorType'),
    ],
  }) as unknown as SerializedNode;

const legacyStaticProps = {
  text: 'Hello world\nnext',
  fontSize: 24,
  fontWeight: '700',
  textAlign: 'center',
  color: { r: 10, g: 20, b: 30, a: 1 },
};

const legacyTextTree = () => ({
  ROOT: {
    type: { resolvedName: 'Container' },
    props: { color: 'inherit' },
    nodes: ['t1'],
  },
  t1: {
    type: { resolvedName: 'Text' },
    props: { ...legacyStaticProps },
    parent: 'ROOT',
    nodes: [],
  },
});

const graphOf = (nodes: unknown[], links: unknown[] = []) =>
  ({
    version: 5,
    graphSettings: {},
    nodes,
    links,
  }) as unknown as SerializedGraph;

const surfaceGraph = (layoutData: unknown) =>
  graphOf([
    {
      id: 'surface',
      type: 'UISurfaceNode',
      socketArray: [socket(surfaceJsonSocketName, layoutData, 'JSONType')],
    },
  ]);

const socketData = (graph: SerializedGraph, nodeId: string, name: string) =>
  graph.nodes
    .find((node) => node.id === nodeId)!
    .socketArray.find((socket) => socket.name === name)?.data;

// the v2 props a migrated node's sockets carry
const nodeProps = (node: SerializedNode) =>
  textPropsFromSocketValues(
    Object.fromEntries(
      node.socketArray
        .filter((socket) => socket.socketType !== 'out')
        .map((socket) => [socket.name, socket.data]),
    ),
  );

describe('text props', () => {
  it('normalizes unknown values back to defaults', () => {
    expect(
      normalizeTextProps({
        variant: 'huge',
        tone: 'loud',
        alignment: 'middle',
        customStyles: 'nope',
      }),
    ).toEqual({ ...textDefaultProps, content: '' });
  });

  it('applies custom styles over the variant, tone and alignment', () => {
    const base = {
      variant: 'h1' as const,
      tone: 'primary' as const,
      alignment: 'center' as const,
      customStyles: {},
    };
    expect(resolveTextElementStyle(base)).toMatchObject({
      fontSize: expect.stringContaining('clamp('),
      fontWeight: 700,
      color: 'primary.main',
      textAlign: 'center',
    });
    expect(resolveTextElementStyle({ ...base, tone: 'default' }).color).toBe(
      'inherit',
    );
    expect(
      resolveTextElementStyle({
        ...base,
        customStyles: { fontSize: '9px', color: 'red' },
      }),
    ).toMatchObject({ fontSize: '9px', fontWeight: 700, color: 'red' });
  });
});

describe('legacy static Text props', () => {
  it('moves every legacy style into custom styles, rendering as it did', () => {
    const migrated = migrateLegacyStaticTextProps(legacyStaticProps);
    expect(migrated).toMatchObject({
      variant: 'body',
      tone: 'default',
      alignment: 'center',
      content: 'Hello world\nnext',
      customStyles: {
        fontSize: '24px',
        fontWeight: '700',
        lineHeight: 1.2,
        color: 'rgb(10, 20, 30)',
      },
    });
    expect(migrated).not.toHaveProperty('text');
    expect(migrated).not.toHaveProperty('fontSize');
    // the same computed style the old widget used
    expect(resolveTextElementStyle(normalizeTextProps(migrated))).toMatchObject(
      {
        fontSize: '24px',
        fontWeight: '700',
        lineHeight: 1.2,
        textAlign: 'center',
        color: 'rgb(10, 20, 30)',
      },
    );
  });

  it('keeps theme-inherited color and the old fallbacks', () => {
    const migrated = migrateLegacyStaticTextProps({
      text: 'Hi',
      fontSize: 'big',
      fontWeight: undefined,
      textAlign: 'middle',
      color: 'inherit',
    });
    expect(migrated.alignment).toBe('left');
    expect(migrated.customStyles).toEqual({
      fontSize: '20px',
      fontWeight: 'normal',
      lineHeight: 1.2,
      color: 'inherit',
    });
    expect(resolveTextElementStyle(normalizeTextProps(migrated)).color).toBe(
      'inherit',
    );
  });

  it('keeps existing custom styles on top and markup as literal text', () => {
    expect(
      migrateLegacyStaticTextProps({
        ...legacyStaticProps,
        customStyles: { color: 'red' },
      }).customStyles.color,
    ).toBe('red');
    expect(
      migrateLegacyStaticTextProps({ text: 'a <b>b</b> *c*' }).content,
    ).toBe('a <b>b</b> \\*c\\*');
  });

  it('migrates only legacy Text items in a tree', () => {
    const tree = {
      ...legacyTextTree(),
      b: {
        type: { resolvedName: 'Text' },
        props: normalizeTextProps({ content: 'kept' }),
        nodes: [],
      },
      c: {
        type: { resolvedName: 'DynamicWidget' },
        props: { text: 'not a text item' },
        nodes: [],
      },
    };
    const migrated = migrateStaticTextItemsInTree(tree);
    expect(migrated.t1.props.customStyles.fontSize).toBe('24px');
    expect(migrated.b).toBe(tree.b);
    expect(migrated.c).toBe(tree.c);
    expect(migrated.ROOT).toBe(tree.ROOT);
  });
});

describe('legacy Text nodes', () => {
  it('keeps unlinked input text as content and styles as custom styles', () => {
    const migrated = migrateLegacyTextNodes(
      graphOf([legacyTextNode('plain', 'Hello\nworld')]),
    );
    const node = migrated.nodes[0];
    const props = nodeProps(node);

    expect(node.id).toBe('plain');
    expect(props.content).toBe('Hello\nworld');
    expect(props.alignment).toBe('center');
    expect(props.customStyles).toEqual({
      fontSize: '40px',
      fontWeight: '700',
      lineHeight: 1.15,
      color: 'rgb(10, 200, 30)',
    });
    const names = node.socketArray.map((socket) => socket.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Output',
        'ReactUI',
        ...Object.values(TEXT_NODE_SOCKETS),
      ]),
    );
    ['Input', 'Font size', 'Width', 'Text color'].forEach((legacy) =>
      expect(names).not.toContain(legacy),
    );
  });

  it('turns a linked input into the {{Input}} token and keeps the link', () => {
    const inputLink = {
      sourceNodeId: 'constant',
      sourceSocketName: 'Out',
      targetNodeId: 'linked',
      targetSocketName: 'Input',
    };
    const styleLink = { ...inputLink, targetSocketName: 'Font size' };
    const outputLink = {
      sourceNodeId: 'linked',
      sourceSocketName: 'Output',
      targetNodeId: 'label',
      targetSocketName: 'Input',
    };
    const label = { type: 'Label', id: 'label', socketArray: [] };
    const migrated = migrateLegacyTextNodes(
      graphOf(
        [legacyTextNode('linked', 'stale'), label],
        [inputLink, styleLink, outputLink],
      ),
    );
    const node = migrated.nodes[0];

    expect(
      node.socketArray.find((socket) => socket.name === 'Input'),
    ).toMatchObject({ dataType: '{"class":"AnyType"}', data: 'stale' });
    expect(nodeProps(node).content).toBe('{{Input}}');
    // the style link is dropped, everything else survives untouched
    expect(migrated.links).toEqual([inputLink, outputLink]);
    expect(migrated.nodes[1]).toEqual(label);
  });

  it('carries a visible background over as custom styles', () => {
    const node = legacyTextNode('boxed', 'Hi');
    node.socketArray.find(
      (socket) => socket.name === 'Background Color',
    )!.data = { r: 1, g: 2, b: 3, a: 0.5 };
    const migrated = migrateLegacyTextNodes(graphOf([node]));
    expect(nodeProps(migrated.nodes[0]).customStyles).toMatchObject({
      backgroundColor: 'rgba(1, 2, 3, 0.5)',
      padding: '20px 26.666666666666668px',
    });
  });

  it('leaves migrated Text nodes and other graphs untouched', () => {
    const once = migrateLegacyTextNodes(graphOf([legacyTextNode('a', 'x')]));
    expect(migrateLegacyTextNodes(once)).toBe(once);
    const noText = graphOf([]);
    expect(migrateLegacyTextNodes(noText)).toBe(noText);
  });
});

describe('migrateGraphDataOnLoad', () => {
  const expectMigratedTree = (tree: Record<string, any>) => {
    expect(tree.t1.props).toMatchObject({
      content: 'Hello world\nnext',
      alignment: 'center',
      customStyles: {
        fontSize: '24px',
        fontWeight: '700',
        lineHeight: 1.2,
        color: 'rgb(10, 20, 30)',
      },
    });
    expect(tree.t1.props).not.toHaveProperty('text');
    expect(tree.ROOT).toEqual(legacyTextTree().ROOT);
  };
  const layoutAfterLoad = (layoutData: unknown) =>
    migrateGraphDataOnLoad(surfaceGraph(layoutData)).nodes[0].socketArray[0]
      .data;

  it('migrates a static tree however the surface stores it', () => {
    const envelope = layoutAfterLoad({
      version: 1,
      tree: legacyTextTree(),
    }) as any;
    expect(envelope.version).toBe(1);
    expectMigratedTree(envelope.tree);

    expectMigratedTree(layoutAfterLoad(legacyTextTree()) as any);

    // a JSON string stays a JSON string
    const raw = layoutAfterLoad(
      JSON.stringify({ version: 1, tree: legacyTextTree() }),
    );
    expect(typeof raw).toBe('string');
    expectMigratedTree(JSON.parse(raw as string).tree);
  });

  it('leaves malformed layout data alone', () => {
    expect(layoutAfterLoad('not json {')).toBe('not json {');
  });

  it('runs the Text node migration and rewrites editor mentions', () => {
    const migrated = migrateGraphDataOnLoad(
      graphOf([
        legacyTextNode('old-text', 'hello'),
        {
          id: 'editor',
          type: 'TextEditor2',
          socketArray: [
            socket(
              'Markdown',
              '# @[42](socket:Input)\n\n**@[old](socket:Input 2)**',
            ),
            socket('Input', 42, 'NumberType'),
          ],
        },
        {
          id: 'other',
          type: 'Constant',
          socketArray: [socket('Markdown', '@[1](socket:x)')],
        },
      ]),
    );

    expect(migrated.version).toBe(GRAPH_DATA_VERSION);
    expect(socketData(migrated, 'old-text', 'Content')).toBe('hello');
    expect(socketData(migrated, 'old-text', 'Custom styles')).toMatchObject({
      fontSize: '40px',
    });
    expect(socketData(migrated, 'editor', 'Markdown')).toBe(
      '# {{Input}}\n\n**{{[Input 2]}}**',
    );
    expect(socketData(migrated, 'editor', 'Input')).toBe(42);
    // only the text editor's own markdown is rewritten
    expect(socketData(migrated, 'other', 'Markdown')).toBe('@[1](socket:x)');
  });
});
