// Headless content and styling model shared by static and dynamic Text.
// Keep React, PIXI, MUI and node classes out of this module - the surface
// layout spec and graph migrations import it.

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

export const TEXT_TONES = [
  'default',
  'muted',
  'accent',
  'positive',
  'negative',
] as const;
export type TextTone = (typeof TEXT_TONES)[number];

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export const TONE_PALETTE: Record<TextTone, string> = {
  default: 'text.primary',
  muted: 'text.secondary',
  accent: 'primary.main',
  positive: 'success.main',
  negative: 'error.main',
};

// editors store a run's tone as this variable, bound to the theme at render
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

export type TextMarks = {
  strong?: true;
  emphasis?: true;
  code?: true;
  nowrap?: true;
  tone?: TextTone;
  link?: string;
};

export type TextRun =
  | { type: 'text'; text: string; marks?: TextMarks }
  | { type: 'token'; source: string; marks?: TextMarks }
  | { type: 'break' };

export type TextParagraph = { runs: TextRun[] };

export type TextContent = { version: 1; paragraphs: TextParagraph[] };

export type TextProps = {
  // inline Markdown (see inlineMarkdown.ts); TextContent is its parsed form
  content: string;
  variant: TextVariant;
  tone: TextTone;
  alignment: TextAlignment;
  // CSS for anything the variant and tone do not cover
  customStyles: Record<string, unknown>;
};

export function createTextContent(plain: string): TextContent {
  return {
    version: 1,
    paragraphs: plain
      .split('\n')
      .map((line) => ({ runs: line ? [{ type: 'text', text: line }] : [] })),
  };
}

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

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;

export function sanitizeLink(href: unknown): string | undefined {
  return typeof href === 'string' && SAFE_LINK.test(href.trim())
    ? href.trim()
    : undefined;
}

function normalizeMarks(marks: unknown): TextMarks | undefined {
  if (!isRecord(marks)) {
    return undefined;
  }
  const result: TextMarks = {};
  (['strong', 'emphasis', 'code', 'nowrap'] as const).forEach((key) => {
    if (marks[key] === true) result[key] = true;
  });
  if (includes(TEXT_TONES, marks.tone) && marks.tone !== 'default') {
    result.tone = marks.tone;
  }
  const link = sanitizeLink(marks.link);
  if (link) result.link = link;
  return Object.keys(result).length > 0 ? result : undefined;
}

const sameMarks = (a?: TextMarks, b?: TextMarks) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

function withMarks<T extends TextRun>(run: T, marks?: TextMarks): T {
  return marks ? { ...run, marks } : run;
}

function normalizeRuns(runs: unknown): TextRun[] {
  const result: TextRun[] = [];
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    if (!isRecord(run)) return;
    const marks = normalizeMarks(run.marks);
    if (run.type === 'break') {
      result.push({ type: 'break' });
    } else if (run.type === 'token' && typeof run.source === 'string') {
      result.push(withMarks({ type: 'token', source: run.source }, marks));
    } else if (run.type === 'text' && typeof run.text === 'string') {
      if (run.text === '') return;
      const previous = result[result.length - 1];
      if (previous?.type === 'text' && sameMarks(previous.marks, marks)) {
        previous.text += run.text;
      } else {
        result.push(withMarks({ type: 'text', text: run.text }, marks));
      }
    }
  });
  return result;
}

/** Anything stored or received becomes valid content; plain strings too. */
export function normalizeTextContent(value: unknown): TextContent {
  if (typeof value === 'string') {
    return createTextContent(value);
  }
  if (!isRecord(value) || !Array.isArray(value.paragraphs)) {
    return createTextContent('');
  }
  const paragraphs = value.paragraphs.map((paragraph) => ({
    runs: normalizeRuns(isRecord(paragraph) ? paragraph.runs : undefined),
  }));
  return {
    version: 1,
    paragraphs: paragraphs.length > 0 ? paragraphs : [{ runs: [] }],
  };
}

function mapRuns(
  content: TextContent,
  map: (run: TextRun) => TextRun,
): TextContent {
  return normalizeTextContent({
    version: 1,
    paragraphs: content.paragraphs.map((paragraph) => ({
      runs: paragraph.runs.map(map),
    })),
  });
}

/** Replaces every token with ordinary text, keeping its marks. */
export function bakeTokens(
  content: TextContent,
  renderToken: (source: string) => string,
): TextContent {
  return mapRuns(content, (run) =>
    run.type === 'token'
      ? withMarks({ type: 'text', text: renderToken(run.source) }, run.marks)
      : run,
  );
}

export function textContentToPlain(
  content: TextContent,
  renderToken: (source: string) => string = () => '',
): string {
  return content.paragraphs
    .map((paragraph) =>
      paragraph.runs
        .map((run) =>
          run.type === 'text'
            ? run.text
            : run.type === 'token'
              ? renderToken(run.source)
              : '\n',
        )
        .join(''),
    )
    .join('\n');
}

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

/**
 * Element-level style in precedence order: variant defaults, tone and
 * alignment, customStyles. Colors are MUI palette paths so the result can go
 * straight into `sx`. Run marks are applied on top by the renderer.
 */
export function resolveTextElementStyle(
  props: Pick<TextProps, 'variant' | 'tone' | 'alignment' | 'customStyles'>,
): Record<string, unknown> {
  const { fontSize, ...variant } = VARIANT_STYLES[props.variant];
  return {
    ...variant,
    fontSize: `${fontSize}px`,
    color: TONE_PALETTE[props.tone],
    textAlign: props.alignment,
    ...props.customStyles,
  };
}
