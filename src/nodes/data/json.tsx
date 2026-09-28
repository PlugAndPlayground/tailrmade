import { TRgba } from '../../utils/color';
import { JSONPath } from 'jsonpath-plus';
import PPNode, { SmallNode } from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { parseJSON, replacePartOfObject } from '../../utils/utils';
import { CustomArgs } from '../../utils/interfaces';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { AnyType } from '../datatypes/anyType';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import { dataToType } from '../datatypes/typehelper';
import { CustomFunction } from './dataFunctions';
import { BooleanType } from '../datatypes/booleanType';
import {
  DynamicInputNode,
  DynamicInputNodeFunctions,
} from '../abstract/DynamicInputNode';
import FormatJSONType, {
  FormatJSONInterface,
} from '../datatypes/formatJSONType';
import { ArrayType } from '../datatypes/arrayType';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import { CodeType } from '../datatypes/codeType';
import { PNPWorker } from './worker/PNPWorker';

const JSONName = 'JSON';
const JSONParamName = 'Path';
const JSONInsert = 'New value';
const outValueName = 'Value';
export const inputArrayName = 'JSON Array';
const outputRegularArrayName = 'Array';
const combinePathIfSingleElement = 'Combine path if single element';
const JSON_SEPARATOR = '→';
const codeName = 'Code';

const destructiveMergeName = 'Destructive Merge';

const outputKeysName = 'Keys';
const outputValuesName = 'Values';
const outputEntriesName = 'Entries';

const flattenIfSingleName = 'Flatten if single element';

export class JSONGet extends PPNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });
  }

  public getName(): string {
    return 'Get Property';
  }

  public getDescription(): string {
    return 'Returns a single value of a JSON at the defined path';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, JSONName, new JSONType()),
      new Socket(SOCKET_TYPE.IN, JSONParamName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, outValueName, new JSONType()),
    ];
  }
  protected async onExecute(
    inputObject: unknown,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject[outValueName] = {};
    const parsedJSON = parseJSON(inputObject[JSONName]).value;
    if (parsedJSON) {
      const res = JSONPath({
        path: inputObject[JSONParamName],
        json: parsedJSON,
        wrap: false,
      });
      // we cant output undefined on the socket
      if (res == undefined) {
        outputObject[outValueName] = {};
      } else {
        outputObject[outValueName] = res;
      }
    }
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name == outValueName;
  }
}

export class JSONSet extends PPNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });
  }

  public getName(): string {
    return 'Set Property';
  }

  public getDescription(): string {
    return 'Sets a value on a JSON at the defined path';
  }

  public getTags(): string[] {
    return ['JSON', 'Transform'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, JSONName, new JSONType(), {}),
      new Socket(SOCKET_TYPE.IN, JSONParamName, new StringType()),
      new Socket(SOCKET_TYPE.IN, JSONInsert, new AnyType(), 'Property Value'),
      new Socket(SOCKET_TYPE.OUT, outValueName, new JSONType()),
    ];
  }
  protected async onExecute(
    inputObject: unknown,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const parsedJSON = parseJSON(inputObject[JSONName]).value;
    if (parsedJSON) {
      outputObject[outValueName] = replacePartOfObject(
        parsedJSON,
        inputObject[JSONParamName],
        inputObject[JSONInsert],
      );
    }
  }
}

abstract class JSONBasicFunction extends SmallNode {
  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }
  protected getDefaultIO(): Socket[] {
    return super
      .getDefaultIO()
      .concat([new Socket(SOCKET_TYPE.IN, JSONName, new JSONType())]);
  }
}

abstract class JSONArrayFunction extends JSONBasicFunction {
  protected abstract getOutArrayName(): string;
  protected abstract getOutputFromInput(input: any): any[];

  protected onExecute(input: any, output: any): Promise<void> {
    output[this.getOutArrayName()] = this.getOutputFromInput(input[JSONName]);
    return;
  }

  protected getDefaultIO(): Socket[] {
    return super
      .getDefaultIO()
      .concat([
        new Socket(SOCKET_TYPE.OUT, this.getOutArrayName(), new ArrayType()),
      ]);
  }
}

export class JSONKeys extends JSONArrayFunction {
  protected getOutArrayName(): string {
    return outputKeysName;
  }
  protected getOutputFromInput(input: any): any[] {
    return Object.keys(input);
  }
  public getName(): string {
    return 'Get Keys';
  }
  public getDescription(): string {
    return 'Gets all keys from a JSON';
  }
  public getTags(): string[] {
    return ['Extract'].concat(super.getTags());
  }
}

