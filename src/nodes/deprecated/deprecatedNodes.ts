// Removed nodes. Each class keeps its old name, which is the type saved graphs
// refer to, and only says what replaces it.
import { DeprecatedNode } from './DeprecatedNode';
import type {
  NodeReplacement,
  NodeReplacementContext,
  SerializedLink,
  SerializedNode,
  SerializedSocket,
} from '../../utils/interfaces';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import { StringType } from '../datatypes/stringType';
import { NumberType } from '../datatypes/numberType';
import { TriggerType } from '../datatypes/triggerType';
import { plainTextToMarkdown } from '../../text/markdownEscaping';
import { textDefaultProps } from '../../text/model';
import {
  TEXT_NODE_TYPE,
  textPropsToSocketValues,
} from '../../text/nodeSockets';
import { TEXT_SOCKET_TYPES } from '../../text/nodeMigrations';
import { formatToken } from '../../text/tokens';

const input = (
  name: string,
  data: unknown,
  type = 'StringType',
): SerializedSocket => ({
  socketType: 'in',
  name,
  data,
  dataType: JSON.stringify({ class: type }),
  visible: false,
  dependentSocketName: undefined,
});

// sockets the node already has keep their value
const withDefaults = (
  sockets: SerializedSocket[],
  defaults: SerializedSocket[],
): SerializedSocket[] => [
  ...sockets,
  ...defaults.filter(
    (socket) =>
      !sockets.some(
        (existing) =>
          existing.name === socket.name &&
          existing.socketType === socket.socketType,
      ),
  ),
];

const linksOf = (node: SerializedNode, links: SerializedLink[]) =>
  links.filter(
    (link) => link.sourceNodeId === node.id || link.targetNodeId === node.id,
  );

const kindOf = (node: SerializedNode) => String(node.type).toLowerCase();

const LEGACY_INPUT = 'Input';
const LABEL_OUTPUT = 'Output';
const REACT_UI_OUTPUT = 'ReactUI';
const CONSTANT_STRING_NODE_TYPE = 'CONSTANT_String';
const CONSTANT_STRING_SOCKET = 'String';

const stringSocket = (
  socketType: 'in' | 'out',
  data: unknown,
): SerializedSocket => ({
  socketType,
  name: CONSTANT_STRING_SOCKET,
  dataType: JSON.stringify({ class: 'StringType' }),
  data,
  visible: true,
  dependentSocketName: undefined,
});

// A Label showing a linked value, or placed on a UI page, keeps doing that as
// Dynamic text; its Input stays as the {{Input}} token's socket.
function labelToDynamicText(
  node: SerializedNode,
  inputIsLinked: boolean,
): SerializedNode {
  const input = node.socketArray.find(
    (socket) => socket.name === LEGACY_INPUT && socket.socketType !== 'out',
  );
  const content = inputIsLinked
    ? formatToken({ path: [LEGACY_INPUT] })
    : plainTextToMarkdown(input?.data == null ? '' : String(input.data));
  const values = textPropsToSocketValues({ ...textDefaultProps, content });
  return {
    ...node,
    type: TEXT_NODE_TYPE,
    version: undefined,
    socketArray: [
      ...node.socketArray.filter(
        (socket) =>
          socket.socketType === 'out' || (inputIsLinked && socket === input),
      ),
      ...Object.entries(values).map(([name, value]) => ({
        socketType: 'in' as const,
        name,
        dataType: JSON.stringify({
          class: TEXT_SOCKET_TYPES[name],
        }),
        data: value,
        visible: false,
        dependentSocketName: undefined,
      })),
    ],
  };
}

function labelToConstantString(node: SerializedNode): SerializedNode {
  const input = node.socketArray.find(
    (socket) => socket.name === LEGACY_INPUT && socket.socketType !== 'out',
  );
  const text = input?.data == null ? '' : String(input.data);
  return {
    ...node,
    type: CONSTANT_STRING_NODE_TYPE,
    version: undefined,
    // the Label's box fitted its own font size; the Constant sizes to its text
    width: 0,
    height: 0,
    socketArray: [stringSocket('in', text), stringSocket('out', text)],
  };
}

/**
 * The Label node is gone. A Label whose Input is linked, or that sits on a UI
 * page, becomes Dynamic text; every other Label becomes a Constant String
 * holding its text. Styling is dropped, along with links into it. The id
 * stays, so links out of the Label and page placements survive.
 */
