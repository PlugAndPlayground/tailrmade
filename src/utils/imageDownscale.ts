/**
 * Everything on its way to a model gets shrunk here first.
 *
 * Attachments arrive at full device resolution: a retina screen capture is a
 * 3000x2000 png, which is ~8MB once base64 has inflated it by a third, and the
 * agentic loop re-sends every attachment with each turn. The relay rejects
 * bodies that big with a 413, and even when it does not, the extra pixels buy
 * nothing - the models downsample far below this internally anyway.
 *
 * Dom free maths lives in `computeDownscaledSize` so it can be unit tested.
 */

/** longest edge of what we send, in pixels */
export const AI_IMAGE_MAX_EDGE = 1500;

/** lossy encoder quality for the re-encode */
export const AI_IMAGE_QUALITY = 0.8;

/** re-encoding one of these gains nothing but artefacts */
const LOSSY_MIME_TYPES = new Set(['image/jpeg', 'image/webp']);

export interface DownscaleOptions {
  maxEdge?: number;
  quality?: number;
}

export interface DownscaledSize {
  width: number;
  height: number;
  /** 1 when the image already fits, so callers can tell a resize from a no-op */
  scale: number;
}

/** Aspect preserving fit into a `maxEdge` box. Never scales up. */
export const computeDownscaledSize = (
  width: number,
  height: number,
  maxEdge: number = AI_IMAGE_MAX_EDGE,
): DownscaledSize => {
  const longestEdge = Math.max(width, height);
  const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
};

// canvas silently hands back a png when it cannot encode the requested type,
// so the support probe is a round trip rather than a feature check
let webpEncoding: boolean | undefined;

const supportsWebpEncoding = (): boolean => {
  if (webpEncoding === undefined) {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpEncoding = probe.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpEncoding;
};

const resize = async (
  dataURL: string,
  { maxEdge = AI_IMAGE_MAX_EDGE, quality = AI_IMAGE_QUALITY }: DownscaleOptions,
): Promise<string> => {
  const decoded = await fetch(dataURL).then((response) => response.blob());
  const bitmap = await createImageBitmap(decoded);
  const size = computeDownscaledSize(bitmap.width, bitmap.height, maxEdge);

  if (size.scale === 1 && LOSSY_MIME_TYPES.has(decoded.type)) {
    bitmap.close();
    return dataURL;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return dataURL;
  }

  const useWebp = supportsWebpEncoding();
  if (!useWebp) {
    // jpeg has no alpha channel and renders transparency black, so the
    // fallback gets a white page to sit on
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encoded = canvas.toDataURL(
    useWebp ? 'image/webp' : 'image/jpeg',
    quality,
  );
  // a flat ui screenshot that already fits can compress better as the png it
  // came in as, and nothing was lost by asking
  if (size.scale === 1 && encoded.length >= dataURL.length) {
    return dataURL;
  }
  return encoded;
};

/**
 * Scales `dataURL` to fit AI_IMAGE_MAX_EDGE and re-encodes it lossily.
 * Never throws: an image we cannot decode is passed through untouched, since
 * sending it oversized still beats losing the user's attachment.
 */
export const downscaleImageForAI = async (
  dataURL: string,
  options: DownscaleOptions = {},
): Promise<string> => {
  try {
    return await resize(dataURL, options);
  } catch (error) {
    console.warn('Could not downscale an image for the AI request', error);
    return dataURL;
  }
};

export const downscaleImagesForAI = async (
  images: string[] | undefined,
  options: DownscaleOptions = {},
): Promise<string[] | undefined> => {
  if (!images?.length) {
    return images;
  }
  return Promise.all(
    images.map((image) => downscaleImageForAI(image, options)),
  );
};
