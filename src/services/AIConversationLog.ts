/**
 * Development-only transcript of an agentic AI run.
 *
 * The assistant panel shows what the agent chose to say; this records what it
 * actually did - every tool call with its arguments, every tool result the
 * model got back, and the captures it looked at - so a run can be read after
 * the fact to judge how well the MCP tools and their descriptions work.
 *
 * Entries are POSTed to the webpack dev server, which appends them as JSON
 * lines under logs/ai/ (see webpack.development.ts). It is a no-op in a
 * production bundle, and every failure is swallowed: logging must never
 * change how a run behaves.
 */

const AI_LOG_ENDPOINT = '/__ai-log';

// tool results (inspect_graph, a whole surface layout) can run to tens of
// thousands of characters. Keep enough to judge what the model saw without
// turning the transcript into a haystack
const MAX_FIELD_CHARS = 8000;

const isEnabled = process.env.NODE_ENV !== 'production';

export type AILogEventType =
  | 'run_start'
  | 'assistant_text'
  | 'tool_call'
  | 'tool_result'
  | 'vision'
  | 'run_end'
  | 'run_error';

export type AILogEvent = {
  type: AILogEventType;
  turn?: number;
  [key: string]: unknown;
};

// one file per run; the timestamp prefix keeps a directory listing in order
let currentRunId: string | undefined;
let sequence = 0;
// posts are chained so the file keeps the order the events happened in
let pending: Promise<unknown> = Promise.resolve();

export function truncateForAILog(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.length <= MAX_FIELD_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_FIELD_CHARS)}\n…[truncated, ${value.length} chars total]`;
}

export function startAILogRun(): string | undefined {
  if (!isEnabled) {
    return undefined;
  }
  currentRunId = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('Z', '');
  sequence = 0;
  return currentRunId;
}

/**
 * Records one event. Fire and forget - callers never await it and never see
 * an error from it.
 */
export function logAIEvent(event: AILogEvent, image?: string): void {
  if (!isEnabled || currentRunId === undefined) {
    return;
  }
  const body = {
    runId: currentRunId,
    seq: sequence++,
    at: new Date().toISOString(),
    ...event,
    // a data: URL is stripped to raw base64 by the dev server, which writes it
    // next to the transcript and puts the file name in this entry instead
    image,
  };
  pending = pending
    .then(() =>
      fetch(AI_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    .catch(() => undefined);
}

export function endAILogRun(): void {
  currentRunId = undefined;
}
