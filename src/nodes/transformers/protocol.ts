// Shared between the Transformers.js nodes (main thread) and their worker.
// Everything here crosses postMessage, so it must stay plain data.

export const DEFAULT_MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const DEFAULT_TASK = 'text-generation';
export const DEFAULT_DTYPE = 'q4f16';

export const TASKS = ['text-generation'] as const;
export const DTYPES = [
  'q4f16',
  'q4',
  'q8',
  'int8',
  'uint8',
  'fp16',
  'fp32',
  'bnb4',
  'auto',
] as const;
export const DEVICES = ['auto', 'webgpu', 'wasm'] as const;
export const STORAGES = ['Browser', 'Companion folder'] as const;

export type ModelDevice = (typeof DEVICES)[number];
export type ResolvedDevice = Exclude<ModelDevice, 'auto'>;
export type ModelStorage = (typeof STORAGES)[number];

// What the graph holds instead of the model. It can sit in State, be saved in
// the file and be wired to many nodes; the worker keeps the model itself.
export interface ModelHandle {
  id: string;
  model: string;
  task: string;
  dtype: string;
  device: ResolvedDevice;
}

export interface ModelKeyInput {
  model: string;
  task: string;
  dtype: string;
  device: ModelDevice;
}

// The same model, task, dtype and requested device always give the same id,
// so a second Load reuses the model instead of loading it again.
export function modelKey({
  model,
  task,
  dtype,
  device,
}: ModelKeyInput): string {
  return [task, model.trim(), dtype, device].join('|');
}

export function isModelHandle(value: unknown): value is ModelHandle {
  const handle = value as ModelHandle;
  return (
    !!handle &&
    typeof handle === 'object' &&
    typeof handle.id === 'string' &&
    typeof handle.model === 'string' &&
    typeof handle.dtype === 'string' &&
    typeof handle.device === 'string'
  );
}

export type ModelPhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'deleting'
  | 'error';

export interface StorageInfo {
  mode: 'browser' | 'companion';
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

export interface ModelStatus {
  phase: ModelPhase;
  progress: number;
  downloadBytes: number;
  totalBytes: number;
  cached: boolean;
  error: string;
  device?: ResolvedDevice;
  // Plain-language notes, e.g. a fallback from WebGPU or from the Companion.
  message: string;
  storage?: StorageInfo;
}

export interface WebGPUInfo {
  available: boolean;
  adapter: string;
  reason: string;
}

export interface DownloadInfo {
  files: number;
  cachedFiles: number;
  downloadBytes: number;
  totalBytes: number;
  hasUnknownSize: boolean;
}

export interface FileMetadata {
  exists: boolean;
  size?: number;
  fromCache?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: Record<string, unknown> };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface GenerateStats {
  tokens: number;
  seconds: number;
  tokensPerSecond: number;
  timeToFirstToken: number;
}

export type GeneratePhase =
  'idle' | 'generating' | 'done' | 'stopped' | 'ignored' | 'error';

export interface GenerateStatus {
  phase: GeneratePhase;
  message: string;
}

export interface GenerateRequest {
  handle: ModelHandle;
  messages: ChatMessage[];
  tools?: unknown[];
  responseFormat?: unknown;
  options?: Record<string, unknown>;
}

export interface GenerateProgress {
  text: string;
  tokens: number;
}

export interface GenerateResult {
  ignored?: boolean;
  stopped?: boolean;
  text: string;
  rawText: string;
  toolCalls: ToolCall[];
  messages: ChatMessage[];
  stats: GenerateStats;
}

export interface LoadRequest extends ModelKeyInput {
  storage: ModelStorage;
}

export interface LoadResult {
  handle: ModelHandle;
  status: ModelStatus;
  webgpu: WebGPUInfo;
}

export interface DeleteResult {
  filesDeleted: number;
  filesCached: number;
  status: ModelStatus;
}

// Worker requests. `id` pairs each reply and progress update with its request.
export type WorkerRequest =
  | { id: number; type: 'init'; wasmBase: string }
  | { id: number; type: 'webgpu' }
  // Tests only: replaces the adapter check, e.g. to cover a missing GPU on a
  // machine that has one. null restores the real check.
  | { id: number; type: 'simulate-webgpu'; info: WebGPUInfo | null }
  | { id: number; type: 'load'; request: LoadRequest }
  | { id: number; type: 'generate'; request: GenerateRequest }
  | { id: number; type: 'stop'; handleId: string }
  | { id: number; type: 'delete'; request: LoadRequest };

export type WorkerReply =
  | { id: number; kind: 'progress'; progress: unknown }
  | { id: number; kind: 'result'; result: unknown }
  | { id: number; kind: 'error'; error: string };

export const IDLE_STATUS: ModelStatus = {
  phase: 'idle',
  progress: 0,
  downloadBytes: 0,
  totalBytes: 0,
  cached: false,
  error: '',
  message: '',
};

export const EMPTY_STATS: GenerateStats = {
  tokens: 0,
  seconds: 0,
  tokensPerSecond: 0,
  timeToFirstToken: 0,
};
