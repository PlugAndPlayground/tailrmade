import React from 'react';
import { DEFAULT_2DVECTOR, DEFAULT_3DVECTOR } from '../../utils/constants';
import { parse2DVector, parse3DVector } from '../../utils/utils';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { ThreeDNumberWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';
import { NumberType } from './numberType';

export interface ThreeDVectorTypeProps extends DataTypeProps {
  dataType: ThreeDVectorType;
}

export interface ThreeDVectorTypeInterface {
  x: number;
  y: number;
  z: number;
}

export class ThreeDVectorType extends AbstractType {
  getInputWidget = (props: ThreeDVectorTypeProps): any => {
    props.dataType = this;
    return <ThreeDNumberWidget {...props} />;
  };

  getName(): string {
    return '3D vector';
  }

  getDefaultValue(): ThreeDVectorTypeInterface {
    return DEFAULT_3DVECTOR;
  }

  parse(data: any): TParseType {
    return parse3DVector(data);
  }

  getColor(): TRgba {
    return new TRgba(128 / 2, 148 / 2, 250 / 2);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['label', 'break'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['numbertothreedvector', 'codeeditor'];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (convertFrom instanceof NumberType) {
      return new Compatibility(
        CompatibilityType.Compatible,
        'NumberToThreeDVector',
      );
    }
    return super.dataIsCompatible(data, convertFrom);
  }
}
