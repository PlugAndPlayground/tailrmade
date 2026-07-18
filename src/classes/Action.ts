import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import Socket from './SocketClass';
import _ from 'lodash';
import { isSurfaceNode, TSocketType } from '../utils/interfaces';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { hri } from 'human-readable-ids';
import * as PIXI from 'pixi.js';
import { NODE_SOURCE } from '../utils/constants';
import { getSocketsForConnection } from '../utils/utils';
import {
  executeMacroPrefix,
  mapExecuteMacroPrefix,
} from '../components/nodeSearchConstants';
import PPStorage from '../PPStorage';

const macroNameName = 'Macro';

export class SerializableAction {
  action: (any) => Promise<void>;
  undoAction: (any) => Promise<void>;
  name: string;
  constructor(
    inAction: (any) => Promise<void>,
    inUndoAction: (any) => Promise<void>,
    inName: string,
  ) {
    this.action = inAction;
    this.undoAction = inUndoAction;
    this.name = inName;
  }
}

// consecutive actions sharing a checksum within this sliding window merge
// into one undo entry
export const ACTION_GROUP_WINDOW_MS = 800;

export class BakedAction {
  serializableAction: SerializableAction;
  args: any = {};
  undoArgs: any = {};
  // always unique - identity of this entry, used by the action-history UI
  ID: string = hri.random();
  checksum: string = hri.random();
  lastMergedTime: number = Date.now();
  source: ActionSource = 'human';
  constructor(
    inAction: SerializableAction,
    inArgs: any = {},
    inUndoArgs: any = {},
    checksum: string = hri.random(),
    source: ActionSource = 'human',
  ) {
    this.serializableAction = inAction;
    this.args = inArgs;
    this.undoArgs = inUndoArgs;
    this.checksum = checksum;
    this.source = source;
  }
}

export type ActionSource = 'human' | 'ai';

export interface ActionHistoryEntry {
  id: string;
  index: number;
  name: string;
  source: ActionSource;
  applied: boolean;
}

export interface ActionHistorySnapshot {
  entries: ActionHistoryEntry[];
  appliedCount: number;
  totalCount: number;
  canUndo: boolean;
  canRedo: boolean;
}

export class SerializableActionHandler {
  actions: Record<string, SerializableAction>;
  private static instance: SerializableActionHandler;

  constructor() {
    this.actions = {};
    this.actions[ACTIONS.SET_SOCKET_VALUE] = ACTIONS.setSocketValueAction();
    this.actions[ACTIONS.MOVE_NODES] = ACTIONS.MoveNodes();
    this.actions[ACTIONS.ADD_NODE] = ACTIONS.addNode();
    this.actions[ACTIONS.RESIZE_NODE] = ACTIONS.resizeNode();
    this.actions[ACTIONS.CONNECT_SOCKETS] = ACTIONS.connectSockets();
    this.actions[ACTIONS.DISCONNECT_SOCKETS] = ACTIONS.disconnectSockets();
    this.actions[ACTIONS.SET_COMMENT] = ACTIONS.setComment();
    this.actions[ACTIONS.SET_UPDATE_BEHAVIOUR] = ACTIONS.setUpdateBehaviour();
    this.actions[ACTIONS.SET_UI_SURFACE_LAYOUT] = ACTIONS.setUISurfaceLayout();
  }

  static getInstance(): SerializableActionHandler {
    if (SerializableActionHandler.instance == undefined) {
      SerializableActionHandler.instance = new SerializableActionHandler();
    }
    return SerializableActionHandler.instance;
  }

  async performSerializableAction(
    id: string,
    args: any,
    undoArgs: any,
    checksum: string,
    source: ActionSource = 'human',
  ): Promise<boolean> {
    if (this.actions[id] !== undefined) {
      await ActionHandler.performRawAction(
        new BakedAction(this.actions[id], args, undoArgs, checksum, source),
      );
      return true;
    } else {
      return false;
    }
  }

  // use these instead of raw references in undo actions, they will work even if node is deleted and recreated through the undo stack
  static getSafeNode(id: string): PPNode {
    return PPGraph.currentGraph.getNodeById(id);
  }
  static getSafeSocket(
    nodeID: string,
    socketType: TSocketType,
    socketName: string,
  ): Socket {
    return PPGraph.currentGraph
      .getNodeById(nodeID)
      .getSocketByNameAndType(socketName, socketType);
  }
}

