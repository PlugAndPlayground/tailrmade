import React from 'react';
import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { TextWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';

export const STRING_COLOR = new TRgba(148, 250, 148);

export interface StringTypeProps extends DataTypeProps {
  dataType: StringType;
}

export class StringType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'String';
  }

  getInputWidget = (props: StringTypeProps): any => {
    props.dataType = this;
    return <TextWidget {...props} />;
  };

  getOutputWidget = (props: StringTypeProps): any => {
    props.dataType = this;
    return <TextWidget {...props} />;
  };

  getDefaultValue(): any {
    return '';
  }

  getColor(): TRgba {
    return STRING_COLOR;
  }

  parse(data: any): TParseType {
    return parseString(data);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['label', 'draw_text', 'concatenate'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['label', 'constant_string'];
  }

  prefersToChangeAwayFromThisType(): boolean {
    return true;
  }

  shouldStringifyForClipboard(): boolean {
    return false;
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (typeof data === 'string') {
      return new Compatibility(CompatibilityType.Exact);
    } else if (typeof data === 'function') {
      return new Compatibility(CompatibilityType.Incompatible);
    } else {
      return new Compatibility(CompatibilityType.NeedDirectConversion);
    }
  }

  getMetaText(data: any): string {
    if (typeof data == 'string') {
      if (data.length > 10) {
        return data.substring(0, 7) + '...';
      } else {
        return data;
      }
    }
    return '';
  }
}

export const parseString = (data: any): TParseType => {
  let parsedData;
  const warnings: SocketParsingWarning[] = [];

  if (typeof data == 'object' || Array.isArray(data)) {
    try {
      parsedData = JSON.stringify(data);
    } catch (error) {}
  } else {
    parsedData = String(data);
  }
  if (parsedData == undefined) {
    parsedData = '';
    warnings.push(
      new SocketParsingWarning('Not a string. Empty string is returned'),
    );
  }

  return {
    value: parsedData,
    warnings: warnings,
  };
};
