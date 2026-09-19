/**
 * width/height on a dashboard item are raw css strings ('auto', '100%',
 * '240px'). Nothing enforced that until a number got written into one and the
 * whole dashboard went down with `height.endsWith is not a function` - a value
 * a generated layout produces easily, since "make it 240 tall" reads as a
 * number to anything that is not a css parser.
 *
 * Two jobs, deliberately separate:
 * - `asCssDimension` is the renderer's guard. It never throws and never
 *   refuses, because by the time a value reaches the renderer it is already
 *   saved in someone's app: a graph that was written badly must still open.
 * - `normalizeDimension` is the write-path check. It corrects what is
 *   obviously meant, refuses what is not, and reports either way so the
 *   caller can tell whoever wrote it.
 *
 * Kept free of app imports so it stays cheap to use and to unit test.
 */

/**
 * Props on a layout item whose value is a plain css dimension.
 *
 * `maxWidth` is deliberately NOT one of them: the root container takes MUI
 * breakpoint tokens there ('xs'...'xl', or false - see getRootMaxWidth in
 * components/dashboard/Container.tsx), so validating it as css would strip the
 * default off every layout that compiles.
 */
export const CSS_DIMENSION_KEYS = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxHeight',
] as const;

const UNITS =
  'px|%|em|rem|ch|ex|vh|vw|vmin|vmax|svh|svw|lvh|lvw|dvh|dvw|cm|mm|in|pt|pc|fr';

const CSS_LENGTH = new RegExp(`^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:${UNITS})$`);

const KEYWORDS = new Set([
  'auto',
  'none',
  'unset',
  'inherit',
  'initial',
  'revert',
  'fit-content',
  'max-content',
  'min-content',
  '0',
]);

/** a bare number, as a number or as a string of digits */
const BARE_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

type DimensionReading =
  | { status: 'valid'; value: string }
  | { status: 'coerced'; value: string }
  | { status: 'unusable' };

/**
 * The one place that decides what a dimension is. Everything below is a
 * different answer to "and what should happen then" - the renderer wants a
 * string it can use, the write paths want to say what they corrected - so they
 * differ in reporting, never in what counts as valid.
 */
const readDimension = (value: unknown): DimensionReading => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { status: 'coerced', value: `${value}px` }
      : { status: 'unusable' };
  }
  if (typeof value !== 'string') {
    return { status: 'unusable' };
  }
  const trimmed = value.trim();
  // valid first: a unitless "0" is legal css, and reading it as a coercion
  // would rewrite a correct value and warn about it
  if (isCssDimensionString(trimmed)) {
    return { status: 'valid', value: trimmed };
  }
  return BARE_NUMBER.test(trimmed)
    ? { status: 'coerced', value: `${trimmed}px` }
    : { status: 'unusable' };
};

const isCssDimensionString = (trimmed: string): boolean =>
  KEYWORDS.has(trimmed) ||
  CSS_LENGTH.test(trimmed) ||
  // calc/clamp/min/max are passed through unchecked: parsing css expressions
  // here would be its own project, and an invalid one is ignored by the
  // browser rather than fatal
  /^(?:calc|clamp|min|max)\(/.test(trimmed);

/** Already a css dimension - no coercion needed, nothing to report. */
export const isCssDimension = (value: unknown): value is string =>
  readDimension(value).status === 'valid';

/**
 * What the renderer should use. Junk becomes the fallback rather than blowing
 * up the dashboard, and a bare number becomes pixels - which is what it was
 * meant to be everywhere this has actually gone wrong. Never throws, never
 * reports: by the time a value reaches the renderer it is already saved in
 * someone's app, and that app has to open.
 */
export const asCssDimension = (value: unknown, fallback = 'auto'): string => {
  const reading = readDimension(value);
  return reading.status === 'unusable' ? fallback : reading.value;
};

export interface NormalizedDimension {
  /** undefined when the value could not be salvaged and should be dropped */
  value?: string;
  /** set whenever the input was not already a valid css dimension */
  warning?: string;
}

/**
 * The write-path counterpart of `asCssDimension`: same rules, but it says what
 * it did instead of quietly repairing, so whoever wrote the bad value learns
 * the format. `label` names the property, e.g. `'widget "ai-node-3" "height"'`.
 */
export const normalizeDimension = (
  value: unknown,
  label: string,
): NormalizedDimension => {
  const reading = readDimension(value);
  if (reading.status === 'valid') {
    return { value: reading.value };
  }
  if (reading.status === 'coerced') {
    return {
      value: reading.value,
      warning: `${label}: ${JSON.stringify(value)} is not a css value, read as "${reading.value}". Dimensions are css strings - use "240px", "100%" or "auto".`,
    };
  }
  return {
    warning: `${label}: ${JSON.stringify(value)} is not a usable css dimension and was ignored. Use "240px", "100%" or "auto".`,
  };
};

/**
 * Normalizes every dimension prop on a compiled layout item, returning a
 * corrected copy (the input is never mutated) and appending any warnings.
 *
 * `fallbacks` is the defaults object the props were built from: a value too
 * broken to salvage reverts to its default rather than vanishing, since an
 * absent width or height is its own kind of broken downstream.
 */
export const normalizeDimensionProps = (
  props: Record<string, unknown>,
  label: string,
  warnings: string[],
  fallbacks: Record<string, unknown> = {},
): Record<string, unknown> => {
  let corrected: Record<string, unknown> | undefined;
  for (const key of CSS_DIMENSION_KEYS) {
    if (!(key in props) || isCssDimension(props[key])) {
      continue;
    }
    const normalized = normalizeDimension(props[key], `${label} "${key}"`);
    if (normalized.warning) {
      warnings.push(normalized.warning);
    }
    corrected = corrected ?? { ...props };
    const replacement = normalized.value ?? fallbacks[key];
    if (replacement === undefined) {
      delete corrected[key];
    } else {
      corrected[key] = replacement;
    }
  }
  return corrected ?? props;
};
