import { hri } from 'human-readable-ids';
import PPGraph from '../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { truncateStringForAIContext } from './contextTruncation';
import { TailrmadeMCPServer } from './TailrmadeMCPServer';
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_GEMINI,
  getAIAgentProvider,
  type AIProvider,
} from './aiModels';
import {
  CLOUD_MODE,
  EXECUTION_LOCATION_LOCAL,
  type ExecutionLocation,
} from './shared-types';
import { getCachedUserPreferences } from '../components/useUserPreferences';
import { BackendGateway } from './BackendGateway';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { getAINodesCompactList } from '../nodes/allNodes';
import {
  parseAIProviderTurn,
  prepareAIProviderTurn,
  type AIProviderToolResult,
  type AIProviderTurn,
} from './aiProviderAdapters';

const LOCAL_COMPANION_AI_BASE_URL = 'http://localhost:6655/ai';

// MCP tools that mutate the graph.
const MUTATION_TOOL_NAMES = new Set([
  'add_node',
  'connect_sockets',
  'set_socket_value',
  'set_node_comment',
  'set_update_behaviour',
  'add_trigger_input',
  'set_trigger_type',
  'set_node_name',
  'set_surface_layout',
  'set_default_surface',
]);

export { DEFAULT_MODEL, DEFAULT_MODEL_GEMINI } from './aiModels';

export enum AIConversationSender {
  USER,
  AI,
}

export interface AIConversationMessage {
  sender: AIConversationSender;
  content: string;
  date: Date;
  tokenUsage?: AIConversationTokenUsage;
}

export interface AIConversationTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalTokens: number;
}

// Define types for Claude API content items
export interface ClaudeTextContent {
  type: 'text';
  text: string;
}

export interface ClaudeImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ClaudeToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// Union type for all content types
export type ClaudeContentItem =
  | ClaudeTextContent
  | ClaudeImageContent
  | ClaudeToolUseContent
  | ClaudeToolResultContent;

export interface AnthropicConversationMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentItem[]; // Either string or an array of properly typed content items
}

export interface AIMessageContext {
  performActions?: boolean;
}

// Interface for AI API responses
export interface AIResponse {
  success: boolean;
  data?: any;
  status?: any;
  user?: {
    uid: string;
    email: string;
    tokenUsage: {
      total: number;
      daily: number;
      limit: number;
    };
  };
  error?: string;
  message?: string;
  details?: any;
}

export class AIBackend {
  conversations: Record<string, AIConversationMessage[]> = {
    'Conversation 1': [],
  };
  awaitingResponseHash: string = '';
  private requestAbortControllers: Record<string, AbortController> = {};

  private static instance: AIBackend | undefined = undefined;
  static getInstance() {
    if (this.instance == undefined) {
      this.instance = new AIBackend();
    }
    return this.instance;
  }

  private getAIExecutionLocation(): ExecutionLocation {
    return CLOUD_MODE
      ? getCachedUserPreferences().aiLocation
      : EXECUTION_LOCATION_LOCAL;
  }

  private isLocalAI(): boolean {
    return this.getAIExecutionLocation() === EXECUTION_LOCATION_LOCAL;
  }

  private getAIRelayEndpoint(): string {
    if (this.isLocalAI()) {
      return `${LOCAL_COMPANION_AI_BASE_URL}/request`;
    }
    return BackendGateway.getInstance().getAIRelayEndpoint();
  }

  private async getRequestHeaders(): Promise<Record<string, string>> {
    if (this.isLocalAI()) {
      return { 'Content-Type': 'application/json' };
    }
    return {
      'Content-Type': 'application/json',
      ...(await BackendGateway.getInstance().getAuthHeader()),
    };
  }

  private canUseAI(): boolean {
    return (
      this.isLocalAI() ||
      (CLOUD_MODE && BackendGateway.getInstance().isLoggedIn())
    );
  }

  private logAIUsage(provider: string, model: string, tokensUsed: number) {
    if (!this.isLocalAI() && CLOUD_MODE && tokensUsed > 0) {
      BackendGateway.getInstance().logAIUsage(provider, model, tokensUsed);
    }
  }

  public getConversation(id: string): AIConversationMessage[] {
    if (id in this.conversations) {
      return this.conversations[id];
    } else {
      return [];
    }
  }

  private conversationToAnthropicMessages(
    conversation: AIConversationMessage[],
  ): AnthropicConversationMessage[] {
    return conversation.map((entry) => ({
      role: entry.sender === AIConversationSender.USER ? 'user' : 'assistant',
      content: entry.content,
    }));
  }

