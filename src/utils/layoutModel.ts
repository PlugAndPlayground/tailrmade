// Two layouts, decided by one question: can this window hold a row of columns?
//
//   COLUMNS  >= md (900px)   rail, panels and the app UI side by side. Between md and
//                            lg only two panels may be open at once, because a third
//                            leaves less canvas than a node is wide.
//   STACK    <  md (900px)   one full-screen view at a time, chosen from a bottom bar.
//                            No rail, no drawers, no overlap.
//
// The line is about the window, not the device: a tablet held in portrait
// stacks, the same tablet turned sideways gets columns.

import { useTheme } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createStore } from '../components/createStore';
import { DrawerSide } from './interfaces';
import { RootName } from './constants_shared';

export const useIsStackLayout = (): boolean =>
  useMediaQuery(useTheme().breakpoints.down('md'));

export const useMaxOpenPanels = (): number =>
  useMediaQuery(useTheme().breakpoints.down('lg')) ? 2 : Infinity;

export type StackView = 'ui' | 'graph' | 'ai' | 'apps';

const stackViewStore = createStore<StackView>('ui');

export const useStackView = stackViewStore.useStore;
export const getStackView = stackViewStore.get;
export const setStackView = stackViewStore.set;

// --- the panel cap --------------------------------------------------------

export const CAPPED_PANELS: DrawerSide[] = [
  DrawerSide.LEFT,
  DrawerSide.DASHBOARD,
  DrawerSide.RIGHT,
];

// Which panels have to close for the cap to hold. The oldest goes.
export function panelsToClose(
  openOrder: DrawerSide[],
  maxOpen: number,
): DrawerSide[] {
  return openOrder.slice(0, Math.max(0, openOrder.length - maxOpen));
}

export function nextPanelOrder(
  previousOrder: DrawerSide[],
  openNow: DrawerSide[],
): DrawerSide[] {
  return [
    ...previousOrder.filter((side) => openNow.includes(side)),
    ...openNow.filter((side) => !previousOrder.includes(side)),
  ];
}

// In stack view, after opening an app through the apps list, we go to
// the opened app UI if it has one, otherwise we show the graph
type SurfaceCandidate = {
  isSurface: () => boolean;
  getSurfaceTree?: () => Record<string, { nodes?: string[] } | undefined>;
};

export type GraphWithNodes = { nodes: Record<string, SurfaceCandidate> };

export const graphHasUI = (graph: GraphWithNodes): boolean =>
  Object.values(graph.nodes).some(
    (node) =>
      node.isSurface() &&
      (node.getSurfaceTree?.()[RootName]?.nodes?.length ?? 0) > 0,
  );

export const goToOpenedApp = (graph: GraphWithNodes): void =>
  setStackView(graphHasUI(graph) ? 'ui' : 'graph');
