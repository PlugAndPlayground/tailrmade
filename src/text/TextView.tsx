import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import type { Theme } from '@mui/material';
import {
  SerializedLexicalNode,
  TEXT_TYPE_TO_FORMAT,
  TextFormatType,
} from 'lexical';
import { styleMarks } from './lexical/content';
import { markdownToLexicalState } from './lexical/markdown';
import { textEditorTheme as theme } from './lexical/theme';
import {
  normalizeTextProps,
  resolveTextElementStyle,
  TEXT_TONES,
  TONE_PALETTE,
  toneCssVariable,
} from './model';
import { renderTokenSource } from './tokens';
import './lexical/styles.css';

const paletteColor = (theme: Theme, path: string): string =>
  path.split('.').reduce((value: any, key) => value[key], theme.palette);

/** The tone colors of the app theme, as the variables runs use. */
export const toneCssVariables = (theme: Theme): Record<string, string> =>
  Object.fromEntries(
    TEXT_TONES.map((tone) => [
      toneCssVariable(tone),
      paletteColor(theme, TONE_PALETTE[tone]),
    ]),
  );

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;

// the serialized Lexical nodes this view draws
type Node = SerializedLexicalNode & {
  children?: SerializedLexicalNode[];
  text?: string;
  format?: number;
  style?: string;
  source?: string;
  url?: string;
  tag?: string;
  start?: number;
  value?: number;
};

type Inputs = Record<string, unknown> | undefined;

// the markup Lexical's own DOM uses, so the view looks like the editor
function renderRun(node: Node, text: string, key: number): React.ReactNode {
  const has = (format: TextFormatType) =>
    (node.format! & TEXT_TYPE_TO_FORMAT[format]) !== 0;
  let run: React.ReactNode = text;
  if (has('code')) run = <code className={theme.text.code}>{run}</code>;
  if (has('italic')) run = <em className={theme.text.italic}>{run}</em>;
  if (has('strikethrough')) {
    run = <s className={theme.text.strikethrough}>{run}</s>;
  }
  if (has('bold')) run = <strong className={theme.text.bold}>{run}</strong>;
  const { tone, nowrap } = styleMarks(node.style!);
  return (
    <span
      key={key}
      style={{
        color: tone && `var(${toneCssVariable(tone)})`,
        whiteSpace: nowrap ? 'nowrap' : undefined,
      }}
    >
      {run}
    </span>
  );
}

const renderChildren = (
  children: SerializedLexicalNode[],
  inputs: Inputs,
): React.ReactNode[] =>
  children.map((child, index) => renderNode(child as Node, index, inputs));

function renderNode(node: Node, key: number, inputs: Inputs): React.ReactNode {
  const children = () => renderChildren(node.children!, inputs);
  switch (node.type) {
    case 'text':
    case 'code-highlight':
      return renderRun(node, node.text!, key);
    case 'text-token':
      // only token-enabled hosts, which pass inputs, import tokens
      return renderRun(node, renderTokenSource(node.source!, inputs!), key);
    case 'linebreak':
      return <br key={key} />;
    case 'tab':
      return '\t';
    case 'link':
    case 'autolink':
      return SAFE_LINK.test(node.url!) ? (
        <a
          key={key}
          className={theme.link}
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children()}
        </a>
      ) : (
        <React.Fragment key={key}>{children()}</React.Fragment>
      );
    case 'paragraph':
      return (
        <p key={key} className={theme.paragraph}>
          {node.children!.length > 0 ? children() : <br />}
        </p>
      );
    case 'heading':
      return React.createElement(
        node.tag!,
        {
          key,
          className: theme.heading[node.tag as keyof typeof theme.heading],
        },
        children(),
      );
    case 'quote':
      return (
        <blockquote key={key} className={theme.quote}>
          {children()}
        </blockquote>
      );
    case 'list':
      return React.createElement(
        node.tag!,
        {
          key,
          className: theme.list[node.tag as 'ol' | 'ul'],
          start: node.start,
        },
        children(),
      );
    case 'listitem':
      return (
        <li
          key={key}
          value={node.value}
          className={
            node.children![0]?.type === 'list'
              ? `${theme.list.listitem} ${theme.list.nested.listitem}`
              : theme.list.listitem
          }
        >
          {children()}
        </li>
      );
    case 'code':
      return (
        <code key={key} className={theme.code}>
          {children()}
        </code>
      );
    default:
      return (
        <React.Fragment key={key}>{node.children && children()}</React.Fragment>
      );
  }
}

export type TextViewProps = Record<string, unknown> & {
  // the owning node's bindable inputs; undefined for static text, which shows
  // token sources as the literal text they are
  inputs?: Record<string, unknown>;
  dataCy?: string;
  id?: string;
};

/** Read-only text: the running app and every surface preview. */
export const TextView: React.FC<TextViewProps> = ({
  inputs,
  dataCy,
  id,
  ...props
}) => {
  const textProps = normalizeTextProps(props);
  const hasTokens = inputs !== undefined;
  const state = useMemo(
    () => markdownToLexicalState(textProps.content, hasTokens),
    [textProps.content, hasTokens],
  );
  return (
    <Box
      id={id}
      data-cy={dataCy}
      sx={[
        (theme) => toneCssVariables(theme),
        {
          width: '100%',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...resolveTextElementStyle(textProps),
        },
      ]}
    >
      {renderChildren(state.root.children, inputs)}
    </Box>
  );
};
