import {
  ACTIONS,
  PNPAction,
  SetSocketValueActionArgs,
} from '../../classes/Action';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import PPGraph from '../../classes/GraphClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { appRisksAccepted } from '../../services/appExecution';
import {
  NODE_SOURCE,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
} from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { TRgba } from '../../utils/color';
import {
  parseReplayScript,
  ReplayProgress,
  ReplayService,
  ReplaySettings,
  ReplayStep,
} from '../../services/ReplayService';
import { ReplayRecorder } from '../../services/ReplayRecorder';
import { BooleanType } from '../datatypes/booleanType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';

const scriptName = 'Script';
const playName = 'Play';
const stopName = 'Stop';
const resetName = 'Reset';
const recordName = 'Record';
const nextName = 'Next';
const backName = 'Back';
const speedName = 'Speed';
const loopName = 'Loop';
const cameraName = 'Camera';
const autoplayName = 'Autoplay';
const statusName = 'Status';
const stepName = 'Step';

const exampleScript: ReplayStep[] = [
  { delay: 0, tool: 'subtitle', input: { text: 'A value and a label' } },
  {
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
  { delay: 1.5, tool: 'subtitle', input: { text: '' } },
];

export class Replay extends PPNode {
  // autoplay builds nodes, so it waits until the app may run
  public readonly deferUntilAppApproved: boolean = true;

  // it builds the graph it lives in
  public getSeemsUnused(): boolean {
    return false;
  }

  public getName(): string {
    return 'Replay';
  }

  public getDescription(): string {
    return 'Records building an app and plays it back step by step, to film it or walk through it in a talk';
  }

  public getDocs(): string {
    return `Each step of the script is one MCP tool call, the same ones the AI uses:

\`{ "delay": 0.5, "tool": "add_node", "input": { "node_type": "Label", "node_id": "ai-node-1", "x": 0, "y": 0 } }\`

- **delay** is waited after the previous step has finished (default 0.5s), divided by Speed. Speed can change while it plays.
- **camera** is a replay-only step: \`{ "fit": ["ai-node-1"] }\` frames nodes (an empty list frames the whole graph), \`{ "x", "y", "zoom" }\` moves to a point. \`duration\` is in seconds.
- **subtitle** is a replay-only step: \`{ "text": "...", "duration": 3 }\` shows a caption without holding up the next steps. Empty text hides it, and a duration of 0 keeps it until the next one.
- Give \`add_node\` an x and y so every run lays out the same.
- **Reset** removes the nodes the script adds and puts the camera back. Play refuses to start while they still exist.
- **Stop** pauses: Play carries on from there.
- **Next** runs the next step straight away, **Back** undoes the last one. For a talk, link a Keyboard node through a Compare node (key == "ArrowRight") to Next.
- **Loop** resets and starts over after the last step. The last step's delay is how long the finished graph stays up.
- **Loop** also makes Next start over after the last step.
- **Camera** off skips camera steps and keeps the view where you put it.
- **Autoplay** resets and plays when the app opens, once the app may run. Turn it off to edit the app.

**Record** turns your editing into a script: build as usual (by hand or with the AI), then press **Stop** and the script replaces this one (undo brings the old one back). Pauses are shortened to 2s, and a drag or a burst of typing becomes one step. To film it, press Reset, then Play.`;
  }

  public getTags(): string[] {
    return ['Misc'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.SYSTEM);
  }

  protected getDefaultIO(): Socket[] {
    const trigger = (name: string, method: string) =>
      new Socket(SOCKET_TYPE.IN, name, new TriggerType(undefined, method), 0);
    return [
      new Socket(SOCKET_TYPE.IN, scriptName, new JSONType(), exampleScript),
      trigger(playName, 'play'),
      trigger(stopName, 'stop'),
      trigger(backName, 'back'),
      trigger(nextName, 'next'),
      trigger(resetName, 'reset'),
      trigger(recordName, 'record'),
      new Socket(SOCKET_TYPE.IN, speedName, new NumberType(false, 0.1, 4), 1),
      new Socket(SOCKET_TYPE.IN, loopName, new BooleanType(), false),
      new Socket(SOCKET_TYPE.IN, cameraName, new BooleanType(), true),
      new Socket(SOCKET_TYPE.IN, autoplayName, new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, statusName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, stepName, new NumberType(true)),
    ];
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  private stopWaitingForApp: (() => void) | undefined;

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    // only when the app opens, not when undo brings the node back
    if (
      source !== NODE_SOURCE.SERIALIZED ||
      PPGraph.currentGraph.graphConfiguredAndReady
    ) {
      return;
    }
    // an imported app may only run once its risks are reviewed
    this.stopWaitingForApp = appRisksAccepted.subscribe(() => {
      if (!appRisksAccepted.get()) return;
      this.stopWaitingForApp?.();
      this.stopWaitingForApp = undefined;
      if (this.getInputData(autoplayName)) {
        // not awaited: a looping replay never finishes
        void this.reset().then(() => this.play());
      }
    });
  }

  onNodeRemoved = (): void => {
    this.stopWaitingForApp?.();
  };

  // read before every step, so they can change while it plays
  private getSettings = (): ReplaySettings => ({
    speed: this.getInputData(speedName),
    loop: this.getInputData(loopName),
    camera: this.getInputData(cameraName),
  });

  public async play(): Promise<void> {
    await this.withScript((steps) =>
      ReplayService.getInstance().play(steps, this.getSettings, (progress) =>
        this.showProgress(progress),
      ),
    );
  }

  public async next(): Promise<void> {
    await this.withScript((steps) =>
      ReplayService.getInstance().next(steps, this.getSettings, (progress) =>
        this.showProgress(progress),
      ),
    );
  }

  public async back(): Promise<void> {
    await this.withScript((steps) =>
      ReplayService.getInstance().back(steps, this.getSettings, (progress) =>
        this.showProgress(progress),
      ),
    );
  }

  private async withScript(
    run: (steps: ReplayStep[]) => Promise<void>,
  ): Promise<void> {
    try {
      await run(parseReplayScript(this.getInputData(scriptName)));
    } catch (error) {
      this.showStatus((error as Error).message);
    }
  }

  public async stop(): Promise<void> {
    const recorder = ReplayRecorder.getInstance();
    if (recorder.isRecording()) {
      await this.saveRecording();
      return;
    }
    await ReplayService.getInstance().stop();
  }

  public async record(): Promise<void> {
    await ReplayService.getInstance().stop();
    ReplayRecorder.getInstance().start(this.id);
    this.showProgress({ step: 0, total: 0, status: 'Recording' });
  }

  private async saveRecording(): Promise<void> {
    const { steps, warnings } = ReplayRecorder.getInstance().stop();
    const args: SetSocketValueActionArgs = {
      nodeID: this.id,
      socketName: scriptName,
      socketType: SOCKET_TYPE.IN,
      newValue: steps,
    };
    await PNPAction(ACTIONS.SET_SOCKET_VALUE, args, {
      ...args,
      newValue: this.getInputData(scriptName),
    });
    const skipped =
      warnings.length > 0 ? `. Not recorded: ${warnings.join('; ')}` : '';
    this.showProgress({
      step: 0,
      total: steps.length,
      status: `Recorded ${steps.length} steps${skipped}`,
    });
  }

  public async reset(): Promise<void> {
    await this.withScript(async (steps) => {
      await ReplayService.getInstance().reset(steps);
      this.showProgress({ step: 0, total: steps.length, status: 'Ready' });
    });
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
