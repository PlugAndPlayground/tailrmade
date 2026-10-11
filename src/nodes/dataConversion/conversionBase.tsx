import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { NODE_SOURCE } from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { AbstractType } from '../datatypes/abstractType';

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
