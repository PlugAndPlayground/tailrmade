import { TRgba } from '../../utils/color';
import PPNode from '../../classes/NodeClass';
import Socket, { DynamicInputDummySocket } from '../../classes/SocketClass';
import { SOCKET_HEIGHT, SOCKET_TYPE } from '../../utils/constants';
import { CustomArgs, TNodeSource } from '../../utils/interfaces';
import { AbstractType, isDirectlyCompatible } from '../datatypes/abstractType';
import { AnyType } from '../datatypes/anyType';
import * as PIXI from 'pixi.js';
import PPGraph from '../../classes/GraphClass';
import { hri } from 'human-readable-ids';
import { GhostType } from '../datatypes/ghostType';
export class DynamicInputNode extends PPNode {
  ghostSocket: DynamicInputDummySocket | undefined;

  constructor(type: string, customArgs?: CustomArgs) {
    super(type, customArgs);
    this.ghostSocket = new DynamicInputDummySocket(
      SOCKET_TYPE.GHOST,
      '',
      new GhostType(),
    );
  }

  protected getMinAmountOfInputSockets(): number {
    return 0;
  }

  addInputButton: PIXI.Container | undefined;
  public getSocketForNewConnection = (socket: Socket): Socket =>
    DynamicInputNodeFunctions.getSocketForNewConnection(
      socket,
      this,
      false,
      this.getPreferredDataType(),
    );

  public socketShouldAutomaticallyAdapt(socket: Socket): boolean {
    return true;
  }

  protected getPreferredDataType(): AbstractType {
    return new AnyType();
  }

  public hasInputSockets(): boolean {
    return true;
  }

  protected hasAddInputButton(): boolean {
    return false;
  }

  protected stringAddInputNodeName(): string {
    return '';
  }
  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    this._BackgroundRef.addChild(this.ghostSocket);
    this.ghostSocket.onNodeAdded(this);
  }

  public drawSockets(): void {
    super.drawSockets();
    this.ghostSocket.y = this.getGhostSocketY();
  }

  // extra space for the ghost socket
  public getMinNodeHeight(): number {
    return super.getMinNodeHeight() + SOCKET_HEIGHT;
  }

  protected shouldDrawAddInputNodeButton(): boolean {
    return false;
  }

  protected getDefaultInputNode() {
    return 'CONSTANT_Number';
  }
  public drawNodeShape(): void {
    super.drawNodeShape();

    if (this.shouldDrawAddInputNodeButton()) {
      this.drawAddInputButton();
    }
  }

  protected drawAddInputButton(): void {
    DynamicInputNodeFunctions.drawAddInputButton(this);
  }

  public inputUnplugged(socket: Socket): void {
    return DynamicInputNodeFunctions.inputUnplugged(
      socket,
      this,
      this.getMinAmountOfInputSockets(),
    );
  }

  public recreateDynamicSocket(
    sourceSocket: Socket,
    name: string,
  ): Socket | undefined {
    const newSocket = new Socket(
      SOCKET_TYPE.IN,
      this.getNewSocketName(name),
      this.getPreferredDataType(),
    );
    this.addDynamicSocket(newSocket);
    this.resizeAndDraw();
    return newSocket;
  }
}

export class SmallDynamicInputNode extends DynamicInputNode {
  public getParallelInputsOutputs(): boolean {
    return true;
  }

  public getIsSimpleStyleNode(): boolean {
    return true;
  }
}

// i structured it like this so that classes that cannot directly inherit from DynamicInputNode (because JS/TS doesn't allow multiple inheritance) can still use these
export class DynamicInputNodeFunctions {
  static getSocketForNewConnection(
    socket: Socket,
    node: PPNode,
    alwaysNewSocket = false,
    preferredDataType: AbstractType = new AnyType(),
  ): Socket {
    if (socket.isInput()) {
      return node.getSocketForNewConnection(socket);
    } else {
      const possibleConnection = node.inputSocketArray
        .filter((availableSocket) =>
          isDirectlyCompatible(
            availableSocket.dataType.getCompatability(socket.data).type,
          ),
        )
        .find((socket) => socket.links.length == 0);
      if (possibleConnection !== undefined && !alwaysNewSocket) {
        return possibleConnection;
      }
      const newSocket = new Socket(
        SOCKET_TYPE.IN,
        node.getNewSocketName(socket.name),
        preferredDataType,
      );
      node.addDynamicSocket(newSocket);
      node.resizeAndDraw();
      return newSocket;
    }
  }

  static inputUnplugged(
    socket: Socket,
    node: PPNode,
    minAmountOfInputSockets: number,
  ): void {
    // remove sockets that need connection, but not the ones that are partnered with other sockets (they will be removed when the other socket is unplugged)
    if (
      node.socketCanBeRemoved(socket) &&
      node.inputSocketArray.length > minAmountOfInputSockets &&
      socket.links.length == 0 &&
      socket.dependentSocketName == ''
    ) {
      node.removeSocket(socket);
    }
  }

  static drawAddInputButton(node: any): void {
    if (node.addInputButton == undefined) {
      node.addInputButton = new PIXI.Container();

      // Create background graphics
      const background = new PIXI.Graphics();
      background.roundRect(0, 0, 80, 20, 5);
      background.fill({
        color: node.getColor().multiply(0.8).hexNumber(),
      });
      background.stroke({
        color: TRgba.white().hexNumber(),
      });

      // Create text
      const text = new PIXI.Text({
        text: 'Add Input',
        style: new PIXI.TextStyle({
          fontSize: 10,
          fill: TRgba.white().hexNumber(),
        }),
        x: 40,
        y: 10,
      });
      text.anchor.x = 0.5;
      text.anchor.y = 0.5;

      // Add both to container
      node.addInputButton.addChild(background);
      node.addInputButton.addChild(text);

      node.addInputButton.interactive = true;
      node.addInputButton.addEventListener('pointerover', () => {
        document.body.style.cursor = 'pointer';
        //node.addInputButton!.filters = [new GlowFilter()];
      });

      node.addInputButton.addEventListener('pointerout', () => {
        document.body.style.cursor = 'default';
        node.addInputButton!.filters = [];
      });

      node.addInputButton.addEventListener('click', async () => {
        const newSocket = new Socket(
          SOCKET_TYPE.IN,
          node.getNewSocketName('New Input'),
          node.getPreferredDataType(),
        );
        node.addDynamicSocket(newSocket);
        const id = hri.random();
        await PPGraph.currentGraph.perform_action_addConnectedNode(
          newSocket,
          node.getDefaultInputNode(),
          id,
        );
        PPGraph.currentGraph.nodes[id].deOverlap(new PIXI.Point(-10, 0));
        node.resizeAndDraw();
      });
    }
    node.addInputButton.x = node.nodeWidth / 2 - 40;
    node.addInputButton.y = node.nodeHeight - 10;

    node.removeChild(node.addInputButton);
    node.addChild(node.addInputButton);
  }
}
