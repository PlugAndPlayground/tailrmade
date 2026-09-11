import { migrateLegacyTextNodes } from '../../../src/text/nodeMigrations';
import {
  TEXT_NODE_SOCKETS,
  textPropsFromSocketValues,
} from '../../../src/text/nodeSockets';
import type {
  SerializedGraph,
  SerializedNode,
} from '../../../src/utils/interfaces';

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
      { socketType: 'out', name: 'Output', dataType: '{"class":"StringType"}' },
      {
        socketType: 'out',
        name: 'ReactUI',
        dataType: '{"class":"DeferredReactType"}',
      },
      {
        socketType: 'in',
        name: 'Input',
        dataType: '{"class":"StringType"}',
        data: input,
      },
      {
        socketType: 'in',
        name: 'Font size',
        dataType: '{"class":"NumberType"}',
        data: 40,
      },
      {
        socketType: 'in',
        name: 'Width',
        dataType: '{"class":"NumberType"}',
        data: 0,
      },
      {
        socketType: 'in',
        name: 'Text alignment',
        dataType: '{"class":"EnumType"}',
        data: 'Center',
      },
      {
        socketType: 'in',
        name: 'Font weight',
        dataType: '{"class":"EnumType"}',
        data: 'Bold',
      },
      {
        socketType: 'in',
        name: 'Text color',
        dataType: '{"class":"ColorType"}',
        data: { r: 10, g: 200, b: 30, a: 1 },
      },
      {
        socketType: 'in',
        name: 'Background Color',
        dataType: '{"class":"ColorType"}',
        data: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  }) as unknown as SerializedNode;

const graphOf = (nodes: SerializedNode[], links: unknown[] = []) =>
  ({
    version: 7,
    graphSettings: {},
    nodes,
    links,
  }) as unknown as SerializedGraph;

const socketValues = (node: SerializedNode) =>
  Object.fromEntries(
    node.socketArray
      .filter((socket) => socket.socketType !== 'out')
      .map((socket) => [socket.name, socket.data]),
  );

describe('legacy Text node migration', () => {
  it('keeps unlinked input text as content and styles as custom styles', () => {
    const migrated = migrateLegacyTextNodes(
      graphOf([legacyTextNode('plain', 'Hello\nworld')]),
    );
    const node = migrated.nodes[0];
    const props = textPropsFromSocketValues(socketValues(node));

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
    const migrated = migrateLegacyTextNodes(
      graphOf(
        [
          legacyTextNode('linked', 'stale'),
          {
            type: 'Label',
            id: 'label',
            socketArray: [],
          } as unknown as SerializedNode,
        ],
        [inputLink, styleLink, outputLink],
      ),
    );
    const node = migrated.nodes[0];
    const input = node.socketArray.find((socket) => socket.name === 'Input');

    expect(input).toMatchObject({
      dataType: '{"class":"AnyType"}',
      data: 'stale',
    });
    expect(textPropsFromSocketValues(socketValues(node)).content).toBe(
      '{{Input}}',
    );
    expect(migrated.links).toEqual([inputLink, outputLink]);
    expect(migrated.nodes[1]).toEqual({
      type: 'Label',
      id: 'label',
      socketArray: [],
    });
  });

  it('carries a visible background over as custom styles', () => {
    const node = legacyTextNode('boxed', 'Hi');
    node.socketArray.find(
      (socket) => socket.name === 'Background Color',
    )!.data = { r: 1, g: 2, b: 3, a: 0.5 };
    const migrated = migrateLegacyTextNodes(graphOf([node]));
    expect(
      textPropsFromSocketValues(socketValues(migrated.nodes[0])).customStyles,
    ).toMatchObject({
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
