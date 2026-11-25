// A node is "shared" while one copy of it runs for several contexts in turn - a
// UI template's body runs once per placement, for example. Whatever it holds
// belongs to whichever context ran last, so it must not adapt to that: its
// sockets keep their types, and it does not chase its own previous values.
//
// Kept outside the node classes, which only ask isSharedNode.

// who shares each node, so two owners can share one without releasing it early
const sharers = new WeakMap<object, Set<string>>();
// classes whose every instance is shared, even mid-construction
const alwaysSharedClasses = new Set<abstract new (...args: any[]) => object>();

export function markNodeShared(node: object, sharerId: string): void {
  const set = sharers.get(node) ?? new Set<string>();
  set.add(sharerId);
  sharers.set(node, set);
}

export function unmarkNodeShared(node: object, sharerId: string): void {
  sharers.get(node)?.delete(sharerId);
}

export function markClassShared(
  nodeClass: abstract new (...args: any[]) => object,
): void {
  alwaysSharedClasses.add(nodeClass);
}

export function isSharedNode(node: object): boolean {
  if ((sharers.get(node)?.size ?? 0) > 0) {
    return true;
  }
  for (const nodeClass of alwaysSharedClasses) {
    if (node instanceof nodeClass) {
      return true;
    }
  }
  return false;
}
