// Runs Transformers.js away from the page, so downloads and inference never
// freeze it. One worker serves every Transformers.js node; its registry is the
// only place a model lives. The graph only ever sees a ModelHandle.
import type {
  ChatMessage,
  DeleteResult,
  GenerateRequest,
  GenerateResult,
  LoadRequest,
  LoadResult,
  ModelHandle,
  ModelStatus,
  ResolvedDevice,
  StorageInfo,
  WebGPUInfo,
  WorkerReply,
  WorkerRequest,
} from './protocol';
import { EMPTY_STATS, IDLE_STATUS, modelKey } from './protocol';
import {
  applyProgressEvent,
  readyStatus,
  resolveDevice,
  statusAfterInspection,
  summarizeDownload,
  toolNames,
} from './status';
import { parseToolCalls } from './toolCalls';
import { HandleRegistry, RegistryEntry } from './handleRegistry';
import {
  checkCompanionModelStore,
  createCompanionModelCache,
} from './companionModelCache';

type TF = typeof import('@huggingface/transformers');

const scope = self as unknown as {
  postMessage: (message: WorkerReply) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  navigator: Navigator & { gpu?: any };
};

let wasmBase = '';
let tfPromise: Promise<TF> | undefined;
let structuredOutputPromise:
  | Promise<typeof import('@huggingface/transformers-structured-output')>
  | undefined;

// Both packages are bundled and only fetched as a chunk of this worker.
// ONNX Runtime's WASM is served from our own origin too, not from a CDN.
function loadTransformers(): Promise<TF> {
  tfPromise ??= import(
    /* webpackChunkName: "transformers" */ '@huggingface/transformers'
  ).then((tf) => {
    const wasm = tf.env.backends.onnx.wasm;
    if (wasm && wasmBase) {
      wasm.wasmPaths = {
        mjs: `${wasmBase}ort-wasm-simd-threaded.asyncify.mjs`,
        wasm: `${wasmBase}ort-wasm-simd-threaded.asyncify.wasm`,
      };
    }
    tf.env.allowLocalModels = false;
    return tf;
  });
  return tfPromise;
}

function loadStructuredOutput() {
  structuredOutputPromise ??= import(
    /* webpackChunkName: "transformers" */ '@huggingface/transformers-structured-output'
  );
  return structuredOutputPromise;
}

let webgpuPromise: Promise<WebGPUInfo> | undefined;
// Asks for an adapter without downloading anything, which also catches
// browsers that expose WebGPU without a usable GPU (headless Chrome).
function checkWebGPU(): Promise<WebGPUInfo> {
  webgpuPromise ??= (async () => {
    const gpu = scope.navigator.gpu;
    if (!gpu) {
      return {
        available: false,
        adapter: '',
        reason: 'this browser has no WebGPU in workers',
      };
    }
    try {
      const adapter = await gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter) {
        return {
          available: false,
          adapter: '',
          reason: 'this browser has WebGPU but no usable graphics adapter',
        };
      }
      const info = adapter.info ?? {};
      return {
        available: true,
        adapter:
          [info.vendor, info.architecture, info.description]
            .filter(Boolean)
            .join(' ') || 'unknown adapter',
        reason: '',
      };
    } catch (error) {
      return {
        available: false,
        adapter: '',
        reason: `WebGPU did not start (${error instanceof Error ? error.message : error})`,
      };
    }
  })();
  return webgpuPromise;
}

// `env` is global to the library, so anything touching the cache runs one at
// a time with the store it chose.
let cacheChain: Promise<unknown> = Promise.resolve();
function withCache<T>(task: () => Promise<T>): Promise<T> {
  const run = cacheChain.then(task, task);
  cacheChain = run.catch(() => undefined);
  return run;
}

const companionCache = createCompanionModelCache();

async function useStore(
  tf: TF,
  storage: LoadRequest['storage'],
): Promise<{ mode: StorageInfo['mode']; message: string }> {
  if (storage === 'Companion folder') {
    const companion = await checkCompanionModelStore();
    if (companion.available) {
      tf.env.useCustomCache = true;
      tf.env.customCache = companionCache;
      return {
        mode: 'companion',
        message: companion.folder
          ? `Stored in the Companion folder ${companion.folder}.`
          : '',
      };
    }
    tf.env.useCustomCache = false;
    tf.env.customCache = null;
    tf.env.useBrowserCache = true;
    return {
      mode: 'browser',
      message: `Stored in this browser instead of the Companion folder, because ${companion.reason}.`,
    };
  }
  tf.env.useCustomCache = false;
  tf.env.customCache = null;
  tf.env.useBrowserCache = true;
  return { mode: 'browser', message: '' };
}

