// The Label node is gone: Labels load as Constant String, or as Dynamic text
// when they show a linked value or sit on a UI page.
import { migrateLabelNodes } from '../../../src/text/nodeMigrations';
import {
  TEXT_NODE_SOCKETS,
  textPropsFromSocketValues,
} from '../../../src/text/nodeSockets';
import type {
  SerializedLink,
  SerializedNode,
  SerializedSelection,
} from '../../../src/utils/interfaces';

const socket = (
  name: string,
  data: unknown,
  cls = 'StringType',
  socketType = 'in',
) => ({ socketType, name, dataType: `{"class":"${cls}"}`, data });

const labelNode = (id: string, text: unknown): SerializedNode =>
  ({
    type: 'Label',
    id,
    name: undefined,
    x: 10,
    y: 20,
    width: 3000,
    height: 300,
    version: undefined,
    updateBehaviour: { load: true, update: true, interval: false },
    socketArray: [
      socket('Output', undefined, 'StringType', 'out'),
      socket('ReactUI', undefined, 'DeferredReactType', 'out'),
      socket('Width', 0, 'NumberType'),
      socket('Input', text),
      socket('Font size', 64, 'NumberType'),
      socket('Text color', { r: 0, g: 0, b: 0, a: 1 }, 'ColorType'),
      socket('Background Color', { r: 1, g: 2, b: 3, a: 1 }, 'ColorType'),
    ],
  }) as unknown as SerializedNode;

const otherNode = (id: string): SerializedNode =>
  ({
    type: 'Concatenate',
    id,
    socketArray: [socket('Out', undefined, 'StringType', 'out')],
  }) as unknown as SerializedNode;

const link = (
  sourceNodeId: string,
  sourceSocketName: string,
  targetNodeId: string,
  targetSocketName: string,
): SerializedLink => ({
  sourceNodeId,
  sourceSocketName,
  targetNodeId,
  targetSocketName,
});

const graph = (
  nodes: SerializedNode[],
  links: SerializedLink[] = [],
): SerializedSelection => ({ version: 12, nodes, links });

const inputData = (node: SerializedNode, name: string) =>
  node.socketArray.find((s) => s.name === name && s.socketType === 'in')?.data;

describe('migrateLabelNodes', () => {
  it('turns a note Label into a Constant String holding its text', () => {
    const migrated = migrateLabelNodes(
      graph(
        [
          labelNode(
            'note',
            'This page is a Tailrmade app.\nFollow the numbers',
          ),
          otherNode('sink'),
        ],
        [
          link('note', 'Output', 'sink', 'a'),
          link('sink', 'Out', 'note', 'Font size'),
        ],
      ),
    );
    const [note, sink] = migrated.nodes;
    expect(note.type).toBe('CONSTANT_String');
    expect({
      id: note.id,
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
    }).toEqual({ id: 'note', x: 10, y: 20, width: 0, height: 0 });
    expect(note.socketArray.map((s) => [s.socketType, s.name])).toEqual([
      ['in', 'String'],
      ['out', 'String'],
    ]);
    expect(inputData(note, 'String')).toBe(
      'This page is a Tailrmade app.\nFollow the numbers',
    );
    expect(sink).toEqual(otherNode('sink'));
    // the outgoing link follows the new socket; the styling link is dropped
    expect(migrated.links).toEqual([link('note', 'String', 'sink', 'a')]);
  });

  it('turns a Label showing a linked value into Dynamic text with {{Input}}', () => {
    const migrated = migrateLabelNodes(
      graph(
        [otherNode('source'), labelNode('shows', 'stale')],
        [
          link('source', 'Out', 'shows', 'Input'),
          link('source', 'Out', 'shows', 'Background Color'),
        ],
      ),
    );
    const shows = migrated.nodes[1];
    expect(shows.type).toBe('Text');
    expect(textPropsFromSocketValues(valuesOf(shows)).content).toBe(
      '{{Input}}',
    );
    expect(shows.socketArray.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Output', 'ReactUI', 'Input']),
    );
    expect(shows.socketArray.map((s) => s.name)).not.toEqual(
      expect.arrayContaining(['Font size']),
    );
    expect(migrated.links).toEqual([link('source', 'Out', 'shows', 'Input')]);
  });

  it('keeps a Label on a UI page on the page as Dynamic text', () => {
    const migrated = migrateLabelNodes(
      graph(
        [labelNode('placed', 'Hello *world*'), otherNode('page')],
        [link('placed', 'ReactUI', 'page', 'Label')],
      ),
    );
    const placed = migrated.nodes[0];
    expect(placed.type).toBe('Text');
    // the text is kept literally, so Markdown characters are escaped
    expect(textPropsFromSocketValues(valuesOf(placed)).content).toBe(
      'Hello \\*world\\*',
    );
    expect(placed.socketArray.some((s) => s.name === 'Input')).toBe(false);
    expect(migrated.links).toEqual([
      link('placed', 'ReactUI', 'page', 'Label'),
    ]);
  });

  it('returns graphs without Labels unchanged', () => {
    const untouched = graph([otherNode('a')]);
    expect(migrateLabelNodes(untouched)).toBe(untouched);
  });
});

function valuesOf(node: SerializedNode): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(TEXT_NODE_SOCKETS).map((name) => [
      name,
      inputData(node, name),
    ]),
  );
}
