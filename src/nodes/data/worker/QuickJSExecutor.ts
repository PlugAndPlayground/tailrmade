import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  Scope,
  type QuickJSRuntime,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';
import { fromQuickJS, toQuickJS, type CopyCheck } from './quickJSData';

const moduleReady = newQuickJSWASMModuleFromVariant(variant);
const MEMORY_LIMIT_MB = 64;
// Date.now on every copied value would dominate the copy itself
const VALUES_PER_DEADLINE_CHECK = 1024;

const largeDataHint =
  'Pass less data, or use a Custom function with "Main Thread" set to true for trusted code.';

type Phase = 'copying the input' | 'running' | 'copying the result';

// QuickJS's own wording ("interrupted", "out of memory") reads like a crash.
// The message is rewritten on the original error, so its stack still points
// at the line in the custom function
const describeError = (
  error: unknown,
  phase: Phase,
  timeout: number,
): unknown => {
  if (!(error instanceof Error)) return error;
  if (/out of memory|memory access out of bounds/i.test(error.message)) {
    error.message =
      phase === 'running'
        ? `The function ran out of memory in the sandbox (${MEMORY_LIMIT_MB} MB limit).`
        : `Data is too large for the sandbox (${MEMORY_LIMIT_MB} MB limit) while ${phase}. ${largeDataHint}`;
  } else if (/^interrupted$/i.test(error.message)) {
    error.message = `Compute operation timed out after ${timeout} ms`;
  }
  return error;
};

type CachedFunction = {
  vm: QuickJSContext;
  fn: QuickJSHandle;
  classify: QuickJSHandle;
  keys: QuickJSHandle;
  define: QuickJSHandle;
};

export class QuickJSExecutor {
  private runtime: QuickJSRuntime;
  private functions = new Map<string, CachedFunction>();
  private deadline = 0;

  private constructor(runtime: QuickJSRuntime) {
    this.runtime = runtime;
    runtime.setMemoryLimit(MEMORY_LIMIT_MB * 1024 * 1024);
    runtime.setMaxStackSize(64 * 1024);
    runtime.setInterruptHandler(() => Date.now() >= this.deadline);
  }

  static async create(): Promise<QuickJSExecutor> {
    return new QuickJSExecutor((await moduleReady).newRuntime());
  }

  private compile(code: string): CachedFunction {
    const cached = this.functions.get(code);
    if (cached) {
      this.functions.delete(code);
      this.functions.set(code, cached);
      return cached;
    }
    if (this.functions.size >= 32) {
      const oldest = this.functions.keys().next().value!;
      this.release(this.functions.get(oldest)!);
      this.functions.delete(oldest);
    }
    const vm = this.runtime.newContext();
    let classify: QuickJSHandle | undefined;
    let keys: QuickJSHandle | undefined;
    let define: QuickJSHandle | undefined;
    let fn: QuickJSHandle | undefined;
    try {
      vm.unwrapResult(
        vm.evalCode(
          `globalThis.macro = () => { throw new Error('macro() is unavailable in restricted workers. Use Main Thread mode for trusted macro calls.'); };`,
        ),
      ).dispose();
      // Capture the inspection intrinsics before custom code can change them.
      classify = vm.unwrapResult(
        vm.evalCode(`(() => {
        const isArray = Array.isArray, getPrototypeOf = Object.getPrototypeOf, prototype = Object.prototype;
        return value => isArray(value) ? 'array' : (getPrototypeOf(value) === prototype || getPrototypeOf(value) === null) ? 'object' : 'unsupported';
      })()`),
      );
      // Not vm.getOwnPropertyNames: in quickjs-emscripten 0.32 each call takes
      // a block off the runtime's allocation count, which wraps around after
      // about a thousand objects and fails every allocation from then on.
      keys = vm.unwrapResult(
        vm.evalCode(`(() => {
        const keys = Object.keys;
        return value => keys(value);
      })()`),
      );
      define = vm.unwrapResult(
        vm.evalCode(`(() => {
        const defineProperty = Object.defineProperty;
        return (object, key, value) => defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
      })()`),
      );
      fn = vm.unwrapResult(vm.evalCode(`(${code})`, 'custom-function.js'));
      const entry = { vm, fn, classify, keys, define };
      this.functions.set(code, entry);
      return entry;
    } catch (error) {
      fn?.dispose();
      define?.dispose();
      keys?.dispose();
      classify?.dispose();
      vm.dispose();
      throw error;
    }
  }

  execute(code: string, data: unknown, timeout = 30000): unknown {
    const progress = { phase: 'copying the input' as Phase };
    try {
      return this.run(code, data, timeout, progress);
    } catch (error) {
      throw describeError(error, progress.phase, timeout);
    }
  }

  private run(
    code: string,
    data: unknown,
    timeout: number,
    progress: { phase: Phase },
  ): unknown {
    this.deadline = Date.now() + timeout;
    let copied = 0;
    const checkCopy =
      (direction: string): CopyCheck =>
      () => {
        if (
          ++copied % VALUES_PER_DEADLINE_CHECK === 0 &&
          Date.now() >= this.deadline
        ) {
          throw new Error(
            `Compute operation timed out while copying ${copied} values ${direction} the sandbox. ${largeDataHint}`,
          );
        }
      };
    const { vm, fn, classify, keys, define } = this.compile(code);
    return Scope.withScope((scope) => {
      const input = toQuickJS(vm, data, scope, define, 0, checkCopy('into'));
      progress.phase = 'running';
      const output = scope.manage(
        vm.unwrapResult(vm.callFunction(fn, vm.undefined, input)),
      );
      while (this.runtime.hasPendingJob()) {
        if (Date.now() >= this.deadline)
          throw new Error('Compute operation timed out');
        const jobs = this.runtime.executePendingJobs(100);
        if (jobs.error) {
          try {
            throw new Error(
              String(
                jobs.error.context.dump(jobs.error).message ||
                  'QuickJS async job failed',
              ),
            );
          } finally {
            jobs.error.dispose();
          }
        }
      }
      const state = vm.getPromiseState(output);
      if (state.type === 'pending')
        throw new Error(
          'QuickJS promise did not settle; browser async APIs are unavailable',
        );
      const settled = scope.manage(vm.unwrapResult(state));
      progress.phase = 'copying the result';
      copied = 0;
      return fromQuickJS(vm, settled, classify, keys, 0, checkCopy('out of'));
    });
  }

  private release(entry: CachedFunction): void {
    entry.fn.dispose();
    entry.classify.dispose();
    entry.keys.dispose();
    entry.define.dispose();
    entry.vm.dispose();
  }
}
