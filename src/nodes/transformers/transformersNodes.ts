import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import {
  NodeExecutionWarning,
  PNPCustomStatus,
} from '../../classes/ErrorClass';
import {
  CompanionRisk,
  ModelDownloadRisk,
  NodeRisk,
} from '../../classes/NodeRisk';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import {
  isNodeExecutionAllowed,
  pendingAppRun,
} from '../../services/appExecution';
import { TRgba } from '../../utils/color';
import {
  NODE_SOURCE,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { TNodeSource } from '../../utils/interfaces';
import { AnyType } from '../datatypes/anyType';
import { BooleanType } from '../datatypes/booleanType';
import { EnumType } from '../datatypes/enumType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { TriggerType } from '../datatypes/triggerType';
import {
  DEFAULT_DTYPE,
  DEFAULT_MODEL_ID,
  DEFAULT_TASK,
  DEVICES,
  DTYPES,
  EMPTY_STATS,
  GenerateStatus,
  IDLE_STATUS,
  LoadRequest,
  ModelDevice,
  ModelHandle,
  ModelStatus,
  ModelStorage,
  STORAGES,
  TASKS,
  WebGPUInfo,
  isModelHandle,
  modelKey,
} from './protocol';
import {
  errorStatus,
  formatBytes,
  normalizeMessages,
  normalizeResponseFormat,
  normalizeTools,
} from './status';
import { TransformersWorkerClient } from './TransformersWorkerClient';

const options = (values: readonly string[]) =>
  values.map((value) => ({ text: value, value }));

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const PUSH_INTERVAL_MS = 150;

// Pushes this node's outputs downstream while it works, at most every
// PUSH_INTERVAL_MS, so progress and streamed text reach the app without
// re-running the graph for every token.
class OutputPusher {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private node: PPNode) {}

  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.push();
    }, PUSH_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    await this.push();
  }

  private async push(): Promise<void> {
    if (!this.node.hasBeenAdded || this.node.destroyed) return;
    try {
      await this.node.executeChildren();
    } catch (error) {
      console.warn(error);
    }
  }
}

const canRun = (node: PPNode) =>
  node.hasBeenAdded && !node.destroyed && isNodeExecutionAllowed(node);

