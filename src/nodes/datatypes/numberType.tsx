import React from 'react';
import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { NumberOutputWidget, SliderWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';
import { formatIfNumber } from '../../utils/utils';

type PresetItem = {
  text: string;
  value: any;
};
type PresetStructure = PresetItem[];

export const NUMBER_COLOR = new TRgba(108, 209, 209);

export interface NumberTypeProps extends DataTypeProps {
  dataType: NumberType;
}

export class NumberType extends AbstractType {
  round: boolean;
  minValue: number;
  maxValue: number;
  stepSize: number;
  showDetails: boolean;
  presetValues: PresetStructure;

  constructor(
    inRound = false,
    inMinValue = 0,
    inMaxValue = 100,
    stepSize = 0.01,
    showDetails = false,
    presetValues: PresetStructure = [],
  ) {
    super();
    this.round = inRound;
    this.minValue = inMinValue;
    this.maxValue = inMaxValue;
    this.stepSize = stepSize;
    this.showDetails = showDetails;
    this.presetValues = presetValues;
  }

  getInputWidget = (props: NumberTypeProps): any => {
    props.dataType = this;
    return <SliderWidget {...props} />;
  };

  getOutputWidget = (props: NumberTypeProps): any => {
    props.dataType = this;
    return <NumberOutputWidget {...props} />;
  };

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (typeof data === 'number') {
      return new Compatibility(CompatibilityType.Exact);
    } else if (typeof data === 'string') {
      return new Compatibility(CompatibilityType.NeedDirectConversion);
    } else if (typeof data === 'function') {
      return new Compatibility(CompatibilityType.Incompatible);
    } else if (
      (Array.isArray(data) && data.length > 0 && typeof data[0] === 'number') ||
      typeof data[0] === 'string'
    ) {
      return new Compatibility(CompatibilityType.Compatible, 'ArrayGet');
    } else {
      return AbstractType.warningsToCompatibility(this.parse(data).warnings);
    }
  }

  getMetaText(data: any): string {
    return typeof data == 'number' ? formatIfNumber(data).toString() : '';
  }

  getName(): string {
    return 'Number';
  }

  getDefaultValue(): any {
    return 0;
  }

  parse(data: any): TParseType {
    return parseNumber(data);
  }

  getColor(): TRgba {
    return NUMBER_COLOR;
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'label',
      'add',
      'subtract',
      'multiply',
      'divide',
      'sqrt',
      'mathfunction',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['widgetslider', 'constant_number'];
  }

  prefersToChangeAwayFromThisType(): boolean {
    return true;
  }
}

const parseNumber = (data): TParseType => {
  let parsedData;
  const warnings: SocketParsingWarning[] = [];

  switch (typeof data) {
    case 'number':
      parsedData = data;
      break;
    case 'string':
      const parsedString = parseFloat(
        data.replace(',', '.').replace(/[^\d.-]/g, ''),
      );
      if (!isNaN(parsedString)) {
        parsedData = parsedString;
      } else {
        parsedData = 0;
        warnings.push(
          new SocketParsingWarning('Not a number (NaN). 0 is returned'),
        );
      }
      break;
    case 'object':
      if (data !== null && data !== undefined) {
        parsedData = 0;
        warnings.push(
          new SocketParsingWarning(
            'No number could be extracted from the object. 0 is returned',
          ),
        );
      }
      break;

    // Default case to handle other data types like 'undefined', 'function', etc.
    default:
      parsedData = 0;
      warnings.push(
        new SocketParsingWarning('Number is null or undefined. 0 is returned'),
      );
      break;
  }
  return {
    value: parsedData,
    warnings: warnings,
  };
};
