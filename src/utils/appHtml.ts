import DOMPurify from 'dompurify';
import isUrl from 'is-url';

// 'none' for markup placed in Tailrmade's own page, where a stylesheet would
// reach the rest of the interface. 'scoped' keeps stylesheets but confines them
// to `scope`. 'page' is for markup that gets a document of its own.
type StyleHandling = 'none' | 'scoped' | 'page';

// Not supported means no DOM, as in unit tests: nothing renders there.
if (DOMPurify.isSupported) {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

// Rules come back out of the parser, so a stylesheet cannot close the scope
// block early. A browser without @scope drops the stylesheet.
function scopeStyleBlocks(markup: string, scope: string): string {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const styles = template.content.querySelectorAll('style');
  if (!styles.length) return markup;
  styles.forEach((style) => {
    try {
      if (typeof CSSScopeRule === 'undefined') throw new Error('No @scope');
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(style.textContent ?? '');
      const rules = Array.from(sheet.cssRules, (rule) => rule.cssText);
      style.textContent = `@scope (${scope}) {\n${rules.join('\n')}\n}`;
    } catch {
      style.remove();
    }
  });
  return template.innerHTML;
}

// Forms are removed everywhere: a form posts what a person types to an
// address without any node asking for it.
export function sanitizeAppHtml(
  markup: string,
  styles: StyleHandling = 'none',
  scope = '',
): string {
  if (typeof markup !== 'string') return '';
  const sanitized = DOMPurify.sanitize(markup, {
    ADD_ATTR: ['target'],
    ADD_TAGS: styles === 'none' ? [] : ['style'],
    FORBID_TAGS: styles === 'none' ? ['style', 'form'] : ['form'],
  });
  return styles === 'scoped' ? scopeStyleBlocks(sanitized, scope) : sanitized;
}

// Sanitizing encodes the ">" of a partial call ({{> name}}). Only that
// character is restored: decoding anything else would hand markup back to the
// page after the sanitizer has finished.
export function restoreHandlebarsPartials(sanitized: string): string {
  return sanitized.replace(/\{\{.*?\}\}/gs, (match) =>
    match.replace(/&gt;/g, '>'),
  );
}

const cssUnescape = (css: string): string =>
  css
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_match, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\\([^\n])/g, '$1');

const cssAddresses = (css: string): string[] => {
  const text = cssUnescape(css);
  return [
    ...Array.from(text.matchAll(/url\(\s*([^)]*?)\s*\)/gi), (m) => m[1]),
    ...Array.from(text.matchAll(/"([^"]*)"|'([^']*)'/g), (m) => m[1] ?? m[2]),
  ].map((value) => value.replace(/^["']|["']$/g, ''));
};

// Every address the sanitized markup can make the browser contact, resolved
// the way the browser resolves it. Reading attributes instead of matching the
// text covers addresses that only look like one after parsing.
export function findExternalAddresses(
  sanitized: string,
  baseURL = typeof document === 'undefined' ? undefined : document.baseURI,
): string[] {
  const candidates = new Set<string>(
    sanitized.match(/(?:https?:)?\/\/[^\s<>"'()]+/g) ?? [],
  );
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = sanitized;
    template.content.querySelectorAll('*').forEach((element) => {
      for (const { name, value } of Array.from(element.attributes)) {
        if (name === 'style') {
          cssAddresses(value).forEach((address) => candidates.add(address));
          continue;
        }
        candidates.add(value);
        // srcset and similar lists
        value.split(/[\s,]+/).forEach((part) => candidates.add(part));
      }
      if (element.tagName === 'STYLE') {
        cssAddresses(element.textContent ?? '').forEach((address) =>
          candidates.add(address),
        );
      }
    });
  }
  const external = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate, baseURL);
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        (!baseURL || url.origin !== new URL(baseURL).origin)
      ) {
        external.add(url.href);
      }
    } catch {
      // Not an address.
    }
  }
  return [...external];
}

// Pasted text becomes markup in a node that is not sanitized, so only a web
// address is accepted and it is written back out in its parsed, escaped form.
export const getEmbeddableAddress = (text: unknown): string | undefined => {
  if (typeof text !== 'string' || !isUrl(text.trim())) return undefined;
  try {
    const url = new URL(text.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.href
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } catch {
    return undefined;
  }
};
