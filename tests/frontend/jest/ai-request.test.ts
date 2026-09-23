import {
  requestAI,
  readAIJSON,
  readClaudeStream,
} from '../../../src/services/AIRequest';

describe('AI backend communication', () => {
  const originalFetch = global.fetch;
  let log: { log: jest.Mock };
  let options: Parameters<typeof requestAI>[0];

  beforeEach(() => {
    log = { log: jest.fn() };
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    options = {
      endpoint: 'http://localhost:6655/ai/request?token=secret',
      provider: 'claude',
      model: 'test-model',
      body: JSON.stringify({
        prompt: 'private prompt',
        image: 'private image',
      }),
      getHeaders: async () => ({ Authorization: 'Bearer secret' }),
      consume: readAIJSON,
      log,
      turn: 3,
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('unwraps JSON and correlates request events without logging sensitive content', async () => {
    (fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ data: { content: 'private answer' } }), {
        headers: {
          'x-request-id': 'backend-123',
          'content-type': 'application/json',
        },
      }),
    );
    await expect(requestAI(options)).resolves.toEqual({
      content: 'private answer',
    });
    const start = log.log.mock.calls[0][0];
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'request_end',
        requestId: start.requestId,
        backendRequestId: 'backend-123',
        status: 200,
        turn: 3,
        provider: 'claude',
        durationMs: expect.any(Number),
      }),
    );
    expect(JSON.stringify(log.log.mock.calls)).not.toMatch(/secret|private/);
  });

  it.each([429, 503])(
    'preserves HTTP %s and nested backend errors',
    async (status) => {
      const payload = { error: { message: 'Token limit exceeded' } };
      const onBackendError = jest.fn();
      (fetch as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify(payload), { status }),
      );
      await expect(
        requestAI({ ...options, onBackendError }),
      ).rejects.toMatchObject({ status, message: 'Token limit exceeded' });
      expect(onBackendError).toHaveBeenCalledWith(payload);
      expect(log.log).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'request_error',
          stage: 'http',
          status,
        }),
      );
    },
  );

  it('handles a non-JSON proxy error and gives actionable advice for oversized requests', async () => {
    (fetch as jest.Mock).mockResolvedValue(
      new Response('<html>Too large</html>', { status: 413 }),
    );
    await expect(requestAI(options)).rejects.toMatchObject({
      status: 413,
      message: expect.stringContaining('Remove an image attachment'),
    });
  });

  it.each([
    '<html>Bad gateway</html>',
    'null',
    '[]',
    '{"success":false,"error":"provider failed"}',
  ])('rejects invalid successful responses: %s', async (body) => {
    (fetch as jest.Mock).mockResolvedValue(new Response(body));
    await expect(requestAI(options)).rejects.toThrow();
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'request_error', stage: 'response' }),
    );
  });

  it('distinguishes authentication and network failures', async () => {
    await expect(
      requestAI({
        ...options,
        getHeaders: async () => {
          throw new Error('private auth details');
        },
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: 'authentication' }),
    );
    (fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestAI(options)).rejects.toThrow('Failed to fetch');
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: 'network' }),
    );
    expect(JSON.stringify(log.log.mock.calls)).not.toContain(
      'private auth details',
    );
  });

  it('records cancellation separately without emitting a console error', async () => {
    const controller = new AbortController();
    controller.abort();
    (fetch as jest.Mock).mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    );
    await expect(
      requestAI({ ...options, signal: controller.signal }),
    ).rejects.toMatchObject({ status: 499 });
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'request_cancelled' }),
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it('decodes split UTF-8 and SSE events and accepts an unterminated final event', async () => {
    const bytes = new TextEncoder().encode(
      'data: {"type":"content_block_delta","text":"ö"}\r\n\r\ndata: {"type":"message_stop"}',
    );
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
    const onEvent = jest.fn();
    await readClaudeStream(response, onEvent);
    expect(onEvent).toHaveBeenCalledWith({
      type: 'content_block_delta',
      text: 'ö',
    });
    expect(onEvent).toHaveBeenLastCalledWith({ type: 'message_stop' });
    expect(response.body?.locked).toBe(false);
  });

  it.each([
    [
      'data: {"type":"content_block_delta"}\n\n',
      'before the message completed',
    ],
    [
      'data: {"type":"error","error":{"message":"Overloaded"}}\n\n',
      'Overloaded',
    ],
    ['data: invalid JSON\n\n', 'JSON'],
  ])('logs failed streams and releases their reader', async (body, message) => {
    const response = new Response(body);
    (fetch as jest.Mock).mockResolvedValue(response);
    await expect(
      requestAI({
        ...options,
        consume: (res) => readClaudeStream(res, () => undefined),
      }),
    ).rejects.toThrow(message);
    expect(log.log).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'request_error', stage: 'response' }),
    );
    expect(response.body?.locked).toBe(false);
  });
});
