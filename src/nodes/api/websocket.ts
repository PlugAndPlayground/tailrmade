import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { TRgba } from '../../utils/color';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';

export class WebSocketNode extends PPNode {
  private connection?: WebSocket;
  private connectionURL = '';
  private pendingMessages: (string | BufferSource | Blob)[] = [];

  public getName(): string {
    return 'WebSocket';
  }

  public getDescription(): string {
    return 'Send and receive live data over one WebSocket connection. Each received message updates Content and runs downstream nodes.';
  }

  public getDocs(): string {
    return `Enter a ws:// or wss:// URL - use wss:// on HTTPS pages.

## Sending
The "Send" trigger sends the current "Message". By default it fires when its
input increases, or when clicked; ordinary node execution does not send.
Text and binary data are sent directly, other values are JSON encoded.
Messages wait for the connection to open and are discarded on disconnect.

## Receiving
Received JSON is parsed automatically, other text stays as text, and binary
messages arrive as an ArrayBuffer. "Content" keeps the latest message until
the URL changes or the node is disabled.

## Connection
Disable "Enabled" to disconnect. After a connection closes, execute the node
again to reconnect.`;
  }

  public getTags(): string[] {
    return ['Input', 'Output'].concat(super.getTags());
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
      new Socket(SOCKET_TYPE.IN, 'Message', new AnyType(), null),
      new Socket(
        SOCKET_TYPE.IN,
        'Send',
        new TriggerType(undefined, 'sendCurrentMessage'),
        0,
      ),
      new Socket(SOCKET_TYPE.OUT, 'Content', new AnyType(), null),
      new Socket(SOCKET_TYPE.OUT, 'Connected', new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, 'Error', new StringType(), ''),
    ];
  }

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) return;
    // Version 1 saved Send as a boolean input. Swap the type in place so the
    // socket keeps its links, and seed previousData with the saved value so
    // the trigger does not fire (and send) while the graph loads.
    const send = this.getInputSocketByName('Send');
    if (!send || send.dataType instanceof TriggerType) return;
    const trigger = new TriggerType(undefined, 'sendCurrentMessage');
    trigger.previousData = send.data;
    send.dataType = trigger;
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
        const pending = this.pendingMessages;
        this.pendingMessages = [];
        for (const message of pending) this.sendMessage(message);
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

  public async sendCurrentMessage(): Promise<void> {
    if (!this.hasBeenAdded || this.destroyed) return;
    const URL = this.getInputData('URL');
    const Enabled = this.getInputData('Enabled');
    const message = this.getInputData('Message');
    await this.onExecute({ URL, Enabled });
    if (Enabled && this.connection && this.connectionURL === URL.trim()) {
      this.sendMessage(message);
    }
    await this.executeChildren();
  }

  private sendMessage(message: unknown): void {
    try {
      const data =
        typeof message === 'string' ||
        message instanceof ArrayBuffer ||
        message instanceof Blob
          ? message
          : ArrayBuffer.isView(message)
            ? new Uint8Array(
                message.buffer,
                message.byteOffset,
                message.byteLength,
              ).slice()
            : JSON.stringify(message);
      if (data === undefined) {
        throw new Error('Message must be text, binary data, or a JSON value.');
      }
      if (this.connection?.readyState === WebSocket.CONNECTING) {
        // Snapshot mutable binary inputs while waiting for the connection.
        this.pendingMessages.push(
          data instanceof ArrayBuffer ? data.slice(0) : data,
        );
      } else if (this.connection?.readyState === WebSocket.OPEN) {
        this.connection.send(data);
      } else {
        throw new Error('WebSocket is not connected.');
      }
      this.setOutputData('Error', '');
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
    this.pendingMessages = [];
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
