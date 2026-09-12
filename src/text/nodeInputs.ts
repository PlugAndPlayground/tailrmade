// Where tokens meet the graph: a token resolves against its owning node's
// bindable data inputs only - never the surface or anything else.
import type PPNode from '../classes/NodeClass';
import type Socket from '../classes/SocketClass';
import {
  ACTIONS,
  AddInputSocketActionArgs,
  PNPAction,
} from '../classes/Action';
import { AnyType } from '../nodes/datatypes/anyType';
import { serializeType } from '../nodes/datatypes/typehelper';
import { tokenValueToText } from './tokens';
import type { TokenPickerProps } from './lexical/TokenPickerPlugin';

/** Inputs the node added beyond its content, styling and control sockets. */
export function getBindableInputSockets(node: PPNode): Socket[] {
  return node.inputSocketArray.filter(
    (socket) =>
      !socket.dependentSocketName &&
      !node.hasSocketNameInDefaultIO(socket.name, socket.socketType),
  );
}

export function getTokenInputs(node: PPNode): Record<string, unknown> {
  return Object.fromEntries(
    getBindableInputSockets(node).map((socket) => [socket.name, socket.data]),
  );
}

export function getTokenPickerProps(
  node: PPNode,
): Omit<TokenPickerProps, 'onCreateInput'> {
  return {
    inputs: getBindableInputSockets(node).map((socket) => ({
      name: socket.name,
      preview: tokenValueToText(
        socket.data === undefined || socket.data === null
          ? { resolved: false }
          : { resolved: true, value: socket.data },
      ),
      value: socket.data,
    })),
    takenNames: node.getAllInputSockets().map((socket) => socket.name),
  };
}

/**
 * Adds the input through the undo stack; the caller validated the name. Any
 * value fits, objects included - `{{d.temp}}` reads a field of one.
 */
export function createTokenInput(node: PPNode, name: string): void {
  const args = new AddInputSocketActionArgs(
    node.id,
    name,
    serializeType(new AnyType()),
  );
  void PNPAction(ACTIONS.ADD_INPUT_SOCKET, args, args);
}