export function getSocketChecksum(socket: Socket) {
  return socket.getNode().id + socket.socketType + socket.name;
}

// for multi user workflow we need to call everything that changes the graph in any way through here
// checksum is used to group together multiple actions in a row so that they can be undone in a single
// UNDO, as long as they happen within ACTION_GROUP_WINDOW_MS of each other (sliding window)
export function PNPAction(
  id: string,
  args: any = {},
  undoArgs: any = {},
  checksum: string = hri.random(),
  source: ActionSource = 'human',
): Promise<boolean> {
  return SerializableActionHandler.getInstance().performSerializableAction(
    id,
    args,
    undoArgs,
    checksum,
    source,
  );
}

const MAX_STACK_SIZE = 99;

export class ActionHandler {
  static undoList: BakedAction[] = [];
  static redoList: BakedAction[] = [];
  static graphHasUnsavedChanges = false;

  static clear() {
    this.undoList = [];
    this.redoList = [];
    this.notifyHistoryChanged();
  }

  static getHistorySnapshot(): ActionHistorySnapshot {
    const entries = this.undoList
      .map(
        (action, index): ActionHistoryEntry => ({
          id: action.ID,
          index,
          name: action.serializableAction.name,
          source: action.source,
          applied: true,
        }),
      )
      .concat(
        [...this.redoList].reverse().map(
          (action, redoIndex): ActionHistoryEntry => ({
            id: action.ID,
            index: this.undoList.length + redoIndex,
            name: action.serializableAction.name,
            source: action.source,
            applied: false,
          }),
        ),
      );

    return {
      entries,
      appliedCount: this.undoList.length,
      totalCount: entries.length,
      canUndo: this.undoList.length > 0,
      canRedo: this.redoList.length > 0,
    };
  }

  static notifyHistoryChanged(): void {
    InterfaceController.notifyListeners(
      ListenEvent.ActionHistoryChanged,
      this.getHistorySnapshot(),
    );
  }

  // ONLY use this if its a UI only action, otherwise have to use PNPAction for action to be possible to synchronize over network
  static async performRawAction(action: BakedAction, doAction = true) {
    this.redoList = [];
    if (doAction) {
      await action.serializableAction.action(action.args);
    }

    // consecutive actions sharing a checksum within the merge window are
    // combined into one undo entry (undoArgs of the first edit are kept, so
    // undo restores the state from before the whole burst)
    const lastAction = this.undoList[this.undoList.length - 1];
    if (
      lastAction !== undefined &&
      lastAction.checksum === action.checksum &&
      Date.now() - lastAction.lastMergedTime <= ACTION_GROUP_WINDOW_MS
    ) {
      lastAction.serializableAction.action = action.serializableAction.action;
      lastAction.args = action.args;
      lastAction.source = action.source;
      lastAction.lastMergedTime = Date.now();
    } else {
      this.undoList.push(action);
      if (this.undoList.length > MAX_STACK_SIZE) {
        this.undoList.shift();
      }
    }
    this.setUnsavedChange(true);
    InterfaceController.notifyListeners(ListenEvent.UnsavedChanges, true);
    this.notifyHistoryChanged();
  }
  static async undo() {
    // move top of undo stack to top of redo stack
    const lastAction = this.undoList.pop();
    if (lastAction) {
      const message = 'Undo: ' + lastAction.serializableAction.name;
      InterfaceController.showSpinner(message);
      await lastAction.serializableAction.undoAction(lastAction.undoArgs);
      this.redoList.push(lastAction);
      InterfaceController.hideSpinner(message);
      this.notifyHistoryChanged();
    } else {
      InterfaceController.showSnackBar(
        'Not possible to undo, nothing in undo stack',
      );
    }
  }
  static async redo() {
    const lastUndo = this.redoList.pop();
    if (lastUndo) {
      const message = 'Redo: ' + lastUndo.serializableAction.name;
      InterfaceController.showSpinner(message);
      await lastUndo.serializableAction.action(lastUndo.args);
      this.undoList.push(lastUndo);
      InterfaceController.hideSpinner(message);
      this.notifyHistoryChanged();
    } else {
      InterfaceController.showSnackBar(
        'Not possible to redo, nothing in redo stack',
      );
    }
  }

