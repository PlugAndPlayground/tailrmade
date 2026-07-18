import { CustomFunction } from '../data/dataFunctions';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { migrateFromCustomFunctionCommon } from '../data/array';

const URLName = 'url';

export class OpenURL extends PPNode {
  protected getDefaultIO(): Socket[] {
    return [new Socket(SOCKET_TYPE.IN, URLName, new StringType())];
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const url = input[URLName];
    window.open(url, '_blank')?.focus();
  }

  public getName(): string {
    return 'Open URL';
  }

  public getDescription(): string {
    return 'Opens a URL in a new tab';
  }

  public getTags(): string[] {
    return ['App'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }
  public getVersion(): number {
    return 4;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion <= 3) {
      migrateFromCustomFunctionCommon(this);
    }
  }
}
