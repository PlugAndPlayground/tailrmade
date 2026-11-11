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
import { NodeConfigurationWarning, PNPSuccess } from '../../classes/ErrorClass';
import {
  hasCaptionSteps,
  parseReplayScript,
  ReplayProgress,
  ReplayService,
  ReplaySettings,
  ReplayStep,
} from '../../services/ReplayService';
import {
  appendSteps,
  diffSnapshots,
  GraphSnapshot,
  NodeDefaults,
} from '../../services/replayRecording';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { getAllNodeTypes } from '../allNodes';
import { isEventComingFromWithinTextInput } from '../../utils/utils';
import type { SerializedLink } from '../../utils/interfaces';
import { BooleanType } from '../datatypes/booleanType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';

const socketNames = {
  script: 'Script',
  play: 'Play',
  stop: 'Stop',
  reset: 'Reset',
  record: 'Record',
  next: 'Next',
  back: 'Back',
  speed: 'Speed',
  loop: 'Loop',
  camera: 'Camera',
  autoplay: 'Autoplay',
  status: 'Status',
  step: 'Step',
  caption: 'Caption',
};

const exampleScript: ReplayStep[] = [
  { delay: 0, tool: 'caption', input: { text: 'A value and a label' } },
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
  { delay: 1.5, tool: 'caption', input: { text: '' } },
];

interface Recording {
  listenerId: string;
  captureTimer?: ReturnType<typeof setTimeout>;
  snapshot: GraphSnapshot;
  steps: ReplayStep[];
  warnings: Set<string>;
  lastStepTime: number;
}

// the Replay node doing the recording is not part of what it records
function takeSnapshot(ignoredNodeId: string): GraphSnapshot {
  const graph = PPGraph.currentGraph;
  const nodes: GraphSnapshot['nodes'] = {};
  Object.values(graph.nodes)
    .filter((node) => node.id !== ignoredNodeId)
    .forEach((node) => (nodes[node.id] = node.serialize()));
  return {
    nodes,
    links: Object.values(graph.getLinks())
      .map((link) => link.serialize())
      .filter(
        (link): link is SerializedLink =>
          link !== undefined &&
          link.sourceNodeId !== ignoredNodeId &&
          link.targetNodeId !== ignoredNodeId,
      ),
    groups: graph.groupLayer.serialize(),
    defaultSurfaceId: graph.defaultUISurfaceNodeId,
  };
}

