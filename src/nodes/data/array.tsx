import PPNode, { SmallNode } from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { SOCKET_TYPE } from '../../utils/constants';
import { AnyType } from '../datatypes/anyType';
import { ARRAY_COLOR, ArrayType } from '../datatypes/arrayType';
import { CodeType } from '../datatypes/codeType';
import { EnumType } from '../datatypes/enumType';
import { CustomArgs } from '../../utils/interfaces';
import { NODE_TYPE_COLOR } from '../../utils/constants';
import { getPropertyNames } from '../../utils/utils';
import { PNPWorker } from './worker/PNPWorker';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import {
  DynamicInputNode,
  DynamicInputNodeFunctions,
  SmallDynamicInputNode,
} from '../abstract/DynamicInputNode';
import Socket from '../../classes/SocketClass';
import { AbstractType } from '../datatypes/abstractType';
import {
  anyCodeName,
  arrayEntryToSelectedValue,
  arrayName,
  initialValueName,
} from './dataFunctions';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import InputArrayKeysType from '../datatypes/inputArrayKeysType';
import { inputReverseName } from '../draw/draw';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { ComputeMessage, ComputeResult } from './worker/compute-worker';
import { StringType } from '../datatypes/stringType';

export const inputPropertyName = 'Property';
const concatArrayName = 'Out';
const indexName = 'Index';

const inputStartName = 'Start';
const inputEndName = 'End';

const selectedName = 'Element';
const reducedName = 'Reduced';
const lengthName = 'Length';

const executeInChunksName = 'Execute in Chunks';
const JSONArrayName = 'JSON Array';
const JSONArrayNamePropertySuffix = ' - Property Name';

export class ArrayMethod extends PPNode {
  onOptionChange?: (value: string) => void;
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });

    this.onOptionChange = (value) => {
      this.setNodeName('Array.' + value);
    };

    this.onExecute = async function (
      inputObject: any,
      outputObject: Record<string, unknown>,
    ) {
      const workString =
        `(array) => {
      const arrayMethod ="` +
        inputObject['Method'] +
        `";
      const callback = ` +
        inputObject['Callback'] +
        `;
      const output = array[arrayMethod](eval(callback));
      return output;
      }`;
      const res = await new PNPWorker().work({
        code: workString,
        data: inputObject['Array'],
      });

      if (!res.success) {
        throw res.error;
      }
      outputObject['Output'] = res.result;
    };
  }

  public socketShouldAutomaticallyAdapt(): boolean {
    return true;
  }

  public getName(): string {
    return 'Array method';
  }

  public getDescription(): string {
    return 'Choose an array method and provide a callback';
  }

  public getTags(): string[] {
    return ['Array', 'Function'].concat(super.getTags());
  }

  protected getDefaultIO(): PPSocket[] {
    const arrayMethodsArray = getPropertyNames(new Array(1), {
      includePrototype: true,
      onlyFunctions: true,
    });
    const arrayMethodsArrayOptions = arrayMethodsArray
      .sort()
      .map((methodName) => {
        return {
          text: methodName,
        };
      });

    return [
      new PPSocket(SOCKET_TYPE.IN, 'Array', new ArrayType()),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Method',
        new EnumType(arrayMethodsArrayOptions, (value) =>
          this.onOptionChange(value),
        ),
        'map',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Callback',
        new CodeType(),
        '(item, index) => `${index}: ${item}`',
        false,
      ),
      new PPSocket(SOCKET_TYPE.OUT, 'Output', new AnyType()),
    ].concat(super.getDefaultIO());
  }
}

abstract class ArrayDynamicInputNode extends SmallDynamicInputNode {
  public getColor(): TRgba {
    return ARRAY_COLOR.multiply(0.8);
  }
  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }
  protected getPreferredDataType(): AbstractType {
    return new ArrayType();
  }
}

export class ConcatenateArrays extends ArrayDynamicInputNode {
  public getName(): string {
    return 'Join Arrays';
  }

