// Pre-v2 Text nodes (a Label with an Input string and styling sockets) become
// the token-based Text node. Headless: runs inside graph migrations.
import type {
  SerializedGraph,
  SerializedLink,
  SerializedNode,
  SerializedSelection,
  SerializedSocket,
} from '../utils/interfaces';
import { colorSettingToCss } from '../utils/themeColors';
import { plainTextToMarkdown } from './markdownEscaping';
import { TextAlignment, textDefaultProps } from './model';
import {
  TEXT_NODE_SOCKETS,
  TEXT_NODE_TYPE,
  textPropsToSocketValues,
} from './nodeSockets';
import { formatToken } from './tokens';

const LEGACY_INPUT = 'Input';
const LEGACY_STYLE_SOCKETS = [
  'Font size',
  'Width',
  'Text alignment',
  'Font weight',
  'Text color',
  'Background Color',
];
// what the old Text node rendered with (see Label.getWidgetContent)
const LEGACY_FONT_SIZE = 32;
const LEGACY_LINE_HEIGHT = 1.15;
const LEGACY_TEXT_COLOR = { r: 255, g: 255, b: 255, a: 1 };
const LEGACY_ALIGNMENTS: Record<string, TextAlignment> = {
  Left: 'left',
  Center: 'center',
  Right: 'right',
};
const LEGACY_WEIGHTS: Record<string, string> = { Regular: '400', Bold: '700' };

const SOCKET_TYPES: Record<string, string> = {
  [TEXT_NODE_SOCKETS.content]: 'StringType',
  [TEXT_NODE_SOCKETS.variant]: 'EnumType',
  [TEXT_NODE_SOCKETS.tone]: 'EnumType',
  [TEXT_NODE_SOCKETS.alignment]: 'EnumType',
  [TEXT_NODE_SOCKETS.customStyles]: 'JSONType',
};

type Rgba = Record<'r' | 'g' | 'b' | 'a', number>;

const isColor = (value: unknown): value is Rgba =>
  typeof value === 'object' &&
  value !== null &&
  ['r', 'g', 'b', 'a'].every((channel) =>
    Number.isFinite(Number((value as Record<string, unknown>)[channel])),
  );

const toColor = (value: Rgba): Rgba => ({
  r: Number(value.r),
  g: Number(value.g),
  b: Number(value.b),
  a: Number(value.a),
});

export function isLegacyTextNode(node: SerializedNode): boolean {
  return (
    String(node.type).toLowerCase() === TEXT_NODE_TYPE.toLowerCase() &&
    !node.socketArray.some(
      (socket) => socket.name === TEXT_NODE_SOCKETS.content,
    )
  );
}

function migrateNode(
  node: SerializedNode,
  inputIsLinked: boolean,
): SerializedNode {
  const data = (name: string) =>
    node.socketArray.find(
      (socket) => socket.name === name && socket.socketType !== 'out',
    )?.data;
  const input = node.socketArray.find(
    (socket) => socket.name === LEGACY_INPUT && socket.socketType !== 'out',
  );

  const fontSizeValue = Number(data('Font size'));
  const fontSize = Number.isFinite(fontSizeValue)
    ? fontSizeValue
    : LEGACY_FONT_SIZE;
  const textColor = data('Text color');
  const background = data('Background Color');
  const customStyles: Record<string, unknown> = {
    fontSize: `${fontSize}px`,
    fontWeight: LEGACY_WEIGHTS[String(data('Font weight'))] ?? '400',
    lineHeight: LEGACY_LINE_HEIGHT,
    color: colorSettingToCss(
      isColor(textColor) ? toColor(textColor) : LEGACY_TEXT_COLOR,
    ),
  };
  if (isColor(background) && Number(background.a) > 0) {
    customStyles.backgroundColor = `rgba(${background.r}, ${background.g}, ${background.b}, ${background.a})`;
    customStyles.padding = `${fontSize / 2}px ${fontSize / 1.5}px`;
  }

  const content = inputIsLinked
    ? formatToken({ path: [LEGACY_INPUT] })
    : plainTextToMarkdown(input?.data == null ? '' : String(input.data));

  const values = textPropsToSocketValues({
    ...textDefaultProps,
    content,
    alignment: LEGACY_ALIGNMENTS[String(data('Text alignment'))] ?? 'left',
    customStyles,
  });
  const v2Sockets: SerializedSocket[] = Object.entries(values).map(
    ([name, value]) => ({
      socketType: 'in',
      name,
      dataType: JSON.stringify({ class: SOCKET_TYPES[name] }),
      data: value,
      visible: false,
      dependentSocketName: undefined,
    }),
  );
  const kept = node.socketArray.filter(
    (socket) =>
      socket.socketType === 'out' ||
      (socket.name === LEGACY_INPUT && inputIsLinked),
  );

  return {
    ...node,
    // Socket types also select the renderer for existing dashboard widgets.
    socketArray: [...kept, ...v2Sockets],
  };
}

/**
 * Keeps node ids and every link that still has a target: a linked Input
 * becomes the `{{Input}}` token over the same socket; links into the old
 * styling sockets are dropped, their current values baked into custom styles.
 */
