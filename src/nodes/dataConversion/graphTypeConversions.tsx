import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { NODE_SOURCE, SOCKET_TYPE } from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { arrayEntryToSelectedValue } from '../data/dataFunctions';
import { BooleanType } from '../datatypes/booleanType';
import { ColorType } from '../datatypes/colorType';
import {
  GraphInputPointX,
  GraphInputPointXY,
  GraphInputPointXYZ,
  GraphInputXType,
  GraphInputXYType,
  GraphInputXYZType,
} from '../datatypes/graphInputType';
import InputArrayKeysType, {
  ENTIRE_OBJECT_NAME,
  INDEX_NAME,
} from '../datatypes/inputArrayKeysType';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import { NumberType } from '../datatypes/numberType';
import { TwoDVectorType } from '../datatypes/twoDVectorType';
import { TypeConversionNode } from './conversionBase';

const inputJSONArrayName = 'JSON Array';
const inputLabelName = 'Label';
const inputValueName = 'Value';
const inputOverrideColor = 'Override Color';
const inputColorName = 'Color';

const inputValue1Name = 'Value 1';
const inputValue2Name = 'Value 2';
const inputValue3Name = 'Value 3';

const outputGraphableName = 'Graphable';

function fishOutGraphValue(name: string, entry: any, index: number) {
  let value = arrayEntryToSelectedValue(entry, name, index);
  // if strings, convert
  if (typeof value == 'string') {
    value = parseFloat(value.trim());
  }
  return value;
}

interface GraphValueSuggestions {
  Color: string | undefined;
  Name: string | undefined;
  Values: string[];
}

// this has gotten quite complex but not sure it can be made simpler, it is fairly smart
export function getDefaultGraphValues(
  input: any,
  desiredValues: number,
): GraphValueSuggestions {
  // best better hope there is an array coming in, otherwise just give up
  let foundValues: string[] = [];
  let foundColor: string | undefined = undefined;
  let foundName: string | undefined = undefined;
  if (Array.isArray(input)) {
    const inputArray: any[] = input;
    if (inputArray.length > 0) {
      const entry = inputArray[0];
      if (typeof entry == 'object') {
        const keys = Object.keys(entry);
        // first try to find value
        if (entry?.Value !== undefined) {
          foundValues.push('Value');
        }
        while (foundValues.length < desiredValues) {
          const foundNumberField = keys.find(
            (key) =>
              typeof entry[key] == 'number' && !foundValues.includes(key),
          );
          if (foundNumberField !== undefined) {
            // good
            foundValues.push(foundNumberField);
            continue;
          } else {
            // no number for us here, well then lets try to find a string that can be converted to a number
            const stringFields = keys.filter(
              (key) =>
                typeof entry[key] == 'string' && !foundValues.includes(key),
            );
            for (let i = 0; i < stringFields.length; i++) {
              const attemptedNumber = parseFloat(entry[stringFields[i]].trim());
              if (!Number.isNaN(attemptedNumber)) {
                foundValues.push(stringFields[i]);
                continue;
              }
            }
            // give up
            break;
          }
        }

        // then try to find "Name"
        if (entry?.Name !== undefined) {
          foundName = 'Name';
        } else if (entry?.Label !== undefined) {
          foundName = 'Label';
        } else {
          // try to find some label that is a string and not the same as an existing value
          const interestingField = keys.find(
            (key) =>
              typeof entry[key] == 'string' && !foundValues.includes(key),
          );
          if (interestingField !== undefined) {
            foundName = interestingField;
          }
        }
        // last, color
        if (entry?.Color !== undefined) {
          foundColor = 'Color';
        }
      } else {
        // not objects, so use entire thing here (hope its a number or can be converted to one)
        foundValues.push(INDEX_NAME);
      }
    }
  }

  return { Color: foundColor, Name: foundName, Values: foundValues };
}

// Unified base class to handle common graph conversion logic
abstract class BaseJSONArrayToGraphInput extends TypeConversionNode {
  protected abstract getValueFieldNames(): string[];
  protected abstract createGraphPoint(
    values: number[],
    label: any,
    color: any,
  ): any;
  protected abstract getDesiredValueCount(): number;

  protected autoSetDefaultValues(): void {
    const currentInput = this.getInputData(inputJSONArrayName);
    const foundSuggestions = getDefaultGraphValues(
      currentInput,
      this.getDesiredValueCount(),
    );

    if (foundSuggestions.Name !== undefined) {
      this.setInputData(inputLabelName, foundSuggestions.Name);
    }
    if (foundSuggestions.Color !== undefined) {
      this.setInputData(inputColorName, foundSuggestions.Color);
    }

    // Set value fields based on available suggestions
    const valueFieldNames = this.getValueFieldNames();
    for (
      let i = 0;
      i < Math.min(foundSuggestions.Values.length, valueFieldNames.length);
      i++
    ) {
      this.setInputData(valueFieldNames[i], foundSuggestions.Values[i]);
    }
  }

