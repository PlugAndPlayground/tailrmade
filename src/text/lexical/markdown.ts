import { $generateNodesFromDOM } from '@lexical/html';
import { $createLinkNode, LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
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
  SerializedEditorState,
} from 'lexical';
import { marksFromClasses } from '../inlineMarkdown';
import { TextContent } from '../model';
import { legacyMentionToTokenSource } from '../tokens';
import { $lexicalToContent, styleForMarks } from './content';
import {
  createHeadlessTextEditor,
  DYNAMIC_TEXT_PROFILE,
  TEXT_EDITOR2_PROFILE,
} from './editorConfig';
import {
  $createTokenNode,
  $isTokenNode,
  $tokenizeTextNode,
  TokenNode,
} from './TokenNode';

const NEVER = /(?!)/;
const FORMAT_MARKERS = [
  ['bold', '**'],
  ['italic', '*'],
  ['strikethrough', '~~'],
] as const;

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

export const MARKDOWN_TRANSFORMERS: Transformer[] = [
  LEGACY_MENTION_TRANSFORMER,
  TOKEN_TRANSFORMER,
  ...TRANSFORMERS,
];

function $tokenizeAll(): void {
  $dfs().forEach(({ node }) => {
    if ($isTextNode(node)) {
      $tokenizeTextNode(node);
    }
  });
}

export function $importMarkdown(markdown: string): void {
  $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
  $tokenizeAll();
}

export function $exportMarkdown(): string {
  return $convertToMarkdownString(MARKDOWN_TRANSFORMERS);
}

const isEscaped = (text: string, index: number) =>
  /\\*$/.exec(text.slice(0, index))![0].length % 2 === 1;

// import only: [text]{.accent .nowrap}, [text](url), [text](url){.muted}. The
// text holds no unescaped brackets - textContentToMarkdown escapes them
const LINK_OR_SPAN_TRANSFORMER: TextMatchTransformer = {
  dependencies: [LinkNode],
  export: () => null,
  importRegExp:
    /\[((?:\\.|`[^`]*`|[^\\[\]`])*)\](?:\(((?:[^()\s]|\([^()\s]*\))*)\)(?:\{((?:\s*\.[\w-]+)+\s*)\})?|\{((?:\s*\.[\w-]+)+\s*)\})/,
  getEndIndex: (node, match) =>
    isEscaped(node.getTextContent(), match.index!)
      ? false
      : match.index! + match[0].length,
  regExp: NEVER,
  replace: (textNode, [, text, url, linkClasses, spanClasses]) => {
    const inner = $createTextNode(text)
      .setFormat(textNode.getFormat())
      .setStyle(
        styleForMarks(marksFromClasses(linkClasses ?? spanClasses ?? '')),
      );
    textNode.replace(
      url === undefined ? inner : $createLinkNode(url).append(inner),
    );
    return inner;
  },
  type: 'text-match',
};

const INLINE_TRANSFORMERS: Transformer[] = [
  INLINE_CODE,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK_OR_SPAN_TRANSFORMER,
];

/**
 * Reads the inline Markdown static Text and the Text node store; the writer
 * is textContentToMarkdown. With tokens off, `{{…}}` stays text.
 */
export function markdownToTextContent(
  markdown: string,
  tokens: boolean,
): TextContent {
  const editor = createHeadlessTextEditor(DYNAMIC_TEXT_PROFILE);
  let content!: TextContent;
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, INLINE_TRANSFORMERS, undefined, true);
      if (tokens) {
        $tokenizeAll();
      }
      content = $lexicalToContent();
    },
    { discrete: true },
  );
  return content;
}

export function markdownToLexicalState(
  markdown: string,
): SerializedEditorState {
  const editor = createHeadlessTextEditor(TEXT_EDITOR2_PROFILE);
  editor.update(() => $importMarkdown(markdown), { discrete: true });
  return editor.getEditorState().toJSON();
}

export function lexicalStateToMarkdown(state: SerializedEditorState): string {
  const editor = createHeadlessTextEditor(TEXT_EDITOR2_PROFILE);
  return editor.parseEditorState(state).read(() => $exportMarkdown(), {
    editor,
  });
}

/** Needs a DOM (DOMParser), so browser only. */
export function htmlToMarkdown(html: string): string {
  const editor = createHeadlessTextEditor(TEXT_EDITOR2_PROFILE);
  let markdown = '';
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
      markdown = $exportMarkdown();
    },
    { discrete: true },
  );
  return markdown;
}
