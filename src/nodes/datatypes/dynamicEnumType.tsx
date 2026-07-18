import React from 'react';
import { SelectWidget } from '../../widgets';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { BackPropagationPayload } from '../../interfaces';
import { EnumStructure, EnumTypeProps } from './enumType';
import { AnyType } from './anyType';

export class DynamicEnumType extends AbstractType {
  getOptions: () => EnumStructure = () => [];
  onChange: (value: string) => void = () => {};
  showAsButtons: boolean;

  constructor(
    getOptions: () => EnumStructure,
    onChange: (value: string) => void,
    showAsButtons = false,
  ) {
    super();
    this.getOptions = getOptions;
    this.onChange = onChange;
    this.showAsButtons = showAsButtons;
  }
  getName(): string {
    return 'Dynamic Enum';
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    return new Compatibility(
      typeof data == 'string'
        ? CompatibilityType.Compatible
        : CompatibilityType.Incompatible,
    );
  }

  getDefaultValue(): any {
    return '';
  }

  getInputWidget = (props: EnumTypeProps): any => {
    props.dataType = this;
    props.getOptions = this.getOptions;
    props.onChange = this.onChange;
    return <SelectWidget {...props} />;
  };

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      minHeight: '32px',
    };
  }

  getBackPropagationPayload(): BackPropagationPayload {
    return {
      SocketToGetOptions: this.getOptions().map((option) => option.text),
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'widgetdropdown',
      'widgetautocomplete',
      'widgetradio',
      'widgettabs',
      'widgetbuttongroup',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return [
      'widgetdropdown',
      'widgetautocomplete',
      'widgetradio',
      'widgettabs',
      'widgetbuttongroup',
      'codeeditor',
    ];
  }

  configureOnLoad(): boolean {
    return false;
  }
}
