import * as PIXI from 'pixi.js';
import { SerializedLink } from '../utils/interfaces';
import Socket from './SocketClass';
import PPNode from './NodeClass';
import PPGraph from './GraphClass';
import throttle from 'lodash/throttle';
import { GlowFilter } from 'pixi-filters';
import { drawExecutionFilter } from '../utils/visuals';
import FlowLogic from './FlowLogic';

export default class PPLink extends PIXI.Container {
  source: Socket;
  target: Socket;
  _connectionRef: PIXI.Graphics;
  executionFilter = undefined;
  // _data: any;

  lineThickness = 2;

  constructor(source: Socket, target: Socket) {
    super();
    this.source = source;
    this.target = target;
    this.executionFilter = new GlowFilter({
      distance: 4,
      outerStrength: 0,
    });
    this.executionFilter.resolution = 2;
    // this._data = null;

    const connection = new PIXI.Graphics();
    this._connectionRef = this.addChild(connection);
    this._drawConnection(connection);
  }

  serialize(): SerializedLink {
    // create serialization object
    // this prevents being blocked from saving when having orphaned links
    if (this.source.getNode() && this.target.getNode()) {
      return {
        sourceNodeId: (this.source.getNode() as PPNode).id,
        sourceSocketName: this.source.name,
        targetNodeId: (this.target.getNode() as PPNode).id,
        targetSocketName: this.target.name,
      };
    }
  }

  public nodeHoveredOver() {
    this.setLineThickness(5);
  }

  public nodeHoveredOut() {
    this.setLineThickness(2);
  }

  private setLineThickness(thickness: number): void {
    this.lineThickness = thickness;
    this.updateConnectionDrawing();
  }

  updateConnectionDrawing(): void {
    // redraw background due to node movement
    this._connectionRef.clear();
    this._drawConnection(this._connectionRef);
  }

  getSource(): Socket {
    return this.source;
  }

  getTarget(): Socket {
    return this.target;
  }

  updateSource(newSource: Socket): void {
    this.source = newSource;
    this.source.setVisible(true);
    this.updateConnectionDrawing();
  }

  updateTarget(newTarget: Socket): void {
    this.target = newTarget;
    this.target.setVisible(true);
    this.updateConnectionDrawing();
  }

  // if there is a new connection pending, dont execute input
  delete(skipNotifyInput = false): void {
    const prevTarget = this.getTarget();
    const prevSource = this.getSource();
    this.getTarget().removeLink(this);
    this.getSource().removeLink(this);
    PPGraph.currentGraph.connectionContainer.removeChild(this);
    prevSource.getNode().outputUnplugged(prevSource);
    if (!skipNotifyInput && PPGraph.currentGraph.graphConfiguredAndReady) {
      prevTarget.getNode().inputUnplugged(prevTarget);
      const targetNode = this.getTarget().getNode();

      if (
        targetNode !== undefined &&
        !targetNode.destroyed &&
        targetNode.updateBehaviour?.update
      ) {
        FlowLogic.addPendingExecution(targetNode.id);
      }
    }
  }
  public renderOutlineThrottled = throttle(this.renderOutline, 500, {
    trailing: false,
    leading: true,
  });

  public async renderOutline(): Promise<void> {
    await drawExecutionFilter(this.executionFilter, this);
  }

  _drawConnection(
    connection: PIXI.Graphics,
    color = this.source.dataType.getColor().multiply(0.9),
  ): void {
    const sourcePoint = PPGraph.currentGraph.getSocketCenter(this.source);
    const targetPoint = PPGraph.currentGraph.getSocketCenter(this.target);

    // draw curve from 0,0 as PIXI.Graphics sourceates from 0,0
    const toX = targetPoint.x - sourcePoint.x;
    const toY = targetPoint.y - sourcePoint.y;
    const cpX = Math.abs(toX) / 2;
    const cpY = 0;
    const cpX2 = toX - cpX;
    const cpY2 = toY;

    const alpha = this.source.dataType.getConnectionAlpha();

    connection
      .bezierCurveTo(cpX, cpY, cpX2, cpY2, toX, toY)
      .stroke({ width: this.lineThickness, color: color.hexNumber(), alpha });

    // offset curve to start from source
    connection.x = sourcePoint.x;
    connection.y = sourcePoint.y;
  }
}
