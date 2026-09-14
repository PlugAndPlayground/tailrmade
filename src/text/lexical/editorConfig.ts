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
  // text placed in a layout: a compact toolbar, undo on the keyboard only
  inline: boolean;
  tokens: boolean;
};

export const TEXT_EDITOR2_PROFILE: TextHostProfile = {
  inline: false,
  tokens: true,
};
export const STATIC_TEXT_PROFILE: TextHostProfile = {
  inline: true,
  tokens: false,
};
export const DYNAMIC_TEXT_PROFILE: TextHostProfile = {
  inline: true,
  tokens: true,
};

export const TEXT_NODES: Klass<LexicalNode>[] = [
  HeadingNode,
  ListNode,
  ListItemNode,
  QuoteNode,
  CodeNode,
  CodeHighlightNode,
  TableNode,
  TableCellNode,
  TableRowNode,
  LinkNode,
  AutoLinkNode,
  TokenNode,
];

export type TextEditorConfig = {
  namespace: string;
  theme: EditorThemeClasses;
  nodes: Klass<LexicalNode>[];
  onError: (error: Error) => void;
};

export function createTextEditorConfig(namespace: string): TextEditorConfig {
  return {
    namespace,
    theme: textEditorTheme,
    nodes: TEXT_NODES,
    onError(error) {
      throw error;
    },
  };
}

/** An editor with no DOM, for converting between formats. */
export function createHeadlessTextEditor(): LexicalEditor {
  return createEditor(createTextEditorConfig('TextConverter'));
}
