import {
  $createTextNode,
  $getRoot,
  $createParagraphNode,
  SerializedEditorState,
  SerializedLexicalNode,
} from 'lexical';
import {
  createHeadlessTextEditor,
  DYNAMIC_TEXT_PROFILE,
  TEXT_EDITOR2_PROFILE,
} from '../../../src/text/lexical/editorConfig';
import {
  lexicalStateToMarkdown,
  markdownToLexicalState,
} from '../../../src/text/lexical/markdown';
import {
  $getRenderedTextContent,
  registerTokenBehaviour,
} from '../../../src/text/lexical/TokenNode';
import {
  $contentToLexical,
  $lexicalToContent,
  registerInlineTextSanitizer,
  styleForMarks,
} from '../../../src/text/lexical/content';
import { textContentToMarkdown } from '../../../src/text/inlineMarkdown';
import { markdownToTextContent } from '../../../src/text/lexical/markdown';
import {
  createTextContent,
  normalizeTextContent,
} from '../../../src/text/model';

type Node = SerializedLexicalNode & {
  children?: Node[];
  source?: string;
  format?: number;
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

const tokenSources = (markdown: string) =>
  collect(markdownToLexicalState(markdown), 'text-token').map(
    (node) => node.source,
  );

const roundTrip = (markdown: string) =>
  lexicalStateToMarkdown(markdownToLexicalState(markdown));

describe('markdown <-> lexical', () => {
  it('round-trips headings, emphasis, links, lists, quotes, code and tables', () => {
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
      '',
      '| a | b |',
      '| --- | --- |',
    ].join('\n');
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('imports plain and formatted tokens as canonical Handlebars', () => {
    expect(
      tokenSources(
        'Hi {{ name }}, it is {{format d.temp decimals=1 suffix=" °C" fallback="—"}}',
      ),
    ).toEqual([
      '{{name}}',
      '{{format d.temp decimals=1 suffix=" °C" fallback="—"}}',
    ]);
    expect(roundTrip('Hi {{name}} and {{format d.temp decimals=1}}')).toBe(
      'Hi {{name}} and {{format d.temp decimals=1}}',
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

  it('keeps bold and italic on tokens', () => {
    const state = markdownToLexicalState('**{{name}}** and *{{other}}*');
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

describe('rendered text content', () => {
  it('resolves tokens and never shows their source', () => {
    const editor = createHeadlessTextEditor(TEXT_EDITOR2_PROFILE);
    editor.setEditorState(
      editor.parseEditorState(
        markdownToLexicalState('# {{format t decimals=1}}\n\n{{missing}} ok'),
      ),
    );
    const text = editor
      .getEditorState()
      .read(() => $getRenderedTextContent({ t: 3 }), { editor });
    expect(text).toBe('3.0\n\n ok');
  });
});

describe('inline markdown', () => {
  const parse = (markdown: string, tokens = true) =>
    markdownToTextContent(markdown, tokens).paragraphs.map(({ runs }) => runs);

  it('reads emphasis, code, links, spans and tokens', () => {
    expect(
      parse(
        '**Temp:** {{format t decimals=1}} *ok* __big__ `c` [site](https://x.io){.muted} [hot]{.negative .nowrap} ~~old~~',
      ),
    ).toEqual([
      [
        { type: 'text', text: 'Temp:', marks: { strong: true } },
        { type: 'text', text: ' ' },
        { type: 'token', source: '{{format t decimals=1}}' },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'ok', marks: { emphasis: true } },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'big', marks: { strong: true } },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'c', marks: { code: true } },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: 'site',
          marks: { tone: 'muted', link: 'https://x.io' },
        },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'hot', marks: { tone: 'negative', nowrap: true } },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'old', marks: { strikethrough: true } },
      ],
    ]);
  });

  it('keeps every line a paragraph, empty ones included', () => {
    expect(parse('one\n\ntwo')).toEqual([
      [{ type: 'text', text: 'one' }],
      [],
      [{ type: 'text', text: 'two' }],
    ]);
  });

  it('leaves tokens, block syntax and loose brackets as text', () => {
    const text = '# Hi {{name}} [plain] {.accent} [x]{bold}';
    expect(parse(text, false)).toEqual([[{ type: 'text', text }]]);
  });

  it('escapes literal markup so it reads back as text', () => {
    const literal = createTextContent('2*3 = 6_ [x](y) [z]{.accent} `q` &#65;');
    const markdown = textContentToMarkdown(literal);
    expect(markdown).toBe(
      '2\\*3 = 6\\_ \\[x\\](y) \\[z\\]{.accent} \\`q\\` &#38;#65;',
    );
    expect(markdownToTextContent(markdown, false)).toEqual(literal);
  });

  const rich = normalizeTextContent({
    paragraphs: [
      {
        runs: [
          { type: 'text', text: 'Temp: ' },
          {
            type: 'token',
            source: '{{format d.temp decimals=1 suffix=" °C"}}',
            marks: { strong: true },
          },
          { type: 'text', text: ' is ' },
          { type: 'text', text: 'fine', marks: { emphasis: true } },
          { type: 'text', text: ', see ' },
          { type: 'text', text: 'docs', marks: { link: 'https://x.io/a_b' } },
          { type: 'text', text: ' or ' },
          {
            type: 'text',
            text: 'alarm',
            marks: { tone: 'negative', nowrap: true },
          },
        ],
      },
      { runs: [] },
      {
        runs: [
          { type: 'text', text: 'bold ', marks: { strong: true } },
          { type: 'text', text: 'both', marks: { strong: true, emphasis: true } },
          { type: 'text', text: 'Hello', marks: { strong: true } },
          { type: 'token', source: '{{name}}', marks: { emphasis: true } },
          { type: 'text', text: ' then ' },
          {
            type: 'text',
            text: 'site',
            marks: { link: 'https://e.com', tone: 'muted', strong: true },
          },
          { type: 'text', text: ' ' },
          {
            type: 'token',
            source: '{{name}}',
            marks: { tone: 'accent', emphasis: true },
          },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'a]`b', marks: { code: true } },
        ],
      },
      {
        runs: [
          { type: 'text', text: 'price ' },
          { type: 'text', text: '10', marks: { strikethrough: true } },
          { type: 'text', text: ' now 8 ~' },
        ],
      },
    ],
  });

  it('writes readable Markdown', () => {
    expect(textContentToMarkdown(rich)).toBe(
      [
        'Temp: **{{format d.temp decimals=1 suffix=" °C"}}** is *fine*, see [docs](https://x.io/a_b) or [alarm]{.negative .nowrap}',
        '',
        '**bold *both*Hello**_{{name}}_ then [**site**](https://e.com){.muted} [_{{name}}_]{.accent} ``a]`b``',
        'price ~~10~~ now 8 \\~',
      ].join('\n'),
    );
  });

  it('reads back exactly what it wrote', () => {
    expect(markdownToTextContent(textContentToMarkdown(rich), true)).toEqual(
      rich,
    );
  });

  it('moves whitespace out of emphasis, which cannot open next to it', () => {
    const content = normalizeTextContent({
      paragraphs: [
        {
          runs: [
            { type: 'text', text: 'a' },
            { type: 'text', text: ' b ', marks: { strong: true } },
            { type: 'text', text: 'c' },
          ],
        },
      ],
    });
    expect(textContentToMarkdown(content)).toBe('a **b** c');
  });
});

describe('content <-> lexical', () => {
  const content = normalizeTextContent({
    paragraphs: [
      {
        runs: [
          { type: 'text', text: 'Plain ' },
          { type: 'text', text: 'strong', marks: { strong: true } },
          { type: 'text', text: ' em', marks: { emphasis: true, code: true } },
          { type: 'text', text: ' link', marks: { link: 'https://x.io' } },
          {
            type: 'token',
            source: '{{d.temp}}',
            marks: { link: 'https://x.io', strong: true },
          },
          { type: 'break' },
          {
            type: 'text',
            text: 'toned',
            marks: { tone: 'negative', nowrap: true },
          },
        ],
      },
      { runs: [] },
      {
        runs: [{ type: 'token', source: '{{gone}}', marks: { tone: 'muted' } }],
      },
    ],
  });

  it('round-trips every run mark, token and break', () => {
    const editor = createHeadlessTextEditor(DYNAMIC_TEXT_PROFILE);
    editor.update(() => $contentToLexical(content), { discrete: true });
    expect(editor.getEditorState().read(() => $lexicalToContent())).toEqual(
      content,
    );
  });

  it('strips formats and CSS outside the inline vocabulary', () => {
    const editor = createHeadlessTextEditor(DYNAMIC_TEXT_PROFILE);
    registerInlineTextSanitizer(editor);
    editor.update(
      () => {
        const text = $createTextNode('x');
        text.toggleFormat('bold');
        text.toggleFormat('underline');
        text.setStyle(
          'font-size: 40px; color: var(--text-tone-accent); white-space: nowrap;',
        );
        $getRoot().append($createParagraphNode().append(text));
      },
      { discrete: true },
    );
    expect(editor.getEditorState().read(() => $lexicalToContent())).toEqual(
      normalizeTextContent({
        paragraphs: [
          {
            runs: [
              {
                type: 'text',
                text: 'x',
                marks: { strong: true, tone: 'accent', nowrap: true },
              },
            ],
          },
        ],
      }),
    );
    editor.getEditorState().read(() => {
      const [node] = $getRoot().getAllTextNodes();
      expect(node.hasFormat('underline')).toBe(false);
      expect(node.getStyle()).toBe(
        styleForMarks({ tone: 'accent', nowrap: true }),
      );
    });
  });

  it('tokenizes typed Handlebars only when tokens are enabled', () => {
    const typed = (withTokens: boolean) => {
      const editor = createHeadlessTextEditor(DYNAMIC_TEXT_PROFILE);
      if (withTokens) registerTokenBehaviour(editor);
      editor.update(
        () => {
          $getRoot().append(
            $createParagraphNode().append($createTextNode('a {{name}} b')),
          );
        },
        { discrete: true },
      );
      return editor.getEditorState().read(() => $lexicalToContent());
    };
    expect(typed(true).paragraphs[0].runs).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'token', source: '{{name}}' },
      { type: 'text', text: ' b' },
    ]);
    expect(typed(false).paragraphs[0].runs).toEqual([
      { type: 'text', text: 'a {{name}} b' },
    ]);
  });
});