export class JSONEntries extends JSONArrayFunction {
  protected getOutArrayName(): string {
    return outputEntriesName;
  }
  protected getOutputFromInput(input: any): any[] {
    return Object.entries(input);
  }
  public getName(): string {
    return 'Get Entries';
  }

  public getDescription(): string {
    return 'Gets all entries in a JSON';
  }
  public getTags(): string[] {
    return ['Extract'].concat(super.getTags());
  }
}

export class JSONValues extends JSONArrayFunction {
  protected getOutArrayName(): string {
    return outputValuesName;
  }
  protected getOutputFromInput(input: any): any[] {
    return Object.values(input);
  }
  public getName(): string {
    return 'Get Values';
  }

  public getDescription(): string {
    return 'Gets all values from a JSON';
  }
  public getTags(): string[] {
    return ['Extract'].concat(super.getTags());
  }
}

const BREAK_MAX_SOCKETS = 100;

export class Break extends PPNode {
  public getName(): string {
    return 'Break Object';
  }

  public getDescription(): string {
    return 'Breaks out all properties of a JSON object or an array';
  }

  public getTags(): string[] {
    return ['JSON', 'Extract'].concat(super.getTags());
  }

  public hasExample(): boolean {
    return true;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, JSONName, new JSONType(true)),
      new Socket(
        SOCKET_TYPE.IN,
        combinePathIfSingleElement,
        new BooleanType(),
        true,
      ),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    // before every execute, re-evaluate inputs
    const currentJSON = inputObject[JSONName];
    this.adaptOutputs(currentJSON);
    // cant use keys of input object here becasue i might have nested properties
    this.outputSocketArray.forEach((socket) => {
      const key = socket.name;
      const allSegments = key.split(JSON_SEPARATOR);
      const value = allSegments.reduce(
        (prev, segment) => prev[segment],
        currentJSON,
      );
      if (value == undefined) {
        outputObject[key] = socket.dataType.getDefaultValue();
      } else {
        outputObject[key] = value;
      }
    });
  }

  MAX_DEPTH = 5;

  private adaptOutputs(json: any): void {
    // remove all non existing arguments and add all missing (based on the definition we just got)
    // if current JSON is empty, then dont adapt (maybe data just hasnt arrived yet)
    if (json === undefined || json === null || typeof json !== 'object') {
      return;
    }

    const combineElements = this.getInputData(combinePathIfSingleElement);

    const socketsToBeRemoved = this.outputSocketArray.filter(
      (socket) =>
        (!(socket.name.split(JSON_SEPARATOR)[0] in json) &&
          socket.links.length == 0) ||
        (socket.name.includes(JSON_SEPARATOR) && !combineElements),
    );
    const argumentsToBeAdded = Object.keys(json).filter(
      (key) =>
        !this.outputSocketArray.some((socket) =>
          combineElements
            ? socket.name.split(JSON_SEPARATOR)[0] === key
            : socket.name === key,
        ),
    );
    socketsToBeRemoved.forEach((socket) => {
      this.removeSocket(socket);
    });
    argumentsToBeAdded.forEach((argument) => {
      // block creation of new sockets after a while to not freeze the whole editor
      if (this.outputSocketArray.length < BREAK_MAX_SOCKETS) {
        // if we only have one child, keep unpacking until thers is none or several
        let currentPath = argument;
        let currentVal = json[argument];
        while (
          currentVal !== undefined &&
          currentVal !== null &&
          typeof currentVal == 'object' &&
          Object.keys(currentVal).length == 1 &&
          combineElements &&
          currentVal.drawFunction == undefined // ugly but otherwise the break function interacts oddly with PixiDeferredGraphics
        ) {
          const currentKeys = Object.keys(currentVal);
          const currentKey = currentKeys[0];
          currentVal = currentVal[currentKey];
          currentPath += JSON_SEPARATOR + currentKey;
        }

        this.addOutput(currentPath, dataToType(currentVal), true, false);
      }
    });
    if (socketsToBeRemoved.length > 0 || argumentsToBeAdded.length > 0) {
      this.metaInfoChanged();
    }
  }
}

const socketFieldPrefix = 'Format ';

const FORMAT_MAX_SOCKETS = 100;

export class Format extends PPNode {
  public getName(): string {
    return 'Format Properties';
  }

  public getDescription(): string {
    return 'Customize and transform a JSON object';
  }

  public getTags(): string[] {
    return ['JSON', 'Transform'].concat(super.getTags());
  }

