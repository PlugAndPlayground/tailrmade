import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  LexicalEditor,
  SerializedEditorState,
  SerializedLexicalNode,
} from 'lexical';
import { createHeadlessTextEditor } from '../../../src/text/lexical/editorConfig';
import {
  bakeMarkdownTokens,
  lexicalStateToMarkdown,
  markdownToLexicalState,
  markdownToPlainText,
} from '../../../src/text/lexical/markdown';
import { registerTokenBehaviour } from '../../../src/text/lexical/TokenNode';
import {
  registerInlineTextSanitizer,
  styleForMarks,
} from '../../../src/text/lexical/content';
import { plainTextToMarkdown } from '../../../src/text/markdownEscaping';

type Node = SerializedLexicalNode & {
  children?: Node[];
  source?: string;
  format?: number;
  style?: string;
  text?: string;
};

const collect = (state: SerializedEditorState, type: string): Node[] => {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (node.type === type) found.push(node);
    node.children?.forEach(walk);
  };
  walk(state.root as unknown as Node);
  return found;
};

const blockTypes = (state: SerializedEditorState) =>
  state.root.children.map((node) => node.type);

const tokenSources = (markdown: string) =>
  collect(markdownToLexicalState(markdown, true), 'text-token').map(
    (node) => node.source,
  );

const roundTrip = (markdown: string) =>
  lexicalStateToMarkdown(markdownToLexicalState(markdown, true));

const stateOf = (
  build: () => void,
  register?: (editor: LexicalEditor) => void,
) => {
  const editor = createHeadlessTextEditor();
  register?.(editor);
  editor.update(build, { discrete: true });
  return editor.getEditorState().toJSON();
};

