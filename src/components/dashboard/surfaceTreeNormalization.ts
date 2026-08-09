// Normalization used to answer "does the craft editor already display this
// stored tree?" without reloading it.
//
// craft's deserialize does not keep a serialized item as-is: createNode fills
// in every prop the item omits from the component's `craft.props` defaults,
// and defaults displayName/custom/isCanvas/hidden/nodes/linkedNodes too. So a
// stored tree that was not itself produced by query.serialize() - one built by
// a graph migration, or a "Layout JSON" written by hand or driven by the graph
// - never compares equal to the editor's own serialization, no matter how
// little (or nothing at all) actually changed.
//
// Rounding the stored tree through the exact same parse craft's deserialize
// uses, then serializing it back, puts both sides of that comparison in the
// same shape. Without it, every execution of a UI surface node looks like a
// layout change and tears down and rebuilds the whole surface, remounting
// every widget in it.
import { serializeNode } from '@craftjs/core';
import { canonicalTreeString } from '../../utils/surfaceTree';

// Cache of the most recent call. The check "does the editor already show this
// tree?" runs on every execution of the displayed surface, and in graphs with
// interval-updating nodes that means several times per second with the exact
// same tree string - so remember the last result and return it for free.
// The cache key is the resolver, not the query object: the resolver is what
// the result actually depends on and is stable for the lifetime of the craft
// Editor, while the query object may be recreated on every React render.
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
