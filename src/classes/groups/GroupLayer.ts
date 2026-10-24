import * as PIXI from 'pixi.js';
import PPNode from '../NodeClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { SerializedGroup } from '../../utils/interfaces';
import PPGroup, { GROUP_COLORS } from './GroupClass';

export type AlignUnit = {
  id: string;
  nodes: PPNode[];
  frame: PIXI.Rectangle;
};

// Drawn behind links and nodes. Its children are the graph's groups, so this
// is also the registry - there is no separate list to keep in sync.
export default class GroupLayer extends PIXI.Container<PPGroup> {
  constructor() {
    super();
    this.label = 'groupLayer';
    // the colour icon shows on selected groups only; lives as long as the graph
    InterfaceController.addListener(ListenEvent.SelectionChanged, () =>
      this.drawAll(),
    );
  }

  get groups(): PPGroup[] {
    return this.children;
  }

  getGroup(id: string): PPGroup | undefined {
    return this.children.find((group) => group.id === id);
  }

  getGroupOfNode(nodeId: string): PPGroup | undefined {
    return this.children.find((group) => group.nodeIds.includes(nodeId));
  }

  getGroupAt(x: number, y: number): PPGroup | undefined {
    return this.children.find((group) => group.getFrame().contains(x, y));
  }

  setDropTarget(target: PPGroup | undefined): void {
    this.children.forEach((group) => {
      if (group.isDropTarget !== (group === target)) {
        group.isDropTarget = group === target;
        group.draw();
      }
    });
  }

  getNextColor(): string {
    return GROUP_COLORS[this.children.length % GROUP_COLORS.length];
  }

  addGroup(data: SerializedGroup): PPGroup {
    const group = new PPGroup({ ...data, nodeIds: [...data.nodeIds] });
    this.addChild(group);
    group.draw();
    return group;
  }

  removeGroup(id: string): void {
    this.getGroup(id).destroy({ children: true });
  }

  // puts a group back exactly as it was serialized, e.g. when undoing a delete
  restoreGroup(data: SerializedGroup): void {
    const group = this.getGroup(data.id);
    if (group) {
      group.name = data.name;
      group.color = data.color;
      group.nodeIds = [...data.nodeIds];
      group.draw();
    } else {
      this.addGroup(data);
    }
  }

  configure(groups: SerializedGroup[], existingNodeIds: Set<string>): void {
    this.removeChildren().forEach((group) => group.destroy({ children: true }));
    groups.forEach((group) => {
      const nodeIds = group.nodeIds.filter((id) => existingNodeIds.has(id));
      if (nodeIds.length > 0) {
        this.addGroup({ ...group, nodeIds });
      }
    });
  }

  serialize(): SerializedGroup[] {
    return this.children.map((group) => group.serialize());
  }

  // only groups whose members are all included travel with a copy
  serializeContainedIn(nodeIds: string[]): SerializedGroup[] {
    return this.children
      .filter((group) => group.nodeIds.every((id) => nodeIds.includes(id)))
      .map((group) => group.serialize());
  }

  // groups that would change if these nodes were removed
  serializeTouching(nodeIds: string[]): SerializedGroup[] {
    return this.children
      .filter((group) => group.nodeIds.some((id) => nodeIds.includes(id)))
      .map((group) => group.serialize());
  }

  drawAll(): void {
    this.children.forEach((group) => group.draw());
  }

  onNodeChanged(nodeId: string): void {
    this.getGroupOfNode(nodeId)?.draw();
  }

  onNodeRemoved(nodeId: string): void {
    const group = this.getGroupOfNode(nodeId);
    if (!group) {
      return;
    }
    group.nodeIds = group.nodeIds.filter((id) => id !== nodeId);
    if (group.nodeIds.length === 0) {
      this.removeGroup(group.id);
    } else {
      group.draw();
    }
  }

  onNodeReplaced(oldId: string, newId: string): void {
    const group = this.getGroupOfNode(oldId);
    if (group) {
      group.nodeIds = group.nodeIds.map((id) => (id === oldId ? newId : id));
      group.draw();
    }
  }

  // Groups touched by the nodes align as one block each, keeping their inner
  // arrangement. If all nodes sit inside one group, they align on their own.
  getAlignUnits(nodes: PPNode[]): AlignUnit[] {
    const touchedGroups = new Set(
      nodes.map((node) => this.getGroupOfNode(node.id)),
    );
    const alignInsideGroup =
      touchedGroups.size === 1 && !touchedGroups.has(undefined);
    const units: AlignUnit[] = [];
    nodes.forEach((node) => {
      const group = alignInsideGroup ? undefined : this.getGroupOfNode(node.id);
      if (!group) {
        units.push({
          id: node.id,
          nodes: [node],
          frame: new PIXI.Rectangle(
            node.x,
            node.y,
            node.nodeWidth,
            node.nodeHeight,
          ),
        });
      } else if (!units.some((unit) => unit.id === group.id)) {
        units.push({
          id: group.id,
          nodes: group.getMembers(),
          frame: group.getFrame(),
        });
      }
    });
    return units;
  }
}
