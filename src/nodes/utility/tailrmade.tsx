import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { getPropertyNames, sortCompare } from '../../utils/utils';
import { getNodesBounds, zoomToFitNodes } from '../../pixi/utils-pixi';
import { TRgba } from '../../utils/color';
import { JSONType } from '../datatypes/jsonType';
import { TriggerType } from './../datatypes/triggerType';
import {
  getAllNodeTypes,
  getAllNodesInDetail,
  getAllTagNames,
  getNodeTypesByTag,
} from '../../nodes/allNodes';
import { EnumType } from '../datatypes/enumType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { BackendGateway } from '../../services/BackendGateway';

export class Tailrmade extends PPNode {
  public getName(): string {
    return 'Tailrmade';
  }

  public getDescription(): string {
    return 'Exposes some Tailrmade functions';
  }

  public getTags(): string[] {
    return ['Misc'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  protected getDefaultIO(): PPSocket[] {
    const graphMethods = getPropertyNames(PPGraph.currentGraph, {
      includePrototype: true,
      onlyFunctions: false,
    });
    const graphOptions = graphMethods
      .filter((methodName: string) => {
        return this[methodName]?.length === 0;
      })
      .map((methodName) => {
        return {
          text: methodName,
        };
      });

    const nodeMethods = getPropertyNames(this, {
      includePrototype: true,
      onlyFunctions: false,
    });

    const nodeOptions = nodeMethods
      .filter((methodName: string) => {
        return this[methodName]?.length === 0;
      })
      .map((methodName) => {
        return {
          text: methodName,
        };
      });

    const tagOptions = () => {
      return getAllTagNames().map((tag) => ({
        text: tag,
      }));
    };

    return [
      new PPSocket(SOCKET_TYPE.OUT, 'output', new JSONType()),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Add all nodes',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'addAllNodes'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Add nodes by tag',
        new DynamicEnumType(
          () => tagOptions(),
          async () => {
            const tagName = this.getInputData('Add nodes by tag');
            await this.addNodesByTag(tagName);
          },
        ),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'List all nodes',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'listAllNodes'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'List nodes by tag',
        new DynamicEnumType(
          () => tagOptions(),
          () => {
            const tagName = this.getInputData('List nodes by tag');
            void this.listNodesByTag(tagName);
          },
        ),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Output graph JSON',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'outputGraphJSON'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Output all added nodes',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'outputAllAddedNodes'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'List all remote apps',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'getAllRemoteApps'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Zoom to fit selected nodes',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'zoomToFitNodes'),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Trigger graph method',
        new EnumType(graphOptions, () => {
          const methodName = this.getInputData('Trigger graph method');
          this.setOutputData('output', PPGraph.currentGraph[methodName]());
        }),
        0,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Trigger node method',
        new EnumType(nodeOptions, () => {
          const methodName = this.getInputData('Trigger node method');
          this.setOutputData(
            'output',
            PPGraph.currentGraph.selection.selectedNodes?.[0]?.[methodName](),
          );
        }),
        0,
      ),
    ].concat(super.getDefaultIO());
  }

  private async addNodesHelper(nodeTypeNames: string[]): Promise<void> {
    let lastNodePosX = this.x + this.width + 40;
    const lastNodePosY = this.y;

    const addedNodes: PPNode[] = [];

    await Promise.all(
      nodeTypeNames.map(async (nodeName) => {
        // await PNPAction(
        //   ACTIONS.ADD_NODE,
        //   new AddNodeActionArgs(
        //     nodeName,
        //     new PIXI.Point(lastNodePosX, lastNodePosY),
        //   ),
        // );
        const newNode = await PPGraph.currentGraph.addNewNode(nodeName);
        newNode.setPosition(lastNodePosX, lastNodePosY, false);
        lastNodePosX += newNode.width + 40;
        addedNodes.push(newNode);
      }),
    );

    PPGraph.currentGraph.selection.selectNodes(addedNodes);
    this.arrangeSelectedNodesByType();
    await this.executeChildren();
  }

  async addAllNodes(): Promise<void> {
    const allNodeTypes = getAllNodeTypes();
    const allNodeTypeNames = Object.keys(allNodeTypes);
    await this.addNodesHelper(allNodeTypeNames);
    await this.listAllNodes();
  }

  async addNodesByTag(tagName: string): Promise<void> {
    const nodeTypes = getNodeTypesByTag(tagName);
    const nodeTypeNames = Object.keys(nodeTypes);
    await this.addNodesHelper(nodeTypeNames);
    await this.listNodesByTag(tagName);
  }

  async listAllNodes(): Promise<void> {
    const newArray = await getAllNodesInDetail();
    this.setOutputData('output', newArray);
    await this.executeChildren();
  }

  async listNodesByTag(tagName: string): Promise<void> {
    const newArray = await getAllNodesInDetail();

    const filteredNodes = newArray.filter((node) =>
      node.tags.includes(tagName),
    );
    this.setOutputData('output', filteredNodes);
    void this.executeChildren();
  }

  arrangeSelectedNodesByType(): void {
    const selectedNodes = PPGraph.currentGraph.selection.selectedNodes;
    selectedNodes.sort((a, b) =>
      sortCompare(a.getColor().hex(), b.getColor().hex(), true),
    );
    if (selectedNodes.length > 0) {
      const boundsOfSelection = getNodesBounds(selectedNodes);
      const origNodePosX = boundsOfSelection.x;
      let lastNodePosX = origNodePosX;
      let lastNodePosY = boundsOfSelection.y;
      const nodesFromLastRow: PPNode[] = [];
      selectedNodes.forEach((node, index) => {
        if (index % 10 === 0 && index !== 0) {
          lastNodePosX = origNodePosX;
          const boundsOfSelection = getNodesBounds(nodesFromLastRow);
          lastNodePosY = boundsOfSelection.y + boundsOfSelection.height + 40;
          nodesFromLastRow.length = 0;
        }
        node.setPosition(lastNodePosX, lastNodePosY, false);
        lastNodePosX += node.width + 40;
        nodesFromLastRow.push(node);
      });
    }
  }

  async getAllRemoteApps(): Promise<void> {
    const remoteGraphs: any[] =
      await BackendGateway.getInstance().getExampleGraphs();
    this.setOutputData('output', remoteGraphs);
    await this.executeChildren();
  }

  outputGraphJSON(): void {
    const serializedGraph = PPGraph.currentGraph.serialize();
    // const max = this.getInputData('max');
    this.setOutputData('output', serializedGraph);
    void this.executeChildren();
  }

  outputAllAddedNodes(): void {
    const serializedGraph = PPGraph.currentGraph.serialize();
    // const max = this.getInputData('max');
    this.setOutputData('output', serializedGraph.nodes);
    void this.executeChildren();
    console.log(PPGraph.currentGraph);
  }

  zoomToFitNodes(): void {
    const selectedNodes = PPGraph.currentGraph.selection.selectedNodes;
    zoomToFitNodes(selectedNodes);
    void this.executeChildren();
  }
}
