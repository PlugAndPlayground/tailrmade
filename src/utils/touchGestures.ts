// Touch gestures the canvas has no other way to express.
//
// A mouse has three buttons, a hover state and pixel precision; a finger has
// none of those. Panning, zooming and node dragging all fall out of
// pixi-viewport and the federated event system for free, but two things do
// not: a finger has no second button to open a context menu with, and it has
// no way to say "I meant to tap, not to drag". Both are decided by TIME and
// DISTANCE rather than by which button was pressed, which is what this
// tracker turns into a single answer.
//
// It is deliberately free of PIXI and DOM types so the rules can be tested
// on their own - see tests/frontend/jest/touch-gestures.test.ts.

// Roughly the platform convention: iOS opens its callout at ~500ms, Android's
// ViewConfiguration long-press timeout is 500ms.
export const LONG_PRESS_MS = 500;

// Deliberately larger than the 5px used for a mouse click (see
// NODE_CLICK_DRAG_THRESHOLD_PX): a finger holding still on glass still wanders
// several pixels, and a tolerance that tight would turn most long presses into
// pans.
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export type TouchGestureOutcome =
  // no touch gesture was in flight (a mouse, a pen, a second finger)
  | 'none'
  // went down and came up in the same place, quickly
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
 * it happens while the finger is still down - that is the whole point of it,
 * and a menu that only appeared on release would feel like a slow tap.
 * Everything else is reported by `end()`, once the gesture is over.
 */
export class TouchGesture<TPayload> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin: { x: number; y: number } | undefined;
  private outcome: TouchGestureOutcome = 'none';

  constructor(
    private readonly onLongPress: (payload: TPayload) => void,
    private readonly longPressMs: number = LONG_PRESS_MS,
    private readonly tolerancePx: number = LONG_PRESS_MOVE_TOLERANCE_PX,
  ) {}

  /**
   * A pointer went down. Anything that is not a PRIMARY TOUCH - a mouse, a
   * pen, or the second finger of a pinch - abandons whatever was in flight
   * rather than starting something new: a pinch must never end up opening a
   * context menu, and a mouse has a real right button to use instead.
   *
   * `payload` is whatever the caller needs to act on later. Pass a snapshot,
   * not a live event: PIXI recycles its event objects, so by the time the
   * timer fires the original has been reused for another pointer.
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
   * Past the tolerance the finger is travelling, so this is a pan or a drag:
   * the pending long press is called off and a tap is no longer possible.
   *
   * A long press that has ALREADY fired stays fired - the menu is open and
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
   * The finger is up: nothing more can change, so the pending long press is
   * called off - but WHAT the gesture was is kept for `end()` to report.
   *
   * Separate from `end()` because two listeners see the release and neither
   * can be trusted to be the one that runs: PIXI dispatches its own pointerup
   * from a window capture listener, and a target that stops propagation can
   * keep that dispatch from reaching the canvas handler at all. Settling from
   * the window guarantees no timer outlives the touch, in either order.
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

  /** True while a finger is down and could still become a tap or long press. */
  get isTracking(): boolean {
    return this.origin !== undefined;
  }

  private reset(): void {
    this.clearTimer();
    this.origin = undefined;
    this.outcome = 'none';
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

/**
 * Whether a press on the empty canvas should start a rubber-band selection.
 *
 * A finger cannot do both: pixi-viewport's drag plugin ignores its
 * `mouseButtons` option for touch input, so the canvas is already panning by
 * the time this is asked - drawing a marquee as well means one gesture doing
 * two contradictory things. On touch the canvas pans and selection is done by
 * tapping nodes instead.
 *
 * This asks the EVENT, not the user agent. `isPhone()` is a user-agent guess
 * and iPadOS Safari reports itself as a Mac, so every tablet was marquee-ing
 * while the canvas panned underneath it - and a touchscreen laptop is a mouse
 * one moment and a finger the next, which no global flag can describe.
 */
export function shouldDrawSelectionMarquee(sample: {
  pointerType: string;
  button: number;
}): boolean {
  return sample.button === 0 && sample.pointerType !== 'touch';
}