  public getDescription(): string {
    return 'Concatenate multiple arrays';
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.OUT, concatArrayName, new ArrayType())];
  }

  protected async onExecute(input, output): Promise<void> {
    output[concatArrayName] = this.getAllNonDefaultInputSockets()
      .map((socket) => socket.data)
      .reduce((prev, current) => prev.concat(current), []);
  }

  public getMinNodeWidth(): number {
    return 200;
  }
}

export class Group extends PPNode {
  public getName(): string {
    return 'Group By';
  }

  public getDescription(): string {
    return 'Groups an array based on specified key';
  }
  public getTags(): string[] {
    return ['JSON', 'Array'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new JSONArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputPropertyName,
        new InputArrayKeysType(arrayName, this.id, false),
      ),
      new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType()),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const grouped = {};
    const Array = inputObject[arrayName];
    const Property = inputObject[inputPropertyName];
    Array.forEach((entry, index) => {
      const selectedValue = arrayEntryToSelectedValue(entry, Property, index);
      if (grouped[selectedValue] == undefined) {
        grouped[selectedValue] = [];
      }
      grouped[selectedValue].push(entry);
    });

    outputObject[arrayName] = Object.keys(grouped).map((key) => ({
      Name: key,
      Entries: grouped[key],
      Length: grouped[key].length,
    }));
  }
}

export class Sort extends PPNode {
  public getName(): string {
    return 'Sort Array';
  }

  public getDescription(): string {
    return 'Sort an array based on specified key';
  }
  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputPropertyName,
        new InputArrayKeysType(arrayName, this.id, false),
      ),
      new Socket(SOCKET_TYPE.IN, inputReverseName, new BooleanType()),
      new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType()),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputArray = inputObject[arrayName];
    const property = inputObject[inputPropertyName];
    const reverse = inputObject[inputReverseName];
    const shallowCopy = inputArray.slice();
    shallowCopy.sort((v1, v2) => {
      const value1 = arrayEntryToSelectedValue(v1, property);
      const value2 = arrayEntryToSelectedValue(v2, property);

      if (value1 < value2) return -1;
      if (value1 > value2) return 1;
      return 0;
    });

    if (reverse) {
      shallowCopy.reverse();
    }
    outputObject[arrayName] = shallowCopy;
  }
}

function arrayNodeIO() {
  return [
    new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType(), []),
    new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType(), []),
  ];
}

class ArrayFunctionCodeBasic extends PPNode {
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        anyCodeName,
        new CodeType(),
        '(a, index) => a',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        executeInChunksName,
        new BooleanType(),
        true,
        false,
      ),
    ]
      .concat(arrayNodeIO())
      .concat(super.getDefaultIO());
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }
}

async function workerExecute(
  input: ComputeMessage,
  executeInChunks: boolean,
): Promise<ComputeResult> {
  const worker = new PNPWorker();
  return executeInChunks ? worker.workChunkedArray(input) : worker.work(input);
}

export class MapNode extends ArrayFunctionCodeBasic {
  public getName(): string {
    return 'Transform (Map) Array';
  }

  public getTags(): string[] {
    return ['Transform', 'Map'].concat(super.getTags());
  }

  public getDescription(): string {
    return 'Transform each element of an array';
  }
  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const workString = `(array) => {
      const callback = ${inputObject[anyCodeName]};
      const output = array.map(callback);
      return output;
    }`;

    const res = await workerExecute(
      {
        code: workString,
        data: inputObject[arrayName],
      },
      inputObject[executeInChunksName],
    );

    if (!res.success) {
      throw res.error;
    }
    outputObject[arrayName] = res.result;
  }
}

export class Filter extends ArrayFunctionCodeBasic {
  public getName(): string {
    return 'Filter Array';
  }

  public getDescription(): string {
    return 'Filters an array using your own filter condition';
  }

  public getTags(): string[] {
    return ['Extract'].concat(super.getTags());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const workString = `(array) => {
      const callback = ${inputObject[anyCodeName]};
      const output = array.filter(callback);
      return output;
    }`;

    const res = await workerExecute(
      {
        code: workString,
        data: inputObject[arrayName],
      },
      inputObject[executeInChunksName],
    );

    if (!res.success) {
      throw res.error;
    }
    outputObject[arrayName] = res.result;
  }
}

