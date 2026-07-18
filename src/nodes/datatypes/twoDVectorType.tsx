import React from 'react';
import { DEFAULT_2DVECTOR } from '../../utils/constants';
import { parse2DVector } from '../../utils/utils';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { TwoDNumberWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';
import { NumberType } from './numberType';

export interface TwoDVectorTypeProps extends DataTypeProps {
  dataType: TwoDVectorType;
}

export interface TwoDVectorTypeInterface {
  x: number;
  y: number;
}

export class TwoDVectorType extends AbstractType {
  getInputWidget = (props: TwoDVectorTypeProps): any => {
    props.dataType = this;
    return <TwoDNumberWidget {...props} />;
  };

  getName(): string {
    return '2D vector';
  }

  getDefaultValue(): TwoDVectorTypeInterface {
    return DEFAULT_2DVECTOR;
  }

  parse(data: any): TParseType {
    return parse2DVector(data);
  }

  getColor(): TRgba {
    return new TRgba(128, 148, 250);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['label', 'break'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['numbertotwodvector', 'codeeditor'];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (convertFrom instanceof NumberType) {
      return new Compatibility(
        CompatibilityType.Compatible,
        'NumberToTwoDVector',
      );
    }
    return super.dataIsCompatible(data, convertFrom);
  }
}
