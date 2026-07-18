import React from 'react';
import * as PIXI from 'pixi.js';
import { SocketParsingWarning } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import { COLOR_WARNING } from '../../utils/constants';
import { ColorWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { AnyType } from './anyType';

export interface ColorTypeProps extends DataTypeProps {
  dataType: ColorType;
}

export class ColorType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'Color';
  }

  getDefaultValue(): any {
    return TRgba.randomColor();
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (typeof data == 'object') {
      return new Compatibility(CompatibilityType.Compatible);
    } else if (
      typeof data === 'string' ||
      typeof data === 'number' ||
      typeof data === 'boolean'
    ) {
      return new Compatibility(CompatibilityType.NeedDirectConversion);
    }
    return new Compatibility(CompatibilityType.Incompatible);
  }

  parse(data: any): TParseType {
    let parsedData;
    const warnings: SocketParsingWarning[] = [];
    if (typeof data === 'object') {
      parsedData = Object.assign(new TRgba(), data);
      if (!TRgba.isTRgba(parsedData)) {
        parsedData = undefined;
      }
    } else if (typeof data === 'string') {
      try {
        parsedData = TRgba.fromString(data);
      } catch (error) {
        parsedData = TRgba.fromHashedString(data);
      }
    } else if (typeof data === 'number') {
      parsedData = new TRgba(data, data, data);
    } else if (typeof data === 'boolean') {
      parsedData = new TRgba(data ? 255 : 0, data ? 255 : 0, data ? 255 : 0);
    }

    if (parsedData == undefined) {
      parsedData = TRgba.fromString(COLOR_WARNING);
      warnings.push(
        new SocketParsingWarning('Not a color. Default color is returned'),
      );
    }

    return {
      value: parsedData as TRgba,
      warnings: warnings,
    };
  }

  getInputWidget = (props: ColorTypeProps): any => {
    props.dataType = this;
    return <ColorWidget {...props} />;
  };

  getColor(): TRgba {
    return new TRgba(110, 110, 110);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['colorarray'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['widgetcolorpicker'];
  }

  drawValueSpecificGraphics(graphics: PIXI.Graphics, data: any) {
    super.drawValueSpecificGraphics(graphics, data);
    if (data) {
      try {
        graphics
          .circle(0, 0, 4)
          .fill({ color: data.hexNumber(), alpha: data.getAlpha(true) });
      } catch (error) {}
    }
  }
}
