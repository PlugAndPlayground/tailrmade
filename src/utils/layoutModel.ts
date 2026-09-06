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

// MUI's own md. Kept as a number so code outside React can ask the same
// question the hook below asks - see isStackLayout.
export const STACK_BREAKPOINT_PX = 900;

export const useLayoutModel = (): LayoutModel => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md')) ? 'stack' : 'columns';
};

export const useIsStackLayout = (): boolean => useLayoutModel() === 'stack';

/**
 * The imperative twin of useIsStackLayout, for the code that is not React -
 * the pixi canvas and the node classes, which have to know whether this window
 * is a phone before they act on a press.
 *
 * The same media query MUI's `breakpoints.down('md')` compiles to, so the two
 * can never disagree about where the line is.
 */
export const isStackLayout = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia(`(max-width: ${STACK_BREAKPOINT_PX - 0.05}px)`).matches;

/**
 * Under the stack layout the canvas is a thing you look at, not one you edit:
 * pan and zoom answer, and nothing else does. Selecting, dragging, wiring and
 * the context menus all need precision, a second button or a keyboard that a
 * phone does not have, and half-working versions of them are worse than none -
 * a tap that moves a node by accident is a change you cannot see you made.
 *
 * Editing happens on a desktop, and the graph view says so out loud.
 */
export const isCanvasExploreOnly = (): boolean => isStackLayout();

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

/**
 * True in the columns layout while width is still scarce - the band where the
 * panel cap applies. Chrome that is merely roomy on a desktop is expensive
 * here, so this is what panel contents check before spending height on
 * decoration.
 */
export const useIsNarrowColumns = (): boolean => {
  const theme = useTheme();
  const belowLarge = useMediaQuery(theme.breakpoints.down('lg'));
  const stack = useIsStackLayout();
  return belowLarge && !stack;
};

// --- what the stack is showing -------------------------------------------
//
// Only meaningful under the stack layout. It is deliberately NOT derived from
// the overlay state: the columns layout lets several panels be open at once
// and the stack layout allows exactly one thing, so there is no honest
// mapping between them. Each layout keeps its own idea of what is on screen,
// and crossing the breakpoint simply hands over to the other one.

export type StackView = 'ui' | 'graph' | 'ai' | 'apps';

const stackViewStore = createStore<StackView>('ui');

export const useStackView = stackViewStore.useStore;
export const getStackView = stackViewStore.get;
export const setStackView = stackViewStore.set;
