import { useSyncExternalStore } from 'react';

// The dive path of nested UI surfaces (first entry = the top-level selected
// surface, last = the one currently displayed).
//
// It is maintained by DashboardEditor, which owns the surface load listeners,
// but rendered by DashboardHeader's breadcrumb - a sibling, not a child. This
// tiny external store keeps the two in sync without threading state through
// the shell layout, the same way devicePreviewStore does for the preview mode.

let surfaceStack: string[] = [];

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSurfaceStack = (): string[] => surfaceStack;

export const setSurfaceStack = (
  update: string[] | ((prev: string[]) => string[]),
): void => {
  const next = typeof update === 'function' ? update(surfaceStack) : update;
  if (
    next.length === surfaceStack.length &&
    next.every((id, index) => id === surfaceStack[index])
  ) {
    return;
  }
  surfaceStack = next;
  notify();
};

export function useSurfaceStack(): string[] {
  return useSyncExternalStore(subscribe, getSurfaceStack);
}
