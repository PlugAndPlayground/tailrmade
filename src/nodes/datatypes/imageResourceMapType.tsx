import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  DataTypeProps,
} from './abstractType';
import { TRgba } from '../../utils/color';
import { JSONType } from './jsonType';

export class ImageResourceMapType extends JSONType {
  getName(): string {
    return 'Image Resource Map';
  }

  getDefaultWidgetSize(): any {
    return {
      w: 4,
      h: 6,
      minW: 2,
      minH: 2,
    };
  }

  // these are too heavy to save
  prepareDataForSaving(data: any) {
    return undefined;
  }

  getDefaultValue(): any {
    return {};
  }

  getColor(): TRgba {
    return new TRgba(58, 58, 158);
  }

  getComment(data: any): string {
    return Object.keys(data).join(',');
  }
  protected dataIsCompatible(data: any): Compatibility {
    if (typeof data == 'object') {
      const values = Object.values(data);
      if (
        values.length &&
        values.find(
          (value) =>
            value?.constructor?.name == 'RenderTexture' ||
            (typeof value == 'string' && value.startsWith('data:image')),
        )
      ) {
        return new Compatibility(CompatibilityType.Exact);
      }
    } else if (typeof data == 'string') {
      if (data.startsWith('data:image')) {
        return new Compatibility(CompatibilityType.Preferred, 'Make');
      }
    }
    return new Compatibility(CompatibilityType.Incompatible);
  }

  recommendedOutputNodeWidgets(): string[] {
    return ['imageshader'];
  }
}
