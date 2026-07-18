import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { prettyPrintNumber } from '../../utils/utils';
import { inputPropertyName } from '../data/array';
import { arrayEntryToSelectedValue, arrayName } from '../data/dataFunctions';
import { ArrayType } from '../datatypes/arrayType';
import InputArrayKeysType from '../datatypes/inputArrayKeysType';
import { NumberType } from '../datatypes/numberType';
import { TypeConversionNode } from './conversionBase';
import { getDefaultGraphValues } from './graphTypeConversions';

const rangeName = 'Range';

export class QuantizeJSONObjectArray extends TypeConversionNode {
  public getName(): string {
    return 'Quantize Object Array';
  }

  public getDescription(): string {
    return 'Quantizes objects to ranges based on one of their properties';
  }

  public getTags(): string[] {
    return ['JSON', 'Array'];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, arrayName, new ArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        inputPropertyName,
        new InputArrayKeysType(arrayName, this.id, false),
      ),
      new Socket(SOCKET_TYPE.IN, rangeName, new NumberType(false, 1, 100), 10),
      new Socket(SOCKET_TYPE.OUT, arrayName, new ArrayType()),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    await quantizeData(inputObject, outputObject);
  }

  protected autoSetDefaultValues(): void {
    const currentInput = this.getInputData(arrayName);
    const foundSuggestions = getDefaultGraphValues(currentInput, 1);
    if (foundSuggestions.Values.length > 0) {
      this.setInputData(inputPropertyName, foundSuggestions.Values[0]);
    }
  }
}

async function quantizeData(
  inputObject: any,
  outputObject: Record<string, unknown>,
): Promise<void> {
  const grouped = [];
  const array = inputObject[arrayName];
  const property = inputObject[inputPropertyName];
  const range = inputObject[rangeName];
  if (range < 0.01) {
    throw new Error('Range must be greater than 0.01');
  }
  let maxFound = -Infinity;
  let minFound = Infinity;
  array.forEach((entry, index) => {
    const selectedValue = arrayEntryToSelectedValue(entry, property, index);
    minFound = Math.min(minFound, selectedValue);
    maxFound = Math.max(maxFound, selectedValue);
  });

  const rangeSize = Math.ceil((maxFound - minFound) / range);
  if (rangeSize > 1000) {
    throw new Error('Range is too small, try increasing it');
  }
  for (let i = 0; i < rangeSize; i++) {
    grouped.push({
      Name: `${prettyPrintNumber(i * range + minFound)} to ${prettyPrintNumber((i + 1) * range + minFound)}`,
      Entries: [],
    });
  }
  array.forEach((entry, index) => {
    const selectedValue = arrayEntryToSelectedValue(entry, property, index);
    const groupIndex = Math.min(
      grouped.length - 1,
      Math.max(0, Math.floor((selectedValue - minFound) / range)),
    );
    grouped[groupIndex].Entries.push(entry);
  });

  grouped.forEach((group) => {
    group.Length = group.Entries.length;
  });

  outputObject[arrayName] = grouped;
}
