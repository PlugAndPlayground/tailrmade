import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import {
  createEditor,
  EditorThemeClasses,
  Klass,
  LexicalEditor,
  LexicalNode,
} from 'lexical';
import { TokenNode } from './TokenNode';
import { textEditorTheme } from './theme';

export type TextHostProfile = {
  // headings, lists, quotes, code blocks and tables, persisted as Markdown
  markdown: boolean;
  tokens: boolean;
};

export const TEXT_EDITOR2_PROFILE: TextHostProfile = {
  markdown: true,
  tokens: true,
};
export const STATIC_TEXT_PROFILE: TextHostProfile = {
  markdown: false,
  tokens: false,
};
export const DYNAMIC_TEXT_PROFILE: TextHostProfile = {
  markdown: false,
  tokens: true,
};

const INLINE_NODES: Klass<LexicalNode>[] = [LinkNode, AutoLinkNode, TokenNode];

const MARKDOWN_NODES: Klass<LexicalNode>[] = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  ...INLINE_NODES,
];

export type TextEditorConfig = {
  namespace: string;
  theme: EditorThemeClasses;
  nodes: Klass<LexicalNode>[];
  onError: (error: Error) => void;
};

export function createTextEditorConfig(
  profile: TextHostProfile,
  namespace: string,
): TextEditorConfig {
  return {
    namespace,
    // inline text sits in a layout, so its paragraphs carry no margins
    theme: profile.markdown
      ? textEditorTheme
      : { ...textEditorTheme, paragraph: 'text-inline-paragraph' },
    nodes: profile.markdown ? MARKDOWN_NODES : INLINE_NODES,
    onError(error) {
      throw error;
    },
  };
}

/** An editor with no DOM, for converting between formats. */
export function createHeadlessTextEditor(
  profile: TextHostProfile,
): LexicalEditor {
  return createEditor(createTextEditorConfig(profile, 'TextConverter'));
}