// Shared by both nodes: manual update only, like the AI and HTTP nodes, so
// typing into an upstream field never starts a download or a generation.
abstract class TransformersNodeBase extends PPNode {
  protected pusher = new OutputPusher(this);

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  public getTags(): string[] {
    return ['AI', 'Input'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected showPhase(label: string, failed = false): void {
    this.pushExclusiveStatus(
      new PNPCustomStatus(
        label,
        failed ? TRgba.fromString('#E53935') : TRgba.white().multiply(0.5),
        'transformers-phase',
      ),
    );
  }
}

export const modelInputName = 'Model';
const taskName = 'Task';
const dtypeName = 'Dtype';
const deviceName = 'Device';
const storageName = 'Storage';
const loadName = 'Load';
const deleteName = 'Delete model';
const loadOnOpenName = 'Load on open';
// Hidden: the last download size seen, saved so the review can show it.
const knownSizeName = 'Known download size';
const statusName = 'Status';
const readyName = 'Ready';
const webgpuName = 'WebGPU';

export class TransformersModel extends TransformersNodeBase {
  private loading?: Promise<void>;
  private loadedOnOpen = false;

  public getName(): string {
    return 'Transformers.js model';
  }

  public getDescription(): string {
    return 'Downloads and loads a Hugging Face model to run in this browser. Load it once, then wire its handle to Transformers.js generate nodes.';
  }

  public getDocs(): string {
    return `Loads a Transformers.js model in a background worker, so the page
never freezes. The "Model" output is a small handle
({ id, model, task, dtype, device }), not the model: wire it to any number
of "Transformers.js generate" nodes, or keep it in State. Loading the same
model, dtype and device again returns the same handle and never loads twice.

## Loading
Press "Load" (a trigger), or enable "Load on open" to load once the app has
started. Nothing loads by itself: changing an input never starts a download.
"Status" updates while it works:
{ phase: idle|checking|downloading|loading|ready|error, progress (0-100),
downloadBytes, totalBytes, cached, error, device, message, storage }.
"checking" reports the size and whether the files are cached before anything
downloads. "Ready" turns true when the model can generate.

## Device
"auto" uses WebGPU when a graphics adapter is available and otherwise the
CPU (wasm); Status.message says when it fell back. "webgpu" never falls
back: it fails with the reason. "WebGPU" outputs { available, adapter,
reason } from a check that downloads nothing. WebGPU needs a recent Chrome or
Edge with a graphics card. Gemma 4 E2B q4f16 is about 3.1 GB.

## Storage
"Browser" keeps the files in this site's browser storage, shared by every
app on this site; Status.storage shows usage and quota. "Companion folder"
keeps them in a folder the tailrmade Companion manages, so they survive
clearing site data and can be copied to other machines; when the Companion
is not running it uses the browser and Status.message says so.
"Delete model" removes this model's files from the chosen storage.`;
  }

  public getRisks(): NodeRisk[] {
    const model = this.getStaticInputData(modelInputName);
    const size = Number(this.getInputData(knownSizeName)) || 0;
    const risks: NodeRisk[] = [
      new ModelDownloadRisk(
        model.known && typeof model.value === 'string'
          ? model.value
          : undefined,
        size > 0 ? formatBytes(size) : undefined,
      ),
    ];
    const storage = this.getStaticInputData(storageName);
    if (!storage.known || storage.value === 'Companion folder') {
      risks.push(new CompanionRisk('model folder'));
    }
    return risks;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        modelInputName,
        new StringType(),
        DEFAULT_MODEL_ID,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        taskName,
        new EnumType(options(TASKS)),
        DEFAULT_TASK,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        dtypeName,
        new EnumType(options(DTYPES)),
        DEFAULT_DTYPE,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        deviceName,
        new EnumType(options(DEVICES), undefined, true),
        'auto',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        storageName,
        new EnumType(options(STORAGES), undefined, true),
        'Browser',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        loadName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'loadModel'),
        0,
      ),
      new Socket(SOCKET_TYPE.IN, loadOnOpenName, new BooleanType(), false),
      new Socket(
        SOCKET_TYPE.IN,
        deleteName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'deleteStoredModel'),
        0,
        false,
      ),
      new Socket(SOCKET_TYPE.IN, knownSizeName, new NumberType(true), 0, false),
      new Socket(SOCKET_TYPE.OUT, modelInputName, new JSONType(), null),
      new Socket(SOCKET_TYPE.OUT, statusName, new JSONType(), IDLE_STATUS),
      new Socket(SOCKET_TYPE.OUT, readyName, new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, webgpuName, new JSONType(), null),
    ];
  }

  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    // A saved handle or status describes the last session; this one has no
    // model until it loads.
    this.setOutputData(modelInputName, null);
    this.setOutputData(statusName, IDLE_STATUS);
    this.setOutputData(readyName, false);
    if (source === NODE_SOURCE.SERIALIZED) {
      // DashboardLoaded also fires before the risk review; only load once
      // the app was allowed to run.
      this.listenId.push(
        InterfaceController.addListener(ListenEvent.DashboardLoaded, () => {
          if (
            this.loadedOnOpen ||
            pendingAppRun.get() ||
            !this.getInputData(loadOnOpenName)
          ) {
            return;
          }
          this.loadedOnOpen = true;
          void this.loadModel();
        }),
      );
    }
  }

  private request(): LoadRequest {
    return {
      model: String(this.getInputData(modelInputName) ?? '').trim(),
      task: this.getInputData(taskName) || DEFAULT_TASK,
      dtype: this.getInputData(dtypeName) || DEFAULT_DTYPE,
      device: (this.getInputData(deviceName) || 'auto') as ModelDevice,
      storage: (this.getInputData(storageName) || 'Browser') as ModelStorage,
    };
  }

  private setStatus_(status: ModelStatus, webgpu?: WebGPUInfo): void {
    this.setOutputData(statusName, status);
    this.setOutputData(readyName, status.phase === 'ready');
    if (webgpu) this.setOutputData(webgpuName, webgpu);
    if (status.totalBytes > 0) {
      this.setInputData(knownSizeName, status.totalBytes);
    }
    const percent = `${status.progress}%`;
    const label = {
      idle: 'Idle',
      checking: 'Checking',
      downloading: `Downloading ${percent}`,
      loading: 'Loading',
      ready: `Ready (${status.device ?? ''})`,
      deleting: 'Deleting',
      error: 'Error',
    }[status.phase];
    this.showPhase(label, status.phase === 'error');
  }

  public async loadModel(): Promise<void> {
    if (!canRun(this)) return;
    // A press while loading joins the load already running.
    if (this.loading) return this.loading;
    const request = this.request();
    this.loading = (async () => {
      this.setStatus_({ ...IDLE_STATUS, phase: 'checking' });
      // Keep the handle when the same model is loaded again; drop it when the
      // inputs now name a different one.
      if (this.getOutputData(modelInputName)?.id !== modelKey(request)) {
        this.setOutputData(modelInputName, null);
      }
      await this.pusher.flush();
      if (request.storage === 'Browser') {
        // Ask before the first big download, so Chrome does not evict the
        // model under storage pressure. persist() only exists on the page.
        try {
          await navigator.storage?.persist?.();
        } catch {
          // Not granted; the files are still cached, just evictable.
        }
      }
      try {
        const result = await TransformersWorkerClient.get().load(
          request,
          ({ status, webgpu }) => {
            this.setStatus_(status, webgpu);
            this.pusher.schedule();
          },
        );
        this.setOutputData(modelInputName, result.handle);
        this.setStatus_(result.status, result.webgpu);
      } catch (error) {
        const previous = this.getOutputData(statusName) ?? IDLE_STATUS;
        this.setStatus_(errorStatus(previous, error));
        this.setOutputData(modelInputName, null);
        this.setStatus(new NodeExecutionWarning(errorText(error)));
      }
      await this.pusher.flush();
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  public async deleteStoredModel(): Promise<void> {
    if (!canRun(this) || this.loading) return;
    const request = this.request();
    this.setStatus_({
      ...(this.getOutputData(statusName) ?? IDLE_STATUS),
      phase: 'deleting',
    });
    await this.pusher.flush();
    try {
      const result = await TransformersWorkerClient.get().deleteModel(request);
      this.setOutputData(modelInputName, null);
      this.setStatus_(result.status);
    } catch (error) {
      this.setStatus_(errorStatus(this.getOutputData(statusName), error));
      this.setStatus(new NodeExecutionWarning(errorText(error)));
    }
    await this.pusher.flush();
  }

  // Executing only republishes what the node has; Load does the work.
  protected async onExecute(): Promise<void> {}
}

export const messagesName = 'Messages';
const toolsName = 'Tools';
const responseFormatName = 'Response format';
const optionsName = 'Options';
const generateName = 'Generate';
const stopName = 'Stop';
const textName = 'Text';
const toolCallsName = 'Tool calls';
const statsName = 'Stats';
const busyName = 'Busy';

export class TransformersGenerate extends TransformersNodeBase {
  private busy = false;

  public getName(): string {
    return 'Transformers.js generate';
  }

  public getDescription(): string {
    return 'Generates text with a model loaded by a Transformers.js model node, streaming it while it writes. Supports chat, tool calls and JSON output.';
  }

  public getDocs(): string {
    return `Wire "Model" from a "Transformers.js model" node and press "Generate"
(a trigger). Generation runs in a background worker and streams: "Text"
updates while the model writes and runs downstream nodes, then holds the
final answer. "Stop" ends it early.

## Inputs
- Messages: a string (one user message) or a chat array such as
  [{ "role": "system", "content": "…" }, { "role": "user", "content": "…" }].
- Tools: OpenAI-style tools,
  [{ "type": "function", "function": { "name", "description", "parameters" } }],
  passed to the model's chat template. Leave [] for none.
- Response format: a JSON schema, or { "type": "json_schema", "json_schema": … }.
  When set, output is constrained to valid JSON for it; parse "Text" with a
  JSON node. Leave {} for free text.
- Options: generation settings, e.g. { "max_new_tokens": 512,
  "do_sample": false }, or { "do_sample": true, "temperature": 0.7, "top_k": 40 }.

## Outputs
- Text: the answer, without tool calls.
- Tool calls: [{ id, name, arguments }] the model asked for.
- Messages: the input messages plus the assistant turn (with tool_calls),
  ready to store as history.
- Stats: { tokens, seconds, tokensPerSecond, timeToFirstToken }.
- Busy: true while generating. Status: { phase: idle|generating|done|
  stopped|ignored|error, message }.

## Tools
The node runs one turn and never calls tools itself. Run each tool call with
ordinary nodes, append { "role": "tool", "tool_call_id": id, "name": name,
"content": result } to Messages, and press Generate again.

## Loading
If "Model" is wired straight from a model node that hasn't loaded yet,
Generate starts that node's Load and waits, so one Generate trigger is
enough; the model node's Status shows the download. A handle that went
through State is not loaded this way: press Load on the model node.

## One at a time
A model generates one answer at a time. Pressing Generate while it is busy
is ignored (Status.phase "ignored"), not queued.`;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, modelInputName, new JSONType(), null),
      new Socket(
        SOCKET_TYPE.IN,
        messagesName,
        new AnyType(),
        'Write a haiku about cooking.',
      ),
      new Socket(SOCKET_TYPE.IN, toolsName, new JSONType(), []),
      new Socket(SOCKET_TYPE.IN, responseFormatName, new JSONType(), {}),
      new Socket(SOCKET_TYPE.IN, optionsName, new JSONType(), {
        max_new_tokens: 512,
        do_sample: false,
      }),
      new Socket(
        SOCKET_TYPE.IN,
        generateName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'generateText'),
        0,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        stopName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'stopGeneration'),
        0,
      ),
      new Socket(SOCKET_TYPE.OUT, textName, new StringType(), ''),
      new Socket(SOCKET_TYPE.OUT, toolCallsName, new JSONType(), []),
      new Socket(SOCKET_TYPE.OUT, messagesName, new JSONType(), []),
      new Socket(SOCKET_TYPE.OUT, statsName, new JSONType(), EMPTY_STATS),
      new Socket(SOCKET_TYPE.OUT, busyName, new BooleanType(), false),
      new Socket(SOCKET_TYPE.OUT, statusName, new JSONType(), {
        phase: 'idle',
        message: '',
      }),
    ];
  }

  private setGenerateStatus(status: GenerateStatus): void {
    this.setOutputData(statusName, status);
    this.showPhase(
      status.phase === 'idle'
        ? 'Idle'
        : status.phase[0].toUpperCase() + status.phase.slice(1),
      status.phase === 'error',
    );
  }

  public async generateText(): Promise<void> {
    if (!canRun(this)) return;
    if (this.busy) {
      this.setGenerateStatus({
        phase: 'ignored',
        message:
          'Still generating; this press was ignored. Press Stop first to start over.',
      });
      await this.pusher.flush();
      // The running generation will overwrite Status when it ends.
      return;
    }
    this.busy = true;
    this.setOutputData(busyName, true);
    this.setOutputData(textName, '');
    this.setOutputData(toolCallsName, []);
    this.setGenerateStatus({ phase: 'generating', message: '' });
    await this.pusher.flush();
    try {
      const handle = await this.modelHandle();
      const messages = normalizeMessages(this.getInputData(messagesName));
      if (!messages.length) throw new Error('Messages is empty.');
      const optionsInput = this.getInputData(optionsName);
      const result = await TransformersWorkerClient.get().generate(
        {
          handle,
          messages,
          tools: normalizeTools(this.getInputData(toolsName)),
          responseFormat: normalizeResponseFormat(
            this.getInputData(responseFormatName),
          ),
          options:
            optionsInput && typeof optionsInput === 'object'
              ? optionsInput
              : {},
        },
        (partial) => {
          this.setOutputData(textName, partial.text);
          this.pusher.schedule();
        },
      );
      if (result.ignored) {
        this.setGenerateStatus({
          phase: 'ignored',
          message:
            'This model is busy with another generation; this press was ignored.',
        });
      } else {
        this.setOutputData(textName, result.text);
        this.setOutputData(toolCallsName, result.toolCalls);
        this.setOutputData(messagesName, result.messages);
        this.setOutputData(statsName, result.stats);
        this.setGenerateStatus({
          phase: result.stopped ? 'stopped' : 'done',
          message: `${result.stats.tokens} tokens in ${result.stats.seconds.toFixed(1)} s (${result.stats.tokensPerSecond.toFixed(1)} tokens/s)`,
        });
      }
    } catch (error) {
      this.setGenerateStatus({ phase: 'error', message: errorText(error) });
      this.setStatus(new NodeExecutionWarning(errorText(error)));
    } finally {
      this.busy = false;
      this.setOutputData(busyName, false);
    }
    await this.pusher.flush();
  }

  // Generate is the only trigger an app needs: when "Model" comes straight
  // from a model node that hasn't loaded yet, this starts its Load (or joins
  // the one running) and waits, so Load and Generate never race.
  private async modelHandle(): Promise<ModelHandle> {
    const source = this.getInputSocketByName(modelInputName)
      ?.links[0]?.getSource()
      .getNode();
    if (
      source instanceof TransformersModel &&
      source.getOutputData(readyName) !== true
    ) {
      this.setGenerateStatus({
        phase: 'generating',
        message: 'Loading the model first; see its Status.',
      });
      await this.pusher.flush();
      await source.loadModel();
    }
    const handle = this.getInputData(modelInputName);
    if (!isModelHandle(handle)) {
      const status = source?.getOutputData(statusName) as ModelStatus;
      throw new Error(
        status?.phase === 'error'
          ? `The model did not load: ${status.error}`
          : 'Connect "Model" to the Model output of a Transformers.js model node.',
      );
    }
    return handle;
  }

  public async stopGeneration(): Promise<void> {
    const handle = this.getInputData(modelInputName);
    if (!this.busy || !isModelHandle(handle)) return;
    await TransformersWorkerClient.get().stop(handle.id);
  }

  protected async onExecute(): Promise<void> {}
}
