// Removed nodes. Each class keeps its old name, which is the type saved graphs
// refer to, and only says what replaces it.
import { DeprecatedNode } from './DeprecatedNode';
import {
  replaceCopySocketValue,
  replaceLegacyStorageNode,
  replaceStateNode,
} from '../state/migrations';
import { replaceLabelNode } from '../../text/nodeMigrations';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { SOCKET_NAME_DASHBOARD_CONTENT } from '../../utils/layoutableHelpers';
import { DeferredReactType } from '../datatypes/deferredHtmlType';
import { StringType } from '../datatypes/stringType';
import {
  NodeReplacement,
  NodeReplacementContext,
  SerializedNode,
} from '../../utils/interfaces';

export class Label extends DeprecatedNode {
  public getName(): string {
    return 'Label';
  }
  // the sockets its replacement keeps links on, there even if not saved
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Input', new StringType()),
      new Socket(SOCKET_TYPE.OUT, 'Output', new StringType()),
      new Socket(
        SOCKET_TYPE.OUT,
        SOCKET_NAME_DASHBOARD_CONTENT,
        new DeferredReactType(),
        undefined,
        false,
      ),
    ];
  }
  protected getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement {
    return replaceLabelNode(node, context);
  }
}

abstract class DeprecatedStateNode extends DeprecatedNode {
  protected getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement {
    return replaceStateNode(node, context);
  }
}

export class State extends DeprecatedStateNode {
  public getName(): string {
    return 'State';
  }
}

export class NumberState extends DeprecatedStateNode {
  public getName(): string {
    return 'Number state';
  }
}

export class ArrayState extends DeprecatedStateNode {
  public getName(): string {
    return 'Array state';
  }
}

export class ObjectState extends DeprecatedStateNode {
  public getName(): string {
    return 'Object state';
  }
}

export class StateRead extends DeprecatedStateNode {
  public getName(): string {
    return 'State Read';
  }
}

export class StateWrite extends DeprecatedStateNode {
  public getName(): string {
    return 'State Write';
  }
}

export class CopySocketValue extends DeprecatedNode {
  public getName(): string {
    return 'Trigger Copy Socket Value';
  }
  protected getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement {
    return replaceCopySocketValue(node, context);
  }
}

abstract class DeprecatedStorageNode extends DeprecatedNode {
  // these were already stubs at version 2
  public getVersion(): number {
    return 3;
  }
  protected getReplacement(
    node: SerializedNode,
    context: NodeReplacementContext,
  ): NodeReplacement {
    return replaceLegacyStorageNode(node, context);
  }
}

export class LocalStorageWrite extends DeprecatedStorageNode {
  public getName(): string {
    return 'Local Storage Write';
  }
}

export class LocalStorageDelete extends DeprecatedStorageNode {
  public getName(): string {
    return 'Local Storage Delete';
  }
}

export class LocalStorageBrowse extends DeprecatedStorageNode {
  public getName(): string {
    return 'Browse Object in Local Storage';
  }
}

export class UserStorageWrite extends DeprecatedStorageNode {
  public getName(): string {
    return 'User Storage Write';
  }
}

export class UserStorageRead extends DeprecatedStorageNode {
  public getName(): string {
    return 'User Storage Read';
  }
}

export class UserStorageDelete extends DeprecatedStorageNode {
  public getName(): string {
    return 'User Storage Delete';
  }
}

export class UserStorageBrowse extends DeprecatedStorageNode {
  public getName(): string {
    return 'Browse User Storage';
  }
}
