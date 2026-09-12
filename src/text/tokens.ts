// The token language shared by every text host: Handlebars path expressions
// ({{name}}, {{d.temp}}) and nothing else - values are formatted by other
// nodes before they reach an input. Headless - keep React, PIXI, MUI and node
// classes out of this module.
import Handlebars from 'handlebars/dist/handlebars';

export type ParsedToken = {
  // path[0] is the input socket name, the rest is traversed inside its value
  path: string[];
};

export type TokenResolution =
  | { resolved: true; value: unknown }
  | { resolved: false };

const RESERVED_INPUT_NAMES = new Set([
  'this',
  'true',
  'false',
  'null',
  'undefined',
  'else',
]);
// a segment Handlebars reads as a plain id; anything else needs [brackets]
const PLAIN_SEGMENT = /^[A-Za-z_$][\w$-]*$/;

/** Parses one `{{…}}` token, or undefined if it is not a plain path. */
export function parseToken(source: string): ParsedToken | undefined {
  let program: any;
  try {
    program = Handlebars.parse(source);
  } catch {
    return undefined;
  }
  const [statement] = program.body;
  if (
    program.body.length !== 1 ||
    statement.type !== 'MustacheStatement' ||
    !statement.escaped ||
    statement.strip.open ||
    statement.strip.close ||
    statement.params.length > 0 ||
    statement.hash
  ) {
    return undefined;
  }
  const { path } = statement;
  if (
    path?.type !== 'PathExpression' ||
    path.data ||
    path.depth !== 0 ||
    path.parts.length === 0 ||
    /^this\b/.test(path.original)
  ) {
    return undefined;
  }
  return { path: path.parts };
}

export function tokenPathToString(path: string[]): string {
  return path
    .map((segment) => (PLAIN_SEGMENT.test(segment) ? segment : `[${segment}]`))
    .join('.');
}

/** The canonical source of a token - what gets persisted. */
export function formatToken(token: ParsedToken): string {
  return `{{${tokenPathToString(token.path)}}}`;
}

/**
 * Finds the valid tokens in a run of text. Invalid `{{…}}` spans stay text,
 * and so do triple-stash and backslash-escaped mustaches.
 */
export function scanTokenSpans(
  text: string,
): { start: number; end: number; token: ParsedToken }[] {
  const spans: { start: number; end: number; token: ParsedToken }[] = [];
  let index = text.indexOf('{{');
  while (index !== -1) {
    const close = text.indexOf('}}', index + 2);
    if (close === -1) {
      break;
    }
    const end = close + 2;
    const token =
      text[index - 1] === '\\' || text[index + 2] === '{'
        ? undefined
        : parseToken(text.slice(index, end));
    if (token) {
      spans.push({ start: index, end, token });
      index = text.indexOf('{{', end);
    } else {
      index = text.indexOf('{{', index + 2);
    }
  }
  return spans;
}

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

/**
 * Looks the path up in the owning node's bindable inputs. Only own properties
 * are followed; missing, undefined and null all count as unresolved.
 */
export function resolveTokenPath(
  path: string[],
  inputs: Record<string, unknown>,
): TokenResolution {
  let current: unknown = inputs;
  for (const segment of path) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !hasOwn(current, segment)
    ) {
      return { resolved: false };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current === undefined || current === null
    ? { resolved: false }
    : { resolved: true, value: current };
}

/** The text a resolved value shows as; an unresolved one shows nothing. */
export function tokenValueToText(resolution: TokenResolution): string {
  if (!resolution.resolved) {
    return '';
  }
  const { value } = resolution;
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

/** What an end user sees for a token source - never the raw `{{…}}`. */
export function renderTokenSource(
  source: string,
  inputs: Record<string, unknown>,
): string {
  const token = parseToken(source);
  return token ? tokenValueToText(resolveTokenPath(token.path, inputs)) : '';
}

/** A reason the name cannot be used for a new input, or undefined. */
export function validateInputName(
  name: string,
  existingNames: string[],
): string | undefined {
  if (name.trim() === '') {
    return 'The input needs a name';
  }
  if (existingNames.includes(name)) {
    return `An input named "${name}" already exists`;
  }
  if (RESERVED_INPUT_NAMES.has(name)) {
    return `"${name}" is reserved`;
  }
  const token = parseToken(`{{${name}}}`);
  if (
    !token ||
    token.path.length !== 1 ||
    token.path[0] !== name ||
    !PLAIN_SEGMENT.test(name)
  ) {
    return `"${name}" is not a valid input name - use letters, digits, _ or -`;
  }
  return undefined;
}

// private mention syntax the text editor stored before tokens were Handlebars
const LEGACY_MENTION = /@\[(.*?)\]\(socket:(.*?)\)/g;

export function legacyMentionToTokenSource(socketName: string): string {
  return formatToken({ path: [socketName] });
}

/** Rewrites legacy mentions outside fenced code blocks. */
export function migrateLegacyMentions(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence
        ? line
        : line.replace(LEGACY_MENTION, (_match, _value, socketName) =>
            legacyMentionToTokenSource(socketName),
          );
    })
    .join('\n');
}
