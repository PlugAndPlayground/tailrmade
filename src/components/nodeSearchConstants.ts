export const executeMacroPrefix = 'Execute Macro: ';
export const mapExecuteMacroPrefix = 'Map Execute Macro: ';
const UNGROUPED_NODE_GROUP = 'Other';
export const getNodeGroup = (tags: string[] | undefined): string =>
  tags?.[0] ?? UNGROUPED_NODE_GROUP;
