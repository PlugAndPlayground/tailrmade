import PPNode from '../classes/NodeClass';
import Socket from '../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../utils/constants';
import { TRgba } from '../utils/color';
import { getPropertyNames } from '../utils/utils';
import {
  DynamicInputNode,
  SmallDynamicInputNode,
} from './abstract/DynamicInputNode';
import { STRING_COLOR, StringType } from './datatypes/stringType';
import { EnumType } from './datatypes/enumType';
import { AbstractType } from './datatypes/abstractType';

const concatStringName = 'Concatenated';
const inputName = 'Input';
const inputOptionName = 'Option';
const parameterName1 = 'Parameter1';
const parameterName2 = 'Parameter2';
const outputName = 'Output';

const methodsAllowingEmptySecondArgument = new Set(['replace', 'replaceAll']);

export class StringFunction extends PPNode {
  protected async onExecute(
    input: any,
    output: Record<string, unknown>,
  ): Promise<void> {
    const inputString = input[inputName];
    const strOption = input[inputOptionName];
    const stringMethod = inputString[strOption];

    if (typeof stringMethod !== 'function') {
      output[outputName] = stringMethod;
      return;
    }

    const args: any[] = [];
    if (stringMethod.length > 0 || input[parameterName1] !== '') {
      args.push(input[parameterName1]);
    }
    if (
      input[parameterName2] !== '' ||
      methodsAllowingEmptySecondArgument.has(strOption)
    ) {
      args.push(input[parameterName2]);
    }

    output[outputName] = stringMethod.apply(inputString, args);
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.isOutput();
  }

  public getName(): string {
    return 'String function';
  }

  public getDescription(): string {
    return 'Perform operations on strings';
  }

  public getTags(): string[] {
    return ['String', 'Function'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): Socket[] {
    const onOptionChange = (value) => {
      this.setNodeName('String.' + value);
    };
    const str = getPropertyNames('').filter((name) => name !== 'length');
    const strOptions = str.map((methodName) => {
      return {
        text: methodName,
      };
    });
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputOptionName,
        new EnumType(strOptions, (value) => onOptionChange(value)),
        'replace',
        false,
      ),
      new Socket(SOCKET_TYPE.IN, inputName, new StringType(), '', true),
      new Socket(SOCKET_TYPE.IN, parameterName1, new StringType(), '', true),
      new Socket(SOCKET_TYPE.IN, parameterName2, new StringType(), '', true),
      new Socket(SOCKET_TYPE.OUT, outputName, new StringType()),
    ];
  }
}

abstract class StringDynamicInputNode extends SmallDynamicInputNode {
  public getColor(): TRgba {
    return STRING_COLOR.multiply(0.8);
  }
  public getTags(): string[] {
    return ['String'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }
  protected getPreferredDataType(): AbstractType {
    return new StringType();
  }
  public getMinNodeWidth(): number {
    return 200;
  }
}

export class Concatenate extends StringDynamicInputNode {
  public getName(): string {
    return 'Concatenate';
  }

  public getDescription(): string {
    return 'Combines all input strings into one';
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.OUT, concatStringName, new StringType())];
  }

  protected async onExecute(input, output): Promise<void> {
    output[concatStringName] = this.getAllNonDefaultInputSockets()
      .map((socket) => socket.data)
      .reduce((prev, current) => prev + current, '');
  }

  protected shouldDrawAddInputNodeButton(): boolean {
    return true;
  }

  protected getDefaultInputNode() {
    return 'CONSTANT_String';
  }
}
