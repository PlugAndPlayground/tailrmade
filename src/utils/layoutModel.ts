// Which of the two layouts a window gets, and what the narrow one is showing.
//
// There used to be three answers to "how much room do I get?" - the rail took
// a fixed column forever, the drawers became sheets below one breakpoint, and
// the app UI became a full cover below a different one. None of them knew
// about the others, so a portrait tablet ended up with sheet drawers beside a
// 270px app.
//
// There are now two, and one question decides between them: can this window
// hold a row of columns at all?
//
//   COLUMNS  >= md   the docked row - rail, panels and the app UI side by
//                    side, as on the desktop today. Between md and lg only
//                    two panels may be open at once, because a third leaves
//                    less canvas than a node is wide.
//
//   STACK    <  md   one full-screen view at a time, chosen from a bottom
//                    bar. No rail, no drawers, no sheets, no overlap - so
//                    nothing needs a breakpoint of its own any more.
//
// The line is about the WINDOW, not the device: a tablet held in portrait is
// 820px and stacks, the same tablet turned sideways is 1180px and gets
// columns. Width is the thing that actually runs out.

import { useTheme } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { createStore } from '../components/createStore';

export type LayoutModel = 'stack' | 'columns';

export const useLayoutModel = (): LayoutModel => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md')) ? 'stack' : 'columns';
};

export const useIsStackLayout = (): boolean => useLayoutModel() === 'stack';

/**
 * How many panels may be open at once in the columns layout.
 *
 * Panels here are the three that take real width: the apps list, the
 * inspector and the app UI. At 1180px two of them still leave the canvas
 * ~500px; a third leaves under 200, which is narrower than a node. lg is the
 * first width where all three fit beside a canvas worth looking at.
 */
export const useMaxOpenPanels = (): number => {
  const theme = useTheme();
  const belowLarge = useMediaQuery(theme.breakpoints.down('lg'));
  return belowLarge ? 2 : Infinity;
};

// --- what the stack is showing -------------------------------------------
//
// Only meaningful under the stack layout. It is deliberately NOT derived from
// the overlay state: the columns layout lets several panels be open at once
// and the stack layout allows exactly one thing, so there is no honest
// mapping between them. Each layout keeps its own idea of what is on screen,
// and crossing the breakpoint simply hands over to the other one.

export type StackView = 'ui' | 'canvas' | 'ai' | 'apps';

const stackViewStore = createStore<StackView>('ui');

export const useStackView = stackViewStore.useStore;
export const getStackView = stackViewStore.get;
export const setStackView = stackViewStore.set;
