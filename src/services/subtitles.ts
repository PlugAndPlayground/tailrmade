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

export interface SubtitleState {
  text: string;
  style: SubtitleStyle;
}

// One caption at a time, shown over the canvas by SubtitleOverlay. Both the
// Subtitle node and replay scripts drive it.
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let currentText = '';

// a duration of 0 keeps the caption until the next one replaces it
export function showSubtitle(
  text: string,
  durationMs = 0,
  style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE,
): void {
  clearTimeout(hideTimer);
  hideTimer = undefined;
  currentText = text;
  const state: SubtitleState = { text, style };
  InterfaceController.notifyListeners(ListenEvent.SubtitleChanged, state);
  if (text && durationMs > 0) {
    hideTimer = setTimeout(clearSubtitle, durationMs);
  }
}

export function clearSubtitle(): void {
  showSubtitle('');
}

export function getSubtitle(): string {
  return currentText;
}
