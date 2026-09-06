// Which layout this window gets, asked imperatively.
//
// The hooks live in layoutModel.ts, which is where the two layouts are
// explained. This module is the same question with no React and no MUI in it,
// so the code that is neither - the pixi canvas, the node classes, the pure
// interaction rules - can ask it without dragging a component library into a
// unit test.

// MUI's own md, and the line between the two layouts.
export const STACK_BREAKPOINT_PX = 900;

/** The imperative twin of useIsStackLayout. */
export const isStackLayout = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  // the media query MUI's breakpoints.down('md') compiles to, so the two can
  // never disagree about where the line is
  window.matchMedia(`(max-width: ${STACK_BREAKPOINT_PX - 0.05}px)`).matches;

/**
 * Under the stack layout the canvas is a thing you look at, not one you edit:
 * pan and zoom answer, and nothing else does. Selecting, dragging, wiring and
 * the context menus all need precision, a second button or a keyboard that a
 * phone does not have, and half-working versions of them are worse than none -
 * a tap that moves a node by accident is a change you cannot see you made.
 *
 * The same goes for a widget sitting on the canvas: there it is a picture of a
 * control rather than a control. Anything meant to be usable on a phone is
 * what the app's UI is for, and its creator puts it there.
 *
 * Editing happens on a desktop, and the graph view says so out loud.
 */
export const isCanvasExploreOnly = (): boolean => isStackLayout();
