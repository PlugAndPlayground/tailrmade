import variant from '@jitl/quickjs-singlefile-browser-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  Scope,
  type QuickJSRuntime,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';
import { fromQuickJS, toQuickJS } from './quickJSData';

const moduleReady = newQuickJSWASMModuleFromVariant(variant);
type CachedFunction = {
  vm: QuickJSContext;
  fn: QuickJSHandle;
  classify: QuickJSHandle;
  define: QuickJSHandle;
};

export class QuickJSExecutor {
  private runtime: QuickJSRuntime;
  private functions = new Map<string, CachedFunction>();
  private deadline = 0;

  private constructor(runtime: QuickJSRuntime) {
    this.runtime = runtime;
    runtime.setMemoryLimit(64 * 1024 * 1024);
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
      define = vm.unwrapResult(
        vm.evalCode(`(() => {
        const defineProperty = Object.defineProperty;
        return (object, key, value) => defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
      })()`),
      );
      fn = vm.unwrapResult(vm.evalCode(`(${code})`, 'custom-function.js'));
      const entry = { vm, fn, classify, define };
      this.functions.set(code, entry);
      return entry;
    } catch (error) {
      fn?.dispose();
      define?.dispose();
      classify?.dispose();
      vm.dispose();
      throw error;
    }
  }

  execute(code: string, data: unknown, timeout = 30000): unknown {
    this.deadline = Date.now() + timeout;
    const { vm, fn, classify, define } = this.compile(code);
    return Scope.withScope((scope) => {
      const input = toQuickJS(vm, data, scope, define);
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
      return fromQuickJS(vm, settled, classify);
    });
  }

  private release(entry: CachedFunction): void {
    entry.fn.dispose();
    entry.classify.dispose();
    entry.define.dispose();
    entry.vm.dispose();
  }
}
