export function createComputeWorker(): Worker {
  return new Worker(new URL('compute-worker.ts', import.meta.url));
}
