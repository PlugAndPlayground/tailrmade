// Literal text as the Markdown every text host stores. Headless: graph
// migrations import this early, so keep React, PIXI, MUI and node classes out.
import {
  $convertToMarkdownString,
  ElementTransformer,
} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  createEditor,
} from 'lexical';

// what Lexical's import reads as a heading, list item or quote; its export
// only escapes the emphasis and code characters
const BLOCK_START = /^(\s*)(#{1,6}(?=\s)|[-+](?=\s)|\d+(?=\.\s)|>(?=\s))/gm;

/** Keeps a paragraph that starts like a block from reading back as one. */
export const PARAGRAPH_ESCAPE: ElementTransformer = {
  dependencies: [],
  export: (node, exportChildren) =>
    $isParagraphNode(node)
      ? exportChildren(node).replace(BLOCK_START, (_match, indent, marker) =>
          /\d/.test(marker) ? `${indent}${marker}\\` : `${indent}\\${marker}`,
        )
      : null,
  regExp: /(?!)/,
  replace: () => false,
  type: 'element',
};

/** One paragraph per line, with nothing in the text read as Markdown. */
export function plainTextToMarkdown(text: string): string {
  const editor = createEditor({
    onError(error) {
      throw error;
    },
  });
  let markdown = '';
  editor.update(
    () => {
      $getRoot().append(
        ...text
          .split('\n')
          .map((line) => $createParagraphNode().append($createTextNode(line))),
      );
      markdown = $convertToMarkdownString([PARAGRAPH_ESCAPE], undefined, true);
    },
    { discrete: true },
  );
  return markdown;
}
