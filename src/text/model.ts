// Headless styling model shared by static and dynamic Text.

export const TEXT_VARIANTS = [
  'display',
  'h1',
  'h2',
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

export const VARIANT_STYLES: Record<
  TextVariant,
  {
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing?: string;
    textTransform?: 'uppercase';
    fontVariantNumeric?: 'tabular-nums';
  }
> = {
  display: { fontSize: 48, fontWeight: 700, lineHeight: 1.1 },
  h1: { fontSize: 32, fontWeight: 700, lineHeight: 1.2 },
  h2: { fontSize: 24, fontWeight: 600, lineHeight: 1.25 },
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
    fontSize: 40,
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
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
  const { fontSize, ...variant } = VARIANT_STYLES[props.variant];
  return {
    ...variant,
    fontSize: `${fontSize}px`,
    color: props.tone === 'default' ? 'inherit' : TONE_PALETTE[props.tone],
    textAlign: props.alignment,
    ...props.customStyles,
  };
}