// from a template node that never joins the graph, like describe_node does
function getNodeDefaults(type: string): NodeDefaults | undefined {
  const entry = getAllNodeTypes()[type];
  if (!entry) return undefined;
  const template: PPNode = new entry.constructor(type);
  template.updateBehaviour ??= template.getUpdateBehaviour();
  const serialized = template.serialize();
  return {
    name: template.getName(),
    inputs: Object.fromEntries(
      serialized.socketArray
        .filter((socket) => socket.socketType === 'in')
        .map((socket) => [socket.name, socket.data]),
    ),
    updateBehaviour: serialized.updateBehaviour,
  };
}

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
- **camera** is a replay-only step: \`{ "fit": ["ai-node-1", "group-id"] }\` frames nodes and groups by id, wherever they are now (an empty list frames the whole graph), \`{ "x", "y", "zoom" }\` moves to a point. \`duration\` is in seconds. Ids no longer in the graph are skipped; the step only fails when none are left.
- **highlight** is a replay-only step: \`{ "ids": ["ai-node-3"] }\` outlines nodes and groups until the next highlight step; an empty list clears it. The outline stays where it was drawn if the node moves.
- **caption** is a replay-only step: \`{ "text": "..." }\` sets the **Caption** output until the next caption step. Link it to a Subtitle node's Text to show it on screen; an empty text hides it there.
- Give \`add_node\` an x and y so every run lays out the same.
- **Reset** removes the nodes the script adds and puts the camera back. Play refuses to start while they still exist.
- **Stop** pauses: Play carries on from there.
- **Next** runs the next step straight away, **Back** undoes the last one.
- Keys work from the first Play, Next or Back until the replay is done: **→** or PageDown is Next, **←** or PageUp is Back, **Space** pauses and resumes, **Escape** stops and hides the caption and highlight. Presenter remotes send PageDown and PageUp.
- **Loop** resets and starts over after the last step. The last step's delay is how long the finished graph stays up.
- **Loop** also makes Next start over after the last step.
- **Camera** off skips camera steps and keeps the view where you put it.
- **Autoplay** resets and plays when the app opens, once the app may run. Turn it off to edit the app.

**Record** turns your editing into a script: build as usual (by hand or with the AI), then press **Stop** and the script replaces this one (undo brings the old one back). Pauses are shortened to 2s, and a drag or a burst of typing becomes one step. To film it, press Reset, then Play.

## Walkthrough of an existing app
A script of only camera, highlight and caption steps tours an app without changing it, and Reset only puts the camera back.
- Never move, remove, connect or change the app's own nodes. Read it with inspect_graph, and inspect_nodes for the nodes worth explaining.
- Add three nodes: a Replay node, a Subtitle node with its Text linked from Caption, and a Button labelled "Play tour" whose output is linked to Play. The Subtitle node is required: without it the captions show nowhere and the camera moves without explanation, and the Replay node warns. Place them above the app, outside its groups, and group them as "Tour".
- Target groups and nodes by id, never by x and y, so the tour still works after things move.
- Per stop: a caption step, a highlight step with delay 0, then a camera step with delay 0. Frame a whole group for a section, and highlight the one or two nodes the caption talks about.
- Captions are one or two short sentences for the person using the app. The step after a caption gets its reading time as delay: about one second per three words, at least 3 seconds.
- Start on the whole graph (fit []) with what the app does, and end with highlight [], fit [] and caption "".`;
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
      new Socket(
        SOCKET_TYPE.IN,
        socketNames.script,
        new JSONType(),
        exampleScript,
      ),
      trigger(socketNames.play, 'play'),
      trigger(socketNames.stop, 'stop'),
      trigger(socketNames.back, 'back'),
      trigger(socketNames.next, 'next'),
      trigger(socketNames.reset, 'reset'),
      trigger(socketNames.record, 'record'),
      new Socket(
        SOCKET_TYPE.IN,
        socketNames.speed,
        new NumberType(false, 0.1, 4),
        1,
      ),
      new Socket(SOCKET_TYPE.IN, socketNames.loop, new BooleanType(), false),
      new Socket(SOCKET_TYPE.IN, socketNames.camera, new BooleanType(), true),
      new Socket(
        SOCKET_TYPE.IN,
        socketNames.autoplay,
        new BooleanType(),
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, socketNames.status, new StringType()),
      new Socket(SOCKET_TYPE.OUT, socketNames.step, new NumberType(true)),
      new Socket(SOCKET_TYPE.OUT, socketNames.caption, new StringType(), ''),
    ];
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  private stopWaitingForApp: (() => void) | undefined;

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    if (PPGraph.currentGraph.graphConfiguredAndReady) {
      this.refreshCaptionWarning();
    } else {
      // an opening app links its nodes after adding them all
      const listenerId = InterfaceController.addListener(
        ListenEvent.GraphConfigured,
        () => {
          InterfaceController.removeListener(listenerId);
          this.refreshCaptionWarning();
        },
      );
    }
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
      if (this.getInputData(socketNames.autoplay)) {
        // not awaited: a looping replay never finishes
        void this.reset().then(() => this.play());
      }
    });
  }

  onNodeRemoved = (): void => {
    this.stopWaitingForApp?.();
    this.endRecording();
    this.stopListeningToKeys?.();
  };

  private stopListeningToKeys: (() => void) | undefined;

  // from the first Play, Next or Back until the replay is done, dismissed or
  // reset, so a walkthrough needs no buttons in view
  private listenToKeys(): void {
    if (this.stopListeningToKeys) return;
    const ignore = (event: KeyboardEvent) =>
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isEventComingFromWithinTextInput(event);
    const onKeyDown = (event: KeyboardEvent) => {
      if (this.destroyed) {
        this.stopListeningToKeys?.();
        return;
      }
      if (ignore(event)) return;
      switch (event.key) {
        // PageDown and PageUp are what presenter remotes send
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          void this.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          void this.back();
          break;
        case ' ':
          event.preventDefault();
          void (ReplayService.getInstance().isPlaying
            ? this.stop()
            : this.play());
          break;
        case 'Escape':
          void this.dismiss();
          break;
      }
    };
    // a focused Play tour button would press itself again on Space
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && !ignore(event)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.stopListeningToKeys = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      this.stopListeningToKeys = undefined;
    };
  }

  private async dismiss(): Promise<void> {
    this.stopListeningToKeys?.();
    await this.withScript(async (steps) =>
      this.showProgress(await ReplayService.getInstance().dismiss(steps)),
    );
  }

  public outputPlugged(socket: Socket): void {
    super.outputPlugged(socket);
    this.refreshCaptionWarning();
  }

  public outputUnplugged(socket: Socket): void {
    super.outputUnplugged(socket);
    this.refreshCaptionWarning();
  }

  public socketChangedFromWidget(): void {
    super.socketChangedFromWidget();
    this.refreshCaptionWarning();
  }

  // captions only show through a linked Subtitle node; without one a
  // walkthrough is a camera moving for no stated reason
  private refreshCaptionWarning(): void {
    const socket = this.getOutputSocketByName(socketNames.caption);
    if (!socket || this.destroyed) return;
    let captions = false;
    try {
      captions = hasCaptionSteps(
        parseReplayScript(this.getInputData(socketNames.script)),
      );
    } catch {
      // an unreadable script is reported when it plays
    }
    socket.setStatus(
      captions && socket.links.length === 0
        ? new NodeConfigurationWarning(
            "Captions show nowhere: link Caption to a Subtitle node's Text",
          )
        : new PNPSuccess(),
    );
    this.refreshSocketStatus();
  }

  // read before every step, so they can change while it plays
  private getSettings = (): ReplaySettings => ({
    speed: this.getInputData(socketNames.speed),
    loop: this.getInputData(socketNames.loop),
    camera: this.getInputData(socketNames.camera),
  });

  // returns once started: a trigger waits for its method, so a Button linked
  // to Play would stay disabled until the replay ended, for good with Loop on
  public async play(): Promise<void> {
    void this.playback('play');
  }

  public async next(): Promise<void> {
    await this.playback('next');
  }

  public async back(): Promise<void> {
    await this.playback('back');
  }

  private async playback(direction: 'play' | 'next' | 'back'): Promise<void> {
    await this.withScript((steps) => {
      if (this.recording) {
        throw new Error('Stop recording first');
      }
      this.listenToKeys();
      return ReplayService.getInstance()[direction](
        steps,
        this.getSettings,
        (progress) => this.showProgress(progress),
      );
    });
  }

  private async withScript(
    run: (steps: ReplayStep[]) => Promise<void>,
  ): Promise<void> {
    try {
      await run(parseReplayScript(this.getInputData(socketNames.script)));
    } catch (error) {
      this.showStatus((error as Error).message);
    }
  }

  public async stop(): Promise<void> {
    if (this.recording) {
      await this.saveRecording(this.recording);
      return;
    }
    await ReplayService.getInstance().stop();
  }

  private recording: Recording | undefined;

  // compares the graph with how it was after each change to the undo history
  // and adds the steps in between
  public async record(): Promise<void> {
    await ReplayService.getInstance().stop();
    this.endRecording();
    const recording: Recording = {
      listenerId: InterfaceController.addListener(
        ListenEvent.ActionHistoryChanged,
        () => this.scheduleCapture(recording),
      ),
      snapshot: takeSnapshot(this.id),
      steps: [],
      warnings: new Set(),
      lastStepTime: 0,
    };
    this.recording = recording;
    this.showProgress({ step: 0, total: 0, status: 'Recording', caption: '' });
  }

  // one capture for a burst of history changes in the same tick
  private scheduleCapture(recording: Recording): void {
    recording.captureTimer ??= setTimeout(() => {
      recording.captureTimer = undefined;
      this.capture(recording);
    }, 0);
  }

  private capture(recording: Recording): void {
    const next = takeSnapshot(this.id);
    const changes = diffSnapshots(recording.snapshot, next, getNodeDefaults);
    recording.snapshot = next;
    changes.warnings.forEach((warning) => recording.warnings.add(warning));
    if (changes.steps.length === 0) return;
    const now = Date.now();
    appendSteps(recording.steps, changes.steps, now - recording.lastStepTime);
    recording.lastStepTime = now;
  }

  private endRecording(): void {
    if (!this.recording) return;
    InterfaceController.removeListener(this.recording.listenerId);
    clearTimeout(this.recording.captureTimer);
    this.recording = undefined;
  }

  private async saveRecording(recording: Recording): Promise<void> {
    this.endRecording();
    this.capture(recording);
    const steps = recording.steps;
    const warnings = Array.from(recording.warnings);
    const args: SetSocketValueActionArgs = {
      nodeID: this.id,
      socketName: socketNames.script,
      socketType: SOCKET_TYPE.IN,
      newValue: steps,
    };
    await PNPAction(ACTIONS.SET_SOCKET_VALUE, args, {
      ...args,
      newValue: this.getInputData(socketNames.script),
    });
    const skipped =
      warnings.length > 0 ? `. Not recorded: ${warnings.join('; ')}` : '';
    this.showProgress({
      step: 0,
      total: steps.length,
      status: `Recorded ${steps.length} steps${skipped}`,
      caption: '',
    });
  }

  public async reset(): Promise<void> {
    await this.withScript(async (steps) => {
      this.stopListeningToKeys?.();
      await ReplayService.getInstance().reset(steps);
      this.showProgress({
        step: 0,
        total: steps.length,
        status: 'Ready',
        caption: '',
      });
    });
  }

  private showProgress(progress: ReplayProgress): void {
    // a failed step reports "Step n (tool) failed: ..."
    if (progress.status === 'Done' || progress.status.startsWith('Step ')) {
      this.stopListeningToKeys?.();
    }
    this.setOutputData(socketNames.step, progress.step);
    this.setOutputData(socketNames.caption, progress.caption);
    this.showStatus(progress.status);
  }

  private showStatus(status: string): void {
    // the replay may have deleted and recreated nodes, but never this one
    if (this.destroyed) return;
    this.setOutputData(socketNames.status, status);
    void this.executeChildren();
  }
}
