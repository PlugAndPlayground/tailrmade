import React from 'react';
import { inspect } from 'util';
import { HtmlWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { validateHtml } from '../../utils/utils';
import { COLOR } from '../../utils/constants';

export interface HtmlTypeProps extends DataTypeProps {
  dataType: HtmlType;
}

export class HtmlType extends AbstractType {
  strictParsing: boolean; // whether to force the result into Html or not
  constructor(strictParsing: boolean = false) {
    super();
    this.strictParsing = strictParsing;
  }

  getName(): string {
    return 'Html';
  }

  getInputWidget = (props: HtmlTypeProps): any => {
    props.dataType = this;
    return <HtmlWidget {...props} />;
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
    return TRgba.fromString(COLOR[10]);
  }

  getComment(data: any): string {
    if (data) {
      return inspect(data, null, 10);
    }
    return 'null';
  }

  shouldStringifyForClipboard(): boolean {
    return false;
  }

  protected dataIsCompatible(data: any): Compatibility {
    return typeof data === 'string'
      ? new Compatibility(CompatibilityType.Compatible)
      : new Compatibility(CompatibilityType.Incompatible);
  }

  parse(data: any): TParseType {
    return validateHtml(data, this.strictParsing);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['htmlrenderer', 'concatenate'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['codeeditor', 'constant'];
  }
}
