import InterfaceController from '../InterfaceController';
import { getCachedUserPreferences } from '../components/userPreferencesStore';
import { CaptureSource, capture } from './CaptureService';
import {
  AI_IMAGE_MAX_EDGE,
  downscaleImageForAI,
} from '../utils/imageDownscale';

/**
 * Lets the assistant look at the app it is building.
 *
 * Only the silent capture sources are reachable from here. 'Screen sharing'
 * is deliberately not one of them: it would hand the model whatever else is
 * on the user's desktop, and it prompts. What the assistant can see is the app
 * being edited and nothing else.
 */

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

/**
 * Base64 inflates by a third, the agent re-sends the newest image on every
 * turn, and the relay 413s on oversized bodies, so a capture that lands over
 * this is re-encoded smaller rather than sent.
 */
export const AI_VISION_MAX_BYTES = 500_000;

/** Successively smaller edges tried when a capture lands over the byte cap. */
const FALLBACK_MAX_EDGES = [1000, 700];

/** How long the app is given to finish rendering before a capture is taken. */
export const AI_CAPTURE_SETTLE_MS = 250;

export interface AIVisionImage {
  source: AIInspectSource;
  /** the short note the image is paired with in the conversation */
  note: string;
  /** a downscaled, lossily re-encoded data url */
  dataURL: string;
}

// The panel registers itself while mounted. Auto-capture is gated on this, so
// nothing is ever captured for an assistant the user is not looking at.
let panelIsOpen = false;

export const setAIPanelOpen = (isOpen: boolean): void => {
  panelIsOpen = isOpen;
};

export const isAIPanelOpen = (): boolean => panelIsOpen;

export const isAutoCaptureEnabled = (): boolean =>
  getCachedUserPreferences().aiAutoCapture !== false;

/**
 * The dashboard has to actually be on screen: html2canvas can only see what is
 * laid out, and `captureUserInterface` throws on a hidden surface rather than
 * returning a blank image.
 */
export const isDashboardOnScreen = (): boolean => {
  const surface =
    document.querySelector<HTMLElement>('[data-cy="dashboard"] #ROOT') ??
    document.querySelector<HTMLElement>('[data-cy="device-preview-frame"]');
  return surface != null && surface.offsetParent !== null;
};

/**
 * Every condition auto-capture needs. The explicit inspect_ui action ignores
 * the preference - asking for it is the consent - but still cannot reach
 * anything but the app being edited.
 */
export const canAutoCapture = (): boolean =>
  panelIsOpen && isAutoCaptureEnabled() && isDashboardOnScreen();

/**
 * Widgets re-render off the node execution that a mutation tool triggered, so
 * a capture taken in the same tick catches the previous frame. Two frames for
 * the hybrid containers to follow the canvas, then a short settle for react
 * commits and webfont/image loads.
 */
export const waitForRenderToSettle = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        window.setTimeout(resolve, AI_CAPTURE_SETTLE_MS),
      ),
    );
  });

/** The base64 payload length, which is what the request body actually carries. */
export const encodedByteLength = (dataURL: string): number =>
  dataURL.length - (dataURL.indexOf(',') + 1);

/**
 * Shrinks until the encoded image fits the cap. The last fallback is returned
 * even if it still does not fit: an oversized capture the model can read beats
 * no capture at all, and the relay's own error is clearer than ours.
 */
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

/**
 * The one place a capture is taken for the assistant. Throws with the capture
 * backend's own message, which is already written for a reader.
 */
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

/** The surface the dashboard is showing, whose layout pairs with its image. */
export const getDisplayedSurfaceNodeId = (): string | null =>
  InterfaceController.displayedSurfaceNodeId;
