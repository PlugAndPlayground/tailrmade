import type { ToolCall } from './protocol';

// Reads tool calls out of a model's text. Two formats are understood:
// - Gemma: <|tool_call>call:name{key:<|"|>text<|"|>,count:4}<tool_call|>
//   The markers can be missing when special tokens were skipped, so a bare
//   "call:name{…}" counts too, and "name{…}" when the name is a known tool.
// - Hermes / Qwen: <tool_call>{"name": "…", "arguments": {…}}</tool_call>
// Generalises parseKitchenToolCalls from Jamie's kitchenAssistant.ts, which
// only knew three tools with numeric arguments.

const GEMMA_STRING = '<|"|>';

class ArgumentReader {
  constructor(
    private text: string,
    public index: number,
  ) {}

  private skipSpace(): void {
    while (/\s/.test(this.text[this.index] ?? '')) this.index++;
  }

  private startsWith(token: string): boolean {
    return this.text.startsWith(token, this.index);
  }

  private expect(char: string): void {
    this.skipSpace();
    if (this.text[this.index] !== char) {
      throw new Error(`Expected "${char}" at ${this.index}`);
    }
    this.index++;
  }

  private readString(): string {
    if (this.startsWith(GEMMA_STRING)) {
      const start = this.index + GEMMA_STRING.length;
      const end = this.text.indexOf(GEMMA_STRING, start);
      if (end < 0) throw new Error('Unterminated string');
      this.index = end + GEMMA_STRING.length;
      return this.text.slice(start, end);
    }
    const quote = this.text[this.index];
    let raw = '';
    this.index++;
    while (this.index < this.text.length) {
      const char = this.text[this.index++];
      if (char === quote) {
        if (quote !== '"') return raw.replace(/\\'/g, "'");
        try {
          return JSON.parse(`"${raw}"`);
        } catch {
          return raw; // e.g. a raw line break inside the quotes
        }
      }
      raw += char;
      if (char === '\\' && this.index < this.text.length) {
        raw += this.text[this.index++];
      }
    }
    throw new Error('Unterminated string');
  }

  private readBare(): string {
    const match = /^[^,:{}\[\]\s]+/.exec(this.text.slice(this.index));
    if (!match) throw new Error(`Unexpected "${this.text[this.index]}"`);
    this.index += match[0].length;
    return match[0];
  }

  private isStringStart(): boolean {
    const char = this.text[this.index];
    return this.startsWith(GEMMA_STRING) || char === '"' || char === "'";
  }

  readValue(): unknown {
    this.skipSpace();
    const char = this.text[this.index];
    if (char === '{') return this.readObject();
    if (char === '[') return this.readArray();
    if (this.isStringStart()) return this.readString();
    const bare = this.readBare();
    if (bare === 'true') return true;
    if (bare === 'false') return false;
    if (bare === 'null') return null;
    const number = Number(bare);
    return bare !== '' && Number.isFinite(number) ? number : bare;
  }

  readObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.expect('{');
    this.skipSpace();
    if (this.text[this.index] === '}') {
      this.index++;
      return result;
    }
    for (;;) {
      this.skipSpace();
      const key = this.isStringStart() ? this.readString() : this.readBare();
      this.expect(':');
      result[key] = this.readValue();
      this.skipSpace();
      const next = this.text[this.index++];
      if (next === '}') return result;
      if (next !== ',') throw new Error(`Expected "," or "}" in arguments`);
    }
  }

  private readArray(): unknown[] {
    const result: unknown[] = [];
    this.expect('[');
    this.skipSpace();
    if (this.text[this.index] === ']') {
      this.index++;
      return result;
    }
    for (;;) {
      result.push(this.readValue());
      this.skipSpace();
      const next = this.text[this.index++];
      if (next === ']') return result;
      if (next !== ',') throw new Error(`Expected "," or "]" in list`);
    }
  }
}

// Reads one `{…}` starting at `start`. Returns undefined if it is not valid.
export function readArguments(
  text: string,
  start: number,
): { value: Record<string, unknown>; end: number } | undefined {
  try {
    const reader = new ArgumentReader(text, start);
    const value = reader.readObject();
    return { value, end: reader.index };
  } catch {
    return undefined;
  }
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let callSequence = 0;
const nextCallId = () => `call_${++callSequence}`;

export interface ParsedToolCalls {
  calls: ToolCall[];
  // The text with tool calls and chat-template markers removed.
  message: string;
}

export function parseToolCalls(
  response: string,
  knownTools: string[] = [],
  createId: () => string = nextCallId,
): ParsedToolCalls {
  const text = String(response ?? '');
  const calls: ToolCall[] = [];
  const spans: Array<[number, number]> = [];

  // Hermes / Qwen style JSON blocks.
  const hermes = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  for (const match of text.matchAll(hermes)) {
    try {
      const parsed = JSON.parse(match[1]);
      const name = parsed?.name ?? parsed?.function?.name;
      if (typeof name !== 'string') continue;
      let args =
        parsed.arguments ??
        parsed.parameters ??
        parsed.function?.arguments ??
        {};
      if (typeof args === 'string') args = JSON.parse(args);
      calls.push({ id: createId(), name, arguments: args });
      spans.push([match.index!, match.index! + match[0].length]);
    } catch {
      // Not a JSON tool call; left in the text.
    }
  }

  // Gemma style. "call:" names any tool; without it only known tools count,
  // so ordinary text such as "Note{…}" is not taken for a call.
  const names = knownTools.map(escapeRegExp).join('|');
  const gemma = new RegExp(
    `(<\\|tool_call>\\s*)?(?:call:([A-Za-z_][\\w.-]*)${names ? `|\\b(${names})` : ''})\\s*(?=\\{)`,
    'g',
  );
  for (const match of text.matchAll(gemma)) {
    const start = match.index!;
    if (spans.some(([from, to]) => start >= from && start < to)) continue;
    const braceAt = start + match[0].length;
    const args = readArguments(text, braceAt);
    if (!args) continue;
    let end = args.end;
    const closing = /^\s*<tool_call\|>/.exec(text.slice(end));
    if (closing) end += closing[0].length;
    calls.push({
      id: createId(),
      name: match[2] ?? match[3],
      arguments: args.value,
    });
    spans.push([start, end]);
  }

  spans.sort((a, b) => a[0] - b[0]);
  let message = '';
  let cursor = 0;
  for (const [from, to] of spans) {
    message += text.slice(cursor, from);
    cursor = to;
  }
  message += text.slice(cursor);
  message = message
    .replace(/<\|(?:turn|channel)[^>]*>|<(?:turn|channel)\|>/g, '')
    .replace(/<\|tool_call>|<tool_call\|>|<\/?tool_call>/g, '')
    .trim();

  // A model sometimes answers with only the tool's name, e.g. "end_conversation()".
  if (calls.length === 0 && names) {
    const bare = new RegExp(`^(?:call:)?(${names})(?:\\(\\)|\\{\\})?$`).exec(
      message,
    );
    if (bare) {
      calls.push({ id: createId(), name: bare[1], arguments: {} });
      message = '';
    }
  }

  return { calls, message };
}
