const AI_CONTEXT_STRING_LIMIT = 4000;
const AI_CONTEXT_STRING_TRUNCATION_SUFFIX = '... (large string is truncated)';

export function truncateStringForAIContext(value: string): string {
  return value.length > AI_CONTEXT_STRING_LIMIT
    ? value.slice(0, AI_CONTEXT_STRING_LIMIT) +
        AI_CONTEXT_STRING_TRUNCATION_SUFFIX
    : value;
}

// Recursively clones a value while truncating long strings and large arrays,
// so it stays small enough to safely include in an AI context window.
export function cloneAndTruncateContext(value: unknown): unknown {
  if (typeof value === 'string') {
    return truncateStringForAIContext(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(cloneAndTruncateContext);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        cloneAndTruncateContext(entryValue),
      ]),
    );
  }

  return value;
}
