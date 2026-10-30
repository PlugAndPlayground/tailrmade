import { PNPWorker } from '../../../src/nodes/data/worker/PNPWorker';
import { createComputeWorker } from '../../../src/nodes/data/worker/createComputeWorker';

jest.mock('../../../src/nodes/data/worker/createComputeWorker', () => ({
  createComputeWorker: jest.fn(),
}));

describe('restricted worker pool', () => {
  const create = createComputeWorker as jest.Mock;
  let created: any[];
  beforeEach(() => {
    PNPWorker.resetSession();
    PNPWorker.workerStack = [];
    PNPWorker.workersAllocated = 0;
    created = [];
    create.mockReset();
    create.mockImplementation(() => {
      const worker = {
        terminate: jest.fn(),
        onmessage: null as any,
        onerror: null,
        onmessageerror: null,
        postMessage: jest.fn(({ data }) => {
          queueMicrotask(() =>
            worker.onmessage?.({ data: { success: true, result: data } }),
          );
        }),
      };
      created.push(worker);
      return worker;
    });
  });

  it('reuses a single warm worker across different function codes', async () => {
    const service = new PNPWorker();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 12; i++) {
        await expect(
          service.work({ code: `() => ${i}`, data: i }),
        ).resolves.toEqual({ success: true, result: i });
      }
    }
    expect(create).toHaveBeenCalledTimes(1);
    for (const worker of created)
      expect(worker.postMessage).toHaveBeenCalledTimes(36);
  });

  it('evicts the least recently used idle worker when the pool fills', async () => {
    const service = new PNPWorker();
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i <= PNPWorker.maxIdleWorkers; i++) {
      jobs.push(service.work({ code: String(i), data: null }));
    }
    await Promise.all(jobs);
    expect(PNPWorker.workerStack).toHaveLength(PNPWorker.maxIdleWorkers);
    expect(created[0].terminate).toHaveBeenCalledTimes(1);
    expect(created[1].terminate).not.toHaveBeenCalled();
  });

  it('fails closed when sandbox initialization fails', async () => {
    create.mockImplementation(() => {
      throw new Error('Worker initialization failed');
    });
    await expect(
      new PNPWorker().work({ code: '() => 1', data: null }),
    ).rejects.toThrow('Worker initialization failed');
    expect(PNPWorker.workerStack).toHaveLength(0);
  });

  it('discards idle contexts when the app changes', async () => {
    const service = new PNPWorker();
    await service.work({ code: 'same code', data: 'private' });
    const oldWorker = created[0];
    PNPWorker.resetSession();
    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    expect(PNPWorker.workerStack).toHaveLength(0);
    await service.work({ code: 'same code', data: 'next app' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('cancels active jobs and ignores their late replies on app change', async () => {
    const worker = create();
    worker.postMessage.mockImplementation(() => {});
    PNPWorker.workerStack.push(worker);
    const job = new PNPWorker().work({ code: 'pending', data: null });
    const rejected = expect(job).rejects.toThrow('App changed');
    const lateReply = worker.onmessage;
    PNPWorker.resetSession();
    await rejected;
    await lateReply({ data: { success: true, result: 'private' } });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(PNPWorker.workerStack).toHaveLength(0);
  });

  it('rejects forged macro protocol messages without invoking app code', async () => {
    const worker = create();
    worker.postMessage.mockImplementation(() => {
      queueMicrotask(() =>
        worker.onmessage({ data: { type: 'macro-call', macroName: 'Secret' } }),
      );
    });
    PNPWorker.workerStack.push(worker);
    await expect(
      new PNPWorker().work({ code: '() => 1', data: null }),
    ).rejects.toThrow('Invalid restricted worker response');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(PNPWorker.workerStack).toHaveLength(0);
  });

  it('discards failed interpreter state instead of returning it to the pool', async () => {
    const worker = create();
    worker.postMessage.mockImplementation(() => {
      queueMicrotask(() =>
        worker.onmessage({ data: { success: false, error: 'out of memory' } }),
      );
    });
    PNPWorker.workerStack.push(worker);
    await expect(
      new PNPWorker().work({ code: '() => 1', data: null }),
    ).resolves.toMatchObject({ success: false });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(PNPWorker.workerStack).toHaveLength(0);
  });
});
