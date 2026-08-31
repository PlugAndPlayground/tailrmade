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

export interface AILogRun {
  log(event: AILogEvent, image?: string): void;
}

const disabledRun: AILogRun = { log: () => undefined };

export function truncateForAILog(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.length <= MAX_FIELD_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_FIELD_CHARS)}\n…[truncated, ${value.length} chars total]`;
}

export function startAILogRun(): AILogRun {
  if (!isEnabled) {
    return disabledRun;
  }
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('Z', '');
  const runId = `${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
  let sequence = 0;
  let pending: Promise<unknown> = Promise.resolve();

  return {
    // Fire and forget. Each run owns its queue, id, and sequence, so an older
    // request finishing cannot interfere with a newer request's transcript.
    log(event: AILogEvent, image?: string): void {
      const body = {
        runId,
        seq: sequence++,
        at: new Date().toISOString(),
        ...event,
        // a data: URL is stripped to raw base64 by the dev server, which writes
        // it next to the transcript and puts the file name in this entry instead
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
    },
  };
}
