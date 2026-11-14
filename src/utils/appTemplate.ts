import Handlebars from 'handlebars/dist/handlebars';

type Environment = typeof Handlebars;

// Helpers that only compute from their arguments. `macro` runs graph code, so
// each environment gets its own (see below and html.tsx).
const registerPureHelpers = (environment: Environment): void => {
  environment.registerHelper('eq', (a, b) => a === b);
  environment.registerHelper('ne', (a, b) => a !== b);
  environment.registerHelper('lt', (a, b) => a < b);
  environment.registerHelper('gt', (a, b) => a > b);
  environment.registerHelper('lte', (a, b) => a <= b);
  environment.registerHelper('gte', (a, b) => a >= b);
  environment.registerHelper('and', (...args) =>
    args.slice(0, -1).every(Boolean),
  );
  environment.registerHelper('or', (...args) =>
    args.slice(0, -1).some(Boolean),
  );
  environment.registerHelper('not', (a) => !a);
  environment.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
  environment.registerHelper('add', (a, b) => Number(a) + Number(b));
  environment.registerHelper('subtract', (a, b) => Number(a) - Number(b));
  environment.registerHelper('multiply', (a, b) => Number(a) * Number(b));
  environment.registerHelper('divide', (a, b) => Number(a) / Number(b));
};

// What the HTML nodes render with.
export const appTemplates: Environment = Handlebars.create();
registerPureHelpers(appTemplates);

class NeedsRunningApp extends Error {}

// What the risk review renders with: the same helpers, except that a macro
// call cannot be answered without running the app.
const reviewTemplates: Environment = Handlebars.create();
registerPureHelpers(reviewTemplates);
reviewTemplates.registerHelper('macro', () => {
  throw new NeedsRunningApp();
});

// Partials arrive HTML-encoded when they passed through a sanitizing node.
const decodeHtmlEntities = (text: string): string => {
  if (typeof document === 'undefined') return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

// Partials are handed to the one render that uses them. Registering them on
// the environment would let one node replace a partial another node reviewed.
const ownPartials = (partials: unknown): Record<string, string> => {
  const own: Record<string, string> = {};
  if (partials && typeof partials === 'object') {
    for (const [name, template] of Object.entries(partials)) {
      if (typeof template === 'string') {
        own[name] = decodeHtmlEntities(template);
      }
    }
  }
  return own;
};

/** Throws when the template is invalid. */
export function expandTemplate(
  markup: string,
  data: unknown,
  partials?: unknown,
  environment: Environment = appTemplates,
): string {
  const template = environment.compile(markup, { noEscape: true });
  return template(data, { partials: ownPartials(partials) });
}

export const CANNOT_REVIEW = Symbol('cannot review');

/**
 * The markup a node will render for inputs that are all known ahead of
 * running. An invalid template is rendered as written, so it is reviewed as
 * written.
 */
export function expandTemplateForReview(
  markup: string,
  data: unknown,
  partials?: unknown,
): string | typeof CANNOT_REVIEW {
  try {
    return expandTemplate(markup, data, partials, reviewTemplates);
  } catch (error) {
    return error instanceof NeedsRunningApp ? CANNOT_REVIEW : markup;
  }
}