async function storageInfo(mode: StorageInfo['mode']): Promise<StorageInfo> {
  const info: StorageInfo = { mode };
  if (mode !== 'browser') return info;
  try {
    const estimate = await scope.navigator.storage?.estimate?.();
    info.usage = estimate?.usage;
    info.quota = estimate?.quota;
    info.persisted = await scope.navigator.storage?.persisted?.();
  } catch {
    // Storage estimates are a courtesy; some browsers refuse them.
  }
  return info;
}

const joinMessages = (...parts: string[]) => parts.filter(Boolean).join(' ');

const registry = new HandleRegistry((entry, request, emit) =>
  withCache(() => loadModel(entry, request, emit)),
);

async function inspectDownload(
  tf: TF,
  request: LoadRequest,
  device: ResolvedDevice,
) {
  const files = await tf.ModelRegistry.get_pipeline_files(
    request.task,
    request.model,
    { device, dtype: request.dtype as any },
  );
  const metadata = await Promise.all(
    files.map((file) =>
      tf.ModelRegistry.get_file_metadata(request.model, file),
    ),
  );
  return summarizeDownload(metadata);
}

async function createPipeline(
  tf: TF,
  entry: RegistryEntry,
  request: LoadRequest,
  device: ResolvedDevice,
  emit: (status: ModelStatus) => void,
) {
  return tf.pipeline(request.task as any, request.model, {
    device,
    dtype: request.dtype as any,
    progress_callback: (event: any) => {
      const next = applyProgressEvent(entry.status, event);
      if (next) emit(next);
    },
  });
}

async function loadModel(
  entry: RegistryEntry,
  request: LoadRequest,
  emit: (status: ModelStatus) => void,
): Promise<LoadResult> {
  const tf = await loadTransformers();
  entry.webgpu = await checkWebGPU();
  emit({ ...entry.status, phase: 'checking' });

  const store = await useStore(tf, request.storage);
  let { device, message } = resolveDevice(request.device, entry.webgpu);
  emit({
    ...entry.status,
    message: joinMessages(store.message, message),
    storage: await storageInfo(store.mode),
    device,
  });

  emit(
    statusAfterInspection(
      entry.status,
      await inspectDownload(tf, request, device),
    ),
  );

  let pipeline: any;
  try {
    pipeline = await createPipeline(tf, entry, request, device, emit);
  } catch (error) {
    if (request.device !== 'auto' || device !== 'webgpu') throw error;
    // "auto" may fall back, but it must say so.
    device = 'wasm';
    message = `WebGPU could not load this model (${error instanceof Error ? error.message : error}), so it runs on the CPU (wasm) instead.`;
    emit({
      ...statusAfterInspection(
        entry.status,
        await inspectDownload(tf, request, device),
      ),
      message: joinMessages(store.message, message),
      device,
    });
    pipeline = await createPipeline(tf, entry, request, device, emit);
  }

  entry.pipeline = pipeline;
  entry.handle = {
    id: entry.key,
    model: request.model.trim(),
    task: request.task,
    dtype: request.dtype,
    device,
  };
  emit({
    ...readyStatus(entry.status, device),
    storage: await storageInfo(store.mode),
  });
  return { handle: entry.handle, status: entry.status, webgpu: entry.webgpu };
}

async function deleteModel(request: LoadRequest): Promise<DeleteResult> {
  const key = modelKey(request);
  const entry = registry.get(key);
  if (entry?.busy) {
    throw new Error(
      'This model is generating. Stop it before deleting the model.',
    );
  }
  return withCache(async () => {
    const tf = await loadTransformers();
    if (entry) {
      registry.delete(key);
      try {
        await entry.pipeline?.dispose?.();
      } catch {
        // Disposing frees GPU memory early; failing to is not fatal.
      }
    }
    const store = await useStore(tf, request.storage);
    const webgpu = await checkWebGPU();
    const device =
      entry?.handle?.device ??
      (request.device === 'wasm' || !webgpu.available ? 'wasm' : 'webgpu');
    const result = await tf.ModelRegistry.clear_pipeline_cache(
      request.task,
      request.model,
      { device, dtype: request.dtype as any },
    );
    const where =
      store.mode === 'companion' ? 'the Companion folder' : 'this browser';
    return {
      filesDeleted: result.filesDeleted,
      filesCached: result.filesCached,
      status: {
        ...IDLE_STATUS,
        message: joinMessages(
          store.message,
          result.filesDeleted
            ? `Deleted ${result.filesDeleted} model files from ${where}.`
            : `No files of this model were stored in ${where}.`,
        ),
        storage: await storageInfo(store.mode),
      },
    };
  });
}

