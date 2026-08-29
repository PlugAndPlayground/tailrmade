import React from 'react';
import { TRgba } from '../../utils/color';
import {
  TParseType,
  FlexDirection,
  MobileBehavior,
} from '../../utils/interfaces';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { JSONType } from './jsonType';
import { AnyType } from './anyType';
import { WidgetLayoutWidget } from '../../layoutWidget';
import { MAIN_COLOR, UNSET_VALUE } from '../../utils/constants';
import { parseJSON } from '../../utils/utils';
import { ColorSetting, INHERIT_COLOR } from '../../utils/themeColors';

export interface WidgetLayoutInterface {
  flexDirection: FlexDirection;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  padding: number[];
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  gap: number;
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  // may hold the 'inherit' keyword instead of a value, so a container can
  // defer to the app theme rather than naming a color
  color: ColorSetting;
  mobileBehavior: MobileBehavior;
  customStyles: Record<string, any>;
}

export interface WidgetLayoutTypeProps extends DataTypeProps {
  dataType: WidgetLayoutType;
}

export function getDefaultContainerBackground(
  color = MAIN_COLOR,
): Record<'r' | 'g' | 'b' | 'a', number> {
  const tintedBackground = TRgba.fromString(color).darken(0.4).setAlpha(0.2);

  return {
    r: tintedBackground.r,
    g: tintedBackground.g,
    b: tintedBackground.b,
    a: tintedBackground.a,
  };
}

export function getDefaultWidgetLayoutValue(): WidgetLayoutInterface {
  return {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    width: '100%',
    height: 'auto',
    padding: [0, 0, 0, 0],
    minWidth: '80px',
    minHeight: '80px',
    maxWidth: UNSET_VALUE,
    maxHeight: UNSET_VALUE,
    gap: 0,
    background: getDefaultContainerBackground(),
    // defers to the app theme's text.primary
    color: INHERIT_COLOR,
    mobileBehavior: 'row',
    customStyles: {},
  };
}

export class WidgetLayoutType extends AbstractType {
  constructor() {
    super();
  }

  getName(): string {
    return 'Widget Layout';
  }

  getInputWidget = (props: WidgetLayoutTypeProps): any => {
    props.dataType = this;
    return <WidgetLayoutWidget {...props} />;
  };

  getOutputWidget = (props: WidgetLayoutTypeProps): any => {
    props.dataType = this;
    return <WidgetLayoutWidget {...props} />;
  };

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '400px',
      heightMode: 'fixed' as const,
    };
  }

  getDefaultValue(): WidgetLayoutInterface {
    return getDefaultWidgetLayoutValue();
  }

  // the layout widget is large and rarely controlled dynamically, so collapse
  // it in the inspector by default
  isInspectorCollapsible(): boolean {
    return true;
  }

  isInspectorCollapsedByDefault(): boolean {
    return true;
  }

  getColor(): TRgba {
    return new TRgba(144, 180, 245);
  }

  parse(data: any): TParseType {
    return parseJSON(data, true);
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    if (typeof data === 'object') {
      return new Compatibility(CompatibilityType.Compatible);
    } else if (convertFrom instanceof JSONType) {
      return new Compatibility(CompatibilityType.Compatible);
    }
    return new Compatibility(CompatibilityType.Incompatible);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['label', 'jsoneditor'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['codeeditor', 'jsoneditor'];
  }
}
