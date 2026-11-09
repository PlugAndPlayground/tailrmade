import type {
  SerializedGroup,
  SerializedLink,
  SerializedNode,
} from '../utils/interfaces';
import type { ReplayStep } from './ReplayService';

/**
 * Turns the difference between two states of a graph into the MCP tool calls
 * that get from one to the other. Recording compares states rather than
 * listening to individual actions, so it catches every change whatever made
 * it: the editor, widgets, the AI, auto layout or an undo.
 */
export interface GraphSnapshot {
  nodes: Record<string, SerializedNode>;
  links: SerializedLink[];
  groups: SerializedGroup[];
  defaultSurfaceId: string | undefined;
}

type UpdateBehaviour = SerializedNode['updateBehaviour'];

// what a freshly added node of a type starts with, serialized the same way
export interface NodeDefaults {
  name: string;
  inputs: Record<string, unknown>;
  updateBehaviour: UpdateBehaviour;
}

export type RecordedStep = Required<Pick<ReplayStep, 'tool' | 'input'>>;

export interface RecordedChanges {
  steps: RecordedStep[];
  warnings: string[];
}

// larger values, e.g. images, would bloat the script beyond being editable
export const MAX_RECORDED_VALUE_LENGTH = 20000;

const isInput = (socket: SerializedNode['socketArray'][number]) =>
  socket.socketType === undefined || socket.socketType === 'in';

// linked inputs serialize without data; those come back through their link
function getInputValues(node: SerializedNode): Map<string, unknown> {
  return new Map(
    node.socketArray
      .filter((socket) => isInput(socket) && socket.data !== undefined)
      .map((socket) => [socket.name, socket.data]),
  );
}

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const linkKey = (link: SerializedLink) =>
  [
    link.sourceNodeId,
    link.sourceSocketName,
    link.targetNodeId,
    link.targetSocketName,
  ].join('\u0000');

function updateBehaviourInput(nodeId: string, behaviour: UpdateBehaviour) {
  return {
    node_id: nodeId,
    load: behaviour.load,
    update: behaviour.update,
    interval: behaviour.interval,
    ...(behaviour.intervalFrequency !== undefined
      ? { interval_frequency: behaviour.intervalFrequency }
      : {}),
  };
}

// the frequency is left out of a node's serialization when it is the default
const sameBehaviour = (a: UpdateBehaviour, b: UpdateBehaviour) =>
  a.load === b.load &&
  a.update === b.update &&
  a.interval === b.interval &&
  a.intervalFrequency === b.intervalFrequency;

export function diffSnapshots(
  before: GraphSnapshot,
  after: GraphSnapshot,
  getDefaults: (nodeType: string) => NodeDefaults | undefined,
): RecordedChanges {
  const steps: RecordedStep[] = [];
  const warnings: string[] = [];
  const step = (tool: string, input: Record<string, unknown>) =>
    steps.push({ tool, input });

  const setValue = (nodeId: string, socketName: string, value: unknown) => {
    if (JSON.stringify(value).length > MAX_RECORDED_VALUE_LENGTH) {
      warnings.push(`${nodeId}: "${socketName}" is too large to record`);
      return;
    }
    step('set_socket_value', {
      node_id: nodeId,
      socket_name: socketName,
      value,
    });
  };

  const addedNodes = Object.values(after.nodes).filter(
    (node) => !before.nodes[node.id],
  );
  const removedNodes = Object.values(before.nodes).filter(
    (node) => !after.nodes[node.id],
  );
  const keptNodes = Object.values(after.nodes).filter(
    (node) => before.nodes[node.id],
  );

  removedNodes.forEach((node) => step('remove_node', { node_id: node.id }));

  addedNodes.forEach((node) => {
    step('add_node', {
      node_type: node.type,
      node_id: node.id,
      x: node.x,
      y: node.y,
    });
    const defaults = getDefaults(node.type);
    if (!defaults) {
      warnings.push(`${node.id}: unknown node type ${node.type}`);
      return;
    }
    getInputValues(node).forEach((value, socketName) => {
      if (!(socketName in defaults.inputs)) {
        warnings.push(`${node.id}: "${socketName}" was added after the node`);
      } else if (!sameValue(value, defaults.inputs[socketName])) {
        setValue(node.id, socketName, value);
      }
    });
    if (node.name !== undefined) {
      step('set_node_name', { node_id: node.id, name: node.name });
    }
    if (node.comment) {
      step('set_node_comment', { node_id: node.id, comment: node.comment });
    }
    if (!sameBehaviour(node.updateBehaviour, defaults.updateBehaviour)) {
      step(
        'set_update_behaviour',
        updateBehaviourInput(node.id, node.updateBehaviour),
      );
    }
  });

  // links come before values, so a widget is on its surface before the
  // surface layout refers to it
  const beforeLinks = new Map(before.links.map((l) => [linkKey(l), l]));
  const afterLinks = new Map(after.links.map((l) => [linkKey(l), l]));
  const relinkedInputs = new Set(
    after.links
      .filter((link) => !beforeLinks.has(linkKey(link)))
      .map((link) => link.targetNodeId + '\u0000' + link.targetSocketName),
  );
  before.links
    .filter(
      (link) =>
        !afterLinks.has(linkKey(link)) &&
        after.nodes[link.sourceNodeId] &&
        after.nodes[link.targetNodeId] &&
        // connecting over an input already replaces its old link
        !relinkedInputs.has(
          link.targetNodeId + '\u0000' + link.targetSocketName,
        ),
    )
    .forEach((link) =>
      step('disconnect_sockets', {
        from_node: link.sourceNodeId,
        to_node: link.targetNodeId,
        to_socket: link.targetSocketName,
      }),
    );
  after.links
    .filter((link) => !beforeLinks.has(linkKey(link)))
    .forEach((link) =>
      step('connect_sockets', {
        from_node: link.sourceNodeId,
        from_socket: link.sourceSocketName,
        to_node: link.targetNodeId,
        to_socket: link.targetSocketName,
      }),
    );

  let resized = false;
  keptNodes.forEach((node) => {
    const previous = before.nodes[node.id];
    const previousValues = getInputValues(previous);
    getInputValues(node).forEach((value, socketName) => {
      // an input that was linked, or appeared as a side effect of a connect,
      // takes its value from that, not from an edit
      if (
        previousValues.has(socketName) &&
        !sameValue(value, previousValues.get(socketName))
      ) {
        setValue(node.id, socketName, value);
      }
    });
    if (node.name !== previous.name) {
      // a name back at its default serializes as undefined
      const name = node.name ?? getDefaults(node.type)?.name;
      if (name) {
        step('set_node_name', { node_id: node.id, name });
      }
    }
    if ((node.comment ?? '') !== (previous.comment ?? '')) {
      step('set_node_comment', {
        node_id: node.id,
        comment: node.comment ?? '',
      });
    }
    if (!sameBehaviour(node.updateBehaviour, previous.updateBehaviour)) {
      step(
        'set_update_behaviour',
        updateBehaviourInput(node.id, node.updateBehaviour),
      );
    }
    resized ||=
      node.width !== previous.width || node.height !== previous.height;
  });
  if (resized) {
    warnings.push('Resizing nodes is not recorded');
  }

  const moved = keptNodes.filter(
    (node) =>
      node.x !== before.nodes[node.id].x || node.y !== before.nodes[node.id].y,
  );
  if (moved.length > 0) {
    step('move_nodes', {
      nodes: moved.map((node) => ({ node_id: node.id, x: node.x, y: node.y })),
    });
  }

  diffGroups(before, after, step);

  if (
    after.defaultSurfaceId !== before.defaultSurfaceId &&
    after.defaultSurfaceId !== undefined
  ) {
    step('set_default_surface', { node_id: after.defaultSurfaceId });
  }

  return { steps, warnings };
}