function removeSpecialTokens(text: string, tokenizer: any): string {
  let result = text;
  for (const token of tokenizer?.all_special_tokens ?? []) {
    if (typeof token === 'string' && token)
      result = result.split(token).join('');
  }
  return result.trim();
}

const PARTIAL_INTERVAL_MS = 80;

async function generate(
  request: GenerateRequest,
  onPartial: (partial: { text: string; tokens: number }) => void,
): Promise<GenerateResult> {
  const entry = registry.get(request.handle?.id);
  // A model that is still loading is waited for, not reported missing.
  if (entry && !entry.pipeline) await entry.promise.catch(() => undefined);
  if (!entry?.pipeline) {
    throw new Error(
      'This model is not loaded in this session. Press Load on its Transformers.js model node first.',
    );
  }
  if (entry.busy) {
    return {
      ignored: true,
      text: '',
      rawText: '',
      toolCalls: [],
      messages: request.messages,
      stats: EMPTY_STATS,
    };
  }
  entry.busy = true;
  try {
    const tf = await loadTransformers();
    const pipeline = entry.pipeline;
    const stopper = new tf.InterruptableStoppingCriteria();
    entry.stopper = stopper;

    const options: Record<string, unknown> = {
      max_new_tokens: 512,
      do_sample: false,
      ...(request.options ?? {}),
    };
    if (request.tools?.length) options.tools = request.tools;
    if (request.responseFormat) {
      const { StructuredOutputProcessor } = await loadStructuredOutput();
      options.logits_processor = new StructuredOutputProcessor(
        pipeline.tokenizer,
        request.responseFormat as any,
      );
    }

    const generated: bigint[] = [];
    let streamed = '';
    let firstTokenAt: number | undefined;
    let lastPartial = 0;
    const started = performance.now();
    const streamer = new tf.TextStreamer(pipeline.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (chunk: string) => {
        streamed += chunk;
        const now = performance.now();
        if (now - lastPartial >= PARTIAL_INTERVAL_MS) {
          lastPartial = now;
          onPartial({ text: streamed, tokens: generated.length });
        }
      },
      token_callback_function: (ids: bigint[]) => {
        firstTokenAt ??= performance.now();
        generated.push(...ids);
      },
    });

    await pipeline(request.messages, {
      ...options,
      streamer,
      stopping_criteria: stopper,
    });
    const finished = performance.now();

    // Tool calls are read from the text with special tokens kept, because
    // markers such as <|tool_call> are special tokens in Gemma.
    const rawText = pipeline.tokenizer.decode(generated, {
      skip_special_tokens: false,
    });
    const parsed = parseToolCalls(rawText, toolNames(request.tools));
    const text = removeSpecialTokens(parsed.message, pipeline.tokenizer);
    const assistant: ChatMessage = {
      role: 'assistant',
      content: text,
      ...(parsed.calls.length
        ? {
            tool_calls: parsed.calls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
    const decodeSeconds =
      firstTokenAt === undefined ? 0 : (finished - firstTokenAt) / 1000;
    return {
      stopped: stopper.interrupted ?? false,
      text,
      rawText,
      toolCalls: parsed.calls,
      messages: [...request.messages, assistant],
      stats: {
        tokens: generated.length,
        seconds: (finished - started) / 1000,
        // The first token includes the prompt, so it is not counted as decode.
        tokensPerSecond:
          decodeSeconds > 0
            ? Math.max(0, generated.length - 1) / decodeSeconds
            : 0,
        timeToFirstToken:
          firstTokenAt === undefined ? 0 : (firstTokenAt - started) / 1000,
      },
    };
  } finally {
    entry.busy = false;
    entry.stopper = undefined;
  }
}

function stop(handleId: string): { stopped: boolean } {
  const entry = registry.get(handleId);
  if (!entry?.stopper) return { stopped: false };
  entry.stopper.interrupt();
  return { stopped: true };
}

scope.onmessage = async ({ data }) => {
  const { id } = data;
  const progress = (value: unknown) =>
    scope.postMessage({ id, kind: 'progress', progress: value });
  try {
    let result: unknown;
    switch (data.type) {
      case 'init':
        wasmBase = data.wasmBase;
        result = true;
        break;
      case 'webgpu':
        result = await checkWebGPU();
        break;
      case 'simulate-webgpu':
        webgpuPromise = data.info ? Promise.resolve(data.info) : undefined;
        result = true;
        break;
      case 'load':
        result = await registry.load(data.request, progress);
        break;
      case 'generate':
        result = await generate(data.request, progress);
        break;
      case 'stop':
        result = stop(data.handleId);
        break;
      case 'delete':
        result = await deleteModel(data.request);
        break;
    }
    scope.postMessage({ id, kind: 'result', result });
  } catch (error) {
    scope.postMessage({
      id,
      kind: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
