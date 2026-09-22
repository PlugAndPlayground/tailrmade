import PPGraph from '../../../classes/GraphClass';
import { runWorkerJob } from './workerJob';
import {
  ComputeMessage,
  ComputeResult,
  MacroCallRequestMessage,
  MacroCallResponseMessage,
} from './compute-worker';

export class PNPWorker {
  static workerStack: Worker[] = [];
  static workersAllocated = 0;
  private static isMacroCallMessage(
    payload: any,
  ): payload is MacroCallRequestMessage {
    return payload && payload.type === 'macro-call';
  }

  private static getWorker(): Worker {
    if (!this.workerStack.length) {
      console.log(
        'creating new worker, total current workers: ' +
          ++this.workersAllocated,
      );
      const worker = new Worker(new URL('compute-worker.ts', import.meta.url));
      this.workerStack.push(worker);
    } else {
      //console.log('re-using old worker');
    }
    return this.workerStack.pop()!;
  }
  private static depositWorker(worker: Worker): void {
    this.workerStack.push(worker);
  }

  private static async handleMacroCall(
    message: MacroCallRequestMessage,
    worker: Worker,
    isActive: () => boolean,
  ): Promise<void> {
    try {
      const result = await PPGraph.currentGraph.invokeMacro(
        message.macroName,
        message.macroArgs,
      );

      if (!isActive()) return;
      worker.postMessage({
        type: 'macro-response',
        success: true,
        result,
      } satisfies MacroCallResponseMessage);
    } catch (error) {
      if (!isActive()) return;
      worker.postMessage({
        type: 'macro-response',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies MacroCallResponseMessage);
    }
  }

  public async work(
    message: ComputeMessage,
    timeout: number = 30000,
  ): Promise<ComputeResult> {
    const worker = PNPWorker.getWorker();
    return runWorkerJob(
      worker,
      message,
      timeout,
      async (payload, isActive) => {
        if (PNPWorker.isMacroCallMessage(payload)) {
          await PNPWorker.handleMacroCall(payload, worker, isActive);
          return true;
        }
        return false;
      },
      (reusableWorker) => PNPWorker.depositWorker(reusableWorker),
    );
  }

  public async workChunkedArray(
    message: ComputeMessage,
    timeout: number = 10000,
  ): Promise<ComputeResult> {
    const array = message.data as Array<any>;
    const ITEMS_PER_CHUNK = 10000;
    const chunks = Math.ceil(array.length / ITEMS_PER_CHUNK);
    let outArray: any[] = [];
    for (let i = 0; i < chunks; i++) {
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
