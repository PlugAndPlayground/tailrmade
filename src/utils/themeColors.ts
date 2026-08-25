import { TRgba } from './color';

// A color slot that defers to the theme instead of naming a value.
//
// 'inherit' is a real CSS keyword, so it can be handed straight to the style
// object - no omission logic, and it round-trips through serialization as an
// ordinary string. That is why foregrounds use it rather than alpha 0:
// transparent text is invisible, not inherited.
export const INHERIT_COLOR = 'inherit';

export type ColorSetting =
  | Record<'r' | 'g' | 'b' | 'a', number>
  | typeof INHERIT_COLOR;

export const isInheritColor = (value: unknown): boolean =>
  value === INHERIT_COLOR;

/**
 * CSS for a color slot. Anything that is not a stored rgba object falls back
 * to inheriting, so a value written by a newer build - or a corrupted one -
 * degrades to the theme rather than to black.
 */
export const colorSettingToCss = (value: unknown): string => {
  if (value === null || value === undefined || typeof value === 'string') {
    return INHERIT_COLOR;
  }
  // keyed assignment rather than Object.values(): the stored key order is not
  // guaranteed to be r,g,b,a and templating the values directly scrambles the
  // channels when it is not
  return Object.assign(new TRgba(), value).toString();
};

/** The alpha-0 background that lets the themed surface show through. */
export const TRANSPARENT_COLOR = { r: 0, g: 0, b: 0, a: 0 };
