import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE, TRIGGER_TYPE_OPTIONS } from '../../utils/constants';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import { readSessionState, writeSessionState } from './storage';

// One shared runtime for migrated accumulators; preserves their socket contract.
export class StorageState extends PPNode {
  protected kind(): string {
    return 'value';
  }
  private stateType() {
    const Type =
      { number: NumberType, array: ArrayType, object: JSONType }[this.kind()] ??
      AnyType;
    return new Type();
  }
  public showInNodeSearch(): boolean {
    return false;
  }
  public getName(): string {
    return (
      {
        value: 'State',
        number: 'Number state',
        array: 'Array state',
        object: 'Object state',
      }[this.kind()] ?? 'State'
    );
  }
  public getDescription(): string {
    return 'Accumulates values in session storage';
  }
  public getTags(): string[] {
    return ['State', 'Storage'].concat(super.getTags());
  }
  public getSeemsUnused(): boolean {
    return (
      !this.getInputSocketByName('State')?.hasLink() && super.getSeemsUnused()
    );
  }

  protected getDefaultIO(): Socket[] {
    const kind = this.kind();
    const stateType = this.stateType();
    const inputs =
      kind === 'number'
        ? ['Add Amount', 'Remove Amount'].map(
            (name) => new Socket(SOCKET_TYPE.IN, name, new NumberType(), 1),
          )
        : [
            new Socket(
              SOCKET_TYPE.IN,
              kind === 'value' ? 'Value' : 'Input',
              new AnyType(),
              'Example',
            ),
          ];
    if (kind === 'array' || kind === 'object')
      inputs.push(
        new Socket(SOCKET_TYPE.IN, 'MaxSize', new NumberType(true), 0),
      );
    if (kind === 'object')
      inputs.push(
        new Socket(SOCKET_TYPE.IN, 'Key', new StringType(), 'ExampleKey'),
      );
    return inputs.concat(
      (kind === 'value' ? ['add', 'clear'] : ['add', 'remove', 'clear']).map(
        (action) =>
          new Socket(
            SOCKET_TYPE.TRIGGER,
            action[0].toUpperCase() + action.slice(1),
            new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, action),
          ),
      ),
      [
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
      ],
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
  protected async add(): Promise<void> {
    await this.mutate(false);
  }
  protected async remove(): Promise<void> {
    await this.mutate(true);
  }
  protected async clear(): Promise<void> {
    await this.updateState(this.stateType().getDefaultValue());
  }
  private async mutate(remove: boolean): Promise<void> {
    const kind = this.kind();
    if (kind === 'value') {
      if (!remove) await this.updateState(this.getInputData('Value'));
      return;
    }
    let state = structuredClone(this.getInputData('State'));
    if (kind === 'number')
      state +=
        (remove ? -1 : 1) *
        this.getInputData(remove ? 'Remove Amount' : 'Add Amount');
    else {
      const key = this.getInputData('Key');
      if (kind === 'object' && !Object.hasOwn(state, key)) {
        if (remove) return;
        Object.defineProperty(state, key, {
          value: [],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      const values = kind === 'object' ? state[key] : state;
      if (remove) values.pop();
      else {
        values.push(structuredClone(this.getInputData('Input')));
        const maxSize = this.getInputData('MaxSize');
        if (maxSize > 0 && maxSize < values.length)
          values.splice(0, values.length - maxSize);
      }
    }
    await this.updateState(state);
  }
  private async updateState(state: any): Promise<void> {
    await writeSessionState(...this.stateAddress(), state, this);
    this.setInputData('State', state);
    const socket = this.getInputSocketByName('State');
    await (
      socket.hasLink() ? socket.links[0].getSource().getNode() : this
    ).executeOptimizedChain();
  }
  protected getBackPropagationTargets(): BackPropagation {
    return { SocketToGetValue: this.getInputSocketByName('State') };
  }
}
export class StorageNumberState extends StorageState {
  protected kind(): string {
    return 'number';
  }
}
export class StorageArrayState extends StorageState {
  protected kind(): string {
    return 'array';
  }
}
export class StorageObjectState extends StorageState {
  protected kind(): string {
    return 'object';
  }
}
