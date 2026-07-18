import React from 'react';
import { ArrayWidget } from '../../widgets';
import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { AnyType } from './anyType';

export const ARRAY_COLOR = new TRgba(204, 153, 255);

export interface ArrayTypeProps extends DataTypeProps {
  dataType: AbstractType;
}

export class ArrayType extends AbstractType {
  constructor() {
    super();
  }
  getName(): string {
    return 'Array';
  }

  getInputWidget = (props: DataTypeProps): any => {
    props.dataType = this;
    return <ArrayWidget {...props} />;
  };

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  getDefaultValue(): any {
    return [];
  }

  getColor(): TRgba {
    return ARRAY_COLOR;
  }

  getMetaText(data: any): string {
    return (
      '(' + (Array.isArray(data) ? data.length.toString() : 'Invalid') + ')'
    );
  }
  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (Array.isArray(data)) {
      return new Compatibility(CompatibilityType.Compatible);
    }
    return AbstractType.warningsToCompatibility(this.parse(data).warnings);
  }

  parse(data: any): TParseType {
    let parsedData;
    const warnings: SocketParsingWarning[] = [];

    if (Array.isArray(data)) {
      parsedData = data;
    } else if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
        if (!Array.isArray(parsedData)) {
          parsedData = [data];
        }
      } catch (error) {
        parsedData = [data];
      }
    }
    if (parsedData == undefined) {
      parsedData = [data];
      warnings.push(
        new SocketParsingWarning('Putting incoming elements into an array'),
      );
    }

    return {
      value: parsedData,
      warnings: warnings,
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'mapnode',
      'filter',
      'arraylength',
      'arrayslice',
      'concatenatearrays',
      'arrayget',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return [
      'codeeditor',
      'randomarray',
      'rangearray',
      'colorarray',
      'arraycreate',
      'widgetradio',
    ];
  }
}