  private getTokenLimitMessage(payload: any): string | undefined {
    const candidateMessages = [
      payload?.error,
      payload?.error?.message,
      payload?.message,
      payload?.details?.error,
      payload?.response?.error,
      payload?.data?.error,
      payload?.data?.message,
    ].filter((value): value is string => typeof value === 'string');

    return candidateMessages.find((message) =>
      /token limit exceeded|token usage limit exceeded|daily token limit exceeded|out of tokens/i.test(
        message,
      ),
    );
  }

  private showTokenLimitToastIfNeeded(payload: any): void {
    const tokenLimitMessage = this.getTokenLimitMessage(payload);
    if (!tokenLimitMessage) {
      return;
    }

    InterfaceController.showSnackBar(`AI limit reached: ${tokenLimitMessage}`, {
      variant: 'warning',
    });
  }

  private getErrorMessage(error: any): string {
    return (
      error?.message ||
      (typeof error === 'string' ? error : undefined) ||
      'Unknown error occurred'
    );
  }

  private buildFailedAIResponse(error: any): AIResponse {
    return {
      success: false,
      status: error?.status || 500,
      message: this.getErrorMessage(error),
    };
  }

  private stripImageDataPrefix(image: string): string {
    return image.replace(/^data:image\/[^;]+;base64,/, '');
  }