export class Label extends DeprecatedNode {
  public getName(): string {
    return 'Label';
  }
  // the sockets its replacement keeps links on, there even if not saved
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, LEGACY_INPUT, new StringType()),
      new Socket(SOCKET_TYPE.OUT, LABEL_OUTPUT, new StringType()),
      new Socket(
        SOCKET_TYPE.OUT,
        REACT_UI_OUTPUT,
        new DeferredReactType(),
        undefined,
        false,
      ),
    ];
  }
  protected getReplacement(
    node: SerializedNode,
    { links }: NodeReplacementContext,
  ): NodeReplacement {
    const inputIsLinked = links.some(
      (link) =>
        link.targetNodeId === node.id && link.targetSocketName === LEGACY_INPUT,
    );
    const onPage = links.some(
      (link) =>
        link.sourceNodeId === node.id &&
        link.sourceSocketName === REACT_UI_OUTPUT,
    );
    const asText = inputIsLinked || onPage;
    return {
      nodes: [
        asText
          ? labelToDynamicText(node, inputIsLinked)
          : labelToConstantString(node),
      ],
      links: links
        .filter(
          (link) =>
            link.sourceNodeId === node.id ||
            (link.targetNodeId === node.id &&
              inputIsLinked &&
              link.targetSocketName === LEGACY_INPUT),
        )
        .map((link) =>
          link.sourceNodeId === node.id &&
          !asText &&
          link.sourceSocketName === LABEL_OUTPUT
            ? { ...link, sourceSocketName: CONSTANT_STRING_SOCKET }
            : link,
        ),
    };
  }
}

// Socket names, the id and links stay, including custom trigger methods.
abstract class DeprecatedStateNode extends DeprecatedNode {
  protected abstract replacementType(): string;

  // the accumulators keep State as their saved initial value, under their own key
  protected addedInputs(node: SerializedNode): SerializedSocket[] {
    return [input('State key', node.id)];
  }

  protected getReplacement(
    node: SerializedNode,
    { links }: NodeReplacementContext,
  ): NodeReplacement {
    return {
      nodes: [
        {
          ...node,
          type: this.replacementType(),
          version: undefined,
          socketArray: withDefaults(node.socketArray, this.addedInputs(node)),
        },
      ],
      links: linksOf(node, links),
    };
  }
}

export class State extends DeprecatedStateNode {
  public getName(): string {
    return 'State';
  }
  protected replacementType(): string {
    return 'StorageState';
  }
}

export class NumberState extends DeprecatedStateNode {
  public getName(): string {
    return 'Number state';
  }
  protected replacementType(): string {
    return 'StorageNumberState';
  }
}

export class ArrayState extends DeprecatedStateNode {
  public getName(): string {
    return 'Array state';
  }
  protected replacementType(): string {
    return 'StorageArrayState';
  }
}

export class ObjectState extends DeprecatedStateNode {
  public getName(): string {
    return 'Object state';
  }
  protected replacementType(): string {
    return 'StorageObjectState';
  }
}

// State Read and Write share the session's State location
abstract class DeprecatedStateAccess extends DeprecatedStateNode {
  protected addedInputs(): SerializedSocket[] {
    return [
      input('Storage type', 'Session', 'EnumType'),
      input('Location', 'State'),
      input('Non-empty only', false, 'BooleanType'),
    ];
  }
}

export class StateRead extends DeprecatedStateAccess {
  public getName(): string {
    return 'State Read';
  }
  protected replacementType(): string {
    return 'StorageRead';
  }
}

export class StateWrite extends DeprecatedStateAccess {
  public getName(): string {
    return 'State Write';
  }
  protected replacementType(): string {
    return 'StorageWrite';
  }
}

const targetId = (node: string, socket: string) =>
  JSON.stringify([node, socket]);
const address = (key: string) => [
  input('Storage type', 'Session', 'EnumType'),
  input('Key', key),
];

const readsKey = (node: SerializedNode | undefined, key: string) =>
  node !== undefined &&
  kindOf(node) === 'storageread' &&
  node.socketArray.some(
    (socket) =>
      socket.socketType === 'in' &&
      socket.name === 'Key' &&
      socket.data === key,
  );

/**
 * Copy Socket Value pushed its value into a fixed input. It becomes a Storage
 * Write under the same id, plus a Storage Read wired into each input it fed.
 * Copies into the same input share one reader.
 */