function diffGroups(
  before: GraphSnapshot,
  after: GraphSnapshot,
  step: (tool: string, input: Record<string, unknown>) => void,
): void {
  const beforeGroups = new Map(before.groups.map((g) => [g.id, g]));
  const afterGroups = new Map(after.groups.map((g) => [g.id, g]));
  const stillThere = (ids: string[]) => ids.filter((id) => after.nodes[id]);

  // members leave their old groups before they can join new ones
  before.groups
    .filter((group) => !afterGroups.has(group.id))
    .filter((group) => stillThere(group.nodeIds).length > 0)
    .forEach((group) => step('ungroup', { group_id: group.id }));

  const kept = after.groups.filter((group) => beforeGroups.has(group.id));
  kept.forEach((group) => {
    const left = stillThere(
      beforeGroups
        .get(group.id)!
        .nodeIds.filter((id) => !group.nodeIds.includes(id)),
    );
    if (left.length > 0) {
      step('remove_from_group', { node_ids: left });
    }
  });

  after.groups
    .filter((group) => !beforeGroups.has(group.id))
    .forEach((group) =>
      step('group_nodes', {
        node_ids: group.nodeIds,
        name: group.name,
        color: group.color,
        group_id: group.id,
      }),
    );
  kept.forEach((group) => {
    const previous = beforeGroups.get(group.id)!;
    const joined = group.nodeIds.filter((id) => !previous.nodeIds.includes(id));
    if (joined.length > 0) {
      step('add_to_group', { group_id: group.id, node_ids: joined });
    }
    if (group.name !== previous.name || group.color !== previous.color) {
      step('update_group', {
        group_id: group.id,
        name: group.name,
        color: group.color,
      });
    }
  });
}

const sameTarget = (a: RecordedStep, b: RecordedStep) =>
  a.input.node_id === b.input.node_id &&
  a.input.socket_name === b.input.socket_name;

const movedIds = (step: RecordedStep) =>
  (step.input.nodes as { node_id: string }[])
    .map((node) => node.node_id)
    .join('\u0000');

// a drag or typing burst is one step: the last value wins
export function canMerge(previous: RecordedStep, next: RecordedStep): boolean {
  if (previous.tool !== next.tool) return false;
  if (next.tool === 'set_socket_value') return sameTarget(previous, next);
  if (next.tool === 'move_nodes') return movedIds(previous) === movedIds(next);
  return false;
}

// longer pauses while recording are shortened, nobody wants to watch them
const MAX_DELAY = 2;
// between the steps of one change, e.g. adding a node and setting its value
const STEP_DELAY = 0.2;
// repeated edits of one value or one drag closer together than this are one step
const MERGE_WINDOW_MS = 1500;

const roundDelay = (seconds: number) => Math.round(seconds * 10) / 10;

// adds the steps of one change, made sinceLastMs after the previous one
export function appendSteps(
  recorded: ReplayStep[],
  steps: RecordedStep[],
  sinceLastMs: number,
): void {
  steps.forEach((step, index) => {
    const last = recorded[recorded.length - 1];
    if (
      index === 0 &&
      last &&
      sinceLastMs < MERGE_WINDOW_MS &&
      canMerge({ tool: last.tool, input: last.input ?? {} }, step)
    ) {
      last.input = step.input;
      return;
    }
    const delay =
      recorded.length === 0
        ? 0
        : index === 0
          ? Math.min(MAX_DELAY, sinceLastMs / 1000)
          : STEP_DELAY;
    recorded.push({ delay: roundDelay(delay), ...step });
  });
}
