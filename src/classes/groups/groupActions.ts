import { hri } from 'human-readable-ids';
import PPGraph from '../GraphClass';
import PPNode from '../NodeClass';
import {
  ActionSource,
  PNPAction,
  SerializableAction,
  SerializableActionHandler,
} from '../Action';
import { SerializedGroup } from '../../utils/interfaces';

export const GROUP_ACTIONS = {
  create: 'CreateGroupAction',
  ungroup: 'UngroupAction',
  update: 'UpdateGroupAction',
  setMembers: 'SetGroupMembersAction',
};

export const DEFAULT_GROUP_NAME = 'Group';

type GroupProperties = { name?: string; color?: string };
type UpdateGroupArgs = GroupProperties & { id: string };

const groupLayer = () => PPGraph.currentGraph.groupLayer;

function registerGroupActions(): void {
  const handler = SerializableActionHandler.getInstance();
  handler.registerAction(
    GROUP_ACTIONS.create,
    new SerializableAction(
      async (group: SerializedGroup) => {
        groupLayer().addGroup(group);
      },
      async (group: SerializedGroup) => groupLayer().removeGroup(group.id),
      'Group nodes',
    ),
  );
  handler.registerAction(
    GROUP_ACTIONS.ungroup,
    new SerializableAction(
      async (groups: SerializedGroup[]) =>
        groups.forEach((group) => groupLayer().removeGroup(group.id)),
      async (groups: SerializedGroup[]) =>
        groups.forEach((group) => groupLayer().addGroup(group)),
      'Ungroup',
    ),
  );
  const applyProperties = async ({ id, ...properties }: UpdateGroupArgs) => {
    const group = groupLayer().getGroup(id)!;
    Object.assign(group, properties);
    group.draw();
  };
  handler.registerAction(
    GROUP_ACTIONS.update,
    new SerializableAction(applyProperties, applyProperties, 'Edit group'),
  );
  // a group left without members is removed, and comes back on undo
  const applyMembers = async (groups: SerializedGroup[]) =>
    groups.forEach((group) =>
      group.nodeIds.length > 0
        ? groupLayer().restoreGroup(group)
        : groupLayer().removeGroup(group.id),
    );
  handler.registerAction(
    GROUP_ACTIONS.setMembers,
    new SerializableAction(applyMembers, applyMembers, 'Edit group members'),
  );
}

registerGroupActions();

// throws with a user facing message, so the UI can show it and the AI tools
// can return it
export function createGroupData(
  nodes: PPNode[],
  properties: GroupProperties = {},
): SerializedGroup {
  if (nodes.length === 0) {
    throw new Error('Select at least one node to group.');
  }
  if (nodes.some((node) => groupLayer().getGroupOfNode(node.id))) {
    throw new Error(
      'Some of these nodes are already in a group. Nested groups are not supported yet - ungroup first.',
    );
  }
  return {
    id: hri.random(),
    name: properties.name ?? DEFAULT_GROUP_NAME,
    color: properties.color ?? groupLayer().getNextColor(),
    nodeIds: nodes.map((node) => node.id),
  };
}

export async function groupNodes(
  nodes: PPNode[],
  properties: GroupProperties = {},
  source: ActionSource = 'human',
): Promise<string> {
  const group = createGroupData(nodes, properties);
  await PNPAction(GROUP_ACTIONS.create, group, group, undefined, source);
  return group.id;
}

export async function ungroupNodes(
  nodes: PPNode[],
  source: ActionSource = 'human',
): Promise<void> {
  const groups = groupLayer()
    .groups.filter((group) =>
      nodes.some((node) => group.nodeIds.includes(node.id)),
    )
    .map((group) => group.serialize());
  if (groups.length > 0) {
    await PNPAction(GROUP_ACTIONS.ungroup, groups, groups, undefined, source);
  }
}

export async function addNodesToGroup(
  id: string,
  nodes: PPNode[],
  source: ActionSource = 'human',
): Promise<void> {
  if (nodes.some((node) => groupLayer().getGroupOfNode(node.id))) {
    throw new Error(
      'Some of these nodes are already in a group. Remove them from it first.',
    );
  }
  const previous = groupLayer().getGroup(id)!.serialize();
  const next: SerializedGroup = {
    ...previous,
    nodeIds: previous.nodeIds.concat(nodes.map((node) => node.id)),
  };
  await PNPAction(
    GROUP_ACTIONS.setMembers,
    [next],
    [previous],
    undefined,
    source,
  );
}

export async function removeNodesFromGroups(
  nodes: PPNode[],
  source: ActionSource = 'human',
): Promise<void> {
  const nodeIds = nodes.map((node) => node.id);
  const previous = groupLayer().serializeTouching(nodeIds);
  if (previous.length === 0) {
    return;
  }
  const next = previous.map((group) => ({
    ...group,
    nodeIds: group.nodeIds.filter((id) => !nodeIds.includes(id)),
  }));
  await PNPAction(GROUP_ACTIONS.setMembers, next, previous, undefined, source);
}

export async function updateGroup(
  id: string,
  properties: GroupProperties,
  source: ActionSource = 'human',
): Promise<void> {
  const group = groupLayer().getGroup(id)!;
  const previous: UpdateGroupArgs = {
    id,
    name: group.name,
    color: group.color,
  };
  const next: UpdateGroupArgs = {
    id,
    name: properties.name ?? group.name,
    color: properties.color ?? group.color,
  };
  // a colour dragged through the picker becomes one undo step
  await PNPAction(
    GROUP_ACTIONS.update,
    next,
    previous,
    `UPDATE_GROUP_${id}`,
    source,
  );
}
