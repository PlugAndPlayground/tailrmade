export const VISIBILITY_ACTION = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  TOGGLE: 'TOGGLE',
};

// lives here (rather than constants.tsx) so it stays importable from modules
// that must stay free of constants.tsx's pixi.js/MUI/theme imports, such as
// graphMigrations.ts which loads very early via GraphClass/PPStorage
export const SOCKET_TYPE = {
  IN: 'in',
  OUT: 'out',
  TRIGGER: 'trigger',
  GHOST: 'ghost',
};

export const dashboardLayoutInputName = 'Layout';
export const dashboardVisibilitySocketName = 'Visible';
export const dashboardCollapseSocketName = 'Collapse Mode';
export const dashboardCollapseNoControlText = 'No Control';
export const COLLAPSE_OPTIONS = [
  { text: dashboardCollapseNoControlText, value: 'none' },
  { text: 'Collapsed', value: 'collapse' },
  { text: 'Expanded', value: 'expand' },
];

export const surfaceJsonSocketName = 'Layout JSON';
export const surfaceRouteSocketName = 'Route';
export const surfaceRadioGroupSocketName = 'Radio Group';
export const surfaceElementVisibleSuffix = ' visible';
export const surfaceElementLayoutSuffix = ' layout';

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
