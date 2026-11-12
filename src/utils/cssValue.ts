// Strings from an app file or from a running app end up inside real
// stylesheets. These checks keep such a string a plain value: it cannot end
// its declaration, open a rule, or make the browser contact another site.

const BREAKS_OUT = /[;{}<>\\@\n\r]|\/\*/;
const ADDRESS = /url\s*\(|image-set\s*\(|src\s*\(/i;
const EMBEDDED_IMAGE = /url\(\s*(["']?)data:image\/[^)]*\1\s*\)/gi;

export const isCssValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  !BREAKS_OUT.test(value) &&
  !ADDRESS.test(value);

// Custom styles may also carry an image as data, which contacts nobody.
const isCustomStyleValue = (value: unknown): boolean =>
  typeof value === 'number' ||
  (typeof value === 'string' &&
    !BREAKS_OUT.test(value.replace(EMBEDDED_IMAGE, '')) &&
    !ADDRESS.test(value.replace(EMBEDDED_IMAGE, '')));

const PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/;
// Responsive blocks and states of the element itself. Any other nested key
// is a selector, which could reach elements outside the widget.
const NESTED_BLOCK =
  /^(@(media|container|supports)\s[^{};]+|&(::?[a-zA-Z-]+(\([a-zA-Z0-9\s+-]*\))?)+)$/;
// Taken out of the widget's own box, so it could cover the rest of Tailrmade.
const ESCAPES_BOX = /^\s*(fixed|sticky)\s*$/i;

export function sanitizeCustomStyles(
  styles: unknown,
  depth = 0,
): Record<string, unknown> {
  if (typeof styles !== 'object' || styles === null || Array.isArray(styles)) {
    return {};
  }
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === 'object' && value !== null) {
      if (depth < 2 && NESTED_BLOCK.test(key)) {
        safe[key] = sanitizeCustomStyles(value, depth + 1);
      }
      continue;
    }
    if (!PROPERTY.test(key) || !isCustomStyleValue(value)) continue;
    if (key.toLowerCase() === 'position' && ESCAPES_BOX.test(String(value))) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}
