import { ONCLICK_DOUBLECLICK } from './constants_shared';

export const LONG_PRESS_MS = 500;

// How far a finger may wander before it counts as travelling.
export const TOUCH_DRAG_SLOP_PX = 10;

export type TouchGestureOutcome = 'none' | 'tap' | 'long-press' | 'drag';

export type TouchGestureSample = {
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
};

// Watches one touch from press to release and says what it turned out to be.
export class TouchGesture<TPayload> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin: { x: number; y: number } | undefined;
  private outcome: TouchGestureOutcome = 'none';

  constructor(
    private readonly onLongPress: (payload: TPayload) => void,
    private readonly longPressMs: number = LONG_PRESS_MS,
    private readonly tolerancePx: number = TOUCH_DRAG_SLOP_PX,
  ) {}

  start(sample: TouchGestureSample, payload: TPayload): void {
    this.reset();
    if (sample.pointerType !== 'touch' || !sample.isPrimary) {
      return;
    }
    this.origin = { x: sample.clientX, y: sample.clientY };
    this.outcome = 'tap';
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.outcome = 'long-press';
      this.onLongPress(payload);
    }, this.longPressMs);
  }

  move(clientX: number, clientY: number): void {
    if (!this.origin) {
      return;
    }
    const travelled = Math.hypot(
      clientX - this.origin.x,
      clientY - this.origin.y,
    );
    if (travelled <= this.tolerancePx) {
      return;
    }
    this.clearTimer();
    this.origin = undefined;
    if (this.outcome === 'tap') {
      this.outcome = 'drag';
    }
  }

  settle(): void {
    this.clearTimer();
    this.origin = undefined;
  }

  end(): TouchGestureOutcome {
    const outcome = this.outcome;
    this.reset();
    return outcome;
  }

  private reset(): void {
    this.clearTimer();
    this.origin = undefined;
    this.outcome = 'none';
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

export const DOUBLE_TAP_MS = 300;

export class DoubleTap {
  private last: { target: unknown; timeStamp: number } | undefined;

  constructor(private readonly windowMs: number = DOUBLE_TAP_MS) {}

  happened(target: unknown, timeStamp: number): boolean {
    const paired =
      this.last !== undefined &&
      this.last.target === target &&
      timeStamp - this.last.timeStamp <= this.windowMs;
    this.last = paired ? undefined : { target, timeStamp };
    return paired;
  }
}

const sharedDoubleTap = new DoubleTap();

export function isDoubleActivation(sample: {
  pointerType: string;
  detail: number;
  target: unknown;
  timeStamp: number;
}): boolean {
  if (sample.pointerType !== 'touch') {
    return sample.detail === ONCLICK_DOUBLECLICK;
  }
  return sharedDoubleTap.happened(sample.target, sample.timeStamp);
}

export function shouldDrawSelectionMarquee(sample: {
  pointerType: string;
  button: number;
}): boolean {
  return sample.button === 0 && sample.pointerType !== 'touch';
}

// A touch that landed on a canvas widget's controls and might have meant the canvas behind it.
export class TouchPanHandoff {
  private last: { x: number; y: number } | undefined;
  private origin: { x: number; y: number } | undefined;
  private panning = false;

  constructor(private readonly slopPx: number = TOUCH_DRAG_SLOP_PX) {}

  start(clientX: number, clientY: number): void {
    this.origin = { x: clientX, y: clientY };
    this.last = { x: clientX, y: clientY };
    this.panning = false;
  }

  move(
    clientX: number,
    clientY: number,
  ): { dx: number; dy: number } | undefined {
    if (!this.origin || !this.last) {
      return undefined;
    }
    if (!this.panning) {
      const travelled = Math.hypot(
        clientX - this.origin.x,
        clientY - this.origin.y,
      );
      if (travelled <= this.slopPx) {
        return undefined;
      }
      this.panning = true;
    }
    const delta = { dx: clientX - this.last.x, dy: clientY - this.last.y };
    this.last = { x: clientX, y: clientY };
    return delta;
  }

  get hasPanned(): boolean {
    return this.panning;
  }

  end(): void {
    this.origin = undefined;
    this.last = undefined;
  }
}
