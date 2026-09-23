import { waitForFrames } from '../../../src/utils/waitForFrames';
import { captureForAI } from '../../../src/services/AIVisionService';
import { capture } from '../../../src/services/CaptureService';

jest.mock('../../../src/InterfaceController', () => ({}));
jest.mock('../../../src/components/userPreferencesStore', () => ({}));
jest.mock('../../../src/services/CaptureService', () => ({
  capture: jest.fn(async () => ({ dataURL: 'data:image/png;base64,AAAA' })),
}));
jest.mock('../../../src/utils/imageDownscale', () => ({
  AI_IMAGE_MAX_EDGE: 1000,
  downscaleImageForAI: jest.fn(async (data: string) => data),
}));

describe('background capture scheduling', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  let hidden: boolean;
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;

  beforeEach(() => {
    jest.useFakeTimers();
    hidden = false;
    callbacks = new Map();
    nextId = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setTimeout,
        clearTimeout,
        requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
          callbacks.set(++nextId, callback);
          return nextId;
        }),
        cancelAnimationFrame: jest.fn((id: number) => callbacks.delete(id)),
      },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get hidden() {
          return hidden;
        },
      },
    });
  });

  afterEach(() => {
    for (const [key, descriptor] of [
      ['window', originalWindow],
      ['document', originalDocument],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const renderFrame = async () => {
    for (const [id, callback] of [...callbacks]) {
      callbacks.delete(id);
      callback(0);
    }
    await Promise.resolve();
  };

  it('waits for two frames while visible and cleans up its timers', async () => {
    const done = jest.fn();
    const waiting = waitForFrames().then(done);
    await renderFrame();
    expect(done).not.toHaveBeenCalled();
    await renderFrame();
    await waiting;
    expect(done).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(callbacks.size).toBe(0);
  });

  it('completes an AI capture when the tab is already hidden', async () => {
    hidden = true;
    const result = captureForAI('dashboard');
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ source: 'dashboard' });
    expect(capture).toHaveBeenCalledWith('User interface');
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('finishes and cancels pending frames if hidden during either frame', async () => {
    for (const completedFrames of [0, 1]) {
      hidden = false;
      const waiting = waitForFrames();
      if (completedFrames === 1) await renderFrame();
      hidden = true;
      await jest.runAllTimersAsync();
      await waiting;
      expect(callbacks.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    }
  });
});