export class CopySocketValue extends DeprecatedNode {
  public getName(): string {
    return 'Trigger Copy Socket Value';
  }
  protected getReplacement(
    node: SerializedNode,
    { links, getNode }: NodeReplacementContext,
  ): NodeReplacement {
    const socketName =
      node.socketArray.find(
        (socket) =>
          socket.socketType === 'in' && socket.name === 'Input Socket',
      )?.data ?? 'Input';
    const destinations = new Map<
      string,
      { node: SerializedNode; socket: string }
    >();
    for (const link of links) {
      if (link.sourceNodeId !== node.id || link.sourceSocketName !== 'Value')
        continue;
      const target = getNode(link.targetNodeId);
      if (!target) continue;
      // Preserve both the explicitly copied input and normal output propagation.
      for (const name of new Set([String(socketName), link.targetSocketName])) {
        if (
          name !== link.targetSocketName &&
          !target.socketArray.some(
            (socket) => socket.socketType === 'in' && socket.name === name,
          )
        )
          continue;
        destinations.set(targetId(target.id, name), {
          node: target,
          socket: name,
        });
      }
    }

    const keys: string[] = [];
    const readers: SerializedNode[] = [];
    const readerLinks: SerializedLink[] = [];
    for (const [destination, target] of destinations) {
      const key = `Copy/${destination}`;
      keys.push(key);
      const feeding = links.find(
        (link) =>
          link.targetNodeId === target.node.id &&
          link.targetSocketName === target.socket,
      );
      const feeder = feeding && getNode(feeding.sourceNodeId);
      // its reader is there already, or the copy feeding it adds it on migrating
      if (
        feeder &&
        feeder.id !== node.id &&
        (readsKey(feeder, key) || kindOf(feeder) === 'copysocketvalue')
      )
        continue;

      let id = `${node.id}-read-${readers.length + 1}`;
      while (getNode(id) || readers.some((reader) => reader.id === id))
        id += '-1';
      const original = target.node.socketArray.find(
        (socket) => socket.socketType === 'in' && socket.name === target.socket,
      );
      readers.push({
        ...node,
        id,
        name: undefined,
        type: 'StorageRead',
        version: undefined,
        x: target.node.x - 220,
        y: target.node.y + readers.length * 40,
        updateBehaviour: {
          ...node.updateBehaviour,
          load: true,
          update: true,
          interval: false,
        },
        socketArray: [
          ...address(key),
          {
            ...input('Fallback value', original?.data, 'AnyType'),
            dataType: original?.dataType ?? input('', null, 'AnyType').dataType,
          },
          { ...input('Value', original?.data, 'AnyType'), socketType: 'out' },
        ],
      });
      readerLinks.push({
        sourceNodeId: id,
        sourceSocketName: 'Value',
        targetNodeId: target.node.id,
        targetSocketName: target.socket,
      });
    }

    const writer: SerializedNode = {
      ...node,
      type: 'StorageWrite',
      version: undefined,
      socketArray: [
        ...node.socketArray.filter(
          (socket) =>
            socket.name === 'Execute' ||
            (socket.name === 'Value' && socket.socketType === 'in'),
        ),
        ...address(keys[0] ?? `Copy/${node.id}`),
        input('Non-empty only', false, 'BooleanType'),
        // Hidden migration input lets one old trigger update several independent keys.
        ...(keys.length > 1
          ? [input('Additional keys', keys.slice(1), 'ArrayType')]
          : []),
      ],
    };
    return {
      nodes: [writer, ...readers],
      links: [
        ...links.filter(
          (link) =>
            link.targetNodeId === node.id &&
            link.targetSocketName !== 'Input Socket',
        ),
        ...readerLinks,
      ],
    };
  }
}

// Local Storage and User Storage nodes become Storage nodes on IndexedDB and
// Cloud, with their renamed inputs and wiring.
abstract class DeprecatedStorageNode extends DeprecatedNode {
  // these were already stubs at version 2
  public getVersion(): number {
    return 3;
  }

  protected abstract replacementType(): string;

  protected renamedInputs(): Record<string, string> {
    return {};
  }

  protected abstract addedInputs(): SerializedSocket[];

