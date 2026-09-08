// Two layouts, decided by one question: can this window hold a row of columns?
//
//   COLUMNS  >= md   rail, panels and the app UI side by side. Between md and
//                    lg only two panels may be open at once, because a third
//                    leaves less canvas than a node is wide.
//   STACK    <  md   one full-screen view at a time, chosen from a bottom bar.
//                    No rail, no drawers, no overlap.
//
// The line is about the window, not the device: a tablet held in portrait
// stacks, the same tablet turned sideways gets columns.

import { useTheme } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createStore } from '../components/createStore';

// The imperative twin, isStackLayout, lives in stackLayout.ts free of React
// and MUI, so the pixi and node code can ask the same question.
export const useIsStackLayout = (): boolean =>
  useMediaQuery(useTheme().breakpoints.down('md'));

/** How many of the apps list, inspector and app UI may be open at once. */
export const useMaxOpenPanels = (): number =>
  useMediaQuery(useTheme().breakpoints.down('lg')) ? 2 : Infinity;

/**
 * The columns band where width is still scarce - the one the panel cap applies
 * to. Chrome that is merely roomy on a desktop is expensive here.
 */
export const useIsNarrowColumns = (): boolean =>
  useMediaQuery(useTheme().breakpoints.between('md', 'lg'));

// What the stack is showing. Deliberately not derived from the overlay state:
// columns allows several panels at once and the stack exactly one, so there is
// no honest mapping between them - each layout keeps its own idea of what is
// on screen.
export type StackView = 'ui' | 'graph' | 'ai' | 'apps';

const stackViewStore = createStore<StackView>('ui');

export const useStackView = stackViewStore.useStore;
export const getStackView = stackViewStore.get;
export const setStackView = stackViewStore.set;
