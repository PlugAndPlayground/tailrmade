import { runWorkerJob } from '../../../src/nodes/data/worker/workerJob';

describe('worker job lifecycle', () => {
  let worker: Worker;
  let release: jest.Mock;
  const message = { code: '() => 42', data: null };
  const result = { success: true, result: 42 };
  const handleMessage = async () => false;

  beforeEach(() => {
    jest.useFakeTimers();
    worker = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    } as unknown as Worker;
    release = jest.fn();
  });
  afterEach(() => jest.useRealTimers());

  it('terminates a timed-out worker and ignores late results', async () => {
    const job = runWorkerJob(worker, message, 100, handleMessage, release);
    const rejection = expect(job).rejects.toThrow(
      'Compute operation timed out',
    );
    const lateMessage = worker.onmessage!;
    jest.advanceTimersByTime(100);
    await rejection;
    await lateMessage.call(worker, { data: result } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(worker.onmessage).toBeNull();
    expect(worker.onerror).toBeNull();
    expect(worker.onmessageerror).toBeNull();
  });

  it('releases a completed worker exactly once and cancels its timeout', async () => {
    const job = runWorkerJob(worker, message, 100, handleMessage, release);
    const receive = worker.onmessage!;
    await receive.call(worker, { data: result } as MessageEvent);
    await expect(job).resolves.toEqual(result);
    await receive.call(worker, { data: result } as MessageEvent);
    jest.advanceTimersByTime(100);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(worker);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('invalidates a pending macro callback when its job times out', async () => {
    let finishMacro!: () => void;
    let active!: () => boolean;
    const macro = jest.fn(async (_payload, isActive) => {
      active = isActive;
      await new Promise<void>((resolve) => {
        finishMacro = resolve;
      });
      return true;
    });
    const job = runWorkerJob(worker, message, 100, macro, release);
    const rejection = expect(job).rejects.toThrow('timed out');
    const handling = worker.onmessage!.call(worker, {
      data: { type: 'macro-call' },
    } as MessageEvent);
    expect(active()).toBe(true);
    jest.advanceTimersByTime(100);
    await rejection;
    expect(active()).toBe(false);
    finishMacro();
    await handling;
    expect(release).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'messageerror', 'postMessage'] as const)(
    'discards the worker after %s failure',
    async (failure) => {
      if (failure === 'postMessage')
        (worker.postMessage as jest.Mock).mockImplementation(() => {
          throw new Error('Cannot clone');
        });
      const job = runWorkerJob(worker, message, 100, handleMessage, release);
      const rejection = expect(job).rejects.toBeDefined();
      if (failure === 'error')
        worker.onerror!.call(worker, new Error('Worker failed') as any);
      if (failure === 'messageerror')
        worker.onmessageerror!.call(worker, {} as MessageEvent);
      await rejection;
      jest.advanceTimersByTime(100);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
    },
  );
});
