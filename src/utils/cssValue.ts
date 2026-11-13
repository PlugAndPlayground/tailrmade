// Strings from an app file or from a running app end up inside real
// stylesheets. These checks keep such a string a plain value: it cannot end
// its declaration, open a rule, or make the browser contact another site.

const BREAKS_OUT = /[;{}<>\\@\n\r]|\/\*/;
const ADDRESS = /url\s*\(|image-set\s*\(|src\s*\(/i;
const EMBEDDED_IMAGE = /url\(\s*(["']?)data:image\/[^)]*\1\s*\)/gi;
// A path on Tailrmade's own site. One leading slash only: two name a host.
const OWN_SITE_IMAGE = /url\(\s*(["']?)\/(?!\/)[\w./%~-]*\1\s*\)/gi;

export const isCssValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  !BREAKS_OUT.test(value) &&
  !ADDRESS.test(value);

// Custom styles may also carry an image as data, which contacts nobody, or
// one served by Tailrmade itself.
const isCustomStyleValue = (value: unknown): boolean => {
  if (typeof value === 'number') return true;
  if (typeof value !== 'string') return false;
  const rest = value.replace(EMBEDDED_IMAGE, '').replace(OWN_SITE_IMAGE, '');
  return !BREAKS_OUT.test(rest) && !ADDRESS.test(rest);
};

const PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/;
const STATE = String.raw`::?[a-zA-Z-]+(?:\([a-zA-Z0-9\s+-]*\))?`;
const ATTRIBUTE = String.raw`\[[\w-]+(?:[~|^$*]?=(?:"[^"\\\]]*"|'[^'\\\]]*'|[\w-]+))?\]`;
const PART = String.raw`(?:[.#][\w-]+|${ATTRIBUTE}|${STATE})`;
const ELEMENT = String.raw`(?:(?:\*|[a-zA-Z][\w-]*)${PART}*|${PART}+)`;
// Responsive blocks, states of the element itself, and elements inside it
// ("& img", "& > .row"). Anything else could reach outside the widget: a
// selector without "&", a sibling combinator, or a list.
const NESTED_BLOCK = new RegExp(
  String.raw`^(?:@(?:media|container|supports)\s[^{};]+|&(?:${STATE})*(?:(?:\s*>\s*|\s+)${ELEMENT})*)$`,
);
// Taken out of the widget's own box, so it could cover the rest of Tailrmade.
// Sticky stays inside its parent and is kept.
const ESCAPES_BOX = /^\s*fixed\s*$/i;

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
      if (depth < 2 && key !== '&' && NESTED_BLOCK.test(key)) {
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
