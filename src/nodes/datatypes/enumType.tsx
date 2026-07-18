import React from 'react';
import { SelectWidget } from '../../widgets';
import {
  AbstractType,
  DataTypeProps,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { BackPropagationPayload } from '../../interfaces';

export type EnumItem = {
  text: string;
  value?: any;
  disabled?: boolean;
};
export type EnumStructure = EnumItem[];

export interface EnumTypeProps extends DataTypeProps {
  dataType: AbstractType;
  getOptions: () => EnumStructure;
  onChange?: (value: string) => void;
  setOptions;
}

// This class is a crutch for legacy reasons, you normally shouldn't need it but instead create new types

export class EnumType extends AbstractType {
  options: EnumStructure;
  onChange?: (value: string) => void;
  showAsButtons: boolean;

  constructor(
    inOptions: EnumStructure,
    onChange: (value: string) => void = () => {},
    showAsButtons = false,
  ) {
    super();
    this.options = inOptions;
    this.onChange = onChange;
    this.showAsButtons = showAsButtons;
  }

  getName(): string {
    return 'Enum';
  }

  getUISignature(): string {
    // Include sorted option texts to differentiate enums with different options
    const optionTexts = this.options
      .map((opt) => opt.text)
      .sort()
      .join(',');
    return `Enum:${optionTexts}`;
  }

  getInputWidget = (props: EnumTypeProps): any => {
    props.dataType = this;
    props.getOptions = () => this.options;
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
      SocketToGetOptions: this.options.map((option) => option.text),
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['widgetdropdown'];
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
}
