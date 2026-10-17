import { runWorkerJob } from './workerJob';
import type { ComputeMessage, ComputeResult } from './compute-worker';
import { createComputeWorker } from './createComputeWorker';

export class PNPWorker {
  static readonly maxIdleWorkers = 4;
  static workerStack: Worker[] = [];
  static workersAllocated = 0;
  private static session = new AbortController();

  static resetSession(): void {
    this.session.abort();
    this.session = new AbortController();
    for (const worker of this.workerStack) worker.terminate();
    this.workerStack = [];
  }
  private static getWorker(): Worker {
    const idle = this.workerStack.pop();
    if (idle) return idle;
    const worker = createComputeWorker();
    this.workersAllocated++;
    return worker;
  }

  private static depositWorker(worker: Worker): void {
    this.workerStack.push(worker);
    if (this.workerStack.length > this.maxIdleWorkers) {
      this.workerStack.shift()!.terminate();
    }
  }

  public async work(
    message: ComputeMessage,
    timeout: number = 30000,
  ): Promise<ComputeResult> {
    const { signal } = PNPWorker.session;
    const worker = PNPWorker.getWorker();
    let succeeded = false;
    const result = await runWorkerJob(
      worker,
      { ...message, timeout },
      timeout,
      async (payload) => {
        if (!payload || typeof payload.success !== 'boolean' || payload.type) {
          throw new Error('Invalid restricted worker response');
        }
        succeeded = payload.success;
        return false;
      },
      () => (succeeded ? PNPWorker.depositWorker(worker) : worker.terminate()),
      signal,
    );
    if (signal.aborted) throw new Error('App changed; compute cancelled');
    return result;
  }

  public async workChunkedArray(
    message: ComputeMessage,
    timeout: number = 10000,
  ): Promise<ComputeResult> {
    const { signal } = PNPWorker.session;
    const array = message.data as Array<any>;
    const ITEMS_PER_CHUNK = 10000;
    const chunks = Math.ceil(array.length / ITEMS_PER_CHUNK);
    let outArray: any[] = [];
    for (let i = 0; i < chunks; i++) {
      if (signal.aborted) throw new Error('App changed; compute cancelled');
      const pos = i * ITEMS_PER_CHUNK;
      const endPos = i < chunks - 1 ? (i + 1) * ITEMS_PER_CHUNK : undefined;
      const currData = array.slice(pos, endPos);
      const res = await this.work(
        {
          code: message.code,
          data: currData,
        },
        timeout,
      );
      if (!res.success) {
        return {
          result: [],
          success: false,
        };
      }
      const chunkResult = (res.result ?? []) as any[];
      outArray.push(...chunkResult);
    }
    return { result: outArray, success: true };
  }
}
