import React from 'react';
import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { ArrayWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { ArrayType } from './arrayType';
import { AnyType } from './anyType';

export class JSONArrayType extends ArrayType {
  constructor() {
    super();
  }
  getName(): string {
    return 'JSON Array';
  }

  getInputWidget = (props: DataTypeProps): any => {
    props.dataType = this;
    return <ArrayWidget {...props} />;
  };

  getColor(): TRgba {
    return new TRgba(144, 103, 245);
  }

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    return AbstractType.warningsToCompatibility(this.parse(data).warnings);
  }

  parse(data: any): TParseType {
    // Handle markdown code blocks (```json...```)
    if (typeof data === 'string') {
      // Check if the string looks like a markdown JSON code block
      const markdownJsonMatch = data.match(
        /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,
      );
      if (markdownJsonMatch) {
        // Extract the JSON content from the code block
        data = markdownJsonMatch[1].trim();
      }
    }

    const parsed = super.parse(data);
    if (parsed.value.length > 0 && typeof parsed.value[0] !== 'object') {
      // put them into object structure
      const newArray = parsed.value.map((p) => ({ Value: p }));
      return { value: newArray, warnings: parsed.warnings };
    }
    return parsed;
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'mapexecutemacro',
      'filter',
      'arraylength',
      'arrayslice',
      'concatenatearrays',
      'arrayget',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['colorarray', 'arraycreate'];
  }
}
