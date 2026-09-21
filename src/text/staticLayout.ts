import type { CSSProperties } from 'react';
import { TRgba } from '../utils/color';
import { getBasicLayoutStyles } from '../utils/layoutableHelpers';
import { colorSettingToCss } from '../utils/themeColors';

const TEXT_PROP_KEYS = new Set([
  'content',
  'variant',
  'tone',
  'alignment',
  'customStyles',
  'id',
  'index',
]);

/** Layout props stored beside a static Text item's text-specific props. */
export function getStaticTextPlacementProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !TEXT_PROP_KEYS.has(key)),
  );
}

/** Props belonging to a DynamicWidget placement rather than its graph node. */
export function getDynamicWidgetPlacementProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { id: _id, index: _index, ...placement } = props;
  return placement;
}

/** Makes placement props keep their appearance while the item is static. */
export function resolveStaticTextFrameStyle(
  props: Record<string, unknown>,
  parentDirection: 'row' | 'column',
): CSSProperties {
  // Keep ordinary static Text exactly as it was. A layout frame is only
  // needed when a converted widget actually brought placement props along.
  if (Object.keys(getStaticTextPlacementProps(props)).length === 0) {
    return { width: '100%' };
  }

  const width = typeof props.width === 'string' ? props.width : '100%';
  const height = typeof props.height === 'string' ? props.height : 'auto';
  const background =
    typeof props.background === 'object' && props.background !== null
      ? Object.assign(new TRgba(), props.background).toString()
      : undefined;
  const padding = Array.isArray(props.padding)
    ? props.padding.map((value) => `${Number(value) || 0}px`).join(' ')
    : undefined;

  return {
    ...getBasicLayoutStyles(width, height, parentDirection),
    flexDirection:
      props.flexDirection === 'row' || props.flexDirection === 'column'
        ? props.flexDirection
        : 'column',
    alignItems:
      typeof props.alignItems === 'string' ? props.alignItems : 'stretch',
    justifyContent:
      typeof props.justifyContent === 'string'
        ? props.justifyContent
        : 'flex-start',
    minWidth: typeof props.minWidth === 'string' ? props.minWidth : undefined,
    minHeight:
      typeof props.minHeight === 'string' ? props.minHeight : undefined,
    maxWidth: typeof props.maxWidth === 'string' ? props.maxWidth : undefined,
    maxHeight:
      typeof props.maxHeight === 'string' ? props.maxHeight : undefined,
    boxSizing: 'border-box',
    background,
    color:
      props.color === undefined ? undefined : colorSettingToCss(props.color),
    padding,
  };
}
