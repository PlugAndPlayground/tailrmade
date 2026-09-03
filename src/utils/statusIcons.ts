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

// The badge icons are drawn white with their detail punched out, so a sprite
// tint recolours them to any severity colour - the same trick ButtonClass uses
// for the node header icons. parseAsGraphicsContext must stay false or pixi
// hands back a graphics context, which cannot be tinted.
//
// drawStatusBadge is synchronous and runs on every node redraw, so the textures
// are loaded once up front and read from this cache afterwards. The promise is
// shared: every node awaits the same load rather than racing its own.
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
        // a missing icon must not stop a node from drawing - the badge simply
        // does not appear, and the border still reports the problem
        console.error('Could not load the status icons', error);
      });
  }
  return loadPromise;
}

// Undefined until loadStatusIcons has resolved. Callers draw nothing rather
// than blocking a redraw on a network fetch.
export function getStatusIconTexture(
  kind: StatusIconKind,
): PIXI.Texture | undefined {
  return textures[kind];
}
