import { parseToolCalls } from '../../../src/nodes/transformers/toolCalls';
import { HandleRegistry } from '../../../src/nodes/transformers/handleRegistry';
import {
  IDLE_STATUS,
  isModelHandle,
  modelKey,
  type LoadRequest,
  type ModelStatus,
} from '../../../src/nodes/transformers/protocol';
import {
  applyProgressEvent,
  errorStatus,
  formatBytes,
  normalizeMessages,
  normalizeResponseFormat,
  normalizeTools,
  readyStatus,
  resolveDevice,
  statusAfterInspection,
  summarizeDownload,
  toolNames,
} from '../../../src/nodes/transformers/status';
import {
  checkCompanionModelStore,
  companionModelUrl,
  createCompanionModelCache,
} from '../../../src/nodes/transformers/companionModelCache';
import {
  CompanionRisk,
  ModelDownloadRisk,
  getRiskLevel,
  requiresAppRiskReview,
} from '../../../src/classes/NodeRisk';

const ids = () => {
  let n = 0;
  return () => `call_${++n}`;
};

const kitchenTools = [
  'adjust_servings',
  'show_recipe_step',
  'end_conversation',
];

describe('tool-call parsing', () => {
  it('reads Gemma tool calls with markers, as Kitchen Jamie gets them', () => {
    const parsed = parseToolCalls(
      '<|tool_call>call:adjust_servings{servings:4}<tool_call|>',
      kitchenTools,
      ids(),
    );
    expect(parsed.calls).toEqual([
      { id: 'call_1', name: 'adjust_servings', arguments: { servings: 4 } },
    ]);
    expect(parsed.message).toBe('');
  });

  it('reads Gemma string delimiters, nesting and several calls', () => {
    const parsed = parseToolCalls(
      'Sure.<|tool_call>call:search{query:<|"|>pasta, quick<|"|>,filters:{vegan:true,max:[1,2.5]},note:null}<tool_call|>' +
        '<|tool_call>call:show_recipe_step{step:2}<tool_call|>',
      [],
      ids(),
    );
    expect(parsed.calls).toEqual([
      {
        id: 'call_1',
        name: 'search',
        arguments: {
          query: 'pasta, quick',
          filters: { vegan: true, max: [1, 2.5] },
          note: null,
        },
      },
      { id: 'call_2', name: 'show_recipe_step', arguments: { step: 2 } },
    ]);
    expect(parsed.message).toBe('Sure.');
  });

  it('accepts calls whose markers were skipped as special tokens', () => {
    expect(
      parseToolCalls('call:show_recipe_step{step:3}', [], ids()).calls,
    ).toEqual([
      { id: 'call_1', name: 'show_recipe_step', arguments: { step: 3 } },
    ]);
    // Without "call:" only known tools count.
    expect(
      parseToolCalls('show_recipe_step{"step": 5}', kitchenTools, ids()).calls,
    ).toEqual([
      { id: 'call_1', name: 'show_recipe_step', arguments: { step: 5 } },
    ]);
    expect(parseToolCalls('Note{a:1}', kitchenTools, ids()).calls).toEqual([]);
  });

  it('treats a bare known tool name as a call, like Jamie did', () => {
    const parsed = parseToolCalls('end_conversation()', kitchenTools, ids());
    expect(parsed.calls).toEqual([
      { id: 'call_1', name: 'end_conversation', arguments: {} },
    ]);
    expect(parsed.message).toBe('');
  });

  it('reads Hermes / Qwen JSON tool calls', () => {
    const parsed = parseToolCalls(
      'Checking.\n<tool_call>\n{"name": "get_weather", "arguments": {"city": "Vienna"}}\n</tool_call>',
      [],
      ids(),
    );
    expect(parsed.calls).toEqual([
      { id: 'call_1', name: 'get_weather', arguments: { city: 'Vienna' } },
    ]);
    expect(parsed.message).toBe('Checking.');
  });

  it('leaves plain text and broken calls alone', () => {
    expect(
      parseToolCalls('Boil the pasta {al dente}.', kitchenTools, ids()),
    ).toEqual({
      calls: [],
      message: 'Boil the pasta {al dente}.',
    });
    expect(parseToolCalls('call:broken{step:', [], ids()).calls).toEqual([]);
  });

  it('strips chat-template markers from the message', () => {
    expect(
      parseToolCalls('<|turn>model\nHello<turn|>', [], ids()).message,
    ).toBe('model\nHello');
  });
});

