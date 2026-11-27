// The case list of "Select by key", kept free of node code so it can be
// tested on its own.

export const keyName = 'Key';
export const casesName = 'Cases';
export const defaultName = 'Default';
export const FIXED_INPUTS = [keyName, casesName, defaultName];

/** The case names in a "Cases" text, trimmed, deduplicated, never a fixed input. */
export function parseCases(text: unknown): string[] {
  const seen = new Set<string>();
  return String(text ?? '')
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => {
      const folded = name.toLowerCase();
      if (
        !name ||
        seen.has(folded) ||
        FIXED_INPUTS.some((fixed) => fixed.toLowerCase() === folded)
      ) {
        return false;
      }
      seen.add(folded);
      return true;
    });
}

/** The case a key picks, ignoring case and surrounding spaces. */
export function matchCase(cases: string[], key: unknown): string | undefined {
  const wanted = String(key ?? '')
    .trim()
    .toLowerCase();
  return cases.find((name) => name.toLowerCase() === wanted);
}
