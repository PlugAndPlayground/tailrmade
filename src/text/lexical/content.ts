// Run styling shared by every text host: formats are bold, italic,
// strikethrough and code, and a run's CSS only ever holds a tone variable and
// nowrap, which Markdown stores as [text]{.tone .nowrap}.
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  getStyleObjectFromCSS,
} from '@lexical/selection';
import {
  $getSelection,
  $isRangeSelection,
  LexicalEditor,
  RangeSelection,
  TEXT_TYPE_TO_FORMAT,
  TextFormatType,
  TextNode,
} from 'lexical';
import { TEXT_TONES, TextTone, toneCssVariable } from '../model';
import { $isTokenNode } from './TokenNode';

const ALLOWED_FORMATS: TextFormatType[] = [
  'bold',
  'italic',
  'strikethrough',
  'code',
];

const ALLOWED_FORMAT_BITS = ALLOWED_FORMATS.reduce(
  (bits, format) => bits | TEXT_TYPE_TO_FORMAT[format],
  0,
);

const TONE_VARIABLE = /^var\(--text-tone-([a-z]+)\)$/;
const NOWRAP_CLASS = 'nowrap';

type StyleMarks = { tone?: TextTone; nowrap?: boolean };

/** The only run-level CSS a text host stores. */
export function styleForMarks(marks: StyleMarks): string {
  return [
    marks.tone && marks.tone !== 'default'
      ? `color: var(${toneCssVariable(marks.tone)});`
      : '',
    marks.nowrap ? 'white-space: nowrap;' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function styleMarksFromCss(
  css: Record<string, string | undefined>,
): StyleMarks {
  const tone = TONE_VARIABLE.exec(css.color ?? '')?.[1] as TextTone;
  const marks: StyleMarks = {};
  if (TEXT_TONES.includes(tone) && tone !== 'default') {
    marks.tone = tone;
  }
  if (css['white-space'] === 'nowrap') {
    marks.nowrap = true;
  }
  return marks;
}

export function styleMarks(style: string): StyleMarks {
  return styleMarksFromCss(getStyleObjectFromCSS(style));
}

/** A run's style as Markdown classes, `.error .nowrap`; empty without one. */
export function styleToClasses(style: string): string {
  const { tone, nowrap } = styleMarks(style);
  return [tone && `.${tone}`, nowrap && `.${NOWRAP_CLASS}`]
    .filter(Boolean)
    .join(' ');
}

export function classesToStyle(classes: string): string {
  const marks: StyleMarks = {};
  classes.split(/[\s.]+/).forEach((name) => {
    if (name === NOWRAP_CLASS) {
      marks.nowrap = true;
    } else if (TEXT_TONES.includes(name as TextTone)) {
      marks.tone = name as TextTone;
    }
  });
  return styleForMarks(marks);
}

export function $getSelectionStyleMarks(selection: RangeSelection): StyleMarks {
  return styleMarksFromCss({
    color: $getSelectionStyleValueForProperty(selection, 'color', ''),
    'white-space': $getSelectionStyleValueForProperty(
      selection,
      'white-space',
      '',
    ),
  });
}

/** Sets tone and/or nowrap on the selected text and tokens. */
export function $setSelectionStyleMarks(patch: StyleMarks): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return;
  }
  const css: Record<string, string | null> = {};
  if ('tone' in patch) {
    css.color =
      patch.tone && patch.tone !== 'default'
        ? `var(${toneCssVariable(patch.tone)})`
        : null;
  }
  if ('nowrap' in patch) {
    css['white-space'] = patch.nowrap ? 'nowrap' : null;
  }
  $patchStyleText(selection, css);
  selection
    .getNodes()
    .filter($isTokenNode)
    .forEach((token) =>
      token.setStyle(
        styleForMarks({ ...styleMarks(token.getStyle()), ...patch }),
      ),
    );
}

/**
 * Keeps typed and pasted text within what Markdown stores: formats other than
 * bold/italic/strikethrough/code and any CSS beyond tone and nowrap are
 * dropped.
 */
export function registerInlineTextSanitizer(editor: LexicalEditor): () => void {
  return editor.registerNodeTransform(TextNode, (node) => {
    const format = node.getFormat() & ALLOWED_FORMAT_BITS;
    if (format !== node.getFormat()) {
      node.setFormat(format);
    }
    const style = styleForMarks(styleMarks(node.getStyle()));
    if (style !== node.getStyle()) {
      node.setStyle(style);
    }
  });
}
