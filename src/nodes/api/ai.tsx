import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { AIBackend } from '../../services/AIBackend';
import {
  AI_PROVIDERS,
  DEFAULT_MODEL,
  DEFAULT_MODEL_GEMINI,
  getDefaultAIModel,
  getAIModelsForProvider,
  getAIResponseText,
  normalizeAIModel,
  type AIProvider,
} from '../../services/aiModels';
import { AnyType } from '../datatypes/anyType';
import { ArrayType } from '../datatypes/arrayType';
import { BooleanType } from '../datatypes/booleanType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { JSONType } from '../datatypes/jsonType';
import { StringType } from '../datatypes/stringType';
import { HTTPNode, outputContentName } from './http';

export const AIDataName = 'Data';
const legacyPromptName = 'Prompt';
export const AIProviderName = 'Provider';
export const AIModelName = 'Model';
export const AIOptionsName = 'Options';
export const AIBase64ImagesName = 'Images';
export const AIPersistantConversationName = 'Persistant conversation';
export const AIConversationName = 'Conversation';
export const responseName = 'Response';

export class AINode extends HTTPNode {
  protected getDefaultProvider(): AIProvider {
    return 'claude';
  }

  protected getDefaultModel(): string {
    return DEFAULT_MODEL;
  }

  private createProviderType(): DynamicEnumType {
    return new DynamicEnumType(
      () => AI_PROVIDERS.map((provider) => ({ text: provider.value })),
      (value) => {
        const provider = value as AIProvider;
        this.setInputData(AIModelName, getDefaultAIModel(provider));
      },
    );
  }

  private createModelType(defaultProvider: AIProvider): DynamicEnumType {
    return new DynamicEnumType(
      () =>
        getAIModelsForProvider(
          (this.getInputData(AIProviderName) || defaultProvider) as AIProvider,
        ).map((model) => ({ text: model.value })),
      () => {},
    );
  }

  public getName(): string {
    return 'AI';
  }

  public getDescription(): string {
    return 'Sends data and images to a selected AI provider and model.';
  }

  public getAdditionalDescription(): string {
    return '';
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    const defaultProvider = this.getDefaultProvider();
    return [
      new Socket(
        SOCKET_TYPE.IN,
        AIDataName,
        new AnyType(),
        'Give me a quick rundown of the battle of Hastings',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        AIProviderName,
        this.createProviderType(),
        defaultProvider,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        AIModelName,
        this.createModelType(defaultProvider),
        this.getDefaultModel(),
      ),
      new Socket(SOCKET_TYPE.IN, AIOptionsName, new JSONType(), {
        max_tokens: 4096,
      }),
      new Socket(SOCKET_TYPE.IN, AIBase64ImagesName, new ArrayType()),
      new Socket(
        SOCKET_TYPE.IN,
        AIPersistantConversationName,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outputContentName, new JSONType(), {}, false),
      new Socket(SOCKET_TYPE.OUT, responseName, new StringType()),
      new Socket(SOCKET_TYPE.OUT, AIConversationName, new JSONType(), []),
    ];
  }

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion >= this.getVersion()) return;

    const savedProvider = this.getInputData(AIProviderName) as AIProvider;
    const provider =
      this.type === 'gemininode'
        ? 'gemini'
        : this.type === 'claudenode'
          ? 'claude'
          : savedProvider || this.getDefaultProvider();
    const providerSocket = this.getInputSocketByName(AIProviderName);
    providerSocket.data = provider;
    providerSocket.defaultData = provider;

    const legacyPromptSocket = this.getInputSocketByName(legacyPromptName);
    const dataSocket = this.getInputSocketByName(AIDataName);
    if (legacyPromptSocket) {
      dataSocket.data = legacyPromptSocket.data;
      dataSocket.defaultData = legacyPromptSocket.defaultData;
      await this.replaceSocketWithOtherSocket(legacyPromptSocket, dataSocket);
    }

    const modelSocket = this.getInputSocketByName(AIModelName);
    modelSocket.changeSocketDataType(this.createModelType(provider));
    const model = normalizeAIModel(provider, modelSocket.data);
    modelSocket.data = model;
    modelSocket.defaultData = model;

    this.type = 'ainode';
  }

  private stringifyData(data: unknown): string {
    if (typeof data === 'string') return data;
    if (data === undefined) return '';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  protected async onExecute(
    inputObject: Record<string, any>,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    this.clearStatuses();
    const provider = inputObject[AIProviderName] as AIProvider;
    const model = normalizeAIModel(provider, inputObject[AIModelName]);
    const options = inputObject[AIOptionsName] || {};
    const conversationID = `ai-node-${this.id}`;
    const retainConversation = Boolean(
      inputObject[AIPersistantConversationName],
    );

    try {
      const result = await AIBackend.getInstance().sendAIMessage(
        provider,
        conversationID,
        this.stringifyData(inputObject[AIDataName]),
        model,
        retainConversation,
        options,
        inputObject[AIBase64ImagesName],
      );

      if (!result?.success || !result.data) {
        throw new Error(result?.error || `${provider} API request failed`);
      }

      outputObject[outputContentName] = result.data;
      outputObject[responseName] = getAIResponseText(provider, result.data);
      this.pushStatusCode(200);
    } catch (error) {
      this.pushStatusCode(400);
      outputObject[outputContentName] = {
        error: true,
        message: error instanceof Error ? error.message : String(error),
      };
      outputObject[responseName] = '';
    } finally {
      outputObject[AIConversationName] = retainConversation
        ? [...AIBackend.getInstance().getConversation(conversationID)]
        : [];
    }
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }
}

// Legacy adapters exist only so version-1 nodes can run AINode.migrate().
export class ClaudeNode extends AINode {
  public showInNodeSearch(): boolean {
    return false;
  }
}

export class GeminiNode extends AINode {
  protected getDefaultProvider(): AIProvider {
    return 'gemini';
  }

  protected getDefaultModel(): string {
    return DEFAULT_MODEL_GEMINI;
  }

  public showInNodeSearch(): boolean {
    return false;
  }
}
