import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { AbstractType } from '../datatypes/abstractType';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import {
  StorageRead,
  StorageWrite,
  readSessionState,
  writeSessionState,
} from './storage';
import { BackPropagation } from '../../interfaces';
import {
  getExecuteTriggerSocket,
  INPUT_SOCKET_NAME,
  KEY_NAME,
  VALUE_NAME,
} from './storage';

function getStateSocketPair(stateType: AbstractType): Socket[] {
  return [
    new Socket(
      SOCKET_TYPE.IN,
      'Location',
      new StringType(),
      PPGraph.currentGraph?.id ?? 'State',
      false,
    ),
    new Socket(SOCKET_TYPE.IN, 'State key', new StringType(), '', false),
    new Socket(
      SOCKET_TYPE.IN,
      'State',
      stateType,
      stateType.getDefaultValue(),
      false,
    ),
    new Socket(
      SOCKET_TYPE.OUT,
      'State',
      stateType,
      stateType.getDefaultValue(),
      true,
    ),
  ];
}

function getTriggerSockets(
  actions: Array<'add' | 'remove' | 'clear'>,
): Socket[] {
  return actions.map(
    (action) =>
      new Socket(
        SOCKET_TYPE.TRIGGER,
        action.charAt(0).toUpperCase() + action.slice(1),
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, action),
      ),
  );
}

function trimArrayToMaxSize(values: any[], maxSize: number): void {
  if (maxSize > 0 && maxSize < values.length) {
    values.splice(0, values.length - maxSize);
  }
}

abstract class StateNode extends PPNode {
  public showInNodeSearch(): boolean {
    return false;
  }
  // A linked State input writes back to its source, even with unused outputs.
  public getSeemsUnused(): boolean {
    return (
      !this.getInputSocketByName('State')?.hasLink() && super.getSeemsUnused()
    );
  }

  public getTags(): string[] {
    return ['State'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    const stateType = this.getStateType();
    return [
      new Socket(
        SOCKET_TYPE.IN,
        'Input',
        new AnyType(),
        this.getDefaultInput(),
      ),
    ].concat(
      getTriggerSockets(['add', 'remove', 'clear']),
      getStateSocketPair(stateType),
    );
  }

  private stateAddress(): [string, string] {
    return [
      this.getInputData('Location'),
      this.getInputData('State key') || this.id,
    ];
  }

  public shouldExecuteOnStorageValueChanged(
    backend: string,
    location: string,
    key: string,
  ): boolean {
    const [ownLocation, ownKey] = this.stateAddress();
    return (
      this.updateBehaviour.update &&
      backend === 'Session' &&
      location === ownLocation &&
      key === ownKey
    );
  }

  protected onExecute = async (input, output): Promise<void> => {
    const linked = this.getInputSocketByName('State').hasLink();
    const state = linked
      ? input.State
      : readSessionState(...this.stateAddress(), input.State);
    if (!linked) this.setInputData('State', structuredClone(state));
    output.State = structuredClone(state);
  };
  protected async clear(): Promise<void> {
    await this.updateState(this.getStateType().getDefaultValue());
  }

  protected abstract getStateType(): AbstractType;
  protected abstract getDefaultInput(): any;
  protected abstract add(): Promise<void>;
  protected abstract remove(): Promise<void>;

  protected async updateState(state: any): Promise<void> {
    await writeSessionState(...this.stateAddress(), state, this);
    this.setInputData('State', state);
    const stateSocket = this.getInputSocketByName('State');
    // this backward propagation thing is so that nodes can connect their output to this state socket and have this state node manage their state (for example table), might be deprecated its a bit convoluted
    if (stateSocket.hasLink()) {
      const sourceNode = stateSocket.links[0].getSource().getNode();
      await sourceNode.executeOptimizedChain();
    } else {
      await this.executeOptimizedChain();
    }
  }

  protected getBackPropagationTargets(): BackPropagation {
    return { SocketToGetValue: this.getInputSocketByName('State') };
  }
}

export class State extends StateNode {
  protected async remove(): Promise<void> {
    // no-op: State only supports add/clear
  }

  protected getDefaultIO(): Socket[] {
    const stateType = this.getStateType();
    return [
      new Socket(
        SOCKET_TYPE.IN,
        VALUE_NAME,
        new AnyType(),
        this.getDefaultInput(),
      ),
    ].concat(
      getTriggerSockets(['add', 'clear']),
      getStateSocketPair(stateType),
    );
  }

  public getName(): string {
    return 'State';
  }

  public getDescription(): string {
    return 'Stores a single State';
  }

  protected getStateType(): AbstractType {
    return new AnyType();
  }
  protected async add(): Promise<void> {
    await this.updateState(this.getInputData(VALUE_NAME));
  }
  protected getDefaultInput(): any {
    return 'Example';
  }
}

export class ArrayState extends StateNode {
  public getName(): string {
    return 'Array state';
  }

