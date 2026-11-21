import {
  Scope,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';

const unsupported = () =>
  new Error(
    'QuickJS supports primitives, arrays, and plain data objects. Use Main Thread mode for browser objects or other complex values.',
  );

// Copying a value in or out runs on the host, where QuickJS's interrupt handler
// never fires, so a huge input has to check the deadline itself
export type CopyCheck = () => void;
const noCheck: CopyCheck = () => {};

// Marshal values explicitly: JSON would silently lose undefined, NaN, and bigint.
export function toQuickJS(
  vm: QuickJSContext,
  value: unknown,
  scope: Scope,
  define: QuickJSHandle,
  depth = 0,
  check: CopyCheck = noCheck,
): QuickJSHandle {
  if (depth > 100)
    throw new Error('Input is cyclic or exceeds 100 levels of nesting');
  check();
  if (value === null) return vm.null;
  switch (typeof value) {
    case 'undefined':
      return vm.undefined;
    case 'boolean':
      return value ? vm.true : vm.false;
    case 'string':
      return scope.manage(vm.newString(value));
    case 'number':
      return scope.manage(vm.newNumber(value));
    case 'bigint':
      return scope.manage(vm.newBigInt(value));
    case 'object': {
      const array = Array.isArray(value);
      if (
        !array &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null
      )
        throw unsupported();
      const handle = scope.manage(array ? vm.newArray() : vm.newObject());
      for (const [key, child] of Object.entries(value)) {
        const property = scope.manage(vm.newString(key));
        const childValue = toQuickJS(
          vm,
          child,
          scope,
          define,
          depth + 1,
          check,
        );
        vm.unwrapResult(
          vm.callFunction(define, vm.undefined, handle, property, childValue),
        ).dispose();
      }
      if (array)
        vm.setProp(handle, 'length', scope.manage(vm.newNumber(value.length)));
      return handle;
    }
    default:
      throw unsupported();
  }
}

// Not vm.getLength: in quickjs-emscripten 0.32 it reads its result through a
// typed array on the WASM heap that goes stale once a large input grows the
// heap, so it returns undefined and big arrays came back empty without an error
function lengthOf(vm: QuickJSContext, handle: QuickJSHandle): number {
  const length = vm.getProp(handle, 'length');
  try {
    const value = vm.typeof(length) === 'number' ? vm.getNumber(length) : NaN;
    if (!Number.isInteger(value) || value < 0)
      throw new Error('Could not read an array length from the sandbox');
    return value;
  } finally {
    length.dispose();
  }
}

export function fromQuickJS(
  vm: QuickJSContext,
  value: QuickJSHandle,
  classify: QuickJSHandle,
  keys: QuickJSHandle,
  depth = 0,
  check: CopyCheck = noCheck,
): unknown {
  if (depth > 100)
    throw new Error('Result is cyclic or exceeds 100 levels of nesting');
  check();
  if (vm.sameValue(value, vm.null)) return null;
  switch (vm.typeof(value)) {
    case 'undefined':
      return undefined;
    case 'boolean':
      return vm.sameValue(value, vm.true);
    case 'string':
      return vm.getString(value);
    case 'number':
      return vm.getNumber(value);
    case 'bigint':
      return vm.getBigInt(value);
    case 'object':
      return Scope.withScope((scope) => {
        const kind = scope.manage(
          vm.unwrapResult(vm.callFunction(classify, vm.undefined, value)),
        );
        const type = vm.getString(kind);
        if (type !== 'array' && type !== 'object') throw unsupported();
        const result = type === 'array' ? new Array(lengthOf(vm, value)) : {};
        const names = scope.manage(
          vm.unwrapResult(vm.callFunction(keys, vm.undefined, value)),
        );
        const count = lengthOf(vm, names);
        for (let i = 0; i < count; i++) {
          const key = scope.manage(vm.getProp(names, i));
          const child = scope.manage(vm.getProp(value, key));
          Object.defineProperty(result, vm.getString(key), {
            value: fromQuickJS(vm, child, classify, keys, depth + 1, check),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        return result;
      });
    default:
      throw unsupported();
  }
}
