import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { ArrayType } from './arrayType';
import { COLOR } from '../../utils/constants';
import { AnyType } from './anyType';
import PPNode from '../../classes/NodeClass';
import { JSONArrayType } from './jsonArrayType';
import { AbstractType, Compatibility, CompatibilityType } from './abstractType';
// this one forces data to arrive in the form of an array of objects with specific properties

export interface GraphInputPointX {
  Value: number;
  Name: string | undefined;
  Color: TRgba | undefined;
}
export interface GraphInputPointXY {
  Value1: number;
  Value2: number;
  Name: string | undefined;
  Color: TRgba | undefined;
}
export interface GraphInputPointXYZ {
  Value1: number;
  Value2: number;
  Value3: number;
  Name: string | undefined;
  Color: TRgba | undefined;
}

export function getMinMaxValuesOfArray(values): [number, number] {
  if (values.length === 0) {
    return [0, 0];
  }
  const maxValue = values.reduce((prevMax, point) => Math.max(prevMax, point));
  const minValue = values.reduce((prevMin, point) => Math.min(prevMin, point));
  return [minValue, maxValue];
}

export function getGraphInputPointColor(
  point: GraphInputPointX,
  index: number,
  shouldUseSingleColor: boolean,
  singleColor: TRgba,
) {
  if (shouldUseSingleColor) {
    return singleColor;
  } else {
    return point.Color !== undefined
      ? TRgba.fromObject(point.Color)
      : TRgba.fromString(COLOR[index % COLOR.length]);
  }
}

export class GraphInputXType extends ArrayType {
  getName(): string {
    return 'Graph Input X';
  }

  getColor(): TRgba {
    return new TRgba(154, 183, 255);
  }

  getDefaultValue(): any {
    return [
      { Value: 10, Name: 'Point 1' },
      { Value: 25, Name: 'Point 2' },
      { Value: 15, Name: 'Point 3' },
      { Value: 40, Name: 'Point 4' },
      { Value: 30, Name: 'Point 5' },
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['graph_line', 'graph_pie'];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (
      (convertFrom instanceof JSONArrayType ||
        convertFrom instanceof ArrayType) &&
      !(convertFrom instanceof GraphInputXType)
    ) {
      return new Compatibility(
        CompatibilityType.Preferred,
        'JSONArrayToGraphInputX',
      );
    }
    return super.dataIsCompatible(data);
  }
}

export class GraphInputXYType extends ArrayType {
  getName(): string {
    return 'Graph Input XY';
  }

  getColor(): TRgba {
    return new TRgba(154 * (2 / 3), 183 * (2 / 3), 255 * (2 / 3));
  }

  getDefaultValue(): any {
    return [
      {
        Value1: 1,
        Value2: 10,
        Name: 'Point 1',
      },
      {
        Value1: 2,
        Value2: 25,
        Name: 'Point 2',
      },
      {
        Value1: 3,
        Value2: 15,
        Name: 'Point 3',
      },
      {
        Value1: 4,
        Value2: 40,
        Name: 'Point 4',
      },
      {
        Value1: 5,
        Value2: 30,
        Name: 'Point 5',
      },
    ];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (
      (convertFrom instanceof JSONArrayType ||
        convertFrom instanceof ArrayType) &&
      !(convertFrom instanceof GraphInputXYType)
    ) {
      return new Compatibility(
        CompatibilityType.Preferred,
        'JSONArrayToGraphInputXY',
      );
    } else if (convertFrom instanceof GraphInputXType) {
      return new Compatibility(CompatibilityType.Exact);
    }
    return super.dataIsCompatible(data);
  }
}

export class GraphInputXYZType extends ArrayType {
  getName(): string {
    return 'Graph Input XYZ';
  }

  getColor(): TRgba {
    return new TRgba(154 * (1 / 3), 183 * (1 / 3), 255 * (1 / 3));
  }

  getDefaultValue(): any {
    return [
      { Value1: 1, Value2: 10, Value3: 5, Name: 'Point 1' },
      { Value1: 2, Value2: 25, Value3: 15, Name: 'Point 2' },
      { Value1: 3, Value2: 15, Value3: 25, Name: 'Point 3' },
      { Value1: 4, Value2: 40, Value3: 10, Name: 'Point 4' },
      { Value1: 5, Value2: 30, Value3: 20, Name: 'Point 5' },
    ];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (
      (convertFrom instanceof JSONArrayType ||
        convertFrom instanceof ArrayType) &&
      !(convertFrom instanceof GraphInputXYZType)
    ) {
      return new Compatibility(
        CompatibilityType.Preferred,
        'JSONArrayToGraphInputXYZ',
      );
    } else if (convertFrom instanceof GraphInputXYZType) {
      return new Compatibility(CompatibilityType.Exact);
    }
    return super.dataIsCompatible(data);
  }
}
