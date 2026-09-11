// Imports the HTML the pre-v2 static Text stored (contentEditable innerHTML)
// into text content. Conservative on purpose: bold, italic, code, links, line
// breaks and text survive; every other tag is dropped, keeping its text, and
// script/style bodies are dropped entirely. Headless - runs inside graph
// migrations, so no DOM parser.
import {
  normalizeTextContent,
  sanitizeLink,
  TextContent,
  TextMarks,
  TextParagraph,
} from './model';

const MARK_TAGS: Record<string, keyof TextMarks> = {
  b: 'strong',
  strong: 'strong',
  i: 'emphasis',
  em: 'emphasis',
  code: 'code',
};
const BLOCK_TAGS = new Set(['div', 'p']);
const DROPPED_BODY_TAGS = new Set(['script', 'style']);
const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/;
const HREF = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function textContentFromLegacyHtml(html: string): TextContent {
  const paragraphs: TextParagraph[] = [{ runs: [] }];
  const markDepth: Partial<Record<keyof TextMarks, number>> = {};
  const links: (string | undefined)[] = [];
  let droppedBody: string | undefined;

  const current = () => paragraphs[paragraphs.length - 1];
  const newParagraph = () => paragraphs.push({ runs: [] });
  const pushText = (text: string) => {
    text.split('\n').forEach((line, index) => {
      if (index > 0) newParagraph();
      if (!line) return;
      const marks: TextMarks = {};
      (['strong', 'emphasis', 'code'] as const).forEach((key) => {
        if (markDepth[key]) marks[key] = true;
      });
      const link = links.filter(Boolean).pop();
      if (link) marks.link = link;
      current().runs.push({ type: 'text', text: line, marks });
    });
  };

  let rest = html;
  while (rest.length > 0) {
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      rest = end === -1 ? '' : rest.slice(end + 3);
      continue;
    }
    const tag = rest[0] === '<' ? TAG.exec(rest) : null;
    if (!tag) {
      const next = rest.indexOf('<', 1);
      const text = next === -1 ? rest : rest.slice(0, next);
      rest = next === -1 ? '' : rest.slice(next);
      if (!droppedBody) pushText(decodeEntities(text));
      continue;
    }
    rest = rest.slice(tag[0].length);
    const [, closing, rawName, attributes] = tag;
    const name = rawName.toLowerCase();

    if (droppedBody) {
      if (closing && name === droppedBody) droppedBody = undefined;
    } else if (DROPPED_BODY_TAGS.has(name)) {
      if (!closing) droppedBody = name;
    } else if (name === 'br') {
      newParagraph();
    } else if (BLOCK_TAGS.has(name)) {
      // the old widget turned <div> into a newline and deleted </div>
      if (!closing && current().runs.length > 0) newParagraph();
    } else if (MARK_TAGS[name]) {
      const key = MARK_TAGS[name];
      markDepth[key] = Math.max(0, (markDepth[key] ?? 0) + (closing ? -1 : 1));
    } else if (name === 'a') {
      if (closing) {
        links.pop();
      } else {
        const href = HREF.exec(attributes);
        links.push(
          sanitizeLink(
            decodeEntities(href?.[2] ?? href?.[3] ?? href?.[4] ?? ''),
          ),
        );
      }
    }
  }

  // a trailing <br> never rendered as an extra line in the old widget
  if (paragraphs.length > 1 && current().runs.length === 0) {
    paragraphs.pop();
  }
  return normalizeTextContent({ version: 1, paragraphs });
}
