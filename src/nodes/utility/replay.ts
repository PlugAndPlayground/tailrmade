import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import {
  parseReplayScript,
  ReplayProgress,
  ReplayService,
  ReplayStep,
} from '../../services/ReplayService';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';

const scriptName = 'Script';
const playName = 'Play';
const stopName = 'Stop';
const resetName = 'Reset';
const speedName = 'Speed';
const statusName = 'Status';
const stepName = 'Step';

const exampleScript: ReplayStep[] = [
  {
    delay: 0,
    tool: 'add_node',
    input: { node_type: 'Constant', node_id: 'ai-node-1', x: 0, y: 0 },
  },
  {
    tool: 'set_socket_value',
    input: { node_id: 'ai-node-1', socket_name: 'In', value: 'Hello' },
  },
  {
    tool: 'add_node',
    input: { node_type: 'Label', node_id: 'ai-node-2', x: 400, y: 0 },
  },
  {
    tool: 'connect_sockets',
    input: {
      from_node: 'ai-node-1',
      from_socket: 'Out',
      to_node: 'ai-node-2',
      to_socket: 'Input',
    },
  },
  { tool: 'camera', input: { fit: ['ai-node-1', 'ai-node-2'] } },
];

export class Replay extends PPNode {
  // it builds the graph it lives in
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Replay';
  }

  public getDescription(): string {
    return 'Plays back a timed list of editor actions, e.g. to film an app being built';
  }

  public getDocs(): string {
    return `Each step of the script is one MCP tool call, the same ones the AI uses:

\`{ "delay": 0.5, "tool": "add_node", "input": { "node_type": "Label", "node_id": "ai-node-1", "x": 0, "y": 0 } }\`

- **delay** is waited after the previous step has finished (default 0.5s), divided by Speed.
- **camera** is a replay-only step: \`{ "fit": ["ai-node-1"] }\` frames nodes (an empty list frames the whole graph), \`{ "x", "y", "zoom" }\` moves to a point. \`duration\` is in seconds.
- Give \`add_node\` an x and y so every run lays out the same.
- **Reset** removes the nodes the script adds and puts the camera back. Play refuses to start while they still exist.`;
  }

  public getTags(): string[] {
    return ['Misc'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, scriptName, new JSONType(), exampleScript),
      new Socket(
        SOCKET_TYPE.IN,
        playName,
        new TriggerType(undefined, 'play'),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        stopName,
        new TriggerType(undefined, 'stop'),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        resetName,
        new TriggerType(undefined, 'reset'),
        0,
      ),
      new Socket(SOCKET_TYPE.IN, speedName, new NumberType(false, 0.1, 4), 1),
      new Socket(SOCKET_TYPE.OUT, statusName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, stepName, new NumberType(true)),
    ];
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  public async play(): Promise<void> {
    try {
      const steps = parseReplayScript(this.getInputData(scriptName));
      await ReplayService.getInstance().play(
        steps,
        this.getInputData(speedName),
        (progress) => this.showProgress(progress),
      );
    } catch (error) {
      this.showStatus((error as Error).message);
    }
  }

  public async stop(): Promise<void> {
    await ReplayService.getInstance().stop();
  }

  public async reset(): Promise<void> {
    try {
      const steps = parseReplayScript(this.getInputData(scriptName));
      await ReplayService.getInstance().reset(steps);
      this.showProgress({ step: 0, total: steps.length, status: 'Ready' });
    } catch (error) {
      this.showStatus((error as Error).message);
    }
  }

  private showProgress(progress: ReplayProgress): void {
    this.setOutputData(stepName, progress.step);
    this.showStatus(progress.status);
  }

  private showStatus(status: string): void {
    // the replay may have deleted and recreated nodes, but never this one
    if (this.destroyed) return;
    this.setOutputData(statusName, status);
    void this.executeChildren();
  }
}