export function migrateLegacyTextNodes(
  graphData: SerializedGraph,
): SerializedGraph {
  const legacyIds = new Set(
    graphData.nodes.filter(isLegacyTextNode).map((node) => node.id),
  );
  if (legacyIds.size === 0) {
    return graphData;
  }
  const targetsLegacy = (link: SerializedLink, sockets: string[]) =>
    legacyIds.has(link.targetNodeId) && sockets.includes(link.targetSocketName);

  return {
    ...graphData,
    nodes: graphData.nodes.map((node) =>
      legacyIds.has(node.id)
        ? migrateNode(
            node,
            graphData.links.some(
              (link) =>
                link.targetNodeId === node.id &&
                link.targetSocketName === LEGACY_INPUT,
            ),
          )
        : node,
    ),
    links: graphData.links.filter(
      (link) => !targetsLegacy(link, LEGACY_STYLE_SOCKETS),
    ),
  };
}

const LABEL_NODE_TYPE = 'label';
const LABEL_OUTPUT = 'Output';
const REACT_UI_OUTPUT = 'ReactUI';
const CONSTANT_STRING_NODE_TYPE = 'CONSTANT_String';
const CONSTANT_STRING_SOCKET = 'String';

const stringSocket = (
  socketType: 'in' | 'out',
  data: unknown,
): SerializedSocket => ({
  socketType,
  name: CONSTANT_STRING_SOCKET,
  dataType: JSON.stringify({ class: 'StringType' }),
  data,
  visible: true,
  dependentSocketName: undefined,
});

// A Label showing a linked value, or placed on a UI page, keeps doing that as
// Dynamic text; its Input stays as the {{Input}} token's socket.
function labelToDynamicText(
  node: SerializedNode,
  inputIsLinked: boolean,
): SerializedNode {
  const input = node.socketArray.find(
    (socket) => socket.name === LEGACY_INPUT && socket.socketType !== 'out',
  );
  const content = inputIsLinked
    ? formatToken({ path: [LEGACY_INPUT] })
    : plainTextToMarkdown(input?.data == null ? '' : String(input.data));
  const values = textPropsToSocketValues({ ...textDefaultProps, content });
  return {
    ...node,
    type: TEXT_NODE_TYPE,
    socketArray: [
      ...node.socketArray.filter(
        (socket) =>
          socket.socketType === 'out' || (inputIsLinked && socket === input),
      ),
      ...Object.entries(values).map(([name, value]) => ({
        socketType: 'in' as const,
        name,
        dataType: JSON.stringify({ class: SOCKET_TYPES[name] }),
        data: value,
        visible: false,
        dependentSocketName: undefined,
      })),
    ],
  };
}

function labelToConstantString(node: SerializedNode): SerializedNode {
  const input = node.socketArray.find(
    (socket) => socket.name === LEGACY_INPUT && socket.socketType !== 'out',
  );
  const text = input?.data == null ? '' : String(input.data);
  return {
    ...node,
    type: CONSTANT_STRING_NODE_TYPE,
    version: undefined,
    // the Label's box fitted its own font size; the Constant sizes to its text
    width: 0,
    height: 0,
    socketArray: [stringSocket('in', text), stringSocket('out', text)],
  };
}

/**
 * The Label node is gone. A Label whose Input is linked, or that sits on a UI
 * page, becomes Dynamic text; every other Label becomes a Constant String
 * holding its text. Styling is dropped, along with links into it. Node ids
 * stay, so links out of the Label and page placements survive.
 */
export function migrateLabelNodes<T extends SerializedSelection>(graph: T): T {
  const labels = graph.nodes.filter(
    (node) => String(node.type).toLowerCase() === LABEL_NODE_TYPE,
  );
  if (labels.length === 0) {
    return graph;
  }
  const textIds = new Set<string>();
  const linkedInputIds = new Set<string>();
  for (const label of labels) {
    const inputIsLinked = graph.links.some(
      (link) =>
        link.targetNodeId === label.id &&
        link.targetSocketName === LEGACY_INPUT,
    );
    const onPage = graph.links.some(
      (link) =>
        link.sourceNodeId === label.id &&
        link.sourceSocketName === REACT_UI_OUTPUT,
    );
    if (inputIsLinked) linkedInputIds.add(label.id);
    if (inputIsLinked || onPage) textIds.add(label.id);
  }
  const labelIds = new Set(labels.map((label) => label.id));

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!labelIds.has(node.id)) return node;
      return textIds.has(node.id)
        ? labelToDynamicText(node, linkedInputIds.has(node.id))
        : labelToConstantString(node);
    }),
    links: graph.links
      .filter(
        (link) =>
          !labelIds.has(link.targetNodeId) ||
          (linkedInputIds.has(link.targetNodeId) &&
            link.targetSocketName === LEGACY_INPUT),
      )
      .map((link) =>
        labelIds.has(link.sourceNodeId) &&
        !textIds.has(link.sourceNodeId) &&
        link.sourceSocketName === LABEL_OUTPUT
          ? { ...link, sourceSocketName: CONSTANT_STRING_SOCKET }
          : link,
      ),
  };
}
