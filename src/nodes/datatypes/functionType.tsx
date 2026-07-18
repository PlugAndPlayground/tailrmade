import { TRgba } from '../../utils/color';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  dataTypeWidgetDefaultProps,
} from './abstractType';

// its a function that will draw onto a container
export class FunctionType extends AbstractType {
  getName(): string {
    return 'Function';
  }

  getComment(commentData: any): string {
    return commentData ? 'Graphics' : 'null';
  }

  getColor(): TRgba {
    return new TRgba(239, 239, 138);
  }

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '240px',
      heightMode: 'fixed' as const,
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['codeeditor'];
  }

  recommendedInputNodeWidgets(): string[] {
    return ['codeeditor'];
  }
  protected dataIsCompatible(data: any): Compatibility {
    return typeof data === 'function'
      ? new Compatibility(CompatibilityType.Compatible)
      : new Compatibility(CompatibilityType.Incompatible);
  }
}
