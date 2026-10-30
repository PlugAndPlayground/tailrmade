import type { ComputeMessage, ComputeResult } from './compute-worker';

export function runWorkerJob(
  worker: Worker,
  message: ComputeMessage,
  timeout: number,
  handleMessage: (payload: any, isActive: () => boolean) => Promise<boolean>,
  release: (worker: Worker) => void,
  signal?: AbortSignal,
): Promise<ComputeResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (reusable: boolean): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      if (reusable) release(worker);
      else worker.terminate();
      return true;
    };
    const fail = (error: unknown): void => {
      if (cleanup(false)) reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error('Compute operation timed out'));
    }, timeout);
    const abort = (): void => fail(new Error('App changed; compute cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    worker.onmessage = async (event: MessageEvent<any>) => {
      if (settled) return;
      try {
        if (await handleMessage(event.data, () => !settled)) return;
        if (cleanup(true)) resolve(event.data as ComputeResult);
      } catch (error) {
        fail(error);
      }
    };
    worker.onerror = fail;
    worker.onmessageerror = () =>
      fail(new Error('Unable to deserialize worker response'));
    try {
      worker.postMessage(message);
    } catch (error) {
      fail(error);
    }
  });
}
