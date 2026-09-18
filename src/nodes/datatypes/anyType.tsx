import { TRgba } from '../../utils/color';
import { AbstractType, dataTypeWidgetDefaultProps } from './abstractType';

export class AnyType extends AbstractType {
  getName(): string {
    return 'Any';
  }

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  getDefaultValue(): any {
    return 0;
  }

  getColor(): TRgba {
    return new TRgba(204, 204, 204);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['label', 'codeeditor', 'jsoneditor', 'logviewer', 'consoleprint'];
  }

  prefersToChangeAwayFromThisType(): boolean {
    return true;
  }

  recommendedInputNodeWidgets(): string[] {
    return [
      'codeeditor',
      'constant_string',
      'constant_number',
      'widgetbutton',
      'widgetslider',
      'widgetswitch',
      'label',
      'widgetcolorpicker',
    ];
  }
}
