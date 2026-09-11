// Text content (the headless model) <-> Lexical, for the inline hosts. Run
// marks map to bold/italic/code formats, link nodes, and a style string that
// only ever holds a tone variable and nowrap.
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  getStyleObjectFromCSS,
} from '@lexical/selection';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
  LexicalEditor,
  RangeSelection,
  TEXT_TYPE_TO_FORMAT,
  TextFormatType,
  TextNode,
} from 'lexical';
import {
  normalizeTextContent,
  sanitizeLink,
  TEXT_TONES,
  TextContent,
  TextMarks,
  TextRun,
  TextTone,
  toneCssVariable,
} from '../model';
import { $createTokenNode, $isTokenNode, TokenNode } from './TokenNode';

const MARK_FORMATS = [
  ['strong', 'bold'],
  ['emphasis', 'italic'],
  ['code', 'code'],
] as const satisfies readonly (readonly [keyof TextMarks, TextFormatType])[];

const ALLOWED_FORMAT_BITS = MARK_FORMATS.reduce(
  (bits, [, format]) => bits | TEXT_TYPE_TO_FORMAT[format],
  0,
);

const TONE_VARIABLE = /^var\(--text-tone-([a-z]+)\)$/;

type StyleMarks = Pick<TextMarks, 'tone' | 'nowrap'>;

/** The only run-level CSS an inline host stores. */
export function styleForMarks(marks: {
  tone?: TextTone;
  nowrap?: boolean;
}): string {
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
export function $setSelectionStyleMarks(patch: {
  tone?: TextTone;
  nowrap?: boolean;
}): void {
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

function marksOf(node: TextNode | TokenNode, link?: string): TextMarks {
  const marks: TextMarks = styleMarks(node.getStyle());
  MARK_FORMATS.forEach(([mark, format]) => {
    if (node.hasFormat(format)) marks[mark] = true;
  });
  if (link) marks.link = link;
  return marks;
}

function $runsOf(element: ElementNode, link?: string): TextRun[] {
  return element.getChildren().flatMap((child): TextRun[] => {
    if ($isLinkNode(child)) {
      return $runsOf(child, sanitizeLink(child.getURL()));
    }
    if ($isTokenNode(child)) {
      return [
        {
          type: 'token',
          source: child.getSource(),
          marks: marksOf(child, link),
        },
      ];
    }
    if ($isLineBreakNode(child)) {
      return [{ type: 'break' }];
    }
    if ($isTextNode(child)) {
      return [
        {
          type: 'text',
          text: child.getTextContent(),
          marks: marksOf(child, link),
        },
      ];
    }
    return $isElementNode(child) ? $runsOf(child, link) : [];
  });
}

export function $lexicalToContent(): TextContent {
  return normalizeTextContent({
    version: 1,
    paragraphs: $getRoot()
      .getChildren()
      .map((block) => ({ runs: $isElementNode(block) ? $runsOf(block) : [] })),
  });
}

function $applyMarks<T extends TextNode | TokenNode>(
  node: T,
  marks: TextMarks = {},
): T {
  node.setFormat(
    MARK_FORMATS.reduce(
      (bits, [mark, format]) =>
        marks[mark] ? bits | TEXT_TYPE_TO_FORMAT[format] : bits,
      0,
    ),
  );
  node.setStyle(styleForMarks(marks));
  return node;
}

export function $contentToLexical(content: TextContent): void {
  const root = $getRoot();
  root.clear();
  content.paragraphs.forEach((paragraph) => {
    const block = $createParagraphNode();
    let link: ElementNode | undefined;
    let href: string | undefined;
    paragraph.runs.forEach((run) => {
      const runHref = run.type === 'break' ? undefined : run.marks?.link;
      if (runHref !== href) {
        href = runHref;
        link = href ? $createLinkNode(href) : undefined;
        if (link) block.append(link);
      }
      const parent = link ?? block;
      if (run.type === 'break') {
        parent.append($createLineBreakNode());
      } else if (run.type === 'token') {
        parent.append($applyMarks($createTokenNode(run.source), run.marks));
      } else {
        parent.append($applyMarks($createTextNode(run.text), run.marks));
      }
    });
    root.append(block);
  });
}

/**
 * Keeps typed and pasted text within the inline vocabulary: formats other
 * than bold/italic/code and any CSS beyond tone and nowrap are dropped.
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