  static async goToHistoryIndex(appliedCount: number): Promise<void> {
    const targetAppliedCount = Math.max(
      0,
      Math.min(appliedCount, this.undoList.length + this.redoList.length),
    );

    while (this.undoList.length > targetAppliedCount) {
      await this.undo();
    }

    while (this.undoList.length < targetAppliedCount) {
      await this.redo();
    }
  }

  static setUnsavedChange(state: boolean): void {
    InterfaceController.notifyListeners(ListenEvent.UnsavedChanges, state);
    this.graphHasUnsavedChanges = state;
    PPStorage.getInstance().autoBackupThrottled();
    if (InterfaceController.showUnsavedChangesWarning) {
      if (this.graphHasUnsavedChanges) {
        window.addEventListener('beforeunload', this.onBeforeUnload, {
          capture: true,
        });
      } else {
        window.removeEventListener('beforeunload', this.onBeforeUnload, {
          capture: true,
        });
      }
    }
  }

  static existsUnsavedChanges(): boolean {
    return this.graphHasUnsavedChanges;
  }

  // triggers native browser reload/close site dialog
  static onBeforeUnload(event: BeforeUnloadEvent): string {
    event.preventDefault();
    return (event.returnValue = '');
  }
}
export class SetSocketValueActionArgs {
  nodeID: string;
  socketType: TSocketType;
  socketName: string;
  newValue: any;
}

export class AddNodeActionArgs {
  nodeName: string;
  nodeID: string;
  isCustomFunction?: boolean;
  addLinkNodeID: string | undefined = undefined;
  addLinkSocketName: string | undefined = undefined;
  addLinkSocketType: TSocketType | undefined = undefined;
  position: PIXI.Point;

  constructor(
    inNodeName: string,
    inPosition: PIXI.Point,
    inNodeID: string = hri.random(),
    inAddLinkNodeID = undefined,
    inAddLinkSocketName = undefined,
    inAddLinkSocketType = undefined,
    inIsCustomFunction = false,
  ) {
    this.nodeName = inNodeName;
    this.nodeID = inNodeID;
    this.isCustomFunction = inIsCustomFunction;
    this.position = inPosition;
    this.addLinkNodeID = inAddLinkNodeID;
    this.addLinkSocketName = inAddLinkSocketName;
    this.addLinkSocketType = inAddLinkSocketType;
  }
}

export class ConnectSocketsActionArgs {
  sourceNodeID: string;
  sourceSocketName: string;
  targetNodeID: string;
  targetSocketName: string;

  constructor(
    sourceNodeID: string,
    sourceSocketName: string,
    targetNodeID: string,
    targetSocketName: string,
  ) {
    this.sourceNodeID = sourceNodeID;
    this.sourceSocketName = sourceSocketName;
    this.targetNodeID = targetNodeID;
    this.targetSocketName = targetSocketName;
  }
}
export class SetCommentActionArgs {
  nodeID: string;
  comment: string;

  constructor(nodeID: string, comment: string) {
    this.nodeID = nodeID;
    this.comment = comment;
  }
}

export class SetUpdateBehaviourActionArgs {
  nodeID: string;
  load: boolean;
  update: boolean;
  interval: boolean;
  intervalFrequency: number;

  constructor(
    nodeID: string,
    load: boolean,
    update: boolean,
    interval: boolean,
    intervalFrequency: number,
  ) {
    this.nodeID = nodeID;
    this.load = load;
    this.update = update;
    this.interval = interval;
    this.intervalFrequency = intervalFrequency;
  }
}

export class SetUISurfaceLayoutActionArgs {
  nodeID: string;
  treeJSON: string; // stringified SerializedCraftTree

  constructor(nodeID: string, treeJSON: string) {
    this.nodeID = nodeID;
    this.treeJSON = treeJSON;
  }
}

export class ResizeNodeActionArgs {
  nodeID: string;
  width: number;
  height: number;

  constructor(nodeID: string, width: number, height: number) {
    this.nodeID = nodeID;
    this.width = width;
    this.height = height;
  }
}

