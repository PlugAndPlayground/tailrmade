import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import {
  clearSubtitle,
  DEFAULT_SUBTITLE_STYLE,
  showSubtitle,
  SUBTITLE_POSITIONS,
} from '../../services/subtitles';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { ColorType } from '../datatypes/colorType';
import { EnumType } from '../datatypes/enumType';

const textName = 'Text';
const durationName = 'Duration';
const backgroundName = 'Background color';
const cornerRadiusName = 'Corner radius';
const positionName = 'Position';
const marginName = 'Margin';

export class Subtitle extends PPNode {
  // its output is the caption on screen
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Subtitle';
  }

  public getDescription(): string {
    return 'Shows a caption over the screen';
  }

  public getDocs(): string {
    return `Shows **Text** as a caption over the canvas, e.g. to narrate a video. Empty text hides it. Link a Replay node's Caption output to Text to narrate a replay.

**Duration** is in seconds; 0 keeps the caption until the text changes. Each Subtitle node shows its own caption; captions in the same position stack, the newest nearest the screen edge.

**Background color** sets the box behind the text; the text is the app theme's light or dark contrast color for it. **Corner radius** is in pixels. **Position** places the caption, and **Margin** is its distance from the screen edge in % of the screen height.`;
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
      new Socket(
        SOCKET_TYPE.IN,
        backgroundName,
        new ColorType(),
        TRgba.fromString(DEFAULT_SUBTITLE_STYLE.background),
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        cornerRadiusName,
        new NumberType(true, 0, 64),
        DEFAULT_SUBTITLE_STYLE.cornerRadius,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        positionName,
        new EnumType(SUBTITLE_POSITIONS.map((text) => ({ text, value: text }))),
        DEFAULT_SUBTITLE_STYLE.position,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        marginName,
        new NumberType(true, 0, 45),
        DEFAULT_SUBTITLE_STYLE.margin,
        false,
      ),
    ];
  }

  protected async onExecute(input: any): Promise<void> {
    showSubtitle(
      this.id,
      String(input[textName] ?? ''),
      input[durationName] * 1000,
      {
        background: TRgba.fromObject(input[backgroundName]).toString(),
        cornerRadius: input[cornerRadiusName],
        position: input[positionName],
        margin: input[marginName],
      },
    );
  }

  onNodeRemoved = (): void => {
    clearSubtitle(this.id);
  };
}
