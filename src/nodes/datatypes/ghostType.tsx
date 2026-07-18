import { TRgba } from '../../utils/color';
import { AbstractType } from './abstractType';

export class GhostType extends AbstractType {
  getName(): string {
    return 'Ghost';
  }
  getColor(): TRgba {
    return new TRgba(255, 255, 255, 0.6);
  }
}