describe('model handles', () => {
  const request: LoadRequest = {
    model: 'onnx-community/gemma-4-E2B-it-ONNX',
    task: 'text-generation',
    dtype: 'q4f16',
    device: 'auto',
    storage: 'Browser',
  };

  it('keys on model, task, dtype and device, not storage', () => {
    expect(modelKey(request)).toBe(
      modelKey({ ...request, model: ` ${request.model} ` }),
    );
    expect(modelKey(request)).not.toBe(modelKey({ ...request, dtype: 'q4' }));
    expect(modelKey(request)).not.toBe(
      modelKey({ ...request, device: 'wasm' }),
    );
  });

  it('loads a key once and returns the same handle every time', async () => {
    let finish: () => void = () => undefined;
    const loader = jest.fn((entry, req, emit) => {
      emit({ ...entry.status, phase: 'downloading', progress: 40 });
      return new Promise<any>((resolve) => {
        finish = () => {
          entry.handle = {
            id: entry.key,
            model: req.model,
            task: req.task,
            dtype: req.dtype,
            device: 'webgpu',
          };
          resolve({ handle: entry.handle, status: entry.status });
        };
      });
    });
    const registry = new HandleRegistry(loader);
    const first = jest.fn();
    const second = jest.fn();
    const a = registry.load(request, first);
    // Same key while loading joins the load and sees its current progress.
    const b = registry.load(
      { ...request, storage: 'Companion folder' },
      second,
    );
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({ phase: 'downloading', progress: 40 }),
      }),
    );
    finish();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.handle).toBe(rb.handle);
    const rc = await registry.load(request, jest.fn());
    expect(rc.handle).toBe(ra.handle);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(isModelHandle(JSON.parse(JSON.stringify(ra.handle)))).toBe(true);
  });

  it('forgets a failed load so it can be retried', async () => {
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ handle: { id: 'x' } });
    const registry = new HandleRegistry(loader);
    const listener = jest.fn();
    await expect(registry.load(request, listener)).rejects.toThrow('offline');
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: expect.objectContaining({ phase: 'error', error: 'offline' }),
      }),
    );
    await expect(registry.load(request, jest.fn())).resolves.toEqual({
      handle: { id: 'x' },
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty model id', async () => {
    const registry = new HandleRegistry(jest.fn());
    await expect(
      registry.load({ ...request, model: ' ' }, jest.fn()),
    ).rejects.toThrow('model id');
  });
});

