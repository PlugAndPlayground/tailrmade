import PPNode from '../../classes/NodeClass';
import { TRgba } from '../../utils/color';

export abstract class TypeConversionNode extends PPNode {
  public getName(): string {
    return 'Type Convert';
  }

  public getDescription(): string {
    return 'Base Parent class for type conversions';
  }

  public getColor(): TRgba {
    return new TRgba(150, 150, 150);
  }
}
