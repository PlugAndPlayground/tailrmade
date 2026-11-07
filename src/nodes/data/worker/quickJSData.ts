import {
  Scope,
  type QuickJSContext,
  type QuickJSHandle,
} from 'quickjs-emscripten-core';

const unsupported = () =>
  new Error(
    'QuickJS supports primitives, arrays, and plain data objects. Use Main Thread mode for browser objects or other complex values.',
  );

// Marshal values explicitly: JSON would silently lose undefined, NaN, and bigint.
export function toQuickJS(
  vm: QuickJSContext,
  value: unknown,
  scope: Scope,
  define: QuickJSHandle,
  depth = 0,
): QuickJSHandle {
  if (depth > 100)
    throw new Error('Input is cyclic or exceeds 100 levels of nesting');
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
        const childValue = toQuickJS(vm, child, scope, define, depth + 1);
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

export function fromQuickJS(
  vm: QuickJSContext,
  value: QuickJSHandle,
  classify: QuickJSHandle,
  depth = 0,
): unknown {
  if (depth > 100)
    throw new Error('Result is cyclic or exceeds 100 levels of nesting');
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
        const result = type === 'array' ? new Array(vm.getLength(value)) : {};
        const keys = scope.manage(
          vm.unwrapResult(
            vm.getOwnPropertyNames(value, {
              strings: true,
              numbersAsStrings: true,
              onlyEnumerable: true,
            }),
          ),
        );
        for (const key of keys) {
          const child = scope.manage(vm.getProp(value, key));
          Object.defineProperty(result, vm.getString(key), {
            value: fromQuickJS(vm, child, classify, depth + 1),
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
