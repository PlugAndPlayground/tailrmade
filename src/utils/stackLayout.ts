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

export const isCanvasExploreOnly = (): boolean => isStackLayout();