  protected getStandardInputName() {
    return JSONName;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        this.getStandardInputName(),
        new JSONType(true),
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        this.getStandardInputName(),
        new JSONType(true),
      ),
    ];
  }

  protected createUseSocketName(fieldName: string) {
    return socketFieldPrefix + fieldName;
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    // before every execute, re-evaluate inputs
    const json = inputObject[JSONName];
    const outJSON = {};

    this.adaptOutputs(json);

    Object.keys(json).forEach((key) => {
      const socketName = this.createUseSocketName(key);
      const formatType: FormatJSONInterface = inputObject[socketName];
      if (formatType?.Enabled) {
        let transformedName = formatType.Alias;
        if (transformedName.length < 1) {
          transformedName = key;
        }
        outJSON[transformedName] = json[key];
      }
    });
    outputObject[JSONName] = outJSON;
  }

  protected adaptOutputs(json: any): void {
    // remove all non existing arguments and add all missing (based on the definition we just got)

    const socketsToBeRemoved = this.inputSocketArray.filter((socket) => {
      const replacedName = socket.name.replaceAll(socketFieldPrefix, '');
      return (
        !(replacedName in json) &&
        socket.name !== this.getStandardInputName() &&
        socket.name !== flattenIfSingleName
      );
    });
    const argumentsToBeAdded = Object.keys(json).filter(
      (key) =>
        !this.inputSocketArray.some(
          (socket) => socket.name === this.createUseSocketName(key),
        ),
    );
    socketsToBeRemoved.forEach((socket) => {
      this.removeSocket(socket);
    });

    argumentsToBeAdded.forEach((argument) => {
      if (this.inputSocketArray.length < FORMAT_MAX_SOCKETS) {
        this.addInput(
          this.createUseSocketName(argument),
          new FormatJSONType(),
          { Enabled: false, Alias: '' },
        );
      }
    });
    if (socketsToBeRemoved.length > 0 || argumentsToBeAdded.length > 0) {
      this.metaInfoChanged();
    }
  }
}

export class FormatMap extends Format {
  public getName(): string {
    return 'Format Properties (Map)';
  }

  public getDescription(): string {
    return 'Customize and transform an array of JSON objects';
  }

  protected getStandardInputName(): string {
    return inputArrayName;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputArrayName, new JSONArrayType()),
      new Socket(SOCKET_TYPE.IN, flattenIfSingleName, new BooleanType(), true),
      new Socket(SOCKET_TYPE.OUT, inputArrayName, new ArrayType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputArray = inputObject[inputArrayName];

    if (Array.isArray(inputArray) && inputArray.length > 0) {
      const json = inputArray[0];

      this.adaptOutputs(json);
      let outputArray = [];
      for (let i = 0; i < inputArray.length; i++) {
        outputArray.push({});
      }

      Object.keys(json).forEach((key) => {
        const formatInfo: FormatJSONInterface =
          inputObject[this.createUseSocketName(key)];
        if (formatInfo?.Enabled) {
          const alias = formatInfo.Alias.length < 1 ? key : formatInfo.Alias;
          for (let i = 0; i < inputArray.length; i++) {
            outputArray[i][alias] = inputArray[i][key];
          }
        }
      });
      const keysOfFirst = Object.keys(outputArray[0]);
      if (inputObject[flattenIfSingleName] && keysOfFirst.length == 1) {
        const key = keysOfFirst[0];
        outputArray = outputArray.map((prop) => prop[key]);
      }

      outputObject[inputArrayName] = outputArray;
    } else {
      outputObject[inputArrayName] = [];
    }
  }
}

export class FlattenMap extends PPNode {
  public getName(): string {
    return 'Flatten Object Array';
  }

  public getDescription(): string {
    return 'Flattens an array of JSONs into a single array';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputArrayName, new JSONArrayType()),
      new Socket(SOCKET_TYPE.OUT, outputRegularArrayName, new ArrayType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputArray = inputObject[inputArrayName];
    outputObject[outputRegularArrayName] = inputArray
      .map((obj) => Object.values(obj))
      .flat();
  }
}

const overrideNameSuffix = ' - Override Name';

function extendJSONObjectWithOverrides(
  json: any,
  inputs: Record<string, any>,
  inputObject,
) {
  inputs.forEach((inputKey) => {
    let keyToUse = inputKey;
    const overrideName = inputObject[inputKey + overrideNameSuffix];
    if (overrideName !== '') {
      keyToUse = overrideName;
    }
    json[keyToUse] = inputObject[inputKey];
  });
}
export class Make extends DynamicInputNode {
  public getName(): string {
    return 'Create Object';
  }

