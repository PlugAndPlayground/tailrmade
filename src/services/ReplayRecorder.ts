import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { getAllNodeTypes } from '../nodes/allNodes';
import type { SerializedLink } from '../utils/interfaces';
import type { ReplayStep } from './ReplayService';
import {
  canMerge,
  diffSnapshots,
  GraphSnapshot,
  NodeDefaults,
} from './replayRecording';

export interface Recording {
  steps: ReplayStep[];
  warnings: string[];
}

// longer pauses while recording are shortened, nobody wants to watch them
const MAX_DELAY = 2;
// between the steps of one change, e.g. adding a node and setting its value
const STEP_DELAY = 0.2;
// repeated edits of one value or one drag closer together than this are one step
const MERGE_WINDOW_MS = 1500;

const roundDelay = (seconds: number) => Math.round(seconds * 10) / 10;

/**
 * Records editing as a replay script. After each change to the undo history
 * it compares the graph with how it was and adds the steps in between.
 */
export class ReplayRecorder {
  private static instance: ReplayRecorder | undefined;

  static getInstance(): ReplayRecorder {
    if (this.instance === undefined) {
      this.instance = new ReplayRecorder();
    }
    return this.instance;
  }

  private listenerId: string | undefined;
  private captureTimer: ReturnType<typeof setTimeout> | undefined;
  // the Replay node doing the recording is not part of what it records
  private ignoredNodeId = '';
  private snapshot: GraphSnapshot | undefined;
  private steps: ReplayStep[] = [];
  private warnings = new Set<string>();
  private lastStepTime = 0;
  private defaults = new Map<string, NodeDefaults | undefined>();

  isRecording(): boolean {
    return this.listenerId !== undefined;
  }

  start(ignoredNodeId: string): void {
    this.stop();
    this.ignoredNodeId = ignoredNodeId;
    this.snapshot = this.takeSnapshot();
    this.steps = [];
    this.warnings.clear();
    this.defaults.clear();
    this.listenerId = InterfaceController.addListener(
      ListenEvent.ActionHistoryChanged,
      () => this.scheduleCapture(),
    );
  }

  stop(): Recording {
    if (this.listenerId === undefined) {
      return { steps: [], warnings: [] };
    }
    InterfaceController.removeListener(this.listenerId);
    this.listenerId = undefined;
    clearTimeout(this.captureTimer);
    this.captureTimer = undefined;
    this.capture();
    this.snapshot = undefined;
    return { steps: this.steps, warnings: Array.from(this.warnings) };
  }

  // one capture for a burst of history changes in the same tick
  private scheduleCapture(): void {
    this.captureTimer ??= setTimeout(() => {
      this.captureTimer = undefined;
      this.capture();
    }, 0);
  }

  private capture(): void {
    if (!this.snapshot) return;
    const next = this.takeSnapshot();
    const changes = diffSnapshots(this.snapshot, next, (type) =>
      this.getDefaults(type),
    );
    this.snapshot = next;
    changes.warnings.forEach((warning) => this.warnings.add(warning));

    const now = Date.now();
    changes.steps.forEach((step, index) => {
      const last = this.steps[this.steps.length - 1];
      if (
        index === 0 &&
        last &&
        now - this.lastStepTime < MERGE_WINDOW_MS &&
        canMerge({ tool: last.tool, input: last.input ?? {} }, step)
      ) {
        last.input = step.input;
        return;
      }
      const delay =
        this.steps.length === 0
          ? 0
          : index === 0
            ? Math.min(MAX_DELAY, (now - this.lastStepTime) / 1000)
            : STEP_DELAY;
      this.steps.push({ delay: roundDelay(delay), ...step });
    });
    if (changes.steps.length > 0) {
      this.lastStepTime = now;
    }
  }

  private takeSnapshot(): GraphSnapshot {
    const graph = PPGraph.currentGraph;
    const ignored = this.ignoredNodeId;
    const nodes: GraphSnapshot['nodes'] = {};
    Object.values(graph.nodes)
      .filter((node) => node.id !== ignored)
      .forEach((node) => (nodes[node.id] = node.serialize()));
    return {
      nodes,
      links: Object.values(graph.getLinks())
        .map((link) => link.serialize())
        .filter(
          (link): link is SerializedLink =>
            link !== undefined &&
            link.sourceNodeId !== ignored &&
            link.targetNodeId !== ignored,
        ),
      groups: graph.groupLayer.serialize(),
      defaultSurfaceId: graph.defaultUISurfaceNodeId,
    };
  }

  // from a template node that never joins the graph, like describe_node does
  private getDefaults(type: string): NodeDefaults | undefined {
    if (!this.defaults.has(type)) {
      const entry = getAllNodeTypes()[type];
      let defaults: NodeDefaults | undefined;
      if (entry) {
        const template: PPNode = new entry.constructor(type);
        template.updateBehaviour ??= template.getUpdateBehaviour();
        const serialized = template.serialize();
        defaults = {
          name: template.getName(),
          inputs: Object.fromEntries(
            serialized.socketArray
              .filter((socket) => socket.socketType === 'in')
              .map((socket) => [socket.name, socket.data]),
          ),
          updateBehaviour: serialized.updateBehaviour,
        };
      }
      this.defaults.set(type, defaults);
    }
    return this.defaults.get(type);
  }
}
