// The imperative twin of useIsStackLayout - see layoutModel.ts for the two
// layouts. Free of React and MUI so the pixi canvas, the node classes and the
// pure interaction rules can ask the same question.

// MUI's own md, and the line between the two layouts.
const STACK_BREAKPOINT_PX = 900;

export const isStackLayout = (): boolean =>
  typeof window !== 'undefined' &&
  // the media query breakpoints.down('md') compiles to, so the two can never
  // disagree about where the line is
  window.matchMedia(`(max-width: ${STACK_BREAKPOINT_PX - 0.05}px)`).matches;

/**
 * Under the stack layout the canvas is a thing you look at, not one you edit:
 * pan and zoom answer, and nothing else does. Selecting, dragging, wiring and
 * the context menus all need precision, a second button or a keyboard that a
 * phone does not have, and a tap that moves a node by accident is a change you
 * cannot see you made. A widget sitting on the canvas is a picture of a
 * control for the same reason - anything meant to be usable with a finger is
 * what the app's UI is for.
 */
export const isCanvasExploreOnly = (): boolean => isStackLayout();
