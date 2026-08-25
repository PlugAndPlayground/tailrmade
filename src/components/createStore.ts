import { useSyncExternalStore } from 'react';

// A minimal external store for view state that has to be shared between
// branches of the tree - siblings that would otherwise need it threaded
// through the shell layout - and must NOT live in the overlay state, which is
// serialized into the graph (GraphClass.serialize).
//
// Use it only for state this app genuinely owns. Anything derivable from the
// overlay state belongs in a hook over InterfaceController's overlay events
// (see useOverlayState in dashboard/hooks) - a store that mirrors it is a
// second source of truth that can drift.

type Store<T> = {
  set: (next: T | ((prev: T) => T)) => void;
  useStore: () => T;
  // imperative read, for the paths that are not React - serialization,
  // graph load, anything reaching for the value outside a render
  get: () => T;
};

export function createStore<T>(
  initial: T,
  // stores holding arrays or objects pass their own comparison so a set() with
  // an equal value does not wake every subscriber
  isEqual: (a: T, b: T) => boolean = Object.is,
): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  const get = (): T => value;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const set = (next: T | ((prev: T) => T)): void => {
    const resolved =
      typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    if (isEqual(resolved, value)) {
      return;
    }
    value = resolved;
    listeners.forEach((listener) => listener());
  };

  function useStore(): T {
    return useSyncExternalStore(subscribe, get);
  }

  return { set, useStore, get };
}
