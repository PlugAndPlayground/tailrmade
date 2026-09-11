// Pre-v2 Text nodes (a Label with an Input string and styling sockets) become
// the token-based Text node. Headless: runs inside graph migrations.
import type {
  SerializedGraph,
  SerializedLink,
  SerializedNode,
  SerializedSocket,
} from '../utils/interfaces';
import { colorSettingToCss } from '../utils/themeColors';
import { textContentToMarkdown } from './inlineMarkdown';
import { createTextContent, TextAlignment, textDefaultProps } from './model';
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
    : textContentToMarkdown(
        createTextContent(input?.data == null ? '' : String(input.data)),
      );

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
    socketArray: [
      ...kept.map((socket) =>
        socket.name === LEGACY_INPUT && socket.socketType !== 'out'
          ? { ...socket, dataType: JSON.stringify({ class: 'AnyType' }) }
          : socket,
      ),
      ...v2Sockets,
    ],
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
