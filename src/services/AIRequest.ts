import { startAILogRun, type AILogRun } from './AIConversationLog';
import type { AIProvider } from './aiModels';

export class AIRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'AIRequestError';
  }
}

function describeFailure(status: number, payload: any): string {
  if (status === 413) {
    return 'The request was too large to send. Remove an image attachment, or start a new conversation if this one has collected a lot of them.';
  }
  const message = [
    payload?.error?.message,
    payload?.error,
    payload?.message,
    payload?.details?.error?.message,
    payload?.details?.error,
    payload?.details,
  ].find((value) => typeof value === 'string' && value.trim());
  return (
    message?.slice(0, 2000) || `AI backend request failed (HTTP ${status}).`
  );
}

/** One boundary for authentication, HTTP, response decoding and stream failures. */
export async function requestAI<T>(options: {
  endpoint: string;
  provider: AIProvider;
  model: string;
  body: string;
  getHeaders: () => Promise<Record<string, string>>;
  consume: (response: Response) => Promise<T>;
  signal?: AbortSignal;
  log?: AILogRun;
  turn?: number;
  onBackendError?: (payload: unknown) => void;
}): Promise<T> {
  const {
    endpoint,
    provider,
    model,
    body,
    getHeaders,
    consume,
    signal,
    turn,
    log = startAILogRun(),
    onBackendError,
  } = options;
  const started = Date.now();
  const context = {
    requestId: `${started}-${Math.random().toString(36).slice(2, 10)}`,
    endpoint: endpoint.split(/[?#]/)[0],
    provider,
    model,
    turn,
    requestBytes: new TextEncoder().encode(body).byteLength,
  };
  let stage = 'authentication';
  let response: Response | undefined;
  const diagnostics = () => ({
    ...context,
    stage,
    durationMs: Date.now() - started,
    status: response?.status,
    backendRequestId:
      response?.headers.get('x-request-id') ||
      response?.headers.get('request-id'),
    contentType: response?.headers.get('content-type'),
  });
  log.log({ type: 'request_start', ...context });
  try {
    const headers = await getHeaders();
    stage = 'network';
    response = await fetch(endpoint, { method: 'POST', headers, body, signal });
    stage = 'http';
    if (!response.ok) {
      const payload = await response.json().catch(() => undefined);
      onBackendError?.(payload);
      throw new AIRequestError(
        describeFailure(response.status, payload),
        response.status,
      );
    }
    stage = 'response';
    const result = await consume(response);
    log.log({ type: 'request_end', ...diagnostics() });
    return result;
  } catch (error) {
    const cancelled =
      signal?.aborted || (error as Error)?.name === 'AbortError';
    // Deliberately omit headers, request/response bodies, and arbitrary error
    // messages: these can contain credentials, prompts or image data.
    const event = {
      type: cancelled ? 'request_cancelled' : 'request_error',
      ...diagnostics(),
      errorName: error instanceof Error ? error.name : 'UnknownError',
    } as const;
    log.log(event);
    if (!cancelled) console.error('AI backend communication failed', event);
    if (cancelled) throw new AIRequestError('AI request was cancelled', 499);
    throw error;
  }
}

export async function readAIJSON(response: Response): Promise<any> {
  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AIRequestError(
      'The AI backend returned an invalid response.',
      502,
    );
  }
  if (payload.success === false || payload.error) {
    throw new AIRequestError(describeFailure(response.status, payload), 502);
  }
  return payload.data ?? payload;
}

/** Decode SSE across arbitrary chunk boundaries and require a completed message. */
export async function readClaudeStream(
  response: Response,
  onEvent: (event: any) => void,
): Promise<void> {
  if (!response.body)
    throw new AIRequestError('Claude stream returned an empty response', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const readEvents = (final = false) => {
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = final ? '' : events.pop() || '';
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      if (data === '[DONE]') {
        completed = true;
        continue;
      }
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed.type !== 'string') {
        throw new AIRequestError(
          'The AI response stream contained an invalid event.',
          502,
        );
      }
      if (parsed.type === 'error') {
        throw new AIRequestError(describeFailure(response.status, parsed), 502);
      }
      if (parsed.type === 'message_stop') completed = true;
      onEvent(parsed);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      readEvents();
    }
    buffer += decoder.decode();
    readEvents(true);
    if (!completed)
      throw new AIRequestError(
        'The AI response stream ended before the message completed.',
        502,
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
