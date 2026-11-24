// Pure mappings from Transformers.js events and node inputs to what the nodes
// output. Kept free of the library so they can be unit tested.
import type {
  ChatMessage,
  DownloadInfo,
  FileMetadata,
  ModelDevice,
  ModelStatus,
  ResolvedDevice,
  WebGPUInfo,
} from './protocol';

// The same sums Kitchen Jamie made in src/services/shared.ts.
export function summarizeDownload(metadata: FileMetadata[]): DownloadInfo {
  const existing = metadata.filter((file) => file.exists);
  const uncached = existing.filter((file) => !file.fromCache);
  return {
    files: existing.length,
    cachedFiles: existing.length - uncached.length,
    downloadBytes: uncached.reduce((sum, file) => sum + (file.size ?? 0), 0),
    totalBytes: existing.reduce((sum, file) => sum + (file.size ?? 0), 0),
    hasUnknownSize: uncached.some((file) => file.size === undefined),
  };
}

export function isFullyCached(info: DownloadInfo): boolean {
  return info.files > 0 && info.cachedFiles === info.files;
}

// The status shown once the size is known and before anything downloads.
export function statusAfterInspection(
  previous: ModelStatus,
  info: DownloadInfo,
): ModelStatus {
  const cached = isFullyCached(info);
  return {
    ...previous,
    phase: cached ? 'loading' : 'downloading',
    progress: cached ? 100 : 0,
    downloadBytes: info.downloadBytes,
    totalBytes: info.totalBytes,
    cached,
    error: '',
  };
}

// Transformers.js reports per-file "progress" events and an aggregated
// "progress_total". Only the latter moves the bar. Returns undefined when the
// event changes nothing a person would see.
export function applyProgressEvent(
  previous: ModelStatus,
  event: { status?: string; progress?: number } | undefined,
): ModelStatus | undefined {
  if (!event || event.status !== 'progress_total') return undefined;
  const progress = Math.max(0, Math.min(100, Math.floor(event.progress ?? 0)));
  const phase = progress >= 100 ? 'loading' : 'downloading';
  if (previous.phase === phase && previous.progress === progress) {
    return undefined;
  }
  return { ...previous, phase, progress };
}

export function readyStatus(
  previous: ModelStatus,
  device: ResolvedDevice,
): ModelStatus {
  return {
    ...previous,
    phase: 'ready',
    progress: 100,
    downloadBytes: 0,
    cached: true,
    error: '',
    device,
  };
}

export function errorStatus(
  previous: ModelStatus,
  error: unknown,
): ModelStatus {
  return {
    ...previous,
    phase: 'error',
    error: error instanceof Error ? error.message : String(error),
  };
}

// WebGPU is never used behind a person's back: an explicit "webgpu" fails with
// the reason, "auto" may fall back to wasm and says so.
export function resolveDevice(
  requested: ModelDevice,
  webgpu: WebGPUInfo,
): { device: ResolvedDevice; message: string } {
  if (requested === 'wasm') return { device: 'wasm', message: '' };
  if (webgpu.available) return { device: 'webgpu', message: '' };
  if (requested === 'webgpu') {
    throw new Error(`WebGPU is not available: ${webgpu.reason}`);
  }
  return {
    device: 'wasm',
    message: `Running on the CPU (wasm) because WebGPU is not available: ${webgpu.reason}`,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1000)),
  );
  const value = bytes / 1000 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

// A string is one user message; an array is used as the chat history.
export function normalizeMessages(input: unknown): ChatMessage[] {
  if (typeof input === 'string') {
    return input.trim() ? [{ role: 'user', content: input }] : [];
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    input = [input];
  }
  if (!Array.isArray(input)) {
    throw new Error('Messages must be text or an array of chat messages.');
  }
  return input.map((message, index) => {
    if (typeof message === 'string') return { role: 'user', content: message };
    if (!message || typeof message !== 'object') {
      throw new Error(
        `Messages[${index}] must be an object with role and content.`,
      );
    }
    const { role, content } = message as ChatMessage;
    if (typeof role !== 'string' || !role) {
      throw new Error(`Messages[${index}] needs a role such as "user".`);
    }
    return {
      ...(message as ChatMessage),
      content:
        typeof content === 'string'
          ? content
          : content === undefined || content === null
            ? ''
            : JSON.stringify(content),
    };
  });
}

// Accepts a ResponseFormat as StructuredOutputProcessor takes it, or a bare
// JSON schema, which is wrapped. Empty values mean no constraint.
export function normalizeResponseFormat(
  input: unknown,
): Record<string, unknown> | undefined {
  if (typeof input === 'string') {
    if (!input.trim()) return undefined;
    input = JSON.parse(input);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const format = input as Record<string, unknown>;
  if (Object.keys(format).length === 0) return undefined;
  if (
    format.type === 'json_object' ||
    (format.type === 'json_schema' && format.json_schema) ||
    (format.type === 'regex' && typeof format.regex === 'string')
  ) {
    return format;
  }
  return { type: 'json_schema', json_schema: format };
}

export function normalizeTools(input: unknown): unknown[] | undefined {
  if (typeof input === 'string') {
    if (!input.trim()) return undefined;
    input = JSON.parse(input);
  }
  if (!Array.isArray(input) || input.length === 0) return undefined;
  return input;
}

export function toolNames(tools: unknown[] | undefined): string[] {
  return (tools ?? [])
    .map((tool: any) => tool?.function?.name ?? tool?.name)
    .filter((name): name is string => typeof name === 'string' && !!name);
}