export class ArrayFind extends ArrayFunctionCodeBasic {
  public getName(): string {
    return 'Find Element';
  }

  public getDescription(): string {
    return 'Returns the first element (if any) in an array that satisfies the provided testing function';
  }

  public getTags(): string[] {
    return ['Extract'].concat(super.getTags());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const workString = `(array) => {
      const callback = ${inputObject[anyCodeName]};
      const output = array.find(callback);
      return output;
    }`;

    const res = await workerExecute(
      {
        code: workString,
        data: inputObject[arrayName],
      },
      false,
    );

    if (!res.success) {
      throw res.error;
    }
    outputObject[arrayName] = res.result;
  }
}

export class ArrayZip extends DynamicInputNode {
  public getName(): string {
    return 'Zip Arrays';
  }
  public getDescription(): string {
    return 'Zip multiple arrays into a single JSON Array';
  }

  public getSocketForNewConnection = (socket: Socket): Socket =>
    DynamicInputNodeFunctions.getSocketForNewConnection(socket, this, true);

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.OUT, JSONArrayName, new JSONArrayType()),
    ].concat(super.getDefaultIO());
  }

  protected getDependentDynamicSockets(socketName: string) {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        socketName + JSONArrayNamePropertySuffix,
        new StringType(),
        '',
      ),
    ];
  }

  public getTags(): string[] {
    return ['JSON', 'Array'].concat(super.getTags());
  }

  protected async onExecute(input, output): Promise<void> {
    const actualInputs = this.inputSocketArray
      .filter((socket) => !socket.name.includes(JSONArrayNamePropertySuffix))
      .map((socket) => socket.name);
    const outObject = [];
    if (actualInputs.length) {
      for (let i = 0; i < input[actualInputs[0]].length; i++) {
        const newObject = {};
        for (const socketName of actualInputs) {
          const inputName = input[socketName + JSONArrayNamePropertySuffix];
          const usedName = inputName.length ? inputName : socketName;
          newObject[usedName] = input[socketName][i];
        }
        outObject.push(newObject);
      }
    }

    output[JSONArrayName] = outObject;
  }
}

export class Uniques extends PPNode {
  public getName(): string {
    return 'Unique Values';
  }
  public getDescription(): string {
    return 'Returns an array with unique values, removing all duplicates';
  }
  public getTags(): string[] {
    return ['Array'];
  }
  protected getDefaultIO(): Socket[] {
    return arrayNodeIO().concat(super.getDefaultIO());
  }
  protected async onExecute(input, output): Promise<void> {
    output[arrayName] = [...new Set(input[arrayName])];
  }
}

export class Flatten extends PPNode {
  public getName(): string {
    return 'Flatten Array';
  }
  public getDescription(): string {
    return 'Flattens an array. All sub-array elements will be concatenated into it recursively';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return arrayNodeIO().concat(super.getDefaultIO());
  }
  protected async onExecute(input, output): Promise<void> {
    output[arrayName] = input[arrayName].flat();
  }
}

export class ArraySlice extends PPNode {
  public getName(): string {
    return 'Slice Array';
  }

  public getDescription(): string {
    return 'Returns a part of an array using given start and end indices';
  }

  public getTags(): string[] {
    return ['Array'];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputStartName, new NumberType(true), 0),
      new Socket(SOCKET_TYPE.IN, inputEndName, new NumberType(true), 10),
    ]
      .concat(arrayNodeIO())
      .concat(super.getDefaultIO());
  }

  protected async onExecute(input, output): Promise<void> {
    output[arrayName] = input[arrayName].slice(
      input[inputStartName],
      input[inputEndName],
    );
  }
}

export class ArrayCreate extends DynamicInputNode {
  public getName(): string {
    return 'Create Array';
  }

  public getDescription(): string {
    return 'Creates an array from selected values';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType(), [])];
  }

  protected async onExecute(input, output): Promise<void> {
    output[arrayName] = this.inputSocketArray.map((socket) => socket.data);
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name !== arrayName;
  }
}

export function migrateFromCustomFunctionCommon(node: PPNode): void {
  node.removeSocket(node.getInputSocketByName('Code'));
  node.removeSocket(node.getOutputSocketByName('Code'));
  node.removeSocket(node.getInputSocketByName('Main Thread'));
}

