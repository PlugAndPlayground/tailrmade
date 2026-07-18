import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import UpdateBehaviourGraphics from './UpdateBehaviourGraphics';

export interface IUpdateBehaviour {
  load: boolean;
  update: boolean;
  interval: boolean;
  intervalFrequency: number;
}

export default class UpdateBehaviourClass {
  private _load: boolean;
  private _update: boolean;
  private _interval: boolean;
  private _intervalFrequency: number;
  public graphics: UpdateBehaviourGraphics | undefined;
  node: PPNode;

  constructor(
    inLoad: boolean,
    inUpdate: boolean,
    inInterval: boolean,
    inIntervalFrequency: number,
    node: PPNode,
  ) {
    this._load = inLoad;
    this._update = inUpdate;
    this._interval = inInterval;
    this._intervalFrequency = inIntervalFrequency;
    this.node = node;
  }
  async onNodeAdded(): Promise<void> {
    this.graphics = new UpdateBehaviourGraphics(this);
    await this.graphics.init();
  }

  setUpdateBehaviour(
    newLoad: boolean,
    newUpdate: boolean,
    newInterval: boolean,
    newIntervalFrequency: number,
  ): void {
    this._load = newLoad;
    this._update = newUpdate;
    this._interval = newInterval;
    this._intervalFrequency = newIntervalFrequency;
    this.graphics.redrawAnythingChanging();
  }

  // GETTERS & SETTERS

  get load(): boolean {
    return this._load;
  }

  set load(newLoad: boolean) {
    this._load = newLoad;
    this.graphics.redrawAnythingChanging();
  }

  get update(): boolean {
    return this._update;
  }

  set update(newUpdate: boolean) {
    this._update = newUpdate;
    this.graphics.redrawAnythingChanging();
  }

  get interval(): boolean {
    return this._interval;
  }

  set interval(newInterval: boolean) {
    this._interval = newInterval;
    this.graphics.redrawAnythingChanging();
  }

  get intervalFrequency(): number {
    return this._intervalFrequency;
  }

  set intervalFrequency(frequency: number) {
    this._intervalFrequency = frequency;
    this.graphics.redrawAnythingChanging();
  }

  // METHODS

  getNode(): PPNode {
    return this.node;
  }

  getGraph(): PPGraph {
    return PPGraph.currentGraph;
  }
}
