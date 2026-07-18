import FlowLogic from '../../classes/FlowLogic';
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
import { BackPropagation } from '../../interfaces';
import {
  FALLBACK_VALUE_NAME,
  getExecuteTriggerSocket,
  hasValueChanged,
  INPUT_SOCKET_NAME,
  KEY_NAME,
  VALUE_NAME,
} from './storage';

// Shared in-memory key-value store for StateRead/StateWrite nodes
const stateStore = new Map<string, any>();

async function notifyStateReadNodes(key: string): Promise<void> {
  const graph = PPGraph.currentGraph;
  if (!graph.nodes) {
    return;
  }

  const nodesToExecute = Object.values(graph.nodes).filter((node) =>
    node.shouldExecuteOnStateValueChanged(key),
  );

  if (nodesToExecute.length === 0) {
    return;
  }

  await FlowLogic.executeOptimizedChainBatch(nodesToExecute);
}

function getStateSocketPair(stateType: AbstractType): Socket[] {
  return [
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

  protected onExecute = this.passThrough;
  protected clear(): void {
    void this.updateState(this.getStateType().getDefaultValue());
  }

  protected abstract getStateType(): AbstractType;
  protected abstract getDefaultInput(): any;
  protected abstract add(): void;
  protected abstract remove(): void;

  protected async updateState(state: any): Promise<void> {
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
  protected remove(): void {
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
  protected add(): void {
    void this.updateState(this.getInputData(VALUE_NAME));
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

  protected add(): void {
    const state: any[] = this.getInputData('State');
    state.push(structuredClone(this.getInputData('Input')));
    const maxSize = this.getInputData('MaxSize');
    trimArrayToMaxSize(state, maxSize);
    void this.updateState(state);
  }

  protected remove(): void {
    const state: any[] = this.getInputData('State');
    state.pop();
    void this.updateState(state);
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

  protected add(): void {
    const state = this.getInputData('State');
    const key = this.getInputData(KEY_NAME);
    if (state[key] === undefined) {
      state[key] = [];
    }
    state[key].push(structuredClone(this.getInputData('Input')));
    const maxSize = this.getInputData('MaxSize');
    trimArrayToMaxSize(state[key], maxSize);
    void this.updateState(state);
  }

  protected remove(): void {
    const state: any[] = this.getInputData('State');
    const key = this.getInputData(KEY_NAME);
    if (state[key] !== undefined) {
      state[key].pop();
      void this.updateState(state);
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
  protected remove(): void {
    void this.updateState(
      this.getInputData('State') - this.getInputData('Remove Amount'),
    );
  }
  protected add(): void {
    void this.updateState(
      this.getInputData('State') + this.getInputData('Add Amount'),
    );
  }

  protected getDefaultInput(): any {
    return 1;
  }
}

export class StateWrite extends PPNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  public getName(): string {
    return 'State Write';
  }

  public getDescription(): string {
    return 'Writes a value by key to the in-memory state store';
  }

  public getTags(): string[] {
    return ['State'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === VALUE_NAME;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, KEY_NAME, new StringType(), 'myKey'),
      new Socket(SOCKET_TYPE.IN, VALUE_NAME, new AnyType()),
      new Socket(
        SOCKET_TYPE.TRIGGER,
        'Execute',
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text),
      ),
    ];
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, any>,
  ): Promise<void> {
    const key = input[KEY_NAME];
    const hadPreviousValue = stateStore.has(key);
    const previousValue = hadPreviousValue ? stateStore.get(key) : undefined;
    const nextValue = structuredClone(input[VALUE_NAME]);

    stateStore.set(key, nextValue);

    if (hasValueChanged(hadPreviousValue, previousValue, true, nextValue)) {
      await notifyStateReadNodes(key);
    }
  }
}

export class StateRead extends PPNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public shouldExecuteOnStateValueChanged(key: string): boolean {
    return this.updateBehaviour.update && this.getInputData(KEY_NAME) === key;
  }

  public getName(): string {
    return 'State Read';
  }

  public getDescription(): string {
    return 'Reads a value by key from the in-memory state store';
  }

  public getTags(): string[] {
    return ['State'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === FALLBACK_VALUE_NAME;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, KEY_NAME, new StringType(), 'myKey'),
      new Socket(SOCKET_TYPE.IN, FALLBACK_VALUE_NAME, new AnyType()),
      new Socket(SOCKET_TYPE.OUT, VALUE_NAME, new AnyType()),
    ];
  }

  protected onExecute(input, output): Promise<void> {
    const key = input[KEY_NAME];
    if (stateStore.has(key)) {
      output[VALUE_NAME] = stateStore.get(key);
    } else {
      output[VALUE_NAME] = input[FALLBACK_VALUE_NAME];
    }
    return Promise.resolve();
  }
}

export class CopySocketValue extends PPNode {
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
