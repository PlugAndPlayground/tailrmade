import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { clearSubtitle, showSubtitle } from '../../services/subtitles';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';

const textName = 'Text';
const durationName = 'Duration';

export class Subtitle extends PPNode {
  // its output is the caption on screen
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Subtitle';
  }

  public getDescription(): string {
    return 'Shows a caption at the bottom of the screen';
  }

  public getDocs(): string {
    return `Shows **Text** as a caption over the canvas, e.g. to narrate a video. Empty text hides it.

**Duration** is in seconds; 0 keeps the caption until the text changes. There is one caption at a time, shared with the subtitle steps of a Replay script.`;
  }

  public getTags(): string[] {
    return ['Misc'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, textName, new StringType(), ''),
      new Socket(SOCKET_TYPE.IN, durationName, new NumberType(false, 0, 30), 0),
    ];
  }

  protected async onExecute(input: any): Promise<void> {
    showSubtitle(String(input[textName] ?? ''), input[durationName] * 1000);
  }

  onNodeRemoved = (): void => {
    clearSubtitle();
  };
}
