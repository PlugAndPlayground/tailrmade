import { createStore } from '../createStore';

// Per-session view state of the dashboard. None of it belongs in the overlay
// state, which is serialized into the graph (GraphClass.serialize) - these are
// properties of this browser session, not of the app being authored.
//
// It lives outside the component tree because in every case the control that
// writes it and the component that reads it sit in different branches:
// DashboardHeader is a sibling of DashboardEditor, not its parent.

// --- device preview -------------------------------------------------------
// Constrains the edited surface to a preset viewport width so users can see
// their app reflow. Whether the choice currently applies is derived from the
// overlay state - see useDevicePreviewWidth in hooks.tsx.

export type DevicePreviewMode = 'mobile' | 'tablet' | 'desktop';

// preset viewport widths; desktop = unconstrained (full panel width)
export const DEVICE_PREVIEW_WIDTHS: Record<DevicePreviewMode, number | null> = {
  mobile: 390,
  tablet: 820,
  desktop: null,
};

const SESSION_KEY = 'tm-device-preview-mode';

const isDevicePreviewMode = (value: unknown): value is DevicePreviewMode =>
  value === 'mobile' || value === 'tablet' || value === 'desktop';

const loadInitialMode = (): DevicePreviewMode => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (isDevicePreviewMode(stored)) {
      return stored;
    }
  } catch {
    // sessionStorage unavailable (tests, some embedded contexts) - default
  }
  return 'desktop';
};

const modeStore = createStore<DevicePreviewMode>(loadInitialMode());

export const useDevicePreviewMode = modeStore.useStore;

export const setDevicePreviewMode = (newMode: DevicePreviewMode): void => {
  modeStore.set(newMode);
  try {
    sessionStorage.setItem(SESSION_KEY, newMode);
  } catch {
    // non-fatal - the mode just won't survive a reload
  }
};

// Container customStyles may hold real `@media (min-width/max-width: Npx)`
// blocks (the ROOT preset ships some). Browsers evaluate those against the
// WINDOW, so inside a constrained device preview they would not reflow.
// When a preview width is set, evaluate simple width conditions against it:
// matching blocks are flattened into the base styles, non-matching ones are
// dropped. Keys with conditions we can't parse (orientation, height, ...)
// are passed through untouched and keep their window-relative behavior.
const MEDIA_WIDTH_CONDITION = /^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/;

export const resolveCustomStylesForPreviewWidth = (
  customStyles: Record<string, any>,
  previewWidth: number | null,
): Record<string, any> => {
  if (previewWidth === null) {
    return customStyles;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(customStyles)) {
    const trimmedKey = key.trim();
    if (!trimmedKey.startsWith('@media')) {
      result[key] = value;
      continue;
    }
    const conditions = trimmedKey
      .slice('@media'.length)
      .split(/\band\b/)
      .map((condition) => condition.trim());
    let recognized = true;
    let matches = true;
    for (const condition of conditions) {
      const match = MEDIA_WIDTH_CONDITION.exec(condition);
      if (!match) {
        recognized = false;
        break;
      }
      const limit = parseFloat(match[2]);
      if (match[1] === 'min' ? previewWidth < limit : previewWidth > limit) {
        matches = false;
      }
    }
    if (!recognized) {
      // unknown media feature - leave it to the browser
      result[key] = value;
    } else if (matches && value && typeof value === 'object') {
      Object.assign(result, value);
    }
    // recognized but not matching: dropped
  }
  return result;
};

// --- toolbox --------------------------------------------------------------
// Means "show the toolbox" in BOTH layouts: an in-flow sidebar while the panel
// is wide enough, an overlay drawer once it is not. Toolbox resets it whenever
// the panel crosses that breakpoint.
//
// It starts closed because that reset runs in an effect, one commit after the
// first render: starting open would flash the overlay toolbox across the
// surface on a narrow panel, where starting closed only costs a wide panel one
// frame with no sidebar - which renders nothing at all rather than the wrong
// thing.

const toolboxOpenStore = createStore(false);

export const setToolboxOpen = toolboxOpenStore.set;
export const useToolboxOpen = toolboxOpenStore.useStore;

export const toggleToolbox = (): void => toolboxOpenStore.set((open) => !open);

// --- surface stack --------------------------------------------------------
// The dive path of nested UI surfaces (first entry = the top-level selected
// surface, last = the one currently displayed). Maintained by DashboardEditor,
// which owns the surface load listeners, and rendered by DashboardHeader's
// breadcrumb.

const sameStack = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

const surfaceStackStore = createStore<string[]>([], sameStack);

export const setSurfaceStack = surfaceStackStore.set;
export const useSurfaceStack = surfaceStackStore.useStore;
