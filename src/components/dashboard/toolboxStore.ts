import { useSyncExternalStore } from 'react';

// Whether the dashboard editor's toolbox is showing.
//
// It lives outside the component tree because the control that toggles it
// (the dashboard header) and the toolbox itself sit in different branches -
// DashboardHeader is a sibling of DashboardEditor, which owns the toolbox.
// Same reasoning as devicePreviewStore: this is per-session view state, never
// part of the overlay state that gets serialized into the graph.
//
// The flag means "show the toolbox" in BOTH layouts: an in-flow sidebar while
// the panel is wide enough, an overlay drawer once it is not. Toolbox resets
// it whenever the panel crosses that breakpoint.
//
// It starts closed because that reset runs in an effect, one commit after the
// first render: starting open would flash the overlay toolbox across the
// surface on a narrow panel, where starting closed only costs a wide panel one
// frame with no sidebar - which renders nothing at all rather than the wrong
// thing.

let open = false;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getToolboxOpen = (): boolean => open;

export const setToolboxOpen = (newOpen: boolean): void => {
  if (newOpen === open) {
    return;
  }
  open = newOpen;
  listeners.forEach((listener) => listener());
};

export const toggleToolbox = (): void => setToolboxOpen(!open);

export function useToolboxOpen(): boolean {
  return useSyncExternalStore(subscribe, getToolboxOpen);
}
