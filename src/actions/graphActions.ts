import { PNPAction } from '../classes/Action';
import { ACTIONS } from '../classes/Action';
import { AddNodeActionArgs } from '../classes/Action';
import PPGraph from '../classes/GraphClass';
import PPLink from '../classes/LinkClass';
import PPNode from '../classes/NodeClass';
import InterfaceController from '../InterfaceController';
import { hri } from 'human-readable-ids';
import {
  ExecuteMacro,
  Macro,
  MACRO_PARAMETER_PREFIX_NAME,
  macroNameName,
  macroOutputName,
} from '../nodes/macro/macro';
import { perform_action_connectNodeToSocket } from '../utils/utils';
import { getNodesBounds } from '../pixi/utils-pixi';
import * as PIXI from 'pixi.js';
interface PreviousConnection {
  sourceNodeId: string;
  sourceSocketName: string;
  targetNodeId: string;
  targetSocketName: string;
}

function connectionIntoPreviousConnection(link: PPLink): PreviousConnection {
  return {
    sourceNodeId: link.getSource().getNode().id,
    sourceSocketName: link.getSource().name,
    targetNodeId: link.getTarget().getNode().id,
    targetSocketName: link.getTarget().name,
  };
}

// TODO properly actionize
export async function extractSelectionToMacro(selectedNodes: PPNode[]) {
  if (selectedNodes.length === 0) {
    InterfaceController.showSnackBar(
      'Cannot extract empty selection to macro! How did you even do this?',
    );
    return;
  }

  const nodeIDs = selectedNodes.map((node) => node.id);

  let connectionsHeadingIntoMacro = selectedNodes
    .map((node) => node.getAllInputSockets())
    .flat()
    .map((socket) => socket.links)
    .flat()
    .filter((link) => !nodeIDs.includes(link.getSource().getNode().id));

  const connectionsHeadingOutofMacro = selectedNodes
    .map((node) => node.outputSocketArray)
    .flat()
    .map((socket) => socket.links)
    .flat()
    .filter((link) => !nodeIDs.includes(link.getTarget().getNode().id));

  const previousInputs = connectionsHeadingIntoMacro.map(
    connectionIntoPreviousConnection,
  );
  const previousOutputs = connectionsHeadingOutofMacro.map(
    connectionIntoPreviousConnection,
  );

  if (previousOutputs.length > 1) {
    InterfaceController.showSnackBar(
      'Lazy developer alert, only one output socket allowed in automatically created macros for the moment, try simplifying the selection to only end up with one output',
    );
    return;
  }

  const firstNode = selectedNodes[0];

  const refID2 = hri.random();
  const args2: AddNodeActionArgs = new AddNodeActionArgs(
    'Macro',
    new PIXI.Point(firstNode.x, firstNode.y - 1000),
    refID2,
  );
  await PNPAction(ACTIONS.ADD_NODE, args2, args2);

  const macro = PPGraph.currentGraph.nodes[refID2] as Macro;

  const mapOfNodeSocketToParameterPosition: Map<string, number> = new Map();

  let currentIndex = 1;
  for (let i = 0; i < previousInputs.length; i++) {
    const previous = previousInputs[i];
    let indexToUse = currentIndex;
    const currentKey = previous.sourceNodeId + previous.sourceSocketName;
    if (mapOfNodeSocketToParameterPosition.has(currentKey)) {
      indexToUse = mapOfNodeSocketToParameterPosition.get(currentKey)!;
    } else {
      mapOfNodeSocketToParameterPosition.set(currentKey, currentIndex);
      indexToUse = currentIndex;
      currentIndex++;
    }

    const targetSocket = selectedNodes
      .find((node) => node.id === previous.targetNodeId)!
      .getInputSocketByName(previous.targetSocketName);
    await PPGraph.currentGraph.perform_action_Disconnect(targetSocket.links[0]);
    await PPGraph.currentGraph.perform_action_Connect(
      macro.getOutputSocketByName(
        MACRO_PARAMETER_PREFIX_NAME + ' ' + indexToUse.toString(),
      ),
      targetSocket,
    );
  }

  if (previousOutputs.length > 0) {
    const previous = previousOutputs[0];
    await perform_action_connectNodeToSocket(
      selectedNodes
        .find((node) => node.id === previous.sourceNodeId)!
        .getOutputSocketByName(previous.sourceSocketName),
      macro,
    );
  }
  const selectionBounds = getNodesBounds(selectedNodes);

  const selectionCenterX = selectionBounds.x + selectionBounds.width / 2;
  const selectionCenterY = selectionBounds.y + selectionBounds.height / 2;

  const name = macro.setNodeName('Extracted Macro');

  const refID = hri.random();
  const args: AddNodeActionArgs = new AddNodeActionArgs(
    'ExecuteMacro',
    new PIXI.Point(selectionCenterX, selectionCenterY),
    refID,
  );
  await PNPAction(ACTIONS.ADD_NODE, args, args);
  const executor = PPGraph.currentGraph.nodes[refID] as ExecuteMacro;

  executor.setInputData(macroNameName, name);
  executor.calledMacroUpdatedMeta();

  for (let i = 0; i < previousInputs.length; i++) {
    const prevNode = PPGraph.currentGraph.nodes[previousInputs[i].sourceNodeId];
    const previousSourceSocket = prevNode.getOutputSocketByName(
      previousInputs[i].sourceSocketName,
    );
    const indexToUse = mapOfNodeSocketToParameterPosition.get(
      previousInputs[i].sourceNodeId + previousInputs[i].sourceSocketName,
    )!;
    const executeMacroSocketName =
      MACRO_PARAMETER_PREFIX_NAME + ' ' + indexToUse.toString();

    const target = executor.getInputSocketByName(executeMacroSocketName);
    await PPGraph.currentGraph.perform_action_Connect(
      previousSourceSocket,
      target,
    );
  }

  // only one output possible for now TODO improve
  if (previousOutputs.length > 0) {
    const previousInputSocket = PPGraph.currentGraph.nodes[
      previousOutputs[0].targetNodeId
    ].getInputSocketByName(previousOutputs[0].targetSocketName);

    await PPGraph.currentGraph.perform_action_Disconnect(
      previousInputSocket.links[0],
    );
    await PPGraph.currentGraph.perform_action_Connect(
      executor.getOutputSocketByName(macroOutputName),
      previousInputSocket,
    );
  }
  executor.deOverlap();

  // Move selection up a bit from center
  await PPGraph.currentGraph.selection.moveSelection(
    0,
    -selectionBounds.height - 500,
  );

  await PPGraph.currentGraph.selection.autoAlignNodes(
    PPGraph.currentGraph.selection.selectedNodes.concat([macro]),
  );
}
