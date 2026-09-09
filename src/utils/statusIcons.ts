import * as PIXI from 'pixi.js';
import {
  ICON_BADGE_SVG_RESOLUTION,
  STATUS_COMMENT_ICON_TEXTURE,
  STATUS_ERROR_ICON_TEXTURE,
  STATUS_WARNING_ICON_TEXTURE,
} from './constants';

export type StatusIconKind = 'error' | 'warning' | 'comment';

const SOURCES: Record<StatusIconKind, string> = {
  error: STATUS_ERROR_ICON_TEXTURE,
  warning: STATUS_WARNING_ICON_TEXTURE,
  comment: STATUS_COMMENT_ICON_TEXTURE,
};

let loadPromise: Promise<void> | undefined;
const textures: Partial<Record<StatusIconKind, PIXI.Texture>> = {};

async function loadOne(kind: StatusIconKind): Promise<void> {
  const src = SOURCES[kind];
  await PIXI.Assets.load({
    src,
    data: {
      resolution: ICON_BADGE_SVG_RESOLUTION,
      parseAsGraphicsContext: false,
    },
  });
  textures[kind] = PIXI.Texture.from(src);
}

export function loadStatusIcons(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all(
      (Object.keys(SOURCES) as StatusIconKind[]).map((kind) => loadOne(kind)),
    )
      .then(() => undefined)
      .catch((error) => {
        console.error('Could not load the status icons', error);
      });
  }
  return loadPromise;
}

export function getStatusIconTexture(
  kind: StatusIconKind,
): PIXI.Texture | undefined {
  return textures[kind];
}