describe('status mapping', () => {
  const metadata = [
    { exists: true, size: 1000, fromCache: true },
    { exists: true, size: 3_000_000_000, fromCache: false },
    { exists: false },
  ];

  it('reports size and cache state before downloading', () => {
    const info = summarizeDownload(metadata);
    expect(info).toEqual({
      files: 2,
      cachedFiles: 1,
      downloadBytes: 3_000_000_000,
      totalBytes: 3_000_001_000,
      hasUnknownSize: false,
    });
    expect(statusAfterInspection(IDLE_STATUS, info)).toMatchObject({
      phase: 'downloading',
      progress: 0,
      cached: false,
      downloadBytes: 3_000_000_000,
    });
    const cached = summarizeDownload([
      { exists: true, size: 5, fromCache: true },
    ]);
    expect(statusAfterInspection(IDLE_STATUS, cached)).toMatchObject({
      phase: 'loading',
      progress: 100,
      cached: true,
    });
  });

  it('maps progress events and skips ones that change nothing', () => {
    const downloading: ModelStatus = { ...IDLE_STATUS, phase: 'downloading' };
    expect(
      applyProgressEvent(downloading, { status: 'progress', progress: 50 }),
    ).toBeUndefined();
    const half = applyProgressEvent(downloading, {
      status: 'progress_total',
      progress: 50.7,
    });
    expect(half).toMatchObject({ phase: 'downloading', progress: 50 });
    expect(
      applyProgressEvent(half!, { status: 'progress_total', progress: 50.2 }),
    ).toBeUndefined();
    expect(
      applyProgressEvent(half!, { status: 'progress_total', progress: 100 }),
    ).toMatchObject({ phase: 'loading', progress: 100 });
    expect(readyStatus(half!, 'webgpu')).toMatchObject({
      phase: 'ready',
      device: 'webgpu',
      cached: true,
    });
    expect(errorStatus(half!, new Error('boom'))).toMatchObject({
      phase: 'error',
      error: 'boom',
      progress: 50,
    });
  });

  it('never falls back from an explicit WebGPU, and says when auto does', () => {
    const missing = { available: false, adapter: '', reason: 'no adapter' };
    const present = { available: true, adapter: 'apple m3', reason: '' };
    expect(() => resolveDevice('webgpu', missing)).toThrow('no adapter');
    expect(resolveDevice('webgpu', present)).toEqual({
      device: 'webgpu',
      message: '',
    });
    expect(resolveDevice('auto', present).device).toBe('webgpu');
    const fallback = resolveDevice('auto', missing);
    expect(fallback.device).toBe('wasm');
    expect(fallback.message).toContain('no adapter');
    expect(resolveDevice('wasm', present)).toEqual({
      device: 'wasm',
      message: '',
    });
  });

  it('formats sizes', () => {
    expect(formatBytes(3_100_000_000)).toBe('3.1 GB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('generate inputs', () => {
  it('turns text into one user message and keeps chat arrays', () => {
    expect(normalizeMessages('Hi')).toEqual([{ role: 'user', content: 'Hi' }]);
    expect(normalizeMessages('  ')).toEqual([]);
    expect(
      normalizeMessages([
        { role: 'system', content: 'Be brief' },
        { role: 'tool', content: { ok: true }, tool_call_id: 'call_1' },
      ]),
    ).toEqual([
      { role: 'system', content: 'Be brief' },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call_1' },
    ]);
    expect(() => normalizeMessages([{ content: 'x' }])).toThrow('role');
    expect(() => normalizeMessages(3)).toThrow();
  });

  it('wraps a bare JSON schema and ignores empty formats', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    expect(normalizeResponseFormat(schema)).toEqual({
      type: 'json_schema',
      json_schema: schema,
    });
    const full = { type: 'json_schema', json_schema: schema };
    expect(normalizeResponseFormat(full)).toBe(full);
    expect(normalizeResponseFormat({})).toBeUndefined();
    expect(normalizeResponseFormat('')).toBeUndefined();
    expect(normalizeResponseFormat(JSON.stringify(schema))).toEqual({
      type: 'json_schema',
      json_schema: schema,
    });
  });

  it('reads tool names from OpenAI-style tools', () => {
    const tools = normalizeTools([
      { type: 'function', function: { name: 'adjust_servings' } },
      { name: 'legacy' },
    ]);
    expect(toolNames(tools)).toEqual(['adjust_servings', 'legacy']);
    expect(normalizeTools([])).toBeUndefined();
  });
});

describe('Companion model store', () => {
  const key =
    'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/resolve/main/config.json';

  it('falls back with a reason when the Companion is missing or old', async () => {
    const down = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await checkCompanionModelStore('http://c', down)).toEqual({
      available: false,
      reason: 'the Companion is not running at http://c',
    });
    const old = jest.fn().mockResolvedValue(new Response('', { status: 404 }));
    expect((await checkCompanionModelStore('http://c', old)).reason).toContain(
      'too old',
    );
    const ok = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ folder: '/models', writable: true })),
      );
    expect(await checkCompanionModelStore('http://c', ok)).toEqual({
      available: true,
      folder: '/models',
    });
  });

  it('maps match, put and delete onto the Companion endpoints', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (!init?.method) return new Response('{}', { status: 200 });
      return new Response(null, { status: 204 });
    });
    const cache = createCompanionModelCache('http://c', fetchImpl as any);
    expect(await cache.match('/models/local/config.json')).toBeUndefined();
    expect(await cache.match(key)).toBeInstanceOf(Response);
    await cache.put(
      key,
      new Response('abc', { headers: { 'content-type': 'application/json' } }),
    );
    expect(await cache.delete(key)).toBe(true);
    const url = companionModelUrl(key, 'http://c');
    expect(url).toBe(`http://c/models/${encodeURIComponent(key)}`);
    expect(calls.map(([u, init]) => [u, init?.method])).toEqual([
      [url, undefined],
      [url, 'PUT'],
      [url, 'DELETE'],
    ]);
  });
});

describe('model risks', () => {
  it('names Hugging Face, the model and its size, without needing review', () => {
    const risk = new ModelDownloadRisk(
      'onnx-community/gemma-4-E2B-it-ONNX',
      '3.1 GB',
    );
    expect(risk.target).toBe(
      'huggingface.co/onnx-community/gemma-4-E2B-it-ONNX · 3.1 GB',
    );
    expect(getRiskLevel(risk)).toBe('loads-only');
    expect(requiresAppRiskReview([{ risk, nodes: [] }])).toBe(false);
  });

  it('needs review when the model is chosen while running or uses the Companion', () => {
    const dynamic = new ModelDownloadRisk();
    expect(getRiskLevel(dynamic)).toBe('dynamic');
    expect(
      requiresAppRiskReview([
        { risk: new CompanionRisk('model folder'), nodes: [] },
      ]),
    ).toBe(true);
  });
});
