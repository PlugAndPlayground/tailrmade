import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { AbstractType, isDirectlyCompatible } from '../datatypes/abstractType';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { BooleanType } from '../datatypes/booleanType';
import { ColorType } from '../datatypes/colorType';
import { DeferredPixiType } from '../datatypes/deferredPixiType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { FunctionType } from '../datatypes/functionType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { dataToType } from '../datatypes/typehelper';

const valueName = 'Value';
const isTypeName = 'Is type';
const matchName = 'Match';
const matchesOutName = 'Matches';
const typeOutName = 'Type';

const MATCH_EXACT = 'Exact';
const MATCH_COMPATIBLE = 'Compatible';

// Exactly the types dataToType can report, so every option in the picker is
// one the Type output can actually produce. Ordered by how often they come up.
const reportableTypes: (new () => AbstractType)[] = [
  NumberType,
  StringType,
  BooleanType,
  ArrayType,
  JSONType,
  ColorType,
  FunctionType,
  DeferredPixiType,
  AnyType,
];

const typesByName = new Map<string, new () => AbstractType>(
  reportableTypes.map((type) => [new type().getName(), type]),
);

export const getTypeOptions = (): EnumStructure =>
  [...typesByName.keys()].map((name) => ({ text: name }));

export class TypeOf extends PPNode {
  public getName(): string {
    return 'Type of';
  }

  public getDescription(): string {
    return 'Reports the data type of a value and whether it is a chosen type';
  }

  public getTags(): string[] {
    return ['Data', 'Logic'].concat(super.getTags());
  }

  public getDocs(): string {
    return `Answers "what type is this" in the app's own types, the same ones
sockets carry, rather than JavaScript's typeof. "Type" is the type name, such
as Number, String, Boolean, Array, JSON or Color, so it feeds labels and the
string and enum nodes directly.

"Matches" compares the value against the type picked in "Is type". "Match" set
to Exact is true only when "Type" equals that pick. Compatible asks what a
socket asks when data arrives instead: would a socket of that type hold this
value as it is, or would it have to change type. That is looser and not
symmetric, so 42 is exactly a Number and also compatible with Boolean, while
the string "42" is neither.

undefined and null report Any and are compatible with nothing, so Any plus
Exact is how you test for an empty value.

A string holding JSON is reported by what it contains, so "[1,2]" is an Array
and "{}" is JSON. Parse or quote upstream if you need the string itself.

The "Value" input stays Any and never adapts to what flows through it, so rows
of mixed types each report their own type instead of being coerced to the first
one seen.`;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return false;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, valueName, new AnyType(), null),
      new Socket(
        SOCKET_TYPE.IN,
        isTypeName,
        new DynamicEnumType(getTypeOptions, () => {}),
        new NumberType().getName(),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        matchName,
        new EnumType(
          [{ text: MATCH_EXACT }, { text: MATCH_COMPATIBLE }],
          undefined,
          true,
        ),
        MATCH_EXACT,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, matchesOutName, new BooleanType()),
      new Socket(SOCKET_TYPE.OUT, typeOutName, new StringType()),
    ];
  }

  protected async onExecute(
    input: Record<string, any>,
    output: Record<string, unknown>,
  ): Promise<void> {
    const value = input[valueName];
    const actualTypeName = dataToType(value).getName();
    output[typeOutName] = actualTypeName;

    const expectedName = input[isTypeName];
    const expected = typesByName.get(expectedName);
    if (expected === undefined) {
      output[matchesOutName] = false;
    } else if (input[matchName] === MATCH_COMPATIBLE) {
      output[matchesOutName] = isDirectlyCompatible(
        new expected().getCompatability(value).type,
      );
    } else {
      output[matchesOutName] = actualTypeName === expectedName;
    }
  }
}