export class ArrayGet extends SmallNode {
  public getName(): string {
    return 'Get Element';
  }

  public getDescription(): string {
    return 'Returns an element based on its index position';
  }

  public getTags(): string[] {
    return ['Array', 'Extract'].concat(super.getTags());
  }

  protected getDefaultIO() {
    return (
      this.shouldHaveIndexSocket()
        ? [new Socket(SOCKET_TYPE.IN, indexName, new NumberType(true))]
        : []
    ).concat([
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType(), []),
      new Socket(SOCKET_TYPE.OUT, selectedName, new AnyType()),
    ]);
  }

  protected shouldHaveIndexSocket() {
    return true;
  }
  protected decideIndexToGet(input) {
    return input[indexName];
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input[arrayName];
    const index = Math.max(
      0,
      Math.min(array.length - 1, this.decideIndexToGet(input)),
    );
    output[selectedName] = input[arrayName][index];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === selectedName;
  }
  public getVersion(): number {
    return 4;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (
      previousVersion < 4 &&
      this.getInputSocketByName('ArrayIn') !== undefined
    ) {
      migrateFromCustomFunctionCommon(this);
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('ArrayIn'),
        this.getInputSocketByName(arrayName),
      );
    }
  }
}

export class ArraySet extends PPNode {
  public getName(): string {
    return 'Set Element';
  }

  public getDescription(): string {
    return 'Sets an element of an array at a specific index position (using deep copy)';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType(), []),
      new Socket(SOCKET_TYPE.IN, indexName, new NumberType(true), 0),
      new Socket(SOCKET_TYPE.IN, 'Value', new AnyType()),
      new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType()),
    ];
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input[arrayName];
    const index = Math.max(0, Math.min(array.length - 1, input[indexName]));

    // Create a deep copy of the array
    const newArray = structuredClone(array);
    newArray[index] = input['Value'];

    output[arrayName] = newArray;
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === 'Value';
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }
}

export class ArrayLength extends SmallNode {
  public getName(): string {
    return 'Length';
  }
  public getVersion(): number {
    return 5;
  }

  public async migrate(previousVersion: number): Promise<void> {
    await super.migrate(previousVersion);
    if (previousVersion < 4) {
      migrateFromCustomFunctionCommon(this);
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName('ArrayIn'),
        this.getInputSocketByName(selectedName),
      );
    } else if (previousVersion < 5) {
      await this.replaceSocketWithOtherSocket(
        this.getInputSocketByName(arrayName),
        this.getInputSocketByName(selectedName),
      );
    }
  }

  public getDescription(): string {
    return 'Returns the length/size of an array or a string';
  }
  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, selectedName, new AnyType()),
      new Socket(SOCKET_TYPE.OUT, lengthName, new NumberType()),
    ];
  }
  protected async onExecute(input, output): Promise<void> {
    output[lengthName] = input[selectedName].length;
  }

  public getTags(): string[] {
    return ['Array', 'String'].concat(super.getTags());
  }
}

export class ArrayFirst extends ArrayGet {
  public getName(): string {
    return 'First';
  }
  public getDescription(): string {
    return 'Gets the first element (if any) in an array';
  }
  protected shouldHaveIndexSocket() {
    return false;
  }
  protected decideIndexToGet(input) {
    return 0;
  }
}

export class ArrayLast extends ArrayGet {
  public getName(): string {
    return 'Last';
  }
  public getDescription(): string {
    return 'Gets the last element (if any) in an array';
  }
  protected shouldHaveIndexSocket() {
    return false;
  }
  protected decideIndexToGet(input) {
    return input[arrayName].length - 1;
  }
}

export class ArrayPush extends SmallNode {
  public getName(): string {
    return 'Add Element';
  }

  public getDescription(): string {
    return 'Adds an element at the end of the array';
  }
  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.IN, selectedName, new AnyType(), []),
      new Socket(SOCKET_TYPE.OUT, 'Out', new ArrayType()),
    ];
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === selectedName;
  }
  public getVersion(): number {
    return 5;
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input['ArrayIn'];
    const newArray = [...array, input[selectedName]];
    output['Out'] = newArray;
  }

  public async migrate(previousversion: number): Promise<void> {
    await super.migrate(previousversion);
    if (previousversion < 5) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}

