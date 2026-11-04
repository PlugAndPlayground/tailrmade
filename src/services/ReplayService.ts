import * as PIXI from 'pixi.js';
import { ActionHandler } from '../classes/Action';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import {
  calculateOverlayOffsets,
  emitMoved,
  getNodesBounds,
} from '../pixi/utils-pixi';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { TailrmadeMCPServer, ToolCaller } from './TailrmadeMCPServer';
import { clearSubtitle, getSubtitle, showSubtitle } from './subtitles';
import { ReplayRecorder } from './ReplayRecorder';

/**
 * Plays a script of MCP tool calls back at a watchable pace, e.g. to film an
 * app being built. Each step runs after the previous one has finished, then
 * waits its delay.
 */
export interface ReplayStep {
  // seconds to wait after the previous step finished
  delay?: number;
  tool: string;
  input?: Record<string, unknown>;
}

export interface ReplayProgress {
  step: number;
  total: number;
  status: string;
}

// steps the replay handles itself instead of the MCP server
const CAMERA_TOOL = 'camera';
const SUBTITLE_TOOL = 'subtitle';

interface CameraInput {
  // node ids to frame; an empty list frames the whole graph
  fit?: string[];
  x?: number;
  y?: number;
  zoom?: number;
  duration?: number;
}

// shown without holding up the steps after it
interface SubtitleInput {
  text?: string;
  // seconds; 0 keeps it until the next subtitle
  duration?: number;
}

const REPLAY_CALLER: ToolCaller = { source: 'replay', quiet: true };
const DEFAULT_DELAY = 0.5;
const DEFAULT_CAMERA_DURATION = 1;
const CAMERA_FIT_PADDING = 0.2;
const STOP_CHECK_MS = 100;

// center is the viewport's own center, drawer offset already applied
interface CameraState {
  center: PIXI.Point;
  scale: number;
}

export function parseReplayScript(script: unknown): ReplayStep[] {
  const steps = typeof script === 'string' ? JSON.parse(script) : script;
  if (!Array.isArray(steps)) {
    throw new Error('The script must be a list of steps');
  }
  steps.forEach((step, index) => {
    if (typeof step?.tool !== 'string' || !step.tool) {
      throw new Error(`Step ${index + 1} has no tool`);
    }
    if (
      step.delay !== undefined &&
      (typeof step.delay !== 'number' || step.delay < 0)
    ) {
      throw new Error(`Step ${index + 1} has an invalid delay`);
    }
  });
  return steps;
}

// the nodes a script adds are the only ones a reset removes
export function getScriptNodeIds(steps: ReplayStep[]): string[] {
  return steps
    .filter((step) => step.tool === 'add_node')
    .map((step) => step.input?.node_id)
    .filter((id): id is string => typeof id === 'string');
}

export interface PlayOptions {
  speed: number;
  // starts over from a reset after the last step
  loop?: boolean;
}

type ProgressListener = (progress: ReplayProgress) => void;

// what undoing a step has to put back
interface AppliedStep {
  // the undo entries the step added
  historyIds: string[];
  caption: string;
  camera: CameraState;
}

export class ReplayService {
  private static instance: ReplayService | undefined;

  static getInstance(): ReplayService {
    if (this.instance === undefined) {
      this.instance = new ReplayService();
    }
    return this.instance;
  }

  // bumped by stop, so a running replay notices it was cancelled
  private runId = 0;
  private running: Promise<void> | undefined;
  // where the camera was before the first play since the last reset
  private cameraBeforePlay: CameraState | undefined;
  // the steps run so far, of the script in scriptKey; play, next and back
  // carry on from there
  private applied: AppliedStep[] = [];
  private scriptKey = '';

  constructor() {
    // a replay belongs to the graph it was started in
    InterfaceController.addListener(ListenEvent.GraphConfigured, () => {
      this.runId++;
      this.applied = [];
      this.cameraBeforePlay = undefined;
    });
  }

  // from where the last run stopped, or from the start once it finished
  async play(
    steps: ReplayStep[],
    options: PlayOptions,
    onProgress: ProgressListener,
  ): Promise<void> {
    await this.prepare(steps, true);
    const speed = options.speed > 0 ? options.speed : 1;
    await this.track(
      this.runSteps(steps, speed, !!options.loop, this.runId, onProgress),
    );
  }

  // runs the next step right away, without its delay
  async next(
    steps: ReplayStep[],
    speed: number,
    onProgress: ProgressListener,
  ): Promise<void> {
    await this.prepare(steps, false);
    const index = this.applied.length;
    const total = steps.length;
    if (index >= total) {
      onProgress({ step: total, total, status: 'Done' });
      return;
    }
    await this.track(
      (async () => {
        onProgress({
          step: index + 1,
          total,
          status: `Running ${steps[index].tool}`,
        });
        const error = await this.applyStep(steps, index, speed > 0 ? speed : 1);
        onProgress(
          error
            ? this.failure(steps, index, error)
            : {
                step: index + 1,
                total,
                status: index + 1 === total ? 'Done' : 'Paused',
              },
        );
      })(),
    );
  }

