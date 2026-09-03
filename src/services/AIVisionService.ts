import InterfaceController from '../InterfaceController';
import { getCachedUserPreferences } from '../components/userPreferencesStore';
import { CaptureSource, capture } from './CaptureService';
import {
  AI_IMAGE_MAX_EDGE,
  downscaleImageForAI,
} from '../utils/imageDownscale';

export const AI_INSPECT_SOURCES = ['dashboard', 'graph', 'selection'] as const;
export type AIInspectSource = (typeof AI_INSPECT_SOURCES)[number];

const CAPTURE_SOURCE_FOR: Record<AIInspectSource, CaptureSource> = {
  dashboard: 'User interface',
  graph: 'Graph',
  selection: 'Node selection',
};

const NOTE_FOR: Record<AIInspectSource, string> = {
  dashboard: 'current dashboard state',
  graph: 'current graph wiring',
  selection: 'currently selected nodes',
};

export const AI_VISION_MAX_BYTES = 500_000;

const FALLBACK_MAX_EDGES = [1000, 700];

export const AI_CAPTURE_SETTLE_MS = 250;

export interface AIVisionImage {
  source: AIInspectSource;
  /** the short note the image is paired with in the conversation */
  note: string;
  /** a downscaled, lossily re-encoded data url */
  dataURL: string;
}

let panelIsOpen = false;

export const setAIPanelOpen = (isOpen: boolean): void => {
  panelIsOpen = isOpen;
};

export const isAIPanelOpen = (): boolean => panelIsOpen;

export const isAutoCaptureEnabled = (): boolean =>
  getCachedUserPreferences().aiAutoCapture !== false;

export const isDashboardOnScreen = (): boolean => {
  const surface =
    document.querySelector<HTMLElement>('[data-cy="dashboard"] #ROOT') ??
    document.querySelector<HTMLElement>('[data-cy="device-preview-frame"]');
  return surface != null && surface.offsetParent !== null;
};

export const canAutoCapture = (): boolean =>
  panelIsOpen && isAutoCaptureEnabled() && isDashboardOnScreen();

export const waitForRenderToSettle = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.setTimeout(resolve, AI_CAPTURE_SETTLE_MS),
      ),
    );
  });

export const encodedByteLength = (dataURL: string): number =>
  dataURL.length - (dataURL.indexOf(',') + 1);

export const fitWithinByteCap = async (
  dataURL: string,
  maxBytes = AI_VISION_MAX_BYTES,
): Promise<string> => {
  let fitted = await downscaleImageForAI(dataURL, {
    maxEdge: AI_IMAGE_MAX_EDGE,
  });
  for (const maxEdge of FALLBACK_MAX_EDGES) {
    if (encodedByteLength(fitted) <= maxBytes) {
      return fitted;
    }
    fitted = await downscaleImageForAI(dataURL, { maxEdge });
  }
  return fitted;
};

export const captureForAI = async (
  source: AIInspectSource,
): Promise<AIVisionImage> => {
  await waitForRenderToSettle();
  const result = await capture(CAPTURE_SOURCE_FOR[source]);
  return {
    source,
    note: NOTE_FOR[source],
    dataURL: await fitWithinByteCap(result.dataURL),
  };
};

export const getDisplayedSurfaceNodeId = (): string | null =>
  InterfaceController.displayedSurfaceNodeId;
