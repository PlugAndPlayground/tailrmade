import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  shouldDrawSelectionMarquee,
  TouchGesture,
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
    gesture.move(100 + LONG_PRESS_MOVE_TOLERANCE_PX, 100);
    jest.advanceTimersByTime(LONG_PRESS_MS);
    expect(fired).toEqual(['node-a']);
  });

  it('gives up as soon as the finger travels - that is a pan', () => {
    gesture.start(touch(100, 100), 'node-a');
    gesture.move(100 + LONG_PRESS_MOVE_TOLERANCE_PX + 1, 100);
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
