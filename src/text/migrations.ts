// Headless migrations of persisted text into the v2 model. Graph migrations
// import this early, so keep React, PIXI, MUI and node classes out.
import { ColorSetting, colorSettingToCss } from '../utils/themeColors';
import { textContentToMarkdown } from './inlineMarkdown';
import { textContentFromLegacyHtml } from './legacyHtml';
import { TEXT_ALIGNMENTS, TextAlignment, textDefaultProps } from './model';

export const STATIC_TEXT_ITEM_TYPE = 'Text';

// the old widget rendered with these whatever its props said
const LEGACY_FONT_SIZE = 20;
const LEGACY_LINE_HEIGHT = 1.2;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Pre-v2 styling becomes custom styles - including values that equal the old
 * defaults, since the v2 variant defaults differ from them.
 */
export function legacyTextStyleToCustomStyles(style: {
  fontSize?: unknown;
  fontWeight?: unknown;
  color?: unknown;
}): Record<string, unknown> {
  const fontSize = Number(style.fontSize);
  return {
    fontSize: `${
      style.fontSize !== '' && Number.isFinite(fontSize)
        ? fontSize
        : LEGACY_FONT_SIZE
    }px`,
    fontWeight:
      typeof style.fontWeight === 'string' ||
      typeof style.fontWeight === 'number'
        ? style.fontWeight
        : 'normal',
    lineHeight: LEGACY_LINE_HEIGHT,
    // without a picked color the old widget followed its container's
    color: colorSettingToCss(style.color as ColorSetting),
  };
}

export function isLegacyStaticTextProps(props: unknown): boolean {
  return (
    isRecord(props) &&
    typeof props.text === 'string' &&
    props.content === undefined
  );
}

export function migrateLegacyStaticTextProps(
  props: Record<string, any>,
): Record<string, any> {
  const { text, fontSize, fontWeight, textAlign, color, ...rest } = props;
  return {
    ...rest,
    content: textContentToMarkdown(textContentFromLegacyHtml(text)),
    variant: textDefaultProps.variant,
    tone: textDefaultProps.tone,
    alignment: TEXT_ALIGNMENTS.includes(textAlign as TextAlignment)
      ? textAlign
      : textDefaultProps.alignment,
    customStyles: {
      ...legacyTextStyleToCustomStyles({ fontSize, fontWeight, color }),
      ...(isRecord(rest.customStyles) ? rest.customStyles : {}),
    },
  };
}

export function migrateStaticTextItemsInTree(
  tree: Record<string, any>,
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(tree).map(([key, item]) => [
      key,
      item?.type?.resolvedName === STATIC_TEXT_ITEM_TYPE &&
      isLegacyStaticTextProps(item.props)
        ? { ...item, props: migrateLegacyStaticTextProps(item.props) }
        : item,
    ]),
  );
}
