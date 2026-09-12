// The inline Markdown static Text and the Text node store: CommonMark
// emphasis, code spans and links, GFM ~~strikethrough~~, plus Pandoc-style
// attributes for tone and
// no-wrap - [text]{.accent .nowrap}, [text](url){.muted}. One line is one
// paragraph. Written here, headless, so migrations can produce it; Lexical
// reads it (lexical/markdown.ts), so there is one writer and one reader.
import {
  TEXT_TONES,
  TextContent,
  TextMarks,
  TextRun,
  TextTone,
} from './model';

export const NOWRAP_CLASS = 'nowrap';

const PUNCTUATION = /[!-/:-@[-`{-~]/;

type InlineRun = Exclude<TextRun, { type: 'break' }>;

export function marksFromClasses(
  classes: string,
): Pick<TextMarks, 'tone' | 'nowrap'> {
  const marks: Pick<TextMarks, 'tone' | 'nowrap'> = {};
  classes.split(/[\s.]+/).forEach((name) => {
    if (name === NOWRAP_CLASS) {
      marks.nowrap = true;
    } else if (TEXT_TONES.includes(name as TextTone) && name !== 'default') {
      marks.tone = name as TextTone;
    }
  });
  return marks;
}

const rawText = (run: InlineRun) => (run.type === 'text' ? run.text : run.source);

// `{{` stays as it is, so token-enabled hosts read their tokens back; a
// character reference would be decoded on import, so its `&` is one too
const escapeText = (text: string) =>
  text.replace(/[\\*_`~[\]]/g, '\\$&').replace(/&(#\d+;)/g, '&#38;$1');

function codeSpan(code: string): string {
  const longestRun = Math.max(
    0,
    ...(code.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(longestRun + 1);
  // import strips one space from each end of a span that has both
  const pad =
    /^`|`$/.test(code) || (/^ [\s\S]* $/.test(code) && /[^ ]/.test(code));
  return pad ? `${fence} ${code} ${fence}` : fence + code + fence;
}

// emphasis only opens and closes next to non-whitespace
function delimit(delimiter: string, inner: string): string {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return core ? lead + delimiter + core + delimiter + trail : inner;
}

const encodeUrl = (url: string) =>
  url.replace(/[\s()<>\\]/g, (char) =>
    char === '(' ? '%28' : char === ')' ? '%29' : encodeURIComponent(char),
  );

function groupBy<T>(items: T[], key: (item: T) => string): T[][] {
  const groups: T[][] = [];
  items.forEach((item) => {
    const last = groups[groups.length - 1];
    if (last && key(last[0]) === key(item)) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  });
  return groups;
}

type Layer = {
  key: (marks: TextMarks) => unknown;
  wrap: (inner: string, marks: TextMarks) => string;
};

// outermost first, so marks nest instead of overlapping; code is innermost
const LAYERS: Layer[] = [
  {
    key: ({ link, tone, nowrap }) => [link, tone, nowrap],
    wrap: (inner, { link, tone, nowrap }) => {
      const classes = [tone && `.${tone}`, nowrap && `.${NOWRAP_CLASS}`]
        .filter(Boolean)
        .join(' ');
      if (!link && !classes) {
        return inner;
      }
      return `[${inner}]${link ? `(${encodeUrl(link)})` : ''}${
        classes ? `{${classes}}` : ''
      }`;
    },
  },
  {
    key: ({ strong }) => strong,
    wrap: (inner, { strong }) => (strong ? delimit('**', inner) : inner),
  },
  {
    key: ({ emphasis }) => emphasis,
    wrap: (inner, { emphasis }) => {
      if (!emphasis) {
        return inner;
      }
      // text that starts or ends in punctuation (a token, a code span) can
      // only take `*` next to whitespace - `_` also works beside a `**`
      const core = inner.trim();
      return delimit(
        PUNCTUATION.test(core[0]) || PUNCTUATION.test(core[core.length - 1])
          ? '_'
          : '*',
        inner,
      );
    },
  },
  {
    key: ({ strikethrough }) => strikethrough,
    wrap: (inner, { strikethrough }) =>
      strikethrough ? delimit('~~', inner) : inner,
  },
];

function writeRuns(runs: InlineRun[], depth = 0): string {
  if (depth === LAYERS.length) {
    return groupBy(runs, (run) => String(Boolean(run.marks?.code)))
      .map((group) =>
        group[0].marks?.code
          ? codeSpan(group.map(rawText).join(''))
          : group.map((run) => escapeText(rawText(run))).join(''),
      )
      .join('');
  }
  const layer = LAYERS[depth];
  return groupBy(runs, (run) => JSON.stringify(layer.key(run.marks ?? {})))
    .map((group) =>
      layer.wrap(writeRuns(group, depth + 1), group[0].marks ?? {}),
    )
    .join('');
}

export function textContentToMarkdown(content: TextContent): string {
  return content.paragraphs
    .flatMap(({ runs }) =>
      runs.reduce<InlineRun[][]>(
        (lines, run) => {
          if (run.type === 'break') {
            lines.push([]);
          } else {
            lines[lines.length - 1].push(run);
          }
          return lines;
        },
        [[]],
      ),
    )
    .map((line) => writeRuns(line))
    .join('\n');
}
