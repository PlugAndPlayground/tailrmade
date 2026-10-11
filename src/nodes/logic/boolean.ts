import PPNode, { SmallNode } from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { SmallDynamicInputNode } from '../abstract/DynamicInputNode';
import { migrateFromCustomFunctionCommon } from '../data/array';
import { AbstractType } from '../datatypes/abstractType';
import { BOOLEAN_COLOR, BooleanType } from '../datatypes/booleanType';

const inputAName = 'A';
const inputBName = 'B';

const invertedOutName = 'Inverted';
const orOutName = 'Or';
const andOutName = 'And';
abstract class BooleanOperationNode extends SmallNode {
  public getIsSimpleStyleNode(): boolean {
    return true;
  }

  public getShowLabels(): boolean {
    return false;
  }

  public getColor() {
    return BOOLEAN_COLOR.multiply(0.8);
  }

  public getTags(): string[] {
    return ['Logic'].concat(super.getTags());
  }

  protected getDefaultIO() {
    return [new Socket(SOCKET_TYPE.IN, inputAName, new BooleanType())];
  }

  public getVersion(): number {
    return 4;
  }

  public async migrate(previousVersion: number): Promise<void> {
    migrateFromCustomFunctionCommon(this);
    if (previousVersion < 4) {
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('a'),
        this.getInputSocketByName(inputAName),
      );
      // sockets got renamed
    }
  }
}

export class NOT extends BooleanOperationNode {
  public getName(): string {
    return 'NOT Gate';
  }

  public getDescription(): string {
    return 'Returns the inverse of the input';
  }
  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.OUT, invertedOutName, new BooleanType()),
    ].concat(super.getDefaultIO());
  }

  protected onExecute(input: any, output: any): Promise<void> {
    output[invertedOutName] = !input[inputAName];
    return;
  }
  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 4) {
      await this.replaceSocketWithOtherSocket(
        this.getOutputSocketByName('OutData'),
        this.getOutputSocketByName(invertedOutName),
      );
    }
  }
}

abstract class BooleanDynamicNode extends SmallDynamicInputNode {
  public getTags(): string[] {
    return ['Logic'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return BOOLEAN_COLOR.multiply(0.7);
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }

  protected getPreferredDataType(): AbstractType {
    return new BooleanType();
  }

  protected shouldDrawAddInputNodeButton(): boolean {
    return true;
  }

  protected getDefaultInputNode() {
    return 'WidgetSwitch';
  }

  protected getMinAmountOfInputSockets(): number {
    return 2;
  }
}

export class OR extends BooleanDynamicNode {
  public getName(): string {
    return 'OR Gate';
  }

  public getDescription(): string {
    return 'Returns true if any of the inputs are truthy';
  }

  protected getDefaultIO() {
    return super
      .getDefaultIO()
      .concat([
        new Socket(SOCKET_TYPE.IN, inputAName, new BooleanType()),
        new Socket(SOCKET_TYPE.IN, inputBName, new BooleanType()),
        new Socket(SOCKET_TYPE.OUT, orOutName, new BooleanType()),
      ]);
  }
  public getNewSocketName() {
    return super.getNewSocketName('Or');
  }

  // hacky check
  protected onExecute(input: any, output: any): Promise<void> {
    output[orOutName] =
      this.inputSocketArray
        .filter(
          (a) =>
            a.name == inputAName ||
            a.name == inputBName ||
            a.name.includes('or'),
        )
        .find((a) => a.data) !== undefined;
    return;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 4) {
      await this.replaceSocketWithOtherSocket(
        this.getOutputSocketByName('OutData'),
        this.getOutputSocketByName(orOutName),
      );
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('b'),
        this.getInputSocketByName(inputBName),
      );
    }
  }
}

export class AND extends BooleanDynamicNode {
  public getName(): string {
    return 'AND Gate';
  }

  protected getDefaultIO() {
    return super
      .getDefaultIO()
      .concat([
        new Socket(SOCKET_TYPE.IN, inputAName, new BooleanType()),
        new Socket(SOCKET_TYPE.IN, inputBName, new BooleanType()),
        new Socket(SOCKET_TYPE.OUT, andOutName, new BooleanType()),
      ]);
  }

  public getNewSocketName() {
    return super.getNewSocketName('And');
  }

  public getDescription(): string {
    return 'Returns true if all of the inputs are truthy';
  }

  protected onExecute(input: any, output: any): Promise<void> {
    output[andOutName] =
      this.inputSocketArray.find((a) => !a.data) == undefined;
    return;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 4) {
      await this.replaceSocketWithOtherSocket(
        this.getOutputSocketByName('OutData'),
        this.getOutputSocketByName(andOutName),
      );
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('b'),
        this.getInputSocketByName(inputBName),
      );
    }
  }
}