  public getDescription(): string {
    return 'Store elements in an array';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'MaxSize', new NumberType(true), 0),
    ].concat(super.getDefaultIO());
  }

  protected async add(): Promise<void> {
    const state: any[] = structuredClone(this.getInputData('State'));
    state.push(structuredClone(this.getInputData('Input')));
    const maxSize = this.getInputData('MaxSize');
    trimArrayToMaxSize(state, maxSize);
    await this.updateState(state);
  }

  protected async remove(): Promise<void> {
    const state: any[] = structuredClone(this.getInputData('State'));
    state.pop();
    await this.updateState(state);
  }

  protected getStateType(): AbstractType {
    return new ArrayType();
  }
  protected getDefaultInput(): any {
    return 'Example';
  }
}

export class ObjectState extends StateNode {
  public getName(): string {
    return 'Object state';
  }

  public getDescription(): string {
    return 'Store elements by key';
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.IN, 'MaxSize', new NumberType(true), 0)]
      .concat(super.getDefaultIO())
      .concat([
        new Socket(SOCKET_TYPE.IN, KEY_NAME, new StringType(), 'ExampleKey'),
      ]);
  }

  protected async add(): Promise<void> {
    const state = structuredClone(this.getInputData('State'));
    const key = this.getInputData(KEY_NAME);
    if (state[key] === undefined) {
      state[key] = [];
    }
    state[key].push(structuredClone(this.getInputData('Input')));
    const maxSize = this.getInputData('MaxSize');
    trimArrayToMaxSize(state[key], maxSize);
    await this.updateState(state);
  }

  protected async remove(): Promise<void> {
    const state: any[] = structuredClone(this.getInputData('State'));
    const key = this.getInputData(KEY_NAME);
    if (state[key] !== undefined) {
      state[key].pop();
      await this.updateState(state);
    }
  }

  protected getStateType(): AbstractType {
    return new JSONType();
  }
  protected getDefaultInput(): any {
    return 'Example';
  }
}

export class NumberState extends StateNode {
  protected getDefaultIO(): Socket[] {
    const stateType = this.getStateType();
    return [
      new Socket(
        SOCKET_TYPE.IN,
        'Add Amount',
        new NumberType(),
        this.getDefaultInput(),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        'Remove Amount',
        new NumberType(),
        this.getDefaultInput(),
      ),
    ].concat(
      getTriggerSockets(['add', 'remove', 'clear']),
      getStateSocketPair(stateType),
    );
  }

  public getName(): string {
    return 'Number state';
  }

  public getDescription(): string {
    return 'Store a number and increment/decrement it';
  }

  protected getStateType(): AbstractType {
    return new NumberType();
  }
  protected async remove(): Promise<void> {
    await this.updateState(
      this.getInputData('State') - this.getInputData('Remove Amount'),
    );
  }
  protected async add(): Promise<void> {
    await this.updateState(
      this.getInputData('State') + this.getInputData('Add Amount'),
    );
  }

  protected getDefaultInput(): any {
    return 1;
  }
}

// Storage-backed adapters preserve the old trigger and socket contract.
export class StorageState extends State {}
export class StorageNumberState extends NumberState {}
export class StorageArrayState extends ArrayState {}
export class StorageObjectState extends ObjectState {}

// Compatibility aliases for saved graphs. New graphs use Storage Read/Write.
export class StateWrite extends StorageWrite {
  public showInNodeSearch(): boolean {
    return false;
  }
  protected getDefaultIO(): Socket[] {
    return sessionDefaults(super.getDefaultIO());
  }
}
export class StateRead extends StorageRead {
  public showInNodeSearch(): boolean {
    return false;
  }
  protected getDefaultIO(): Socket[] {
    return sessionDefaults(super.getDefaultIO());
  }
}
function sessionDefaults(sockets: Socket[]): Socket[] {
  for (const socket of sockets) {
    const value = {
      'Storage type': 'Session',
      Location: 'State',
      Key: 'myKey',
      'Non-empty only': false,
    }[socket.name];
    if (value !== undefined) socket.data = socket.defaultData = value;
  }
  return sockets;
}

export class CopySocketValue extends PPNode {
  public showInNodeSearch(): boolean {
    return false;
  }
  public getName() {
    return 'Trigger Copy Socket Value';
  }

  public getDescription() {
    return 'Copies the value of an socket on a node to an input socket of another node using a trigger socket';
  }

  public getTags(): string[] {
    return ['State'];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, VALUE_NAME, new AnyType(), 'Value'),
      new Socket(SOCKET_TYPE.IN, INPUT_SOCKET_NAME, new StringType(), 'Input'),
      getExecuteTriggerSocket(),
      new Socket(SOCKET_TYPE.OUT, VALUE_NAME, new AnyType(), 'Value'),
    ];
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 10000, this);
  }

  protected async onExecute(input, output) {
    const value = input[VALUE_NAME];
    const socketName = input[INPUT_SOCKET_NAME];
    const links = this.getOutputSocketByName(VALUE_NAME).links;
    for (const link of links) {
      const node = link.getTarget().getNode();
      node.setInputData(socketName, structuredClone(value));
      await node.executeOptimizedChain();
    }
    output[VALUE_NAME] = value;
  }
}