export class Max extends SmallNode {
  public getName(): string {
    return 'Max Element';
  }

  public getDescription(): string {
    return 'Returns the largest (max) number of the array';
  }

  public getTags(): string[] {
    return ['Math', 'Comparison'];
  }

  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.OUT, 'Max Element', new AnyType()),
    ];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === 'Max Element';
  }
  public getVersion(): number {
    return 5;
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input['ArrayIn'];
    output['Max Element'] = Math.max(...array);
  }

  public async migrate(previousversion: number): Promise<void> {
    await super.migrate(previousversion);
    if (previousversion < 5) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}

export class Min extends SmallNode {
  public getName(): string {
    return 'Min Element';
  }

  public getDescription(): string {
    return 'Returns the smallest (min) number of the array';
  }

  public getTags(): string[] {
    return ['Math', 'Comparison'];
  }

  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.OUT, 'Min Element', new AnyType()),
    ];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === 'Min Element';
  }
  public getVersion(): number {
    return 5;
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input['ArrayIn'];
    output['Min Element'] = Math.min(...array);
  }

  public async migrate(previousversion: number): Promise<void> {
    await super.migrate(previousversion);
    if (previousversion < 5) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}

export class Reduce extends PPNode {
  public getName(): string {
    return 'Reduce Array';
  }
  public getTags(): string[] {
    return ['Array'];
  }

  public getDescription(): string {
    return 'Reduce (or fold) an array into a single value';
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        anyCodeName,
        new CodeType(),
        '(a, b) => a + b',
      ),
      new Socket(SOCKET_TYPE.IN, initialValueName, new AnyType(), 0),
      new Socket(SOCKET_TYPE.OUT, reducedName, new AnyType()),
    ];
  }
  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name === reducedName || socket.name === initialValueName;
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const res = await new PNPWorker().work({
      code:
        '(arrayIn) => {return arrayIn.reduce(' +
        inputObject[anyCodeName] +
        ',' +
        inputObject[initialValueName] +
        ')}',
      data: inputObject[arrayName],
    });
    if (!res.success) {
      throw res.error;
    }
    outputObject[reducedName] = res.result;
  }
}

export class Reverse extends PPNode {
  public getName(): string {
    return 'Reverse Array';
  }
  public getTags(): string[] {
    return ['Array', 'Transform'];
  }
  public getDescription(): string {
    return 'Reverses an array';
  }

  protected getDefaultIO() {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.OUT, 'Out', new ArrayType()),
    ];
  }

  public getVersion(): number {
    return 5;
  }

  protected async onExecute(input, output): Promise<void> {
    output['Out'] = input['ArrayIn'].toReversed();
  }

  public async migrate(previousversion: number): Promise<void> {
    await super.migrate(previousversion);
    if (previousversion < 5) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}

export class ArrayContains extends PPNode {
  public getName(): string {
    return 'Array Contains';
  }
  public getDescription(): string {
    return 'Checks if an array contains a value';
  }
  public getTags(): string[] {
    return ['Array', 'Comparison', 'Include'];
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.IN, 'Value', new AnyType()),
      new Socket(SOCKET_TYPE.OUT, 'Contains', new BooleanType()),
    ];
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input['ArrayIn'];
    const value = input['Value'];
    output['Contains'] = array.includes(value);
  }
}

export class ArrayIndexOf extends PPNode {
  public getName(): string {
    return 'Array Index Of';
  }
  public getDescription(): string {
    return 'Returns the index of a value in an array';
  }
  public getTags(): string[] {
    return ['Array', 'Search', 'Index'];
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'ArrayIn', new ArrayType()),
      new Socket(SOCKET_TYPE.IN, 'Value', new AnyType()),
      new Socket(SOCKET_TYPE.OUT, 'Index', new NumberType()),
    ];
  }

  protected async onExecute(input, output): Promise<void> {
    const array = input['ArrayIn'];
    const value = input['Value'];
    output['Index'] = array.indexOf(value);
  }
}
