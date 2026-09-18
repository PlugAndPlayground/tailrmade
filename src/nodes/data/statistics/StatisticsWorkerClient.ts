import type { StatisticsSummary } from './computeStatistics';

export class StatisticsWorkerClient {
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: StatisticsSummary) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private createWorker: () => Worker) {}

  compute(values: unknown, sample: boolean): Promise<StatisticsSummary> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }) => {
          const request = this.pending.get(data.id);
          if (!request) return;
          clearTimeout(request.timer);
          this.pending.delete(data.id);
          if (data.error) request.reject(new Error(data.error));
          else request.resolve(data.result);
        };
        this.worker.onerror = (event) => {
          this.dispose(new Error(event.message || 'Statistics worker failed.'));
        };
        this.worker.onmessageerror = () => {
          this.dispose(new Error('Could not read statistics worker response.'));
        };
      }
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        // A timed-out worker may still be computing; never reuse it.
        this.dispose(new Error('Statistics calculation timed out.'));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, values, sample });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  dispose(error = new Error('Statistics node removed.')): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