  // undoes the last step that ran
  async back(
    steps: ReplayStep[],
    speed: number,
    onProgress: ProgressListener,
  ): Promise<void> {
    this.ensureNotRecording();
    await this.halt();
    const total = steps.length;
    if (JSON.stringify(steps) !== this.scriptKey && this.applied.length > 0) {
      throw new Error('The script changed. Reset first.');
    }
    const last = this.applied[this.applied.length - 1];
    if (!last) {
      onProgress({ step: 0, total, status: 'At the start' });
      return;
    }
    await this.track(
      (async () => {
        const index = this.applied.length - 1;
        if (await this.undoStep(last)) {
          this.applied.pop();
          showSubtitle(last.caption);
          if (steps[index].tool === CAMERA_TOOL) {
            this.animateCamera(
              last.camera,
              this.getCameraTime(steps[index].input, speed),
            );
          }
        } else {
          await this.rebuild(steps, index);
        }
        onProgress({ step: index, total, status: 'Paused' });
      })(),
    );
  }

  async stop(): Promise<void> {
    await this.halt();
    clearSubtitle();
  }

  // stepping keeps the caption up, stop takes it down
  private async halt(): Promise<void> {
    this.runId++;
    await this.running;
  }

  // removes what the script added and puts the camera back
  async reset(steps: ReplayStep[]): Promise<void> {
    await this.stop();
    await this.removeScriptNodes(steps);
    this.applied = [];
    if (this.cameraBeforePlay) {
      this.animateCamera(this.cameraBeforePlay, 0);
      this.cameraBeforePlay = undefined;
    }
  }

  private ensureNotRecording(): void {
    if (ReplayRecorder.getInstance().isRecording()) {
      throw new Error('Stop recording first');
    }
  }

  private async prepare(steps: ReplayStep[], restartWhenDone: boolean) {
    this.ensureNotRecording();
    await this.halt();
    const key = JSON.stringify(steps);
    if (
      key !== this.scriptKey ||
      (restartWhenDone && this.applied.length >= steps.length)
    ) {
      this.scriptKey = key;
      this.applied = [];
    }
    if (this.applied.length === 0) {
      // never replaces nodes silently: they may be ones an AI built under the
      // same ids, so clearing them is left to an explicit reset
      const existing = getScriptNodeIds(steps).filter(
        (id) => PPGraph.currentGraph.nodes[id],
      );
      if (existing.length > 0) {
        throw new Error(
          `${existing.join(', ')} already in the graph. Reset first.`,
        );
      }
    }
    this.cameraBeforePlay ??= this.getCamera();
  }

  private async track(run: Promise<void>): Promise<void> {
    this.running = run;
    try {
      await run;
    } finally {
      if (this.running === run) {
        this.running = undefined;
      }
    }
  }

  private async removeScriptNodes(steps: ReplayStep[]): Promise<void> {
    const graph = PPGraph.currentGraph;
    const nodes = getScriptNodeIds(steps)
      .map((id) => graph.nodes[id])
      .filter((node): node is PPNode => node !== undefined);
    if (nodes.length > 0) {
      await graph.perform_action_DeleteNodes(nodes, 'replay');
    }
  }

  private async runSteps(
    steps: ReplayStep[],
    speed: number,
    loop: boolean,
    runId: number,
    onProgress: ProgressListener,
  ): Promise<void> {
    const total = steps.length;
    for (;;) {
      for (let index = this.applied.length; index < total; index++) {
        const step = steps[index];
        await this.waitUnlessStopped(
          ((step.delay ?? DEFAULT_DELAY) * 1000) / speed,
          runId,
        );
        if (runId !== this.runId) {
          onProgress({ step: index, total, status: 'Stopped' });
          return;
        }
        onProgress({ step: index + 1, total, status: `Running ${step.tool}` });
        const error = await this.applyStep(steps, index, speed);
        if (error) {
          onProgress(this.failure(steps, index, error));
          return;
        }
      }
      onProgress({ step: total, total, status: 'Done' });
      if (!loop || runId !== this.runId) return;
      // the last step's delay is the only pause before the graph is cleared
      await this.removeScriptNodes(steps);
      this.applied = [];
      clearSubtitle();
      if (this.cameraBeforePlay) {
        this.animateCamera(this.cameraBeforePlay, 0);
      }
    }
  }

  private failure(
    steps: ReplayStep[],
    index: number,
    error: string,
  ): ReplayProgress {
    return {
      step: index + 1,
      total: steps.length,
      status: `Step ${index + 1} (${steps[index].tool}) failed: ${error}`,
    };
  }