  private buildClaudeImageContent(image: string): ClaudeImageContent {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: this.getMediaTypeFromImage(image),
        data: this.stripImageDataPrefix(image),
      },
    };
  }

  private buildAnthropicMessageContent(
    text: string,
    images?: string[],
  ): string | ClaudeContentItem[] {
    if (!images?.length) {
      return text;
    }

    const textContent: ClaudeTextContent = {
      type: 'text',
      text,
    };

    return [
      ...images.map((image) => this.buildClaudeImageContent(image)),
      textContent,
    ];
  }

  private buildProviderMessages(
    conversation: AIConversationMessage[],
    message: string,
    images: string[] = [],
  ) {
    return [
      ...conversation.map((entry) => ({
        role: entry.sender === AIConversationSender.USER ? 'user' : 'assistant',
        content: [{ type: 'text', text: entry.content }],
      })),
      {
        role: 'user',
        content: [
          ...images.map((image) => ({
            type: 'image',
            mimeType: this.getMediaTypeFromImage(image),
            data: this.stripImageDataPrefix(image),
            text: '',
          })),
          { type: 'text', text: message },
        ],
      },
    ];
  }

  private pruneFailedConversationTurns(
    conversation: AIConversationMessage[],
  ): void {
    for (let i = 0; i < conversation.length; i++) {
      const msg = conversation[i];
      if (
        msg.sender === AIConversationSender.AI &&
        msg.content.startsWith('Something went wrong')
      ) {
        const startIndex = Math.max(i - 1, 0);
        const deleteCount = i === 0 ? 1 : 2;
        conversation.splice(startIndex, deleteCount);
        i = startIndex - 1;
      }
    }
  }

  private applyAssistantText(
    conversationID: string,
    messageIndex: number,
    content: string,
    tokenUsage?: AIConversationTokenUsage,
    date?: Date,
  ): void {
    const currentConversation = this.getConversation(conversationID);
    if (!currentConversation[messageIndex]) {
      return;
    }
    currentConversation[messageIndex] = {
      ...currentConversation[messageIndex],
      content,
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(date ? { date } : {}),
    };
    InterfaceController.notifyListeners(
      ListenEvent.newAIMessageArrived,
      currentConversation,
    );
  }

  private applyLastAIMessageError(
    conversationID: string,
    actionDescription: string,
    error: any,
  ): void {
    const currentConversation = this.getConversation(conversationID);
    const lastMessage = currentConversation[currentConversation.length - 1];
    if (lastMessage?.sender !== AIConversationSender.AI) {
      return;
    }

    lastMessage.content =
      `Something went wrong while ${actionDescription}: ` +
      this.getErrorMessage(error);
    InterfaceController.notifyListeners(
      ListenEvent.newAIMessageArrived,
      currentConversation,
    );
  }

  // Format Claude API messages consistently
  private formatAnthropicMessages(
    conversationMessages: AnthropicConversationMessage[],
    model: string,
    max_tokens: number,
    systemPrompt: string,
    options: Record<string, unknown> = {},
  ): string {
    const requestOptions = this.sanitizeRequestOptions(options, [
      'messages',
      'model',
      'max_tokens',
      'system',
      'stream',
      'tools',
    ]);
    return JSON.stringify({
      ...requestOptions,
      messages: conversationMessages,
      model: model,
      max_tokens,
      system: systemPrompt,
    });
  }

  private sanitizeRequestOptions(
    options: Record<string, unknown>,
    reservedKeys: string[],
  ): Record<string, unknown> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      return {};
    }
    const reserved = new Set(reservedKeys);
    return Object.fromEntries(
      Object.entries(options).filter(([key]) => !reserved.has(key)),
    );
  }

  public cancelCurrentRequest(conversationID: string) {
    this.awaitingResponseHash = '';
    this.requestAbortControllers[conversationID]?.abort();
    delete this.requestAbortControllers[conversationID];
    const myConvo = this.getConversation(conversationID);
    if (myConvo.length > 0) {
      myConvo.pop();
    }
    InterfaceController.notifyListeners(
      ListenEvent.newAIMessageArrived,
      myConvo,
    );
  }

  private getTextFromAnthropicContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return '';
    }

    return content
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n\n');
  }

  private buildConversationTokenUsage(
    inputTokens: number,
    outputTokens: number,
    cacheCreationInputTokens = 0,
    cacheReadInputTokens = 0,
  ): AIConversationTokenUsage | undefined {
    const totalTokens =
      inputTokens +
      outputTokens +
      cacheCreationInputTokens +
      cacheReadInputTokens;
    if (totalTokens <= 0) {
      return undefined;
    }

    return {
      inputTokens,
      outputTokens,
      ...(cacheCreationInputTokens > 0 ? { cacheCreationInputTokens } : {}),
      ...(cacheReadInputTokens > 0 ? { cacheReadInputTokens } : {}),
      totalTokens,
    };
  }

  private async sendAgenticMessage(
    conversationID: string,
    message: string,
    model: string,
    context: AIMessageContext,
    max_tokens: number,
    images?: string[],
  ): Promise<AIResponse> {
    let myConvo = this.getConversation(conversationID);
    this.pruneFailedConversationTurns(myConvo);
    const selectedNodeIdsAtSendTime = this.getSelectedNodeIds();
    const messageWithSelectedNodeIds = this.appendSelectedNodeIdsToMessage(
      message,
      selectedNodeIdsAtSendTime,
    );

    const systemPrompt = await this.getConversationStartInstructions();

    const performActions = context.performActions !== false;
    let apiText = message;
    apiText += this.getSelectedNodesContext();
    apiText += performActions
      ? '\n\nPerform actions: enabled. You may use mutation tools when the user asks you to change the graph.'
      : '\n\nPerform actions: disabled. Do not change the graph. Use inspection tools only and answer with guidance.';

    const messages = this.buildProviderMessages(myConvo, apiText, images);

    const sentDate = new Date();
    myConvo.push({
      content: messageWithSelectedNodeIds,
      sender: AIConversationSender.USER,
      date: sentDate,
    });
    this.conversations[conversationID] = myConvo;
    InterfaceController.notifyListeners(
      ListenEvent.newAIMessageArrived,
      myConvo,
    );

    const agentSpinnerLabel = 'AI agent working';
    InterfaceController.showSpinner(agentSpinnerLabel);
    TailrmadeMCPServer.getInstance().beginAgentTurn();

    try {
      this.awaitingResponseHash = hri.random();
      const sendingHash = this.awaitingResponseHash;
      const abortController = new AbortController();
      this.requestAbortControllers[conversationID]?.abort();
      this.requestAbortControllers[conversationID] = abortController;

      let assistantMessage = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      const assistantMessageIndex = myConvo.length;
      myConvo.push({
        content: '',
        sender: AIConversationSender.AI,
        date: new Date(),
      });
      this.conversations[conversationID] = myConvo;
      InterfaceController.notifyListeners(
        ListenEvent.newAIMessageArrived,
        myConvo,
      );

      const applyAssistantText = (
        content: string,
        tokenUsage?: AIConversationTokenUsage,
        date?: Date,
      ) => {
        this.applyAssistantText(
          conversationID,
          assistantMessageIndex,
          content,
          tokenUsage,
          date,
        );
      };

      let state: unknown;
      let pendingToolResults: AIProviderToolResult[] | undefined;
      let pendingMessage: string | undefined;
      const maxAgentTurns = 60;
      let toolCallCount = 0;
      let hasMutatedGraph = false;
      let checkedWarningsAndErrors = false;
      // Reveal the dashboard the moment the agent first touches a surface, so
      // the user watches the UI build live rather than only seeing the result.
      let revealedDashboard = false;
      const inspectionToolNames = new Set([
        'inspect_graph',
        'inspect_nodes',
        'inspect_selected_nodes',
        'inspect_warnings_and_errors',
        'describe_node',
        'list_available_nodes',
        'inspect_surface',
      ]);
      const inspectionToolCounts = new Map<string, number>();
      const tools = TailrmadeMCPServer.getInstance()
        .listTools()
        .filter((tool) => performActions || !MUTATION_TOOL_NAMES.has(tool.name))
        .map(({ name, description, input_schema }) => ({
          name,
          description,
          inputSchema: input_schema,
        }));

      for (let turn = 0; turn < maxAgentTurns; turn++) {
        const provider = getAIAgentProvider(model);
        const prepared = prepareAIProviderTurn({
          provider,
          model,
          systemPrompt,
          maxTokens: max_tokens,
          tools,
          ...(state ? { state } : { messages }),
          ...(pendingToolResults ? { toolResults: pendingToolResults } : {}),
          ...(pendingMessage ? { message: pendingMessage } : {}),
        });
        const res = await fetch(this.getAIRelayEndpoint(), {
          method: 'POST',
          headers: await this.getRequestHeaders(),
          body: JSON.stringify({ provider, body: prepared.body }),
          signal: abortController.signal,
        });

        const backendResponse = await res.json().catch(() => undefined);
        if (!res.ok) {
          this.showTokenLimitToastIfNeeded(backendResponse);
          throw new Error(
            backendResponse?.error?.message ||
              backendResponse?.error ||
              backendResponse?.details ||
              'AI provider request failed',
          );
        }

        if (this.awaitingResponseHash !== sendingHash) {
          console.log(
            'received response from AI but no longer interested in response so ignoring',
          );
          return {
            success: false,
            status: 499,
            error: 'AI request was cancelled',
          };
        }

        const providerData = backendResponse?.data ?? backendResponse;
        const turnResponse = parseAIProviderTurn(
          provider,
          providerData,
          prepared.state,
        );
        state = turnResponse.state;
        pendingToolResults = undefined;
        pendingMessage = undefined;
        const usage = turnResponse.usage;
        if (Number.isFinite(Number(usage?.inputTokens))) {
          inputTokens += Number(usage?.inputTokens);
        }
        if (Number.isFinite(Number(usage?.outputTokens))) {
          outputTokens += Number(usage?.outputTokens);
        }
        if (Number.isFinite(Number(usage?.cacheCreationInputTokens))) {
          cacheCreationInputTokens += Number(usage?.cacheCreationInputTokens);
        }
        if (Number.isFinite(Number(usage?.cacheReadInputTokens))) {
          cacheReadInputTokens += Number(usage?.cacheReadInputTokens);
        }

        const textDelta = turnResponse.text;
        if (textDelta) {
          assistantMessage += assistantMessage ? `\n\n${textDelta}` : textDelta;
          applyAssistantText(assistantMessage);
        }

        const toolUses = turnResponse.toolCalls || [];
        if (toolUses.length === 0) {
          if (hasMutatedGraph && !checkedWarningsAndErrors) {
            assistantMessage +=
              '\n\n*Checking graph warnings and errors before finishing...*';
            applyAssistantText(assistantMessage);

            const result = await TailrmadeMCPServer.getInstance().callTool(
              'inspect_warnings_and_errors',
              {},
            );
            checkedWarningsAndErrors = true;

            pendingMessage =
              `Final MCP warnings/errors inspection result: ${result.content}\n\n` +
              'Use this inspection result before giving your final answer. If warnings or errors remain, either fix them with tools or clearly report them.';
            continue;
          }
          break;
        }

        const toolResults: AIProviderToolResult[] = [];
        for (const toolUse of toolUses) {
          toolCallCount++;
          const toolName = String(toolUse.name || 'unknown_tool');
          if (MUTATION_TOOL_NAMES.has(toolName)) {
            hasMutatedGraph = true;
          }
          const touchedSurfaceId = this.getTouchedSurfaceId(toolUse);
          if (touchedSurfaceId) {
            if (!revealedDashboard) {
              revealedDashboard = true;
              InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.OPEN);
            }
            // Always bring the surface currently being edited to the front, so
            // with multiple surfaces the user watches the one being built.
            if (!InterfaceController.showEmbeddedSurface(touchedSurfaceId)) {
              InterfaceController.showSurface(touchedSurfaceId);
            }
          }
          if (toolName === 'inspect_warnings_and_errors') {
            checkedWarningsAndErrors = true;
          }
          const isInspectionTool = inspectionToolNames.has(toolName);
          if (isInspectionTool) {
            inspectionToolCounts.set(
              toolName,
              (inspectionToolCounts.get(toolName) || 0) + 1,
            );
          } else {
            assistantMessage += `\n\n*Using ${toolName}...*`;
            applyAssistantText(assistantMessage);
          }

          const result = await TailrmadeMCPServer.getInstance().callTool(
            toolName,
            toolUse.arguments || {},
          );
          toolResults.push({
            callId: toolUse.id,
            name: toolName,
            content: result.content,
            isError: result.is_error,
          });

          if (result.is_error || !isInspectionTool) {
            assistantMessage += result.is_error
              ? `\n*${toolName} failed: ${result.content}*`
              : `\n*Used ${toolName}.*`;
            applyAssistantText(assistantMessage);
          }
        }

        pendingToolResults = toolResults;
      }

      if (toolCallCount > 0) {
        const inspectionSummary = Array.from(inspectionToolCounts.entries())
          .map(
            ([toolName, count]) =>
              `${toolName}${count > 1 ? ` x${count}` : ''}`,
          )
          .join(', ');
        assistantMessage +=
          `\n\n*Completed ${toolCallCount} MCP tool call(s).` +
          (inspectionSummary ? ` Inspections: ${inspectionSummary}.` : '') +
          '*';
        applyAssistantText(assistantMessage);
      }

      if (pendingToolResults?.length) {
        assistantMessage += `\n\nStopped after reaching the MCP turn limit (${maxAgentTurns}) for this request.`;
        applyAssistantText(assistantMessage);
      }

      const tokenUsage = this.buildConversationTokenUsage(
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
      );
      // Stamp the message's date to now, the moment the agentic run actually
      // finishes - it was pushed with the request's *start* time up above,
      // which otherwise remains stuck next to the (only-now-final) token
      // count and content, misrepresenting how long the run took.
      applyAssistantText(assistantMessage, tokenUsage, new Date());

      const tokensUsed = tokenUsage?.totalTokens || 0;
      this.logAIUsage(getAIAgentProvider(model), model, tokensUsed);

      void PPGraph.getCurrentGraph().notifyUserDataChanged(false);
      delete this.requestAbortControllers[conversationID];
      return {
        success: true,
        data: {
          content: [{ type: 'text', text: assistantMessage }],
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_creation_input_tokens: cacheCreationInputTokens,
            cache_read_input_tokens: cacheReadInputTokens,
          },
        },
        status: 200,
      };
    } catch (error) {
      delete this.requestAbortControllers[conversationID];
      this.applyLastAIMessageError(
        conversationID,
        'running the AI agent',
        error,
      );
      return this.buildFailedAIResponse(error);
    } finally {
      // runs even on abort/error so whatever the AI created this turn still
      // gets tidied up; isolated try/catch so a layout failure here can never
      // mask the real result/error above
      try {
        await TailrmadeMCPServer.getInstance().finishAgentTurn();
      } catch (layoutError) {
        console.error('finishAgentTurn failed', layoutError);
      }
      InterfaceController.hideSpinner(agentSpinnerLabel);
    }
  }

  public async sendMessageClaude(
    conversationID: string,
    message: string, // Just the text prompt
    model: string,
    context: AIMessageContext,
    retainConvo = true,
    max_tokens: number = 16384,
    images?: string[], // Optional array of base64 image strings
    agentic = retainConvo,
    options: Record<string, unknown> = {},
  ): Promise<AIResponse> {
    if (!this.canUseAI()) {
      InterfaceController.showSnackBar(
        'You need to be logged in to use AI features',
      );
      return {
        success: false,
        status: 401,
        error: 'You need to be logged in to use AI features',
      };
    }

    if (agentic) {
      return this.sendAgenticMessage(
        conversationID,
        message,
        model,
        context,
        max_tokens,
        images,
      );
    }

    let myConvo = this.getConversation(conversationID);
    // when sending a new message, filter out error messages that might have come from before
    this.pruneFailedConversationTurns(myConvo);
    const selectedNodeIdsAtSendTime = this.getSelectedNodeIds();
    const messageWithSelectedNodeIds = this.appendSelectedNodeIdsToMessage(
      message,
      selectedNodeIdsAtSendTime,
    );

    const convo: AnthropicConversationMessage[] =
      this.conversationToAnthropicMessages(myConvo);

    let systemPrompt = '';

    if (retainConvo) {
      systemPrompt += await this.getConversationStartInstructions();
    }

    // Build API text: include selected node IDs/context so the AI sees current state with each message
    let apiText = message;
    if (retainConvo) {
      apiText += this.getSelectedNodesContext();
    }

    console.log('sysPrompt: ' + systemPrompt);

    const sentDate = new Date();

    const messageContent = this.buildAnthropicMessageContent(apiText, images);

    const newMessage: AnthropicConversationMessage = {
      role: 'user',
      content: messageContent,
    };

    const myNewMessage = {
      content: messageWithSelectedNodeIds,
      sender: AIConversationSender.USER,
      date: sentDate,
    };

    if (retainConvo) {
      myConvo.push(myNewMessage);
      this.conversations[conversationID] = myConvo;
      InterfaceController.notifyListeners(
        ListenEvent.newAIMessageArrived,
        myConvo,
      );
    }

    // Add the new message to the conversation
    convo.push(newMessage);

    // Format the messages for the Claude API (include tools if enabled)
    const finalBody = this.formatAnthropicMessages(
      convo,
      model,
      max_tokens,
      systemPrompt,
      options,
    );

    try {
      this.awaitingResponseHash = hri.random();
      const sendingHash = this.awaitingResponseHash;
      const abortController = new AbortController();
      this.requestAbortControllers[conversationID]?.abort();
      this.requestAbortControllers[conversationID] = abortController;

      let assistantMessage = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      let stopReason: string | undefined;
      const assistantMessageIndex = myConvo.length;
      const AIMessage: AIConversationMessage = {
        content: '',
        sender: AIConversationSender.AI,
        date: new Date(),
      };

      if (retainConvo) {
        myConvo.push(AIMessage);
        this.conversations[conversationID] = myConvo;
        InterfaceController.notifyListeners(
          ListenEvent.newAIMessageArrived,
          myConvo,
        );
      }

      const res = await fetch(
        this.isLocalAI()
          ? `${LOCAL_COMPANION_AI_BASE_URL}/claude-stream`
          : BackendGateway.getInstance().getClaudeStreamEndpoint(),
        {
          method: 'POST',
          headers: await this.getRequestHeaders(),
          body: finalBody,
          signal: abortController.signal,
        },
      );

      if (!res.ok) {
        const backendResponse = await res.json().catch(() => undefined);
        this.showTokenLimitToastIfNeeded(backendResponse);
        throw new Error(
          backendResponse?.error ||
            backendResponse?.details ||
            'Claude API request failed',
        );
      }

      if (this.awaitingResponseHash !== sendingHash) {
        console.log(
          'received response from AI but no longer interested in response so ignoring',
        );
        return {
          success: false,
          status: 499,
          error: 'AI request was cancelled',
        };
      }

      if (!res.body) {
        throw new Error('Claude stream returned an empty response');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const applyAssistantText = (
        content: string,
        tokenUsage?: AIConversationTokenUsage,
        date?: Date,
      ) => {
        if (!retainConvo) {
          return;
        }
        this.applyAssistantText(
          conversationID,
          assistantMessageIndex,
          content,
          tokenUsage,
          date,
        );
      };

      const handleStreamEvent = (event: any) => {
        const usage = event?.message?.usage || event?.usage;
        if (Number.isFinite(Number(usage?.input_tokens))) {
          inputTokens = Math.max(inputTokens, Number(usage.input_tokens));
        }
        if (Number.isFinite(Number(usage?.output_tokens))) {
          outputTokens = Math.max(outputTokens, Number(usage.output_tokens));
        }
        if (Number.isFinite(Number(usage?.cache_creation_input_tokens))) {
          cacheCreationInputTokens = Math.max(
            cacheCreationInputTokens,
            Number(usage.cache_creation_input_tokens),
          );
        }
        if (Number.isFinite(Number(usage?.cache_read_input_tokens))) {
          cacheReadInputTokens = Math.max(
            cacheReadInputTokens,
            Number(usage.cache_read_input_tokens),
          );
        }

        if (event?.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            assistantMessage += delta.text;
            applyAssistantText(assistantMessage);
          }
        }

        if (
          event?.type === 'message_delta' &&
          typeof event?.delta?.stop_reason === 'string'
        ) {
          stopReason = event.delta.stop_reason;
        }

        if (event?.type === 'error') {
          throw new Error(event?.error?.message || 'Claude stream failed');
        }
      };

      const readBufferedEvents = (isFinal = false) => {
        const eventStrings = buffer.split(/\r?\n\r?\n/);
        buffer = isFinal ? '' : eventStrings.pop() || '';

        for (const eventString of eventStrings) {
          const dataLines = eventString
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());

          for (const data of dataLines) {
            if (!data || data === '[DONE]') {
              continue;
            }

            handleStreamEvent(JSON.parse(data));
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        readBufferedEvents();
      }

      buffer += decoder.decode();
      readBufferedEvents(true);

      const tokenUsage = this.buildConversationTokenUsage(
        inputTokens,
        outputTokens,
        cacheCreationInputTokens,
        cacheReadInputTokens,
      );
      // Same fix as the agentic path: stamp the message's date to the
      // moment the stream actually finishes, not the request's start time.
      applyAssistantText(assistantMessage, tokenUsage, new Date());

      const tokensUsed = tokenUsage?.totalTokens || 0;
      this.logAIUsage('claude', model, tokensUsed);

      void PPGraph.getCurrentGraph().notifyUserDataChanged(false);
      delete this.requestAbortControllers[conversationID];
      return {
        success: true,
        data: {
          content: [{ type: 'text', text: assistantMessage }],
          stop_reason: stopReason,
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_creation_input_tokens: cacheCreationInputTokens,
            cache_read_input_tokens: cacheReadInputTokens,
          },
        },
        status: 200,
      };
    } catch (error) {
      delete this.requestAbortControllers[conversationID];
      if (retainConvo) {
        this.applyLastAIMessageError(
          conversationID,
          'streaming the AI response',
          error,
        );
      }
      return this.buildFailedAIResponse(error);
    }
  }

  private async sendNormalizedMessage(
    provider: AIProvider,
    conversationID: string,
    message: string,
    model: string,
    retainConvo: boolean,
    maxTokens: number,
    images?: string[],
    options: Record<string, unknown> = {},
  ): Promise<AIResponse> {
    if (!this.canUseAI()) {
      return {
        success: false,
        status: 401,
        error: 'You need to be logged in to use AI features',
      };
    }
    const conversation = retainConvo
      ? this.getConversation(conversationID)
      : [];
    const messages = this.buildProviderMessages(conversation, message, images);
    try {
      const prepared = prepareAIProviderTurn({
        provider,
        model,
        maxTokens,
        messages,
        options,
      });
      const response = await fetch(this.getAIRelayEndpoint(), {
        method: 'POST',
        headers: await this.getRequestHeaders(),
        body: JSON.stringify({ provider, body: prepared.body }),
      });
      const payload = await response.json();
      if (!response.ok) {
        this.showTokenLimitToastIfNeeded(payload);
        throw new Error(
          payload?.details || payload?.error || 'AI request failed',
        );
      }
      const responseData = payload?.data ?? payload;
      const turn = parseAIProviderTurn(provider, responseData, prepared.state);
      if (retainConvo) {
        conversation.push(
          {
            sender: AIConversationSender.USER,
            content: message,
            date: new Date(),
          },
          {
            sender: AIConversationSender.AI,
            content: turn.text,
            date: new Date(),
          },
        );
        this.conversations[conversationID] = conversation;
      }
      const usage = turn.usage;
      this.logAIUsage(
        provider,
        model,
        (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0),
      );
      return {
        success: true,
        status: 200,
        data: images?.length
          ? responseData
          : { content: [{ type: 'text', text: turn.text }] },
      };
    } catch (error) {
      return this.buildFailedAIResponse(error);
    }
  }

  public sendAIMessage(
    provider: AIProvider,
    conversationID: string,
    message: string,
    model: string,
    retainConvo = false,
    options: Record<string, unknown> = {},
    images?: string[],
  ): Promise<AIResponse> {
    const maxTokens = Number(options.max_tokens) || 4096;
    if (provider !== 'claude') {
      return this.sendNormalizedMessage(
        provider,
        conversationID,
        message,
        model,
        retainConvo,
        maxTokens,
        images,
        options,
      );
    }
    return this.sendMessageClaude(
      conversationID,
      message,
      model,
      {},
      retainConvo,
      maxTokens,
      images,
      false,
      options,
    );
  }

  // Helper method to extract media type from base64 image
  private getMediaTypeFromImage(dataUrl: string): string {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : 'image/png'; // default to png if no match
  }

  // Returns the id of the surface a tool call makes content appear on, or null.
  // We reveal/switch the dashboard only when a widget actually lands on a
  // surface - not when the surface node is merely created or set as default -
  // because the agent scaffolds the surface up front and wires widgets in only
  // later, which would otherwise reveal an empty dashboard. set_surface_layout
  // auto-connects its widgets, and connect_sockets into a surface places one.
  private getTouchedSurfaceId(
    toolUse: AIProviderTurn['toolCalls'][number],
  ): string | null {
    const name = String(toolUse.name || '');
    const input = (toolUse.arguments ?? {}) as any;
    if (name === 'set_surface_layout') {
      return typeof input.node_id === 'string' ? input.node_id : null;
    }
    if (name === 'connect_sockets') {
      const toNode = String(input.to_node ?? '');
      return PPGraph.currentGraph.nodes[toNode]?.isSurface() ? toNode : null;
    }
    return null;
  }

  async getConversationStartInstructions(): Promise<string> {
    // This stable prompt is cached by providers that support prompt caching.
    // Keep workflow rules here, tool semantics in tool descriptions, and
    // node-specific guidance in getAIDocs (fetched through describe_node).
    const nodeCatalogue = await getAINodesCompactList();
    const instructions = `You help users build tailrmade projects. tailrmade is a node-based app builder combining pre-made nodes with custom JavaScript and HTML. Answer questions or edit projects as requested.

## General Instructions:
1. Use describe_node before using an unfamiliar node type, especially one marked [docs].
2. Build UIs from widget nodes wired into a "UI surface" node. Call describe_node for "UI surface" first for layout, navigation, and multi-page guidance.
3. Use "CustomFunction" for custom JavaScript when no dedicated node fits, and "HTTP" for API data.
4. Keep responses concise.

## Agentic Graph Editing:
Use the browser-local MCP tools to inspect and edit the live graph. Use them when the user requests changes. Do not emit JSON action blocks or claim planned actions are complete.

### Tool Rules:
1. Inspect graph data instead of asking the user to provide it. Use inspect_selected_nodes or inspect_graph to find nodes, then inspect_nodes when details matter.
2. Tool calls in one response execute in the order listed. The add_node tool description gives the highest existing ai-node number and the next safe ID. Start with that next ID and increment it for each additional node in the same response. In that same response, put add_node before any set_node_name, set_node_comment, set_socket_value, or connect_sockets calls that use its ID; do not wait for add_node's result. Put structure-changing socket values before calls that use the sockets they create.
3. Add brief comments to CustomFunction and other non-obvious nodes. Share repeated values through one Constant node.
4. After using any mutation tool and before saying the task is complete, call inspect_warnings_and_errors. If warnings or errors remain, fix them when possible or clearly report what remains.

## Available Node Types
Each line is key (Name): description. [docs] marks extra AI documentation.
${nodeCatalogue}
`;

    return instructions;
  }

  getContextFromObject(object: any): any {
    return this.toAIContextValue(object);
  }

  private toAIContextValue(
    value: unknown,
    depth = 0,
    seen = new WeakSet<object>(),
  ): unknown {
    if (typeof value === 'string') {
      return truncateStringForAIContext(value);
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'function' || typeof value === 'symbol') {
      return `[${typeof value}]`;
    }

    if (typeof value !== 'object') {
      return String(value);
    }

    if (seen.has(value)) {
      return '[Circular reference]';
    }

    const constructorName = value.constructor?.name || 'Object';
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (ArrayBuffer.isView(value)) {
      return {
        type: constructorName,
        length: value.byteLength,
      };
    }

    if (value instanceof ArrayBuffer) {
      return {
        type: 'ArrayBuffer',
        length: value.byteLength,
      };
    }

    if (depth >= 5) {
      return `[${constructorName} truncated at depth limit]`;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      const items = value
        .slice(0, 20)
        .map((entry) => this.toAIContextValue(entry, depth + 1, seen));
      if (value.length > 20) {
        items.push(`... (${value.length - 20} more items)`);
      }
      return items;
    }

    if (value instanceof Map) {
      return {
        type: 'Map',
        entries: Array.from(value.entries())
          .slice(0, 20)
          .map(([key, entryValue]) => [
            this.toAIContextValue(key, depth + 1, seen),
            this.toAIContextValue(entryValue, depth + 1, seen),
          ]),
      };
    }

    if (value instanceof Set) {
      return {
        type: 'Set',
        values: Array.from(value.values())
          .slice(0, 20)
          .map((entry) => this.toAIContextValue(entry, depth + 1, seen)),
      };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        type: constructorName,
        summary: String(value),
      };
    }

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, entryValue]) => [
          key,
          this.toAIContextValue(entryValue, depth + 1, seen),
        ]),
    );
  }

  private getSocketDataForAIContext(socket: any): unknown {
    try {
      return this.toAIContextValue(
        socket.dataType.prepareDataForSaving(socket.data),
      );
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Could not prepare socket data for AI context',
        raw_data: this.toAIContextValue(socket.data),
      };
    }
  }

  private getSelectedNodeIds(): string[] {
    return PPGraph.currentGraph.selection.selectedNodes.map((node) => node.id);
  }

  private appendSelectedNodeIdsToMessage(
    message: string,
    selectedNodeIds: string[],
  ): string {
    return `${message}\n\nSelected node IDs at send time: ${
      selectedNodeIds.length > 0 ? selectedNodeIds.join(', ') : '(none)'
    }`;
  }

  getSelectedNodesContext(): string {
    const selectedNodes = PPGraph.currentGraph.selection.selectedNodes;
    const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
    const links = selectedNodes.flatMap((node) =>
      node
        .getAllInputSockets()
        .filter((socket) => socket.hasLink())
        .map((socket) => socket.links[0])
        .filter((link) => selectedNodeIds.has(link.getSource().getNode().id))
        .map((link) => ({
          sourceNodeId: link.getSource().getNode().id,
          sourceSocketName: link.getSource().name,
          targetNodeId: link.getTarget().getNode().id,
          targetSocketName: link.getTarget().name,
        })),
    );

    const data = {
      selected_node_ids: Array.from(selectedNodeIds),
      nodes: selectedNodes.map((node) => ({
        id: node.id,
        name: node.getName(),
        type: node.type,
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: Math.round(node.nodeWidth),
        height: Math.round(node.nodeHeight),
        comment: node.comment || undefined,
        sockets: node.getAllSockets().map((socket) => ({
          name: socket.name,
          socket_type: socket.socketType,
          data_type: socket.dataType.getName(),
          visible: socket.visible,
          has_link: socket.hasLink(),
          links: socket.links.map((link) => ({
            sourceNodeId: link.getSource().getNode().id,
            sourceSocketName: link.getSource().name,
            targetNodeId: link.getTarget().getNode().id,
            targetSocketName: link.getTarget().name,
          })),
          data: this.getSocketDataForAIContext(socket),
        })),
      })),
      links,
    };

    return (
      '\n\nSelected nodes and links between them in AI-safe form (large data may be truncated; runtime-only values may be summarized):\n' +
      JSON.stringify(data)
    );
  }
}
