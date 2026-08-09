import { serializeNode } from '@craftjs/core';
import { canonicalTreeString } from '../../utils/surfaceTree';

let lastResolver: unknown;
let lastInput: string | undefined;
let lastOutput: string;

export function normalizeTreeString(query: any, treeString: string): string {
  const resolver = query.getOptions().resolver;
  if (resolver === lastResolver && treeString === lastInput) {
    return lastOutput;
  }
  lastResolver = resolver;
  lastInput = treeString;
  lastOutput = normalizeTreeStringUncached(query, resolver, treeString);
  return lastOutput;
}

function normalizeTreeStringUncached(
  query: any,
  resolver: any,
  treeString: string,
): string {
  try {
    const tree = JSON.parse(treeString) as Record<string, unknown>;
    const normalized = Object.entries(tree).reduce(
      (acc, [itemId, item]) => {
        acc[itemId] = serializeNode(
          query.parseSerializedNode(item).toNode().data,
          resolver,
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );
    return canonicalTreeString(normalized);
  } catch (error) {
    // an item type missing from the resolver, or a malformed tree - fall back
    // to the raw string, which errs towards reloading rather than leaving a
    // stale surface on screen
    console.error(
      'normalizeTreeString: could not normalize, comparing raw',
      error,
    );
    return treeString;
  }
}
