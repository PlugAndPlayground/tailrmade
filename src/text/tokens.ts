// The token language shared by every text host: Handlebars path expressions
// ({{d.temp}}) and the `format` helper, nothing else. Headless - keep React,
// PIXI, MUI and node classes out of this module.
import Handlebars from 'handlebars/dist/handlebars';

export const FORMAT_HELPER = 'format';

export type TokenFormat = {
  decimals?: number;
  suffix?: string;
  dateFormat?: string;
  fallback?: string;
};

export type ParsedToken = {
  // path[0] is the input socket name, the rest is traversed inside its value
  path: string[];
  format?: TokenFormat;
};

export type TokenResolution =
  | { resolved: true; value: unknown }
  | { resolved: false };

const RESERVED_INPUT_NAMES = new Set([
  'this',
  FORMAT_HELPER,
  'true',
  'false',
  'null',
  'undefined',
  'else',
]);
const MAX_DECIMALS = 20;
// a segment Handlebars reads as a plain id; anything else needs [brackets]
const PLAIN_SEGMENT = /^[A-Za-z_$][\w$-]*$/;

function parsePath(node: any): string[] | undefined {
  if (
    node?.type !== 'PathExpression' ||
    node.data ||
    node.depth !== 0 ||
    node.parts.length === 0 ||
    /^this\b/.test(node.original)
  ) {
    return undefined;
  }
  return node.parts;
}

function parseFormat(
  pairs: { key: string; value: any }[],
): TokenFormat | undefined {
  const format: TokenFormat = {};
  for (const { key, value } of pairs) {
    if (key === 'decimals') {
      if (
        value.type !== 'NumberLiteral' ||
        !Number.isInteger(value.value) ||
        value.value < 0 ||
        value.value > MAX_DECIMALS
      ) {
        return undefined;
      }
      format.decimals = value.value;
    } else if (key === 'suffix' || key === 'dateFormat' || key === 'fallback') {
      if (value.type !== 'StringLiteral') {
        return undefined;
      }
      format[key] = value.value;
    } else {
      return undefined;
    }
  }
  return format;
}

/** Parses one `{{…}}` token, or undefined if it is not a supported token. */
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
    statement.strip.close
  ) {
    return undefined;
  }
  const path = parsePath(statement.path);
  if (!path) {
    return undefined;
  }
  const pairs = statement.hash?.pairs ?? [];
  if (path.length === 1 && path[0] === FORMAT_HELPER) {
    const valuePath = parsePath(statement.params[0]);
    const format = parseFormat(pairs);
    return statement.params.length === 1 && valuePath && format
      ? { path: valuePath, format }
      : undefined;
  }
  if (statement.params.length > 0 || pairs.length > 0) {
    return undefined;
  }
  return { path };
}

export function tokenPathToString(path: string[]): string {
  return path
    .map((segment) => (PLAIN_SEGMENT.test(segment) ? segment : `[${segment}]`))
    .join('.');
}

/** The canonical source of a token - what gets persisted. */
export function formatToken(token: ParsedToken): string {
  const path = tokenPathToString(token.path);
  const format = token.format;
  if (!format) {
    return `{{${path}}}`;
  }
  const hash = [
    format.decimals !== undefined ? `decimals=${format.decimals}` : '',
    ...(['suffix', 'dateFormat', 'fallback'] as const).map((key) =>
      format[key] !== undefined ? `${key}=${JSON.stringify(format[key])}` : '',
    ),
  ].filter(Boolean);
  return `{{${[FORMAT_HELPER, path, ...hash].join(' ')}}}`;
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
    const end = findMustacheEnd(text, index + 2);
    if (end === -1) {
      break;
    }
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

// index just past the closing `}}`, skipping over quoted hash values
function findMustacheEnd(text: string, from: number): number {
  let quote: string | undefined;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '}' && text[i + 1] === '}') {
      return i + 2;
    }
  }
  return -1;
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

function toDate(value: unknown): Date | undefined {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number' || typeof value === 'string'
        ? new Date(value)
        : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

function formatDate(date: Date, pattern: string): string {
  const parts: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: pad(date.getFullYear() % 100),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, (key) => parts[key]);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function stringify(value: unknown): string {
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

/** Null fallback, then number/date formatting, then the suffix. */
export function formatTokenValue(
  resolution: TokenResolution,
  format: TokenFormat = {},
): string {
  if (!resolution.resolved) {
    return format.fallback ?? '';
  }
  const { value } = resolution;
  let text: string | undefined;
  const date = format.dateFormat !== undefined ? toDate(value) : undefined;
  if (date) {
    text = formatDate(date, format.dateFormat!);
  } else if (format.decimals !== undefined) {
    text = toNumber(value)?.toFixed(format.decimals);
  }
  return (text ?? stringify(value)) + (format.suffix ?? '');
}

/** What an end user sees for a token source - never the raw `{{…}}`. */
export function renderTokenSource(
  source: string,
  inputs: Record<string, unknown>,
): string {
  const token = parseToken(source);
  if (!token) {
    return '';
  }
  return formatTokenValue(resolveTokenPath(token.path, inputs), token.format);
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
    token.format ||
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