  // runs a step and remembers how to undo it
  private async applyStep(
    steps: ReplayStep[],
    index: number,
    speed: number,
  ): Promise<string | undefined> {
    const before = new Set(getHistoryIds());
    const caption = getSubtitle();
    const camera = this.getCamera();
    const error = await this.runStep(steps[index], speed);
    if (!error) {
      this.applied.push({
        historyIds: getHistoryIds().filter((id) => !before.has(id)),
        caption,
        camera,
      });
    }
    return error;
  }

  // only when the step's undo entries are still the latest ones
  private async undoStep(step: AppliedStep): Promise<boolean> {
    const count = step.historyIds.length;
    if (count === 0) return true;
    const ids = getHistoryIds();
    const latest = ids.slice(-count);
    if (latest.some((id, index) => id !== step.historyIds[index])) {
      return false;
    }
    await ActionHandler.goToHistoryIndex(ids.length - count);
    return true;
  }

  // the slow way back, when the history no longer matches: from a reset,
  // without delays and without moving the camera
  private async rebuild(steps: ReplayStep[], count: number): Promise<void> {
    const camera = this.getCamera();
    await this.removeScriptNodes(steps);
    this.applied = [];
    clearSubtitle();
    for (let index = 0; index < count; index++) {
      if (steps[index].tool === CAMERA_TOOL) {
        this.applied.push({ historyIds: [], caption: getSubtitle(), camera });
      } else if (await this.applyStep(steps, index, Infinity)) {
        break;
      }
    }
    PPGraph.currentGraph.viewport.plugins.remove('animate');
    this.animateCamera(camera, 0);
  }

  // in slices, so stop doesn't have to sit out a long delay
  private async waitUnlessStopped(ms: number, runId: number): Promise<void> {
    const end = Date.now() + ms;
    while (runId === this.runId && Date.now() < end) {
      await wait(Math.min(STOP_CHECK_MS, end - Date.now()));
    }
  }

  // returns an error message, or nothing when the step worked
  private async runStep(
    step: ReplayStep,
    speed: number,
  ): Promise<string | undefined> {
    if (step.tool === CAMERA_TOOL) {
      return this.runCamera((step.input ?? {}) as CameraInput, speed);
    }
    if (step.tool === SUBTITLE_TOOL) {
      const { text = '', duration = 0 } = (step.input ?? {}) as SubtitleInput;
      showSubtitle(String(text), (duration * 1000) / speed);
      return undefined;
    }
    const result = await TailrmadeMCPServer.getInstance().callTool(
      step.tool,
      step.input ?? {},
      REPLAY_CALLER,
    );
    return result.is_error ? result.content : undefined;
  }

  private async runCamera(
    input: CameraInput,
    speed: number,
  ): Promise<string | undefined> {
    const target = this.getCameraTarget(input);
    if (typeof target === 'string') {
      return target;
    }
    const time = this.getCameraTime(input, speed);
    this.animateCamera(target, time);
    await wait(time);
    return undefined;
  }

  private getCameraTime(input: CameraInput | undefined, speed: number) {
    return ((input?.duration ?? DEFAULT_CAMERA_DURATION) * 1000) / speed;
  }

  private getCameraTarget(input: CameraInput): CameraState | string {
    const graph = PPGraph.currentGraph;
    const current = this.getCamera();
    if (input.fit !== undefined) {
      const nodes = input.fit.map((id) => graph.nodes[id]);
      const missing = input.fit.filter((_, index) => !nodes[index]);
      if (missing.length > 0) {
        return `Node not found: ${missing.join(', ')}`;
      }
      const bounds =
        nodes.length > 0
          ? getNodesBounds(nodes)
          : graph.nodeContainer.getLocalBounds().rectangle;
      const scale =
        input.zoom ??
        graph.viewport.findFit(bounds.width, bounds.height) *
          (1 - CAMERA_FIT_PADDING);
      return {
        center: new PIXI.Point(
          bounds.x + bounds.width / 2 - calculateOverlayOffsets(scale),
          bounds.y + bounds.height / 2,
        ),
        scale,
      };
    }
    const scale = input.zoom ?? current.scale;
    return {
      center: new PIXI.Point(
        input.x !== undefined
          ? input.x - calculateOverlayOffsets(scale)
          : current.center.x,
        input.y ?? current.center.y,
      ),
      scale,
    };
  }

  private getCamera(): CameraState {
    const viewport = PPGraph.currentGraph.viewport;
    return { center: viewport.center.clone(), scale: viewport.scale.x };
  }

  // open drawers cover part of the canvas; targets aim at the visible middle
  private animateCamera(target: CameraState, time: number): void {
    const viewport = PPGraph.currentGraph.viewport;
    if (time <= 0) {
      viewport.setZoom(target.scale, true);
      viewport.moveCenter(target.center);
      emitMoved();
      return;
    }
    viewport.animate({
      position: target.center,
      scale: target.scale,
      time,
      ease: 'easeInOutSine',
      callbackOnComplete: () => emitMoved(),
    });
  }
}

function getHistoryIds(): string[] {
  return ActionHandler.getHistorySnapshot()
    .entries.filter((entry) => entry.applied)
    .map((entry) => entry.id);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
