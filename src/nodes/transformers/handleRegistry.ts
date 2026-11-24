import type {
  LoadRequest,
  LoadResult,
  ModelHandle,
  ModelStatus,
  WebGPUInfo,
} from './protocol';
import { IDLE_STATUS, modelKey } from './protocol';
import { errorStatus } from './status';

export interface RegistryListener {
  (update: { status: ModelStatus; webgpu?: WebGPUInfo }): void;
}

export interface RegistryEntry {
  key: string;
  status: ModelStatus;
  webgpu?: WebGPUInfo;
  listeners: Set<RegistryListener>;
  promise: Promise<LoadResult>;
  pipeline?: any;
  handle?: ModelHandle;
  busy: boolean;
  stopper?: { interrupt(): void };
}

export type ModelLoader = (
  entry: RegistryEntry,
  request: LoadRequest,
  emit: (status: ModelStatus) => void,
) => Promise<LoadResult>;

// Where the worker keeps its models. A key (task, model, dtype, requested
// device) maps to one entry, so loading it again joins or reuses that entry
// and returns the same handle.
export class HandleRegistry {
  private entries = new Map<string, RegistryEntry>();

  constructor(private loader: ModelLoader) {}

  get(key: string): RegistryEntry | undefined {
    return this.entries.get(key);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  private emit(entry: RegistryEntry, status: ModelStatus): void {
    entry.status = status;
    for (const listener of entry.listeners) {
      listener({ status, webgpu: entry.webgpu });
    }
  }

  load(request: LoadRequest, listener: RegistryListener): Promise<LoadResult> {
    if (!request.model?.trim()) {
      return Promise.reject(
        new Error('Enter a model id, e.g. onnx-community/gemma-4-E2B-it-ONNX.'),
      );
    }
    const key = modelKey(request);
    const existing = this.entries.get(key);
    if (existing) {
      existing.listeners.add(listener);
      listener({ status: existing.status, webgpu: existing.webgpu });
      return existing.promise.finally(() =>
        existing.listeners.delete(listener),
      );
    }
    const entry: RegistryEntry = {
      key,
      status: { ...IDLE_STATUS, phase: 'checking' },
      listeners: new Set([listener]),
      busy: false,
      promise: undefined as unknown as Promise<LoadResult>,
    };
    this.entries.set(key, entry);
    entry.promise = this.loader(entry, request, (status) =>
      this.emit(entry, status),
    ).catch((error) => {
      this.emit(entry, errorStatus(entry.status, error));
      // A failed load may be retried with the same key.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    return entry.promise.finally(() => entry.listeners.delete(listener));
  }
}
