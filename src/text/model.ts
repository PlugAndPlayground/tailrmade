// Headless styling model shared by static and dynamic Text.

import { fontScalarVar } from '../utils/theme/tokens';

export const TEXT_VARIANTS = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'caption',
  'label',
  'stat',
] as const;
export type TextVariant = (typeof TEXT_VARIANTS)[number];

// named after the theme roles they resolve to, except default and muted,
// which are text.primary and text.secondary
export const TEXT_TONES = [
  'default',
  'muted',
  'primary',
  'secondary',
  'success',
  'warning',
  'error',
] as const;
export type TextTone = (typeof TEXT_TONES)[number];

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export const TONE_PALETTE: Record<TextTone, string> = {
  default: 'text.primary',
  muted: 'text.secondary',
  primary: 'primary.main',
  secondary: 'secondary.main',
  success: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
};

export const toneCssVariable = (tone: TextTone): string =>
  `--text-tone-${tone}`;

export const FLUID_MIN_WIDTH_PX = 360;
export const FLUID_MAX_WIDTH_PX = 1024;

const ROOT_FONT_SIZE_PX = 16;

export const VARIANT_STYLES: Record<
  TextVariant,
  {
    fontSize: number;
    fontSizeMax?: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing?: string;
    textTransform?: 'uppercase';
    fontVariantNumeric?: 'tabular-nums';
  }
> = {
  display: { fontSize: 32, fontSizeMax: 48, fontWeight: 700, lineHeight: 1.1 },
  h1: { fontSize: 26, fontSizeMax: 32, fontWeight: 700, lineHeight: 1.2 },
  h2: { fontSize: 20, fontSizeMax: 24, fontWeight: 600, lineHeight: 1.25 },
  h3: { fontSize: 20, fontWeight: 600, lineHeight: 1.3 },
  body: { fontSize: 16, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.4 },
  label: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  stat: {
    fontSize: 28,
    fontSizeMax: 40,
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
};

const trim = (value: number): string => String(Number(value.toFixed(4)));

const rem = (px: number): string => `${trim(px / ROOT_FONT_SIZE_PX)}rem`;

const scaled = (length: string): string =>
  `calc(${length} * ${fontScalarVar()})`;

/**
 * A size that grows with the app's width between the two pinned widths, and
 * holds outside them.
 */
export const fluidFontSize = (min: number, max: number): string => {
  const slope = (max - min) / (FLUID_MAX_WIDTH_PX - FLUID_MIN_WIDTH_PX);
  const intercept = min - slope * FLUID_MIN_WIDTH_PX;
  const preferred = `(${rem(intercept)} + ${trim(slope * 100)}cqi)`;
  return `clamp(${scaled(rem(min))}, ${scaled(preferred)}, ${scaled(rem(max))})`;
};

/** The CSS font-size for a variant, fluid or fixed, with the scalar applied. */
export const variantFontSize = (variant: TextVariant): string => {
  const { fontSize, fontSizeMax } = VARIANT_STYLES[variant];
  return fontSizeMax === undefined
    ? scaled(rem(fontSize))
    : fluidFontSize(fontSize, fontSizeMax);
};

export type TextProps = {
  // Markdown, see lexical/markdown.ts
  content: string;
  variant: TextVariant;
  tone: TextTone;
  alignment: TextAlignment;
  customStyles: Record<string, unknown>;
};

export const textDefaultProps: TextProps = {
  content: 'Text',
  variant: 'body',
  tone: 'default',
  alignment: 'left',
  customStyles: {},
};

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const includes = <T extends string>(list: readonly T[], value: unknown) =>
  list.includes(value as T);

export function normalizeTextProps(props: Record<string, any>): TextProps {
  return {
    content: typeof props.content === 'string' ? props.content : '',
    variant: includes(TEXT_VARIANTS, props.variant)
      ? props.variant
      : textDefaultProps.variant,
    tone: includes(TEXT_TONES, props.tone) ? props.tone : textDefaultProps.tone,
    alignment: includes(TEXT_ALIGNMENTS, props.alignment)
      ? props.alignment
      : textDefaultProps.alignment,
    customStyles: isRecord(props.customStyles) ? props.customStyles : {},
  };
}

export function resolveTextElementStyle(
  props: Pick<TextProps, 'variant' | 'tone' | 'alignment' | 'customStyles'>,
): Record<string, unknown> {
  const {
    fontSize: _min,
    fontSizeMax: _max,
    ...variant
  } = VARIANT_STYLES[props.variant];
  return {
    ...variant,
    fontSize: variantFontSize(props.variant),
    color: props.tone === 'default' ? 'inherit' : TONE_PALETTE[props.tone],
    textAlign: props.alignment,
    ...props.customStyles,
  };
}
