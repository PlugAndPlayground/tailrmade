import { computeStatistics } from '../../../src/nodes/data/statistics/computeStatistics';
import { StatisticsWorkerClient } from '../../../src/nodes/data/statistics/StatisticsWorkerClient';

describe('statistics calculations', () => {
  it('computes population and sample summaries without changing input', async () => {
    const values = [4, 1, 3, 2];
    expect(await computeStatistics(values, false)).toEqual({
      count: 4,
      sum: 10,
      min: 1,
      max: 4,
      mean: 2.5,
      median: 2.5,
      variance: 1.25,
      standardDeviation: Math.sqrt(1.25),
      q1: 1.75,
      q3: 3.25,
    });
    expect((await computeStatistics(values, true)).variance).toBeCloseTo(5 / 3);
    expect(values).toEqual([4, 1, 3, 2]);
  });
  it('handles empty and singleton inputs explicitly', async () => {
    expect(await computeStatistics([], false)).toMatchObject({
      count: 0,
      sum: 0,
      mean: null,
      variance: null,
    });
    expect(await computeStatistics([7], true)).toMatchObject({
      mean: 7,
      variance: null,
      standardDeviation: null,
    });
    expect(await computeStatistics([7], false)).toMatchObject({
      variance: 0,
      standardDeviation: 0,
    });
  });
  it.each([[null], ['3'], [NaN], [Infinity], [undefined]])(
    'rejects invalid values %p',
    async (value) => {
      await expect(computeStatistics([value], false)).rejects.toThrow(
        'finite number',
      );
    },
  );
  it('rejects a non-array', async () => {
    await expect(computeStatistics({}, false)).rejects.toThrow('array');
  });
});

describe('statistics worker lifecycle', () => {
  function setup() {
    const workers: any[] = [];
    const factory = jest.fn(() => {
      const worker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onmessage: null,
        onerror: null,
      };
      workers.push(worker);
      return worker as unknown as Worker;
    });
    return { client: new StatisticsWorkerClient(factory), workers, factory };
  }
  afterEach(() => jest.useRealTimers());

  it('loads lazily, reuses its worker, and matches concurrent replies', async () => {
    const { client, workers, factory } = setup();
    expect(factory).not.toHaveBeenCalled();
    const first = client.compute([1], false);
    const second = client.compute([2], true);
    expect(factory).toHaveBeenCalledTimes(1);
    workers[0].onmessage({ data: { id: 2, result: { mean: 2 } } });
    workers[0].onmessage({ data: { id: 1, result: { mean: 1 } } });
    await expect(first).resolves.toEqual({ mean: 1 });
    await expect(second).resolves.toEqual({ mean: 2 });
    client.dispose();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });
  it('terminates on timeout and creates a fresh worker for the next request', async () => {
    jest.useFakeTimers();
    const { client, workers, factory } = setup();
    const failed = expect(client.compute([1], false)).rejects.toThrow(
      'timed out',
    );
    jest.advanceTimersByTime(30000);
    await failed;
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    const result = client.compute([2], false);
    expect(factory).toHaveBeenCalledTimes(2);
    workers[1].onmessage({ data: { id: 2, result: { mean: 2 } } });
    await expect(result).resolves.toEqual({ mean: 2 });
    client.dispose();
  });
  it('rejects pending work when the node is removed', async () => {
    const { client } = setup();
    const failed = expect(client.compute([1], false)).rejects.toThrow(
      'removed',
    );
    client.dispose();
    await failed;
  });
  it('propagates calculation errors and recovers for the next request', async () => {
    const { client, workers } = setup();
    const failed = expect(client.compute(['bad'], false)).rejects.toThrow(
      'finite number',
    );
    workers[0].onmessage({
      data: { id: 1, error: 'Values[0] must be a finite number.' },
    });
    await failed;
    const success = client.compute([1], false);
    workers[0].onmessage({ data: { id: 2, result: { mean: 1 } } });
    await expect(success).resolves.toEqual({ mean: 1 });
    client.dispose();
  });
});
