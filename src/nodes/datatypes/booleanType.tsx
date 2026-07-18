import React from 'react';
import * as PIXI from 'pixi.js';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { BooleanWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';

export const BOOLEAN_COLOR = new TRgba(90, 90, 90);

export interface BooleanTypeProps extends DataTypeProps {
  dataType: BooleanType;
}

export class BooleanType extends AbstractType {
  getName(): string {
    return 'Boolean';
  }

  getDefaultValue(): any {
    return false;
  }

  parse(data: any): TParseType {
    return { value: data ? true : false, warnings: [] };
  }

  getInputWidget = (props: BooleanTypeProps): any => {
    props.dataType = this;
    return <BooleanWidget {...props} />;
  };

  getOutputWidget = (props: BooleanTypeProps): any => {
    props.dataType = this;
    return <BooleanWidget {...props} />;
  };

  getColor(): TRgba {
    return BOOLEAN_COLOR;
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['and', 'or', 'not', 'if_else', 'comparison'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['widgetswitch'];
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (typeof data === 'boolean') {
      return new Compatibility(CompatibilityType.Exact);
    } else if (typeof data === 'number') {
      return new Compatibility(CompatibilityType.Compatible);
    } else if (typeof data === 'function') {
      return new Compatibility(CompatibilityType.Incompatible);
    } else {
      return new Compatibility(CompatibilityType.NeedDirectConversion);
    }
  }

  static drawBooleanValue(graphics: PIXI.Graphics, data: any) {
    if (data) {
      graphics.moveTo(-4, 0);
      graphics.lineTo(-1, 3);
      graphics.moveTo(-1.35, 2.65);
      graphics.lineTo(4, -3.5);
    } else {
      graphics.moveTo(-4, -4);
      graphics.lineTo(4, 4);
      graphics.moveTo(-4, 4);
      graphics.lineTo(4, -4);
    }
    graphics
      .fill(TRgba.white().hexNumber())
      .stroke({ width: 1, color: TRgba.white().hexNumber() });
  }

  drawValueSpecificGraphics(graphics: PIXI.Graphics, data: any) {
    super.drawValueSpecificGraphics(graphics, data);
    BooleanType.drawBooleanValue(graphics, data);
  }
}
