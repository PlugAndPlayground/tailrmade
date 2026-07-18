import React from 'react';
import { CodeWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { TParseType } from '../../utils/interfaces';
import { convertToViewableString } from '../../utils/utils';

export interface CodeTypeProps extends DataTypeProps {
  dataType: AbstractType;
}

export class CodeType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'Code';
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType,
  ): Compatibility {
    switch (typeof data) {
      case 'string':
        return new Compatibility(CompatibilityType.Preferred);
      case 'object':
        return new Compatibility(CompatibilityType.NeedDirectConversion);
      default:
        return new Compatibility(CompatibilityType.Incompatible);
    }
  }

  parse(data: any): TParseType {
    let warnings = [];
    let dataAsString = '';
    if (typeof data !== 'string') {
      dataAsString = JSON.stringify(data);
    } else {
      dataAsString = data;
    }
    return { value: dataAsString, warnings };
  }

  getInputWidget = (props: CodeTypeProps): any => {
    props.dataType = this;
    return <CodeWidget {...props} />;
  };

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  getDefaultValue(): any {
    return '(a) => {return a;}';
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['codeeditor'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['codeeditor'];
  }

  shouldStringifyForClipboard(): boolean {
    return false;
  }
}
