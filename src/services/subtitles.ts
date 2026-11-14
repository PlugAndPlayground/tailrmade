import InterfaceController, { ListenEvent } from '../InterfaceController';

export const SUBTITLE_POSITIONS = [
  'Bottom',
  'Bottom left',
  'Bottom right',
  'Center',
  'Top',
  'Top left',
  'Top right',
] as const;
export type SubtitlePosition = (typeof SUBTITLE_POSITIONS)[number];

export interface SubtitleStyle {
  // any CSS color; the text takes the app theme's contrast color for it
  background: string;
  cornerRadius: number; // px
  position: SubtitlePosition;
  margin: number; // distance from the screen edge, in % of its height
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  background: 'rgba(0, 0, 0, 0.72)',
  cornerRadius: 8,
  position: 'Bottom',
  margin: 8,
};

export interface Caption {
  // the Subtitle node showing it
  id: string;
  text: string;
  style: SubtitleStyle;
}

// The captions shown over the canvas by SubtitleOverlay, one per Subtitle
// node, in the order they appeared. A changed text keeps its place.
const captions = new Map<string, Caption>();
const hideTimers = new Map<string, ReturnType<typeof setTimeout>>();

const notify = () =>
  InterfaceController.notifyListeners(ListenEvent.SubtitleChanged, [
    ...captions.values(),
  ]);

// empty text hides the caption, and a duration of 0 keeps it until it changes
export function showSubtitle(
  id: string,
  text: string,
  durationMs: number,
  style: SubtitleStyle,
): void {
  if (!text) {
    clearSubtitle(id);
    return;
  }
  clearTimeout(hideTimers.get(id));
  hideTimers.delete(id);
  captions.set(id, { id, text, style });
  notify();
  if (durationMs > 0) {
    hideTimers.set(
      id,
      setTimeout(() => clearSubtitle(id), durationMs),
    );
  }
}

export function clearSubtitle(id: string): void {
  clearTimeout(hideTimers.get(id));
  hideTimers.delete(id);
  captions.delete(id);
  notify();
}

export function clearAllSubtitles(): void {
  hideTimers.forEach((timer) => clearTimeout(timer));
  hideTimers.clear();
  captions.clear();
  notify();
}
