import { inspect } from 'util';
import React from 'react';
import { JSONWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { parseJSON } from '../../utils/utils';

export interface JSONTypeProps extends DataTypeProps {
  dataType: JSONType;
}

export class JSONType extends AbstractType {
  strictParsing: boolean; // whether to force the result into JSON or not
  constructor(strictParsing: boolean = false) {
    super();
    this.strictParsing = strictParsing;
  }

  getName(): string {
    return 'JSON';
  }

  getInputWidget = (props: JSONTypeProps): any => {
    props.dataType = this;
    return <JSONWidget {...props} />;
  };

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  getDefaultValue(): any {
    return {};
  }

  getColor(): TRgba {
    return new TRgba(128, 128, 250);
  }

  getComment(data: any): string {
    if (data) {
      return inspect(data, null, 10);
    }
    return 'null';
  }
  protected dataIsCompatible(data: any): Compatibility {
    return typeof data === 'string' || typeof data == 'object'
      ? new Compatibility(CompatibilityType.Compatible)
      : new Compatibility(CompatibilityType.Incompatible);
  }

  parse(data: any): TParseType {
    return parseJSON(data, this.strictParsing);
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'break',
      'format',
      'jsonkeys',
      'jsonvalues',
      'jsoneditor',
      'table2',
      'merge',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['make', 'jsoneditor'];
  }
}
