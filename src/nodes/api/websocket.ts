import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';

export class WebSocketNode extends PPNode {
  private connection?: WebSocket;
  private connectionURL = '';

  public getName(): string {
    return 'WebSocket';
  }

  public getDescription(): string {
    return 'Receive live data from a WebSocket server. Each message updates Content and runs downstream nodes.';
  }

  public getAdditionalDescription(): string {
    return 'Enter a ws:// or wss:// URL (use wss:// on HTTPS pages). JSON messages are parsed automatically; other text stays as text and binary messages use ArrayBuffer. Disable Enabled to disconnect. After a connection closes, execute the node again to reconnect. Content keeps the latest message until the URL changes or the node is disabled.';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'URL', new StringType(), ''),
      new Socket(SOCKET_TYPE.IN, 'Enabled', new BooleanType(), true),
      new Socket(SOCKET_TYPE.OUT, 'Content', new AnyType(), null),
      new Socket(SOCKET_TYPE.OUT, 'Connected', new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, 'Error', new StringType(), ''),
    ];
  }

  protected async onExecute(input: {
    URL: string;
    Enabled: boolean;
  }): Promise<void> {
    const url = input.URL.trim();
    if (
      input.Enabled &&
      url === this.connectionURL &&
      this.connection &&
      this.connection.readyState < WebSocket.CLOSING
    ) {
      return;
    }

    this.disconnect();
    this.setOutputData('Content', null);
    this.setOutputData('Connected', false);
    this.setOutputData('Error', '');
    if (!input.Enabled || !url) return;

    try {
      if (!/^wss?:\/\//i.test(url)) {
        throw new Error('Use a ws:// or wss:// URL.');
      }
      const connection = new WebSocket(url);
      this.connection = connection;
      this.connectionURL = url;
      connection.binaryType = 'arraybuffer';

      connection.onopen = () => {
        if (this.connection !== connection) return;
        this.setOutputData('Connected', true);
        void this.executeChildren();
      };
      connection.onmessage = (event) => {
        if (this.connection !== connection) return;
        let content: unknown = event.data;
        if (typeof content === 'string') {
          try {
            content = JSON.parse(content);
          } catch {
            // Non-JSON messages remain plain text.
          }
        }
        this.setOutputData('Content', content);
        void this.executeChildren();
      };
      connection.onerror = () => {
        if (this.connection !== connection) return;
        this.setOutputData('Error', 'WebSocket connection failed.');
        void this.executeChildren();
      };
      connection.onclose = (event) => {
        if (this.connection !== connection) return;
        this.disconnect();
        this.setOutputData('Connected', false);
        if (!event.wasClean) {
          this.setOutputData('Error', `WebSocket closed (${event.code}).`);
        }
        void this.executeChildren();
      };
    } catch (error) {
      this.setOutputData(
        'Error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private disconnect(): void {
    const connection = this.connection;
    this.connection = undefined;
    this.connectionURL = '';
    if (!connection) return;
    connection.onopen = null;
    connection.onmessage = null;
    connection.onerror = null;
    connection.onclose = null;
    if (connection.readyState < WebSocket.CLOSING) connection.close();
  }

  public onNodeRemoved = (): void => {
    this.disconnect();
  };
}
