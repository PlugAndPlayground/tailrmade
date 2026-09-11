import React, { createContext, useContext, useEffect } from 'react';
import { Box } from '@mui/material';
import { $isCodeNode } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { getStyleObjectFromCSS } from '@lexical/selection';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  DOMExportOutput,
  FORMAT_TEXT_COMMAND,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  TEXT_TYPE_TO_FORMAT,
  TextFormatType,
  TextNode,
} from 'lexical';
import {
  formatToken,
  formatTokenValue,
  parseToken,
  renderTokenSource,
  resolveTokenPath,
  scanTokenSpans,
  tokenPathToString,
} from '../tokens';

export type TokenInputs = Record<string, unknown>;

// the owning node's bindable inputs; chips re-render when they change without
// the values ever entering the editor state
export const TokenInputsContext = createContext<TokenInputs>({});

// HTML export runs outside React, so hosts also register their inputs here
const exportInputs = new WeakMap<LexicalEditor, TokenInputs>();

export function registerTokenInputs(
  editor: LexicalEditor,
  inputs: TokenInputs,
): void {
  exportInputs.set(editor, inputs);
}

export type SerializedTokenNode = Spread<
  { source: string; format: number; style: string },
  SerializedLexicalNode
>;

const TokenChip: React.FC<{
  source: string;
  format: number;
  style: string;
}> = ({ source, format, style }) => {
  const inputs = useContext(TokenInputsContext);
  const token = parseToken(source);
  const resolution = token
    ? resolveTokenPath(token.path, inputs)
    : { resolved: false as const };
  const css = getStyleObjectFromCSS(style);
  const hasFormat = (type: TextFormatType) =>
    (format & TEXT_TYPE_TO_FORMAT[type]) !== 0;

  return (
    <Box
      component="span"
      title={source}
      data-cy="text-token"
      data-token-source={source}
      data-token-state={resolution.resolved ? 'resolved' : 'unresolved'}
      sx={{
        px: 0.5,
        borderRadius: 0.5,
        cursor: 'default',
        fontWeight: hasFormat('bold') ? 700 : undefined,
        fontStyle: hasFormat('italic') ? 'italic' : undefined,
        fontFamily: hasFormat('code') ? 'monospace' : undefined,
        whiteSpace: css['white-space'],
        ...(resolution.resolved
          ? { bgcolor: 'action.selected', color: css.color }
          : {
              color: 'error.main',
              outline: '1px dashed',
              outlineOffset: '-1px',
            }),
      }}
    >
      {token && resolution.resolved
        ? formatTokenValue(resolution, token.format)
        : token
          ? tokenPathToString(token.path)
          : source}
    </Box>
  );
};

export class TokenNode extends DecoratorNode<React.ReactElement> {
  __source: string;
  __format: number;
  __style: string;

  static getType(): string {
    return 'text-token';
  }

  static clone(node: TokenNode): TokenNode {
    return new TokenNode(
      node.__source,
      node.__format,
      node.__style,
      node.__key,
    );
  }

  static importJSON(json: SerializedTokenNode): TokenNode {
    return $createTokenNode(json.source, json.format, json.style);
  }

  // exported HTML carries the rendered value, which pastes back as plain text
  static importDOM(): null {
    return null;
  }

  constructor(source: string, format = 0, style = '', key?: NodeKey) {
    super(key);
    this.__source = source;
    this.__format = format;
    this.__style = style;
  }

  exportJSON(): SerializedTokenNode {
    return {
      ...super.exportJSON(),
      type: TokenNode.getType(),
      version: 1,
      source: this.__source,
      format: this.__format,
      style: this.__style,
    };
  }

  getSource(): string {
    return this.getLatest().__source;
  }

  getFormat(): number {
    return this.getLatest().__format;
  }

  getStyle(): string {
    return this.getLatest().__style;
  }

  hasFormat(type: TextFormatType): boolean {
    return (this.getFormat() & TEXT_TYPE_TO_FORMAT[type]) !== 0;
  }

  setFormat(format: number): this {
    const writable = this.getWritable();
    writable.__format = format;
    return writable;
  }

  setStyle(style: string): this {
    const writable = this.getWritable();
    writable.__style = style;
    return writable;
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  isInline(): true {
    return true;
  }

  // copying a chip yields its source, which pastes back as the same token
  getTextContent(): string {
    return this.getSource();
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement('span');
    element.textContent = renderTokenSource(
      this.__source,
      exportInputs.get(editor) ?? {},
    );
    return { element };
  }

  decorate(): React.ReactElement {
    return (
      <TokenChip
        source={this.__source}
        format={this.__format}
        style={this.__style}
      />
    );
  }
}

export function $createTokenNode(
  source: string,
  format = 0,
  style = '',
): TokenNode {
  return new TokenNode(source, format, style);
}

export function $isTokenNode(
  node: LexicalNode | null | undefined,
): node is TokenNode {
  return node instanceof TokenNode;
}

/** Turns every valid `{{…}}` in a text node into a token, outside code. */
export function $tokenizeTextNode(node: TextNode): void {
  if (
    !node.isSimpleText() ||
    node.hasFormat('code') ||
    $findMatchingParent(node, $isCodeNode)
  ) {
    return;
  }
  const spans = scanTokenSpans(node.getTextContent());
  for (let i = spans.length - 1; i >= 0; i--) {
    const { start, end, token } = spans[i];
    const segments = node.splitText(start, end);
    segments[start === 0 ? 0 : 1].replace(
      $createTokenNode(formatToken(token), node.getFormat(), node.getStyle()),
    );
  }
}

/** Like getTextContent, with tokens rendered the way an end user sees them. */
export function $getRenderedTextContent(
  inputs: TokenInputs,
  node: LexicalNode = $getRoot(),
): string {
  if ($isTokenNode(node)) {
    return renderTokenSource(node.getSource(), inputs);
  }
  if (!$isElementNode(node)) {
    return node.getTextContent();
  }
  const children = node.getChildren();
  return children
    .map(
      (child, index) =>
        $getRenderedTextContent(inputs, child) +
        ($isElementNode(child) &&
        index < children.length - 1 &&
        !child.isInline()
          ? '\n\n'
          : ''),
    )
    .join('');
}

/**
 * Tokens are decorators, which text formatting skips - carry bold/italic/code
 * over to them, and tokenize `{{…}}` as it is typed.
 */
export function registerTokenBehaviour(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerNodeTransform(TextNode, $tokenizeTextNode),
    editor.registerCommand(
      FORMAT_TEXT_COMMAND,
      (type) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }
        const bit = TEXT_TYPE_TO_FORMAT[type];
        const enable = !selection.hasFormat(type);
        selection
          .getNodes()
          .filter($isTokenNode)
          .forEach((token) =>
            token.setFormat(
              enable ? token.getFormat() | bit : token.getFormat() & ~bit,
            ),
          );
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

export function TokenBehaviourPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerTokenBehaviour(editor), [editor]);
  return null;
}