  protected async onExecute(
    inputObject: unknown,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const input = inputObject as Record<string, unknown>;
    const inputArray: any[] = input[inputJSONArrayName] as any[];
    const valueFieldNames = this.getValueFieldNames();

    const graphableObjects: any[] = [];

    const colorParser = new ColorType();
    inputArray.forEach((entry, index) => {
      const label = arrayEntryToSelectedValue(
        entry,
        input[inputLabelName] as string,
        index,
      );

      // Extract all values
      const values: number[] = [];
      for (const fieldName of valueFieldNames) {
        const value = fishOutGraphValue(
          input[fieldName] as string,
          entry,
          index,
        );
        values.push(value);
      }

      let color = undefined;
      if (input[inputOverrideColor]) {
        color = arrayEntryToSelectedValue(
          entry,
          input[inputColorName] as string,
          index,
        );
      }

      const graphPoint = this.createGraphPoint(
        values,
        label,
        color != undefined ? colorParser.parse(color).value : undefined,
      );
      graphableObjects.push(graphPoint);
    });

    outputObject[outputGraphableName] = graphableObjects;
  }
}

export abstract class JSONArrayToGraphInputX extends BaseJSONArrayToGraphInput {
  public getName(): string {
    return 'Convert JSON Array to Graph Input X';
  }
  public getDescription(): string {
    return 'Prepares an input JSON array to be put on a one dimension graph';
  }

  public getTags(): string[] {
    return ['JSON', 'Array', 'Draw'];
  }

  protected getValueFieldNames(): string[] {
    return [inputValueName];
  }

  protected getDesiredValueCount(): number {
    return 1;
  }

  protected createGraphPoint(
    values: number[],
    label: any,
    color: any,
  ): GraphInputPointX {
    return { Value: values[0], Name: label, Color: color };
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputJSONArrayName, new JSONArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputValueName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputLabelName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(SOCKET_TYPE.IN, inputOverrideColor, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputColorName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
        ENTIRE_OBJECT_NAME,
        () => this.getInputData(inputOverrideColor),
      ),

      new Socket(SOCKET_TYPE.OUT, outputGraphableName, new GraphInputXType()),
    ];
  }
}

export abstract class JSONArrayToGraphInputXY extends BaseJSONArrayToGraphInput {
  public getName(): string {
    return 'Convert JSON Array to Graph Input XY';
  }
  public getDescription(): string {
    return 'Prepares an input JSON array to be put on a two dimensional graph';
  }

  public getTags(): string[] {
    return ['JSON', 'Array', 'Draw'];
  }

  protected getValueFieldNames(): string[] {
    return [inputValue1Name, inputValue2Name];
  }

  protected getDesiredValueCount(): number {
    return 2;
  }

  protected createGraphPoint(
    values: number[],
    label: any,
    color: any,
  ): GraphInputPointXY {
    return {
      Value1: values[0],
      Value2: values[1],
      Name: label,
      Color: color,
    };
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputJSONArrayName, new JSONArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputValue1Name,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputValue2Name,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputLabelName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(SOCKET_TYPE.IN, inputOverrideColor, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputColorName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
        ENTIRE_OBJECT_NAME,
        () => this.getInputData(inputOverrideColor),
      ),

      new Socket(SOCKET_TYPE.OUT, outputGraphableName, new GraphInputXYType()),
    ];
  }
}

export abstract class JSONArrayToGraphInputXYZ extends BaseJSONArrayToGraphInput {
  public getName(): string {
    return 'Convert JSON Array to Graph Input XYZ';
  }
  public getDescription(): string {
    return 'Prepares an input JSON array to be put on a three dimensional graph';
  }

  public getTags(): string[] {
    return ['JSON', 'Array', 'Draw'];
  }

  protected getValueFieldNames(): string[] {
    return [inputValue1Name, inputValue2Name, inputValue3Name];
  }

  protected getDesiredValueCount(): number {
    return 3;
  }

  protected createGraphPoint(
    values: number[],
    label: any,
    color: any,
  ): GraphInputPointXYZ {
    return {
      Value1: values[0],
      Value2: values[1],
      Value3: values[2],
      Name: label,
      Color: color,
    };
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, inputJSONArrayName, new JSONArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputValue1Name,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputValue2Name,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputValue3Name,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        inputLabelName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
      ),
      new Socket(SOCKET_TYPE.IN, inputOverrideColor, new BooleanType(), false),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        inputColorName,
        new InputArrayKeysType(inputJSONArrayName, this.id, true, false),
        ENTIRE_OBJECT_NAME,
        () => this.getInputData(inputOverrideColor),
      ),

      new Socket(SOCKET_TYPE.OUT, outputGraphableName, new GraphInputXYZType()),
    ];
  }
}
