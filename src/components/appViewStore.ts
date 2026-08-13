import { useSyncExternalStore } from 'react';

// App view: zero chrome, forced live, the app UI fills the window.
//
// It lives outside the component tree for the same reason devicePreviewStore
// does - it is per-session view state, never part of the overlay state that
// gets serialized into the graph. Keeping it here rather than in GraphOverlay's
// useState is what lets the width hooks subscribe to it: useDashboardPanelWidth
// has to know that the dashboard column spans the whole viewport in app view,
// and it is nowhere near GraphOverlay in the tree.
//
// GraphOverlay still owns the TRANSITION (restoring panels, the URL parameter,
// the ticker) through its toggleAppView - this store only holds the flag.

let appView = false;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getAppView = (): boolean => appView;

export const setAppView = (newAppView: boolean): void => {
  if (newAppView === appView) {
    return;
  }
  appView = newAppView;
  listeners.forEach((listener) => listener());
};

export function useAppView(): boolean {
  return useSyncExternalStore(subscribe, getAppView);
}
