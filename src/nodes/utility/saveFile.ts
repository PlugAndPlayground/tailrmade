import { StringType } from '../datatypes/stringType';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { AnyType } from '../datatypes/anyType';
import { downloadFile } from '../../utils/utils';

const saveFileName = 'File Name';
const saveFileDataName = 'Data';

export class SaveFile extends PPNode {
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, saveFileDataName, new AnyType()),
      new Socket(SOCKET_TYPE.IN, saveFileName, new StringType(), 'TM Data.txt'),
    ];
  }

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return socket.name == saveFileDataName;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const data = input[saveFileDataName];
    const fileName = input[saveFileName];

    // Convert data to string if needed
    let content: string;
    if (typeof data === 'string') {
      content = data;
    } else if (data === null || data === undefined) {
      content = '';
    } else {
      // For objects/arrays, convert to JSON
      content = JSON.stringify(data, null, 2);
    }

    downloadFile(content, fileName, 'text/plain');
  }

  public getName(): string {
    return 'Save File';
  }

  public getDescription(): string {
    return 'Save given data as file with given name';
  }

  public getTags(): string[] {
    return ['App', 'File'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }
}
