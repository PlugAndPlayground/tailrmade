import InterfaceController, { ListenEvent } from '../InterfaceController';

// One caption at a time, shown over the canvas by SubtitleOverlay. Both the
// Subtitle node and replay scripts drive it.
let hideTimer: ReturnType<typeof setTimeout> | undefined;

// a duration of 0 keeps the caption until the next one replaces it
export function showSubtitle(text: string, durationMs = 0): void {
  clearTimeout(hideTimer);
  hideTimer = undefined;
  InterfaceController.notifyListeners(ListenEvent.SubtitleChanged, text);
  if (text && durationMs > 0) {
    hideTimer = setTimeout(() => showSubtitle(''), durationMs);
  }
}

export function clearSubtitle(): void {
  showSubtitle('');
}
