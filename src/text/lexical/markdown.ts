// The Markdown every text host stores, read and written by Lexical. On top of
// its transformers: Handlebars tokens, [text]{.tone .nowrap} spans, escaped
// block markers, and one paragraph per line.
import { $generateNodesFromDOM } from '@lexical/html';
import { $createLinkNode, $isLinkNode, LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  LINK,
  TextMatchTransformer,
  Transformer,
  TRANSFORMERS,
} from '@lexical/markdown';
import { $dfs } from '@lexical/utils';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  createEditor,
  ElementNode,
  LexicalNode,
  NodeKey,
  SerializedEditorState,
  SerializedElementNode,
  Spread,
} from 'lexical';
import { PARAGRAPH_ESCAPE } from '../markdownEscaping';
import { legacyMentionToTokenSource } from '../tokens';
import { classesToStyle, styleToClasses } from './content';
import {
  createHeadlessTextEditor,
  createTextEditorConfig,
  TEXT_NODES,
} from './editorConfig';
import {
  $createTokenNode,
  $getRenderedTextContent,
  $isTokenNode,
  $tokenizeTextNode,
  TokenInputs,
  TokenNode,
} from './TokenNode';

const NEVER = /(?!)/;
const FORMAT_MARKERS = [
  ['bold', '**'],
  ['italic', '*'],
  ['strikethrough', '~~'],
] as const;
const CLASSES = /\{((?:\s*\.[\w-]+)+\s*)\}/.source;

// export only: tokens are imported by $tokenizeTextNode, so the Handlebars
// parser rather than a regular expression decides what a token is
const TOKEN_TRANSFORMER: TextMatchTransformer = {
  dependencies: [TokenNode],
  export: (node) => {
    if (!$isTokenNode(node)) {
      return null;
    }
    const open = FORMAT_MARKERS.filter(([format]) => node.hasFormat(format))
      .map(([, marker]) => marker)
      .join('');
    return open + node.getSource() + [...open].reverse().join('');
  },
  regExp: NEVER,
  type: 'text-match',
};

// import only: the mention syntax stored before tokens were Handlebars
const LEGACY_MENTION_TRANSFORMER: TextMatchTransformer = {
  dependencies: [TokenNode],
  export: () => null,
  importRegExp: /@\[(.*?)\]\(socket:(.*?)\)/,
  regExp: NEVER,
  replace: (textNode, match) => {
    textNode.replace(
      $createTokenNode(
        legacyMentionToTokenSource(match[2]),
        textNode.getFormat(),
        textNode.getStyle(),
      ),
    );
  },
  type: 'text-match',
};

type SerializedStyleSpanNode = Spread<
  { classes: string },
  SerializedElementNode
>;

// export only: wraps equally styled runs, so emphasis around them closes at
// the span's edges the way it does at a link's
class StyleSpanNode extends ElementNode {
  __classes: string;

  static getType(): string {
    return 'text-style-span';
  }

  static clone(node: StyleSpanNode): StyleSpanNode {
    return new StyleSpanNode(node.__classes, node.__key);
  }

  static importJSON(json: SerializedStyleSpanNode): StyleSpanNode {
    return new StyleSpanNode(json.classes);
  }

  constructor(classes: string, key?: NodeKey) {
    super(key);
    this.__classes = classes;
  }

  exportJSON(): SerializedStyleSpanNode {
    return { ...super.exportJSON(), classes: this.__classes };
  }

  isInline(): true {
    return true;
  }
}

const runClasses = (node: LexicalNode) =>
  $isTextNode(node) || $isTokenNode(node)
    ? styleToClasses(node.getStyle())
    : '';

function $wrapStyledRuns(): void {
  $dfs().forEach(({ node }) => {
    // a link carries its children's style itself
    if (!$isElementNode(node) || $isLinkNode(node)) {
      return;
    }
    let span: StyleSpanNode | undefined;
    node.getChildren().forEach((child) => {
      const classes = runClasses(child);
      if (!classes) {
        span = undefined;
        return;
      }
      if (span?.__classes !== classes) {
        span = new StyleSpanNode(classes);
        child.insertBefore(span);
      }
      span.append(child);
    });
  });
}

const isEscaped = (text: string, index: number) =>
  /\\*$/.exec(text.slice(0, index))![0].length % 2 === 1;

