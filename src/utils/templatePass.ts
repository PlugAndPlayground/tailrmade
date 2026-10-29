// Which nodes are inside a UI template's body.
//
// A socket's data type adapts to the data put through it, which is right for a
// graph the user wired up and wrong inside a template: the inner nodes are
// shared and every row pushes its own value through them, so a socket would
// end up typed by whichever row happened to run last. Feed a template a mix of
// strings and numbers and a type test meant to tell them apart sees everything
// already coerced to the last row's type.
//
// Registration is by NODE rather than by a "a pass is running now" flag,
// because a pass schedules deferred executions that land after it returns -
// those would re-type the sockets again a moment later.
//
// A leaf module on purpose: SocketClass reads this, and anything importing the
// template nodes would close an import cycle.
const innerNodeIds = new Set<string>();

/** Registers the nodes and returns the ids that were not registered before. */
export const registerTemplateInnerNodes = (nodeIds: string[]): string[] => {
  const added = nodeIds.filter((id) => !innerNodeIds.has(id));
  added.forEach((id) => innerNodeIds.add(id));
  return added;
};

export const isTemplateInnerNode = (nodeId: string): boolean =>
  innerNodeIds.has(nodeId);

// a graph swap leaves the previous graph's ids behind, so start clean
export const clearTemplateInnerNodes = (): void => {
  innerNodeIds.clear();
};