  protected getReplacement(
    node: SerializedNode,
    { links }: NodeReplacementContext,
  ): NodeReplacement {
    const names = this.renamedInputs();
    const sockets = node.socketArray.map((socket) => ({
      ...socket,
      name:
        socket.socketType === 'out'
          ? socket.name
          : (names[socket.name] ?? socket.name),
    }));
    return {
      nodes: [
        {
          ...node,
          type: this.replacementType(),
          version: undefined,
          socketArray: withDefaults(sockets, this.addedInputs()),
        },
      ],
      links: linksOf(node, links).map((link) =>
        link.targetNodeId === node.id
          ? {
              ...link,
              targetSocketName:
                names[link.targetSocketName] ?? link.targetSocketName,
            }
          : link,
      ),
    };
  }
}

const writeInputs = () => [
  input('Non-empty only', false, 'BooleanType'),
  input('Insert only', false, 'BooleanType'),
];

abstract class DeprecatedLocalStorageNode extends DeprecatedStorageNode {
  protected renamedInputs(): Record<string, string> {
    return { 'Local Storage Key': 'Location', 'Object Key': 'Key' };
  }
  protected addedInputs(): SerializedSocket[] {
    return [
      input('Storage type', 'IndexedDB', 'EnumType'),
      input('Show Toast Notification', false, 'BooleanType'),
    ];
  }
}

export class LocalStorageWrite extends DeprecatedLocalStorageNode {
  public getName(): string {
    return 'Local Storage Write';
  }
  protected replacementType(): string {
    return 'StorageWrite';
  }
  protected addedInputs(): SerializedSocket[] {
    return [...super.addedInputs(), ...writeInputs()];
  }
}

export class LocalStorageDelete extends DeprecatedLocalStorageNode {
  public getName(): string {
    return 'Local Storage Delete';
  }
  protected replacementType(): string {
    return 'StorageDelete';
  }
}

export class LocalStorageBrowse extends DeprecatedLocalStorageNode {
  public getName(): string {
    return 'Browse Object in Local Storage';
  }
  protected replacementType(): string {
    return 'StorageRead';
  }
  protected renamedInputs(): Record<string, string> {
    return {
      'Local Storage Key': 'Location',
      Selected: 'Key',
      'Fallback Value': 'Fallback value',
    };
  }
}

abstract class DeprecatedUserStorageNode extends DeprecatedStorageNode {
  protected addedInputs(): SerializedSocket[] {
    return [input('Storage type', 'Cloud', 'EnumType')];
  }
}

export class UserStorageWrite extends DeprecatedUserStorageNode {
  public getName(): string {
    return 'User Storage Write';
  }
  protected replacementType(): string {
    return 'StorageWrite';
  }
  protected addedInputs(): SerializedSocket[] {
    return [...super.addedInputs(), ...writeInputs()];
  }
}

export class UserStorageRead extends DeprecatedUserStorageNode {
  public getName(): string {
    return 'User Storage Read';
  }
  protected replacementType(): string {
    return 'StorageRead';
  }
  protected addedInputs(): SerializedSocket[] {
    return [
      ...super.addedInputs(),
      input('Show Toast Notification', false, 'BooleanType'),
    ];
  }
}

export class UserStorageDelete extends DeprecatedUserStorageNode {
  public getName(): string {
    return 'User Storage Delete';
  }
  protected replacementType(): string {
    return 'StorageDelete';
  }
}

export class UserStorageBrowse extends DeprecatedUserStorageNode {
  public getName(): string {
    return 'Browse User Storage';
  }
  protected replacementType(): string {
    return 'StorageBrowse';
  }
}

// Sequence and Get Draw Bounds were default exports, so both registered as
// "default" and Sequence, registered last, won: a saved "default" node has
// always loaded as a Sequence. Both now have their class names as keys, and
// this stub takes over "default" - which is why it is this module's default
// export and has no named one.
class DefaultSequence extends DeprecatedNode {
  public getName(): string {
    return 'Sequence';
  }
  // the sockets its replacement keeps links on, there even if not saved
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.TRIGGER, 'Trigger', new TriggerType()),
      new Socket(SOCKET_TYPE.OUT, 'Sequence 0', new NumberType()),
    ];
  }
  protected getReplacement(
    node: SerializedNode,
    { links }: NodeReplacementContext,
  ): NodeReplacement {
    return {
      nodes: [{ ...node, type: 'Sequence', version: undefined }],
      links: linksOf(node, links),
    };
  }
}
export default DefaultSequence;