// [text]{.error .nowrap}
const STYLE_SPAN_TRANSFORMER: TextMatchTransformer = {
  dependencies: [],
  export: (node, exportChildren) =>
    node instanceof StyleSpanNode
      ? `[${exportChildren(node)}]{${node.__classes}}`
      : null,
  importRegExp: new RegExp(/\[((?:\\.|`[^`]*`|[^\\[\]`])*)\]/.source + CLASSES),
  getEndIndex: (node, match) =>
    isEscaped(node.getTextContent(), match.index!)
      ? false
      : match.index! + match[0].length,
  regExp: NEVER,
  replace: (textNode, [, text, classes]) => {
    const inner = $createTextNode(text)
      .setFormat(textNode.getFormat())
      .setStyle(classesToStyle(classes));
    textNode.replace(inner);
    return inner;
  },
  type: 'text-match',
};

// [text](url){.muted}: Lexical's link, then the classes of all its text
const STYLED_LINK_TRANSFORMER: TextMatchTransformer = {
  dependencies: [LinkNode],
  export: (node, exportChildren, exportFormat) => {
    if (!$isLinkNode(node)) {
      return null;
    }
    const classes = new Set(node.getChildren().map(runClasses));
    const [only] = classes;
    const link =
      classes.size === 1 && only
        ? LINK.export!(node, exportChildren, exportFormat)
        : null;
    return link && `${link}{${only}}`;
  },
  importRegExp: new RegExp(LINK.importRegExp!.source + CLASSES),
  regExp: NEVER,
  replace: (textNode, match) => {
    const linkText = LINK.replace!(textNode, match);
    linkText?.setStyle(classesToStyle(match[match.length - 1]));
    return linkText;
  },
  type: 'text-match',
};

// a match at the same index goes to the transformer listed first, and the
// span goes before links: their text may run across brackets
const FORMAT_TRANSFORMERS: Transformer[] = [
  TOKEN_TRANSFORMER,
  STYLE_SPAN_TRANSFORMER,
  STYLED_LINK_TRANSFORMER,
  PARAGRAPH_ESCAPE,
  ...TRANSFORMERS,
];

export const MARKDOWN_TRANSFORMERS: Transformer[] = [
  LEGACY_MENTION_TRANSFORMER,
  ...FORMAT_TRANSFORMERS,
];

/** With tokens off, `{{…}}` and legacy mentions stay text. */
export function $importMarkdown(markdown: string, tokens: boolean): void {
  $convertFromMarkdownString(
    markdown,
    tokens ? MARKDOWN_TRANSFORMERS : FORMAT_TRANSFORMERS,
    undefined,
    true,
  );
  if (tokens) {
    $dfs().forEach(({ node }) => {
      if ($isTextNode(node)) {
        $tokenizeTextNode(node);
      }
    });
  }
}

export function markdownToLexicalState(
  markdown: string,
  tokens: boolean,
): SerializedEditorState {
  const editor = createHeadlessTextEditor();
  editor.update(() => $importMarkdown(markdown, tokens), { discrete: true });
  return editor.getEditorState().toJSON();
}

export function lexicalStateToMarkdown(state: SerializedEditorState): string {
  // styled runs get wrapped, so this works on a copy
  const editor = createEditor({
    ...createTextEditorConfig('MarkdownExport'),
    nodes: [...TEXT_NODES, StyleSpanNode],
  });
  let markdown = '';
  editor.parseEditorState(state, () => {
    $wrapStyledRuns();
    markdown = $convertToMarkdownString(MARKDOWN_TRANSFORMERS, undefined, true);
  });
  return markdown;
}

/** What an end user reads: tokens rendered, each block on its own line. */
export function markdownToPlainText(
  markdown: string,
  inputs: TokenInputs,
): string {
  const editor = createHeadlessTextEditor();
  editor.update(() => $importMarkdown(markdown, true), { discrete: true });
  return editor
    .getEditorState()
    .read(() => $getRenderedTextContent(inputs), { editor });
}

/** Replaces every token with the text it renders, format and style kept. */
export function bakeMarkdownTokens(
  markdown: string,
  render: (source: string) => string,
): string {
  const editor = createHeadlessTextEditor();
  editor.update(
    () => {
      $importMarkdown(markdown, true);
      $dfs().forEach(({ node }) => {
        if ($isTokenNode(node)) {
          node.replace(
            $createTextNode(render(node.getSource()))
              .setFormat(node.getFormat())
              .setStyle(node.getStyle()),
          );
        }
      });
    },
    { discrete: true },
  );
  return lexicalStateToMarkdown(editor.getEditorState().toJSON());
}

/** Needs a DOM (DOMParser), so browser only. */
export function htmlToMarkdown(html: string): string {
  const editor = createHeadlessTextEditor();
  editor.update(
    () => {
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const root = $getRoot();
      $generateNodesFromDOM(editor, dom).forEach((node) => {
        root.append(
          $isElementNode(node) && !node.isInline()
            ? node
            : $createParagraphNode().append(node),
        );
      });
    },
    { discrete: true },
  );
  return lexicalStateToMarkdown(editor.getEditorState().toJSON());
}