export class ACTIONS {
  static ADD_NODE = 'AddNode';
  static RESIZE_NODE = 'ResizeNodeAction';
  static SET_SOCKET_VALUE = 'SetSocketValueAction';
  static MOVE_NODES = 'MoveNodesAction';
  static CONNECT_SOCKETS = 'ConnectSocketsAction';
  static DISCONNECT_SOCKETS = 'DisconnectSocketsAction';
  static SET_COMMENT = 'SetCommentAction';
  static SET_UPDATE_BEHAVIOUR = 'SetUpdateBehaviourAction';
  static SET_UI_SURFACE_LAYOUT = 'SetUISurfaceLayoutAction';

  private static async setNodeValue(args: SetSocketValueActionArgs) {
    const nodeID = args.nodeID;
    const socketName = args.socketName;
    const node = PPGraph.currentGraph.nodes[nodeID];
    const socket = node.getSocketByNameAndType(socketName, args.socketType);
    const alsoExecute = node.updateBehaviour.update;
    socket.data = args.newValue;
    if (alsoExecute) {
      await node.executeOptimizedChain();
    }
    node.socketChangedFromWidget();
  }
  static setSocketValueAction(): SerializableAction {
    return {
      action: (args: SetSocketValueActionArgs) => this.setNodeValue(args),
      undoAction: (args: SetSocketValueActionArgs) => this.setNodeValue(args),
      name: 'Set socket value',
    };
  }
  static MoveNodes(): SerializableAction {
    const action = (args): Promise<void> => {
      const positions: PIXI.ObservablePoint[] = args.Positions;
      const nodes: string[] = args.Nodes;
      positions.forEach((pos, index) => {
        PPGraph.currentGraph.nodes[nodes[index]].setPosition(pos.x, pos.y);
      });
      PPGraph.currentGraph.selection.drawRectanglesFromSelection();
      return Promise.resolve();
    };
    return { action: action, undoAction: action, name: 'Move Node(s)' };
  }

  static addNode(): SerializableAction {
    const action = async (args: AddNodeActionArgs) => {
      InterfaceController.setIsNodeSearchVisible(false);
      let addedNode: PPNode;
      // a bit hacky with the macro stuff
      const nodeExists =
        !args.isCustomFunction ||
        args.nodeName.startsWith(executeMacroPrefix) ||
        args.nodeName.startsWith(mapExecuteMacroPrefix);
      const linkedSocket =
        args.addLinkNodeID !== undefined &&
        args.addLinkSocketName !== undefined &&
        args.addLinkSocketType !== undefined
          ? PPGraph.currentGraph.nodes[
              args.addLinkNodeID
            ].getSocketByNameAndType(
              args.addLinkSocketName,
              args.addLinkSocketType,
            )
          : undefined;

      const nodeParams = {
        overrideId: args.nodeID,
        nodePosX: args.position.x,
        nodePosY: args.position.y,
      };
      if (nodeExists) {
        // tiny bit hacky - we have the execute macro things now in the list
        let addedMacroCaller = false;
        let addedMacroName = '';
        if (args.nodeName.startsWith(executeMacroPrefix)) {
          addedMacroCaller = true;
          addedNode = await PPGraph.currentGraph.addNewNode(
            'ExecuteMacro',
            nodeParams,
            linkedSocket ? NODE_SOURCE.NEWCONNECTED : NODE_SOURCE.NEW,
          );
          addedMacroName = args.nodeName.replace(executeMacroPrefix, '');
        } else if (args.nodeName.startsWith(mapExecuteMacroPrefix)) {
          addedMacroCaller = true;
          addedNode = await PPGraph.currentGraph.addNewNode(
            'MapExecuteMacro',
            nodeParams,
            linkedSocket ? NODE_SOURCE.NEWCONNECTED : NODE_SOURCE.NEW,
          );
          addedMacroName = args.nodeName.replace(mapExecuteMacroPrefix, '');
        } else {
          // if it wasnt these guys then its a normal node
          addedNode = await PPGraph.currentGraph.addNewNode(
            args.nodeName,
            nodeParams,
            linkedSocket ? NODE_SOURCE.NEWCONNECTED : NODE_SOURCE.NEW,
          );
        }
        if (addedMacroCaller) {
          addedNode.setInputData(macroNameName, addedMacroName);
          addedNode.calledMacroUpdatedMeta();
        }
      } else {
        addedNode = await PPGraph.currentGraph.addNewNode(
          'CustomFunction',
          nodeParams,
          linkedSocket ? NODE_SOURCE.NEWCONNECTED : NODE_SOURCE.NEW,
        );
        addedNode.setNodeName(args.nodeName);
      }
      if (linkedSocket) {
        if (linkedSocket.isInput()) {
          await addedNode.populateDefaults(linkedSocket);
          await addedNode.execute();
        }
        const [input, output] = getSocketsForConnection(
          addedNode,
          linkedSocket,
        );
        const connectActions = PPGraph.currentGraph.actions_Connect(
          output.name,
          output.getNode().id,
          input.name,
          input.getNode().id,
        );
        await connectActions[0]();
      }
    };
    const undoAction = async (args: AddNodeActionArgs) => {
      await PPGraph.currentGraph.removeNode(
        SerializableActionHandler.getSafeNode(args.nodeID),
      );
    };
    return {
      action,
      undoAction,
      name: 'Add Node',
    };
  }

