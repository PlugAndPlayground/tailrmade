import type {
  DeleteResult,
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  LoadRequest,
  LoadResult,
  ModelStatus,
  WebGPUInfo,
  WorkerReply,
  WorkerRequest,
} from './protocol';

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: any) => void;
};

type DistributiveOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;

// ONNX Runtime's WASM files are copied here by webpack (see webpack.config.ts).
export const ONNX_WASM_PATH = 'onnxruntime/';

// One worker for every Transformers.js node, because the models live in its
// registry: a model loaded by one node is used by all the nodes wired to it.
// Unlike the Statistics worker it is never terminated when a node is removed,
// and there is no timeout, since a first download can take many minutes.
export class TransformersWorkerClient {
  private static instance: TransformersWorkerClient | undefined;
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<number, Pending>();

  constructor(private createWorker: () => Worker) {}

  static get(): TransformersWorkerClient {
    TransformersWorkerClient.instance ??= new TransformersWorkerClient(
      () =>
        new Worker(new URL('./transformers-worker.ts', import.meta.url), {
          type: 'module',
          name: 'transformers',
        }),
    );
    return TransformersWorkerClient.instance;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      if (data.kind === 'progress') {
        request.onProgress?.(data.progress);
        return;
      }
      this.pending.delete(data.id);
      if (data.kind === 'error') request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.reset(
        new Error(event.message || 'The Transformers.js worker stopped.'),
      );
    };
    worker.onmessageerror = () =>
      this.reset(new Error('Could not read the Transformers.js worker reply.'));
    const base =
      typeof document !== 'undefined' ? document.baseURI : self.location.href;
    void this.send(
      { type: 'init', wasmBase: new URL(ONNX_WASM_PATH, base).href },
      undefined,
      worker,
    );
    return worker;
  }

  private send<T>(
    message: DistributiveOmit<WorkerRequest, 'id'>,
    onProgress?: (progress: any) => void,
    worker: Worker = this.ensureWorker(),
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject, onProgress });
      try {
        worker.postMessage({ ...message, id });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  checkWebGPU(): Promise<WebGPUInfo> {
    return this.send({ type: 'webgpu' });
  }

  // Tests only, like CompanionBackend's dummy mode.
  simulateWebGPU(info: WebGPUInfo | null): Promise<boolean> {
    return this.send({ type: 'simulate-webgpu', info });
  }

  load(
    request: LoadRequest,
    onProgress: (update: { status: ModelStatus; webgpu?: WebGPUInfo }) => void,
  ): Promise<LoadResult> {
    return this.send({ type: 'load', request }, onProgress);
  }

  generate(
    request: GenerateRequest,
    onProgress: (progress: GenerateProgress) => void,
  ): Promise<GenerateResult> {
    return this.send({ type: 'generate', request }, onProgress);
  }

  stop(handleId: string): Promise<{ stopped: boolean }> {
    return this.send({ type: 'stop', handleId });
  }

  deleteModel(request: LoadRequest): Promise<DeleteResult> {
    return this.send({ type: 'delete', request });
  }

  // A crashed worker takes its models with it; the next request starts a new one.
  private reset(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
