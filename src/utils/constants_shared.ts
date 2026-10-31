export const VISIBILITY_ACTION = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  TOGGLE: 'TOGGLE',
} as const;
export type TVisibilityAction =
  (typeof VISIBILITY_ACTION)[keyof typeof VISIBILITY_ACTION];

// lives here (rather than constants.tsx) so it stays importable from modules
// that must stay free of constants.tsx's pixi.js/MUI/theme imports, such as
// graphMigrations.ts which loads very early via GraphClass/PPStorage
export const SOCKET_TYPE = {
  IN: 'in',
  OUT: 'out',
  TRIGGER: 'trigger',
  GHOST: 'ghost',
};

// here for the same reason: touchGestures.ts reads it
export const ONCLICK_DOUBLECLICK = 2;

export const dashboardLayoutInputName = 'Layout';
export const dashboardVisibilitySocketName = 'Visible';

export const surfaceJsonSocketName = 'Layout JSON';
export const surfaceRouteSocketName = 'Route';
export const surfaceRadioGroupSocketName = 'Radio Group';
export const surfaceElementVisibleSuffix = ' visible';
export const surfaceElementLayoutSuffix = ' layout';

// A UI template's sockets. The parameters are OUTPUTS on its left block,
// feeding the nodes inside the frame; the UI is a single INPUT on its right
// block, taking the surface that is the template's body - the same shape as
// Macro's parameters and its Output. Same spelling as
// MACRO_PARAMETER_PREFIX_NAME on purpose, since it reads the same to the user,
// but a separate constant: templates and macros stay independent features.
export const templateParameterPrefixName = 'Parameter';
export const templateUISocketName = 'UI';
export const templateOutputPrefixName = 'Output';
export const templateSocketName = 'Template';
// per-placement edits, kept on the placing node so they save with the graph
export const templateEditsSocketName = 'Edits';

export const modalOpenSocketName = 'Open';
export const modalOpenTriggerSocketName = 'Open Dialog';
export const modalCloseTriggerSocketName = 'Close Dialog';
export const modalIsOpenOutputSocketName = 'Is Open';
export const modalTitleSocketName = 'Title';
export const modalDismissOnBackdropSocketName = 'Dismiss on Backdrop';
export const modalDismissOnEscapeSocketName = 'Dismiss on Escape';

// the craft tree's ROOT item type/name and the DynamicWidget item type -
// lives here (rather than surfaceTree.ts) so it stays importable from
// modules that must stay free of surfaceTree.ts's constants.tsx import,
// such as graphMigrations.ts which loads very early via GraphClass/PPStorage
export const RootName = 'ROOT';
export const containerName = 'Container';
export const DynamicWidgetName = 'DynamicWidget';

export const isDefaultPageSocketName = 'Is Default Page';
