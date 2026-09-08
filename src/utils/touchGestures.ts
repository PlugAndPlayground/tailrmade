// Touch gestures the canvas has no other way to express. Panning, zooming and
// node dragging fall out of pixi-viewport for free; a context menu and a
// deliberate tap do not, because a finger has no second button and no way to
// say "I meant to tap, not to drag". Both are decided by time and distance.
//
// Free of PIXI and DOM types so the rules can be tested on their own - see
// tests/frontend/jest/touch-gestures.test.ts.

// Roughly the platform convention: iOS opens its callout at ~500ms, Android's
// ViewConfiguration long-press timeout is 500ms.
export const LONG_PRESS_MS = 500;

// How far a finger may wander before it counts as travelling. Deliberately
// larger than the 5px used for a mouse click (NODE_CLICK_DRAG_THRESHOLD_PX): a
// finger holding still on glass still moves several pixels. One constant,
// because a press that has moved too far to be a long press is exactly a press
// that has moved far enough to be a pan.
export const TOUCH_DRAG_SLOP_PX = 10;

export type TouchGestureOutcome =
  // no touch gesture was in flight (a mouse, a pen, a second finger)
  | 'none'
  | 'tap'
  // stayed put long enough that onLongPress has ALREADY been called
  | 'long-press'
  // travelled far enough to be a pan, a node drag or a pinch
  | 'drag';

export type TouchGestureSample = {
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
};

/**
 * Watches one touch from press to release and says what it turned out to be.
 *
 * The long press is reported by callback rather than by return value because
 * it happens while the finger is still down - a menu that only appeared on
 * release would feel like a slow tap. Everything else is reported by `end()`.
 */
export class TouchGesture<TPayload> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin: { x: number; y: number } | undefined;
  private outcome: TouchGestureOutcome = 'none';

  constructor(
    private readonly onLongPress: (payload: TPayload) => void,
    private readonly longPressMs: number = LONG_PRESS_MS,
    private readonly tolerancePx: number = TOUCH_DRAG_SLOP_PX,
  ) {}

  /**
   * A pointer went down. Anything that is not a primary touch - a mouse, a pen
   * or the second finger of a pinch - abandons whatever was in flight rather
   * than starting something new.
   *
   * `payload` must be a snapshot, not a live event: PIXI recycles its event
   * objects, so by the time the timer fires the original has been reused.
   */
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

  /**
   * Past the tolerance the finger is travelling, so this is a pan or a drag. A
   * long press that has already fired stays fired - the menu is open, and
   * moving afterwards must not retroactively turn it into a drag.
   */
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

  /**
   * The finger is up: the pending long press is called off, but what the
   * gesture was is kept for `end()` to report.
   *
   * Separate from `end()` because two listeners see the release and neither
   * can be trusted to be the one that runs: PIXI dispatches its own pointerup
   * from a window capture listener, and a target that stops propagation can
   * keep that dispatch from reaching the canvas handler at all.
   */
  settle(): void {
    this.clearTimer();
    this.origin = undefined;
  }

  /** Ends the gesture and reports what it was. Reading it clears it. */
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

/**
 * Whether a press on the empty canvas should start a rubber-band selection.
 *
 * A finger cannot do both: pixi-viewport's drag plugin ignores its
 * `mouseButtons` option for touch input, so the canvas is already panning by
 * the time this is asked. This asks the EVENT rather than the user agent -
 * `isPhone()` is a guess, iPadOS Safari reports itself as a Mac, and a
 * touchscreen laptop is a mouse one moment and a finger the next.
 */
export function shouldDrawSelectionMarquee(sample: {
  pointerType: string;
  button: number;
}): boolean {
  return sample.button === 0 && sample.pointerType !== 'touch';
}

/**
 * A touch that landed on a canvas widget's controls and might have meant the
 * canvas behind it.
 *
 * The controls are the only part of a canvas widget that takes pointer events
 * (see getCanvasGrabThroughSx), which leaves them as dead spots for panning.
 * So the gesture is left with the control until it travels, and handed to the
 * canvas after that. Movement is reported as a per-move delta rather than a
 * total, because the caller applies it to a viewport that is moving underneath
 * the finger.
 */
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

  /**
   * How far the canvas should move, or undefined while the control still owns
   * the gesture. The move that crosses the threshold reports the whole
   * distance travelled so far, so the canvas does not jump backwards.
   */
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

  /** True once the canvas took the gesture - the control must not fire. */
  get hasPanned(): boolean {
    return this.panning;
  }

  end(): void {
    this.origin = undefined;
    this.last = undefined;
  }
}
