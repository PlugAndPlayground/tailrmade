import {
  TOUCH_DRAG_SLOP_PX,
  LONG_PRESS_MS,
  shouldDrawSelectionMarquee,
  TouchGesture,
  TouchPanHandoff,
} from '../../../src/utils/touchGestures';

const touch = (clientX = 0, clientY = 0) => ({
  pointerType: 'touch',
  isPrimary: true,
  clientX,
  clientY,
});

describe("long press as the finger's right click", () => {
  let fired: string[];
  let gesture: TouchGesture<string>;

  beforeEach(() => {
    jest.useFakeTimers();
    fired = [];
    gesture = new TouchGesture<string>((payload) => fired.push(payload));
  });
  afterEach(() => jest.useRealTimers());

  it('opens the menu while the finger is still down', () => {
    gesture.start(touch(), 'node-a');
    jest.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).toEqual(['node-a']);
    expect(gesture.end()).toBe('long-press');
  });

  it('carries the payload captured at press time, not at fire time', () => {
    gesture.start(touch(), 'first');
    gesture.end();
    gesture.start(touch(), 'second');
    jest.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).toEqual(['second']);
  });

  it('tolerates the wander of a finger holding still', () => {
    gesture.start(touch(100, 100), 'node-a');
    gesture.move(100 + TOUCH_DRAG_SLOP_PX, 100);
    jest.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).toEqual(['node-a']);
  });

  it('gives up as soon as the finger travels - that is a pan', () => {
    gesture.start(touch(100, 100), 'node-a');
    gesture.move(100 + TOUCH_DRAG_SLOP_PX + 1, 100);
    jest.advanceTimersByTime(LONG_PRESS_MS * 4);
    expect(fired).toEqual([]);
    expect(gesture.end()).toBe('drag');
  });

  it('stays a long press even if the finger moves after the menu opened', () => {
    gesture.start(touch(100, 100), 'node-a');
    jest.advanceTimersByTime(LONG_PRESS_MS);
    gesture.move(400, 400);
    expect(gesture.end()).toBe('long-press');
  });

  // a pinch must never end up opening a context menu
  it('abandons the press when a second finger lands', () => {
    gesture.start(touch(), 'node-a');
    gesture.start({ ...touch(), isPrimary: false }, 'node-a');
    jest.advanceTimersByTime(LONG_PRESS_MS * 4);
    expect(fired).toEqual([]);
    expect(gesture.end()).toBe('none');
  });

  it('ignores a mouse, which has a real right button of its own', () => {
    gesture.start({ ...touch(), pointerType: 'mouse' }, 'node-a');
    jest.advanceTimersByTime(LONG_PRESS_MS * 4);
    expect(fired).toEqual([]);
    expect(gesture.end()).toBe('none');
  });

  it('reports a quick press and release as a tap', () => {
    gesture.start(touch(100, 100), 'canvas');
    jest.advanceTimersByTime(LONG_PRESS_MS - 1);
    gesture.settle();
    expect(gesture.end()).toBe('tap');
    expect(fired).toEqual([]);
  });

  // the whole point of settle(): whichever listener sees the release first,
  // no timer may outlive the touch and fire a menu at an empty screen
  it('never fires after the finger is up, whoever ends the gesture', () => {
    gesture.start(touch(), 'node-a');
    gesture.settle();
    jest.advanceTimersByTime(LONG_PRESS_MS * 4);
    expect(fired).toEqual([]);
    // settling keeps WHAT it was, so the canvas handler can still read it
    expect(gesture.end()).toBe('tap');
  });

  it('forgets the outcome once it has been read', () => {
    gesture.start(touch(), 'node-a');
    gesture.settle();
    expect(gesture.end()).toBe('tap');
    expect(gesture.end()).toBe('none');
  });
});

describe('marquee vs pan', () => {
  it('lets a mouse drag out a selection rectangle', () => {
    expect(
      shouldDrawSelectionMarquee({ pointerType: 'mouse', button: 0 }),
    ).toBe(true);
  });

  // one finger cannot both pan and marquee, and pixi-viewport is already
  // panning by the time this is asked
  it('leaves the canvas to pan under a finger', () => {
    expect(
      shouldDrawSelectionMarquee({ pointerType: 'touch', button: 0 }),
    ).toBe(false);
  });

  it('still ignores the non-primary mouse buttons', () => {
    expect(
      shouldDrawSelectionMarquee({ pointerType: 'mouse', button: 2 }),
    ).toBe(false);
  });
});

describe('reaching the canvas through a widget control', () => {
  let handoff: TouchPanHandoff;
  beforeEach(() => {
    handoff = new TouchPanHandoff();
    handoff.start(100, 100);
  });

  it('leaves a press with the control it landed on', () => {
    expect(handoff.move(100 + TOUCH_DRAG_SLOP_PX, 100)).toBeUndefined();
    expect(handoff.hasPanned).toBe(false);
  });

  // the finger has already travelled that far - reporting only the last step
  // would leave the canvas lagging behind it by the whole slop distance
  it('hands over the full distance travelled on the move that commits', () => {
    const delta = handoff.move(100 + TOUCH_DRAG_SLOP_PX + 5, 100);
    expect(delta).toEqual({ dx: TOUCH_DRAG_SLOP_PX + 5, dy: 0 });
    expect(handoff.hasPanned).toBe(true);
  });

  // the caller applies each delta to a viewport that is moving under the
  // finger, so anything measured from the original press would double-count
  it('reports each later move as a step, not as a total', () => {
    handoff.move(200, 100);
    expect(handoff.move(210, 130)).toEqual({ dx: 10, dy: 30 });
    expect(handoff.move(205, 130)).toEqual({ dx: -5, dy: 0 });
  });

  it('keeps panning once committed, even back inside the slop', () => {
    handoff.move(200, 200);
    expect(handoff.move(100, 100)).toEqual({ dx: -100, dy: -100 });
    expect(handoff.hasPanned).toBe(true);
  });

  it('reports nothing after the gesture ends', () => {
    handoff.end();
    expect(handoff.move(500, 500)).toBeUndefined();
  });
});
