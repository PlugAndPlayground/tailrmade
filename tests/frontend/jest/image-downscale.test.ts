import {
  AI_IMAGE_MAX_EDGE,
  computeDownscaledSize,
} from '../../../src/utils/imageDownscale';

describe('computeDownscaledSize', () => {
  it('leaves an image that already fits alone', () => {
    expect(computeDownscaledSize(1200, 800)).toEqual({
      width: 1200,
      height: 800,
      scale: 1,
    });
  });

  it('fits the longest edge to the cap and keeps the aspect ratio', () => {
    const landscape = computeDownscaledSize(3200, 1800);
    expect(landscape.width).toBe(AI_IMAGE_MAX_EDGE);
    expect(landscape.height).toBe(844);
    expect(landscape.width / landscape.height).toBeCloseTo(3200 / 1800, 2);

    const portrait = computeDownscaledSize(1800, 3200);
    expect(portrait.height).toBe(AI_IMAGE_MAX_EDGE);
    expect(portrait.width).toBe(844);
  });

  it('honours a custom cap', () => {
    expect(computeDownscaledSize(4000, 2000, 500)).toEqual({
      width: 500,
      height: 250,
      scale: 0.125,
    });
  });

  it('never rounds an extreme aspect ratio down to zero pixels', () => {
    const sliver = computeDownscaledSize(6000, 3);
    expect(sliver.width).toBe(AI_IMAGE_MAX_EDGE);
    expect(sliver.height).toBe(1);
  });
});

// the encode path needs canvas, createImageBitmap and fetch, none of which the
// node test environment has, so it runs against stand ins that record what it
// asked them to do
interface DrawnSize {
  width: number;
  height: number;
}

interface BrowserStubOptions {
  bitmapWidth: number;
  bitmapHeight: number;
  blobType?: string;
  webp?: boolean;
  encodedLength?: number;
}

const installBrowserStubs = (options: BrowserStubOptions) => {
  const record = {
    drawn: [] as DrawnSize[],
    fills: 0,
    closed: 0,
    encodes: [] as [string, number][],
  };

  (global as any).fetch = async () => ({
    blob: async () => ({ type: options.blobType ?? 'image/png' }),
  });
  (global as any).createImageBitmap = async () => ({
    width: options.bitmapWidth,
    height: options.bitmapHeight,
    close: () => {
      record.closed += 1;
    },
  });
  (global as any).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        fillRect: () => {
          record.fills += 1;
        },
        drawImage: (
          _bitmap: unknown,
          _x: number,
          _y: number,
          width: number,
          height: number,
        ) => {
          record.drawn.push({ width, height });
        },
      }),
      toDataURL: (type: string, quality: number) => {
        record.encodes.push([type, quality]);
        if (type === 'image/webp' && options.webp === false) {
          return 'data:image/png;base64,probe';
        }
        return `data:${type};base64,${'x'.repeat(options.encodedLength ?? 8)}`;
      },
    }),
  };

  return record;
};

const loadModule = () => {
  let loaded: typeof import('../../../src/utils/imageDownscale') | undefined;
  jest.isolateModules(() => {
    loaded = require('../../../src/utils/imageDownscale');
  });
  return loaded!;
};

const PNG_URL = `data:image/png;base64,${'p'.repeat(4000)}`;

describe('downscaleImageForAI', () => {
  afterEach(() => {
    delete (global as any).document;
    delete (global as any).createImageBitmap;
  });

  it('fits an oversized capture to the cap and re-encodes it as webp', async () => {
    const record = installBrowserStubs({
      bitmapWidth: 3200,
      bitmapHeight: 1800,
    });
    const result = await loadModule().downscaleImageForAI(PNG_URL);

    expect(record.drawn).toEqual([{ width: 1500, height: 844 }]);
    expect(record.encodes.at(-1)).toEqual(['image/webp', 0.8]);
    expect(record.closed).toBe(1);
    expect(result.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('leaves a jpeg that already fits untouched', async () => {
    const record = installBrowserStubs({
      bitmapWidth: 1000,
      bitmapHeight: 800,
      blobType: 'image/jpeg',
    });
    const original = `data:image/jpeg;base64,${'j'.repeat(400)}`;

    expect(await loadModule().downscaleImageForAI(original)).toBe(original);
    expect(record.drawn).toEqual([]);
  });

  it('keeps the original when the re-encode came out bigger', async () => {
    installBrowserStubs({
      bitmapWidth: 900,
      bitmapHeight: 600,
      encodedLength: PNG_URL.length,
    });

    expect(await loadModule().downscaleImageForAI(PNG_URL)).toBe(PNG_URL);
  });

  it('mattes onto white and falls back to jpeg without webp encoding', async () => {
    const record = installBrowserStubs({
      bitmapWidth: 3000,
      bitmapHeight: 3000,
      webp: false,
    });
    const result = await loadModule().downscaleImageForAI(PNG_URL);

    expect(record.fills).toBe(1);
    expect(record.encodes.at(-1)).toEqual(['image/jpeg', 0.8]);
    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('passes an image through rather than losing it when decoding fails', async () => {
    installBrowserStubs({ bitmapWidth: 3000, bitmapHeight: 3000 });
    (global as any).createImageBitmap = async () => {
      throw new Error('decode failed');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await loadModule().downscaleImageForAI(PNG_URL)).toBe(PNG_URL);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves an empty attachment list alone', async () => {
    expect(await loadModule().downscaleImagesForAI(undefined)).toBe(undefined);
    expect(await loadModule().downscaleImagesForAI([])).toEqual([]);
  });
});
