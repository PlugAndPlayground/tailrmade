import { useSyncExternalStore } from 'react';

// Device preview for the dashboard editor: constrain the edited surface to a
// preset viewport width (mobile/tablet) so users can see their app reflow.
//
// This state is deliberately NOT part of the overlay state:
// overlayState.dashboard is serialized into the graph (GraphClass.serialize),
// and the preview mode must only persist per browser session, never with the
// graph. It lives in this tiny external store so both the editor UI
// (DevicePreviewToggle, the frame in DashboardEditor) and the width-dependent
// layout logic (useIsDashboardNarrow in hooks.tsx) follow the same value.

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
  } catch (error) {
    // sessionStorage unavailable (tests, some embedded contexts) - default
  }
  return 'desktop';
};

let mode: DevicePreviewMode = loadInitialMode();
// only true while the dashboard editor is in edit mode - outside of it the
// dashboard must render at its real width (view/app mode is the real app)
let active = false;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getDevicePreviewMode = (): DevicePreviewMode => mode;

// The width the dashboard surface is currently constrained to, or null when
// unconstrained (desktop preset, or the editor is not in edit mode).
export const getDevicePreviewWidth = (): number | null =>
  active ? DEVICE_PREVIEW_WIDTHS[mode] : null;

export const setDevicePreviewMode = (newMode: DevicePreviewMode): void => {
  if (newMode === mode) {
    return;
  }
  mode = newMode;
  try {
    sessionStorage.setItem(SESSION_KEY, newMode);
  } catch (error) {
    // non-fatal - the mode just won't survive a reload
  }
  notify();
};

export const setDevicePreviewActive = (newActive: boolean): void => {
  if (newActive === active) {
    return;
  }
  active = newActive;
  notify();
};

export function useDevicePreviewMode(): DevicePreviewMode {
  return useSyncExternalStore(subscribe, getDevicePreviewMode);
}

export function useDevicePreviewWidth(): number | null {
  return useSyncExternalStore(subscribe, getDevicePreviewWidth);
}

// Container customStyles may hold real `@media (min-width/max-width: Npx)`
// blocks (the ROOT preset ships some). Browsers evaluate those against the
// WINDOW, so inside a constrained device preview they would not reflow.
// When a preview width is set, evaluate simple width conditions against it:
// matching blocks are flattened into the base styles, non-matching ones are
// dropped. Keys with conditions we can't parse (orientation, height, ...)
// are passed through untouched and keep their window-relative behavior.
const MEDIA_WIDTH_CONDITION = /^\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)$/;

export const resolveCustomStylesForPreviewWidth = (
  customStyles: Record<string, any> | undefined,
  previewWidth: number | null,
): Record<string, any> => {
  if (!customStyles || previewWidth === null) {
    return customStyles ?? {};
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
    let recognized = conditions.length > 0;
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