  static resizeNode(): SerializableAction {
    const action = (args: ResizeNodeActionArgs): Promise<void> => {
      const node = SerializableActionHandler.getSafeNode(args.nodeID);
      node.resizeAndDraw(args.width, args.height);
      PPGraph.currentGraph.selection.drawRectanglesFromSelection();
      return Promise.resolve();
    };
    return {
      action,
      undoAction: action,
      name: 'Resize Node',
    };
  }

  static connectSockets(): SerializableAction {
    const action = async (args: ConnectSocketsActionArgs) => {
      await PPGraph.currentGraph.linkConnect(
        args.sourceNodeID,
        args.sourceSocketName,
        args.targetNodeID,
        args.targetSocketName,
        true,
      );
    };
    const undoAction = (args: ConnectSocketsActionArgs): Promise<void> => {
      PPGraph.currentGraph.linkDisconnect(
        args.targetNodeID,
        args.targetSocketName,
        true,
      );
      return Promise.resolve();
    };
    return {
      action,
      undoAction,
      name: 'Connect Sockets',
    };
  }

  static disconnectSockets(): SerializableAction {
    const action = (args: ConnectSocketsActionArgs): Promise<void> => {
      PPGraph.currentGraph.linkDisconnect(
        args.targetNodeID,
        args.targetSocketName,
        true,
      );
      return Promise.resolve();
    };
    const undoAction = async (args: ConnectSocketsActionArgs) => {
      await PPGraph.currentGraph.linkConnect(
        args.sourceNodeID,
        args.sourceSocketName,
        args.targetNodeID,
        args.targetSocketName,
        true,
      );
    };
    return {
      action,
      undoAction,
      name: 'Disconnect Sockets',
    };
  }

  static setComment(): SerializableAction {
    const action = (args: SetCommentActionArgs): Promise<void> => {
      const node = SerializableActionHandler.getSafeNode(args.nodeID);
      node.setComment(args.comment);
      return Promise.resolve();
    };
    return {
      action,
      undoAction: action,
      name: 'Set Comment',
    };
  }

  static setUISurfaceLayout(): SerializableAction {
    const apply = (args: SetUISurfaceLayoutActionArgs): Promise<void> => {
      const node = SerializableActionHandler.getSafeNode(args.nodeID);
      if (node && isSurfaceNode(node)) {
        node.setSurfaceTree(JSON.parse(args.treeJSON));
      }
      return Promise.resolve();
    };
    return {
      action: apply,
      undoAction: apply,
      name: 'Edit UI layout',
    };
  }

  static setUpdateBehaviour(): SerializableAction {
    const action = (args: SetUpdateBehaviourActionArgs): Promise<void> => {
      const node = SerializableActionHandler.getSafeNode(args.nodeID);
      node.updateBehaviour.setUpdateBehaviour(
        args.load,
        args.update,
        args.interval,
        args.intervalFrequency,
      );
      return Promise.resolve();
    };
    return {
      action,
      undoAction: action,
      name: 'Set Update Behaviour',
    };
  }
}