  public getSocketForNewConnection = (socket: Socket): Socket =>
    DynamicInputNodeFunctions.getSocketForNewConnection(socket, this, true);

  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.OUT, JSONName, new JSONType())].concat(
      super.getDefaultIO(),
    );
  }

  protected getDependentDynamicSockets(socketName: string) {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        socketName + overrideNameSuffix,
        new StringType(),
        '',
      ),
    ];
  }

  public getDescription(): string {
    return 'Create new JSON from inputs';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  protected async onExecute(input, output): Promise<void> {
    const actualInputs = this.inputSocketArray
      .filter((socket) => !socket.name.includes(overrideNameSuffix))
      .map((socket) => socket.name);
    const outObject = {};
    extendJSONObjectWithOverrides(outObject, actualInputs, input);

    output[JSONName] = outObject;
  }
}

export class Merge extends DynamicInputNode {
  public getName(): string {
    return 'Merge Objects';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        destructiveMergeName,
        new BooleanType(),
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, JSONName, new JSONType()),
    ].concat(super.getDefaultIO());
  }

  public getDescription(): string {
    return 'Combine multiple JSONs together into a single one';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  protected async onExecute(input, output): Promise<void> {
    const actualInputs = this.inputSocketArray
      .filter((socket) => socket.name !== destructiveMergeName)
      .map((socket) => socket.name);

    const outObject = {};
    const destructiveMerge = input[destructiveMergeName];
    actualInputs.forEach((inputName) => {
      const keys = Object.keys(input[inputName]);
      keys.forEach((key) => {
        let keyName = key;
        let suffixInt = 2;
        while (!destructiveMerge && keyName in outObject) {
          keyName = key + '_' + suffixInt.toString();
          suffixInt++;
        }
        outObject[keyName] = input[inputName][key];
      });
    });
    output[JSONName] = outObject;
  }
}

export class Extend extends DynamicInputNode {
  public getName(): string {
    return 'Extend Object';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, JSONName, new JSONType()),
      new Socket(SOCKET_TYPE.OUT, JSONName, new JSONType()),
    ].concat(super.getDefaultIO());
  }

  public getDescription(): string {
    return 'Extend JSON with additional fields';
  }

  public socketCanBeRemoved(socket: Socket): boolean {
    return super.socketCanBeRemoved(socket) && socket.name !== JSONName;
  }

  protected getDependentDynamicSockets(socketName: string) {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        socketName + overrideNameSuffix,
        new StringType(),
        '',
      ),
    ];
  }

  public getTags(): string[] {
    return ['JSON', 'Transform'].concat(super.getTags());
  }

  protected async onExecute(input, output): Promise<void> {
    const actualInputs = this.inputSocketArray
      .filter(
        (socket) =>
          socket.name !== JSONName && !socket.name.includes(overrideNameSuffix),
      )
      .map((socket) => socket.name);
    const outObject = { ...input[JSONName] };
    extendJSONObjectWithOverrides(outObject, actualInputs, input);
    output[JSONName] = outObject;
  }
  // we want to always create a new socket for the new connection if you release on the node
  public getSocketForNewConnection = (socket: Socket): Socket =>
    DynamicInputNodeFunctions.getSocketForNewConnection(
      socket,
      this,
      true,
      this.getPreferredDataType(),
    );
}

export class ExtendMap extends PPNode {
  public getName(): string {
    return 'Extend Object (Map)';
  }

  public getDescription(): string {
    return 'Extend each object in a JSON array using a custom expression';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputArrayName, new JSONArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        codeName,
        new CodeType(),
        "(JSON) => ({'Keys':Object.keys(JSON)})",
      ),
      new Socket(SOCKET_TYPE.OUT, inputArrayName, new JSONArrayType()),
    ].concat(super.getDefaultIO());
  }

  public getTags(): string[] {
    return ['JSON', 'Transform'].concat(super.getTags());
  }

  protected async onExecute(input, output): Promise<void> {
    const workString =
      `
      (inputArray) => {
        const code = ` +
      input[codeName] +
      `;
        const func = eval(code);
        const outputArray = [];
        for (let i = 0; i < inputArray.length; i++){
          const cp = inputArray[i];
          const resObject = func(cp, i);
          const items = Object.entries(resObject);
          items.forEach(item => {
            cp[item[0]] = item[1];
          });
          outputArray.push(cp);
        };
        return outputArray;
      }
    `;

    const res = await new PNPWorker().work({
      code: workString,
      data: input[inputArrayName],
    });

    if (!res.success) {
      throw res.error;
    }
    output[inputArrayName] = res.result;
  }
}