describe('markdown <-> lexical', () => {
  it('round-trips headings, emphasis, links, lists, quotes and code', () => {
    const markdown = [
      '# Title',
      '',
      '### Smaller',
      '',
      '**bold** and *italic* and ***both*** with [a link](https://example.com) and `code`',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted',
      '',
      '```javascript',
      'const x = 1;',
      '```',
    ].join('\n');
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps every line a paragraph, empty ones included', () => {
    const markdown = 'one\n\n\ntwo';
    expect(blockTypes(markdownToLexicalState(markdown, true))).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('imports path tokens as canonical Handlebars and helpers as text', () => {
    expect(
      tokenSources('Hi {{ name }}, it is {{d.temp}}, not {{format d.temp}}'),
    ).toEqual(['{{name}}', '{{d.temp}}']);
    expect(roundTrip('Hi {{name}} and {{d.temp}}')).toBe(
      'Hi {{name}} and {{d.temp}}',
    );
  });

  it('leaves invalid tokens and code as literal text', () => {
    const markdown = [
      'block {{#if x}}y{{/if}} and {{{raw}}}',
      '',
      'inline `{{code}}`',
      '',
      '```',
      '{{fenced}}',
      '```',
    ].join('\n');
    expect(tokenSources(markdown)).toEqual([]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('leaves tokens and legacy mentions as text when tokens are off', () => {
    const markdown = 'Hi {{name}} and @[x](socket:Input)';
    const state = markdownToLexicalState(markdown, false);
    expect(collect(state, 'text-token')).toEqual([]);
    expect(lexicalStateToMarkdown(state)).toBe(markdown);
  });

  it('keeps bold and italic on tokens', () => {
    const state = markdownToLexicalState('**{{name}}** and *{{other}}*', true);
    expect(collect(state, 'text-token').map((node) => node.format)).toEqual([
      1, 2,
    ]);
    expect(lexicalStateToMarkdown(state)).toBe('**{{name}}** and *{{other}}*');
  });

  it('imports legacy mentions and exports them as Handlebars only', () => {
    const legacy = '# @[42](socket:Input)\n\nvalue @[x](socket:Input 2) end';
    expect(tokenSources(legacy)).toEqual(['{{Input}}', '{{[Input 2]}}']);
    expect(roundTrip(legacy)).toBe('# {{Input}}\n\nvalue {{[Input 2]}} end');
  });
});

describe('tone and no-wrap spans', () => {
  it('store a run style, on links and tokens too', () => {
    const markdown =
      'a [hot]{.error .nowrap}, [site](https://x.io){.muted} and [**{{t}}**]{.primary}';
    const state = markdownToLexicalState(markdown, true);
    expect(
      collect(state, 'text')
        .filter((node) => node.style)
        .map((node) => [node.text, node.style]),
    ).toEqual([
      ['hot', styleForMarks({ tone: 'error', nowrap: true })],
      ['site', styleForMarks({ tone: 'muted' })],
    ]);
    expect(collect(state, 'text-token')[0].style).toBe(
      styleForMarks({ tone: 'primary' }),
    );
    expect(lexicalStateToMarkdown(state)).toBe(markdown);
  });

  it('close emphasis at the span instead of inside it', () => {
    const state = stateOf(() => {
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode('a ').toggleFormat('bold'),
          $createTextNode('b')
            .toggleFormat('bold')
            .setStyle(styleForMarks({ tone: 'error' })),
          $createTextNode(' c').toggleFormat('bold'),
        ),
      );
    });
    const markdown = lexicalStateToMarkdown(state);
    expect(markdown).toBe('**a** [**b**]{.error} **c**');
    expect(roundTrip(markdown)).toBe(markdown);
  });
});

describe('escaping', () => {
  it('reads plain text back as the same text', () => {
    const text =
      '2*3 = 6_ `q`\n# not a heading\n- not a bullet\n1. not a list\n> not a quote';
    const markdown = plainTextToMarkdown(text);
    expect(markdown).toBe(
      '2\\*3 = 6\\_ \\`q\\`\n\\# not a heading\n\\- not a bullet\n1\\. not a list\n\\> not a quote',
    );
    expect(blockTypes(markdownToLexicalState(markdown, false))).toEqual(
      Array(5).fill('paragraph'),
    );
    expect(markdownToPlainText(markdown, {})).toBe(text);
  });

  it('keeps an edited paragraph that starts like a list a paragraph', () => {
    const state = stateOf(() => {
      $getRoot().append($createParagraphNode().append($createTextNode('- 5')));
    });
    expect(lexicalStateToMarkdown(state)).toBe('\\- 5');
  });
});

describe('rendered text', () => {
  it('resolves tokens, never shows their source, one line per block', () => {
    expect(
      markdownToPlainText('# {{t}}\n\n{{missing}} ok\n- a\n- b', { t: 3 }),
    ).toBe('3\n\n ok\na\nb');
  });

  it('bakes tokens into text, keeping their format and style', () => {
    expect(
      bakeMarkdownTokens('**Hi {{name}}** and [{{name}}]{.error}', () => 'A*a'),
    ).toBe('**Hi A\\*a** and [A\\*a]{.error}');
  });
});

describe('editor behaviour', () => {
  it('strips formats and CSS that Markdown does not store', () => {
    const state = stateOf(
      () => {
        const text = $createTextNode('x');
        text.toggleFormat('bold');
        text.toggleFormat('underline');
        text.setStyle(
          'font-size: 40px; color: var(--text-tone-primary); white-space: nowrap;',
        );
        $getRoot().append($createParagraphNode().append(text));
      },
      (editor) => registerInlineTextSanitizer(editor),
    );
    const [node] = collect(state, 'text');
    expect(node.format).toBe(1);
    expect(node.style).toBe(styleForMarks({ tone: 'primary', nowrap: true }));
  });

  it('tokenizes typed Handlebars only when tokens are enabled', () => {
    const typed = (register?: (editor: LexicalEditor) => void) =>
      collect(
        stateOf(() => {
          $getRoot().append(
            $createParagraphNode().append($createTextNode('a {{name}} b')),
          );
        }, register),
        'text-token',
      ).map((node) => node.source);
    expect(typed((editor) => registerTokenBehaviour(editor))).toEqual([
      '{{name}}',
    ]);
    expect(typed()).toEqual([]);
  });
});
