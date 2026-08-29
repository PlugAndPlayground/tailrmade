import type { AIProvider } from './aiModels';

export interface AIProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** A base64 image the next user message should carry. */
export interface AIProviderAttachment {
  mimeType: string;
  data: string;
}

export interface AIProviderToolResult {
  callId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export interface AIProviderTurnRequest {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  messages?: any[];
  tools?: AIProviderTool[];
  state?: any;
  toolResults?: AIProviderToolResult[];
  message?: string;
  /** images to send with `message`, in the provider's own content shape */
  attachments?: AIProviderAttachment[];
  options?: Record<string, unknown>;
}

export interface AIProviderTurn {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  stopReason: string;
  state: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
}

export interface PreparedAIProviderTurn {
  body: Record<string, unknown>;
  state: any;
}

const count = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const joinTextParts = (parts: any[], type?: string) =>
  parts
    .filter(
      (part) => (!type || part.type === type) && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n\n');

const parseArguments = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'string')
    return (value || {}) as Record<string, unknown>;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const options = (request: AIProviderTurnRequest, reserved: string[]) =>
  Object.fromEntries(
    Object.entries(request.options || {}).filter(
      ([name]) => !reserved.includes(name),
    ),
  );

const imageUrl = (part: any) => `data:${part.mimeType};base64,${part.data}`;

/**
 * Marks a message the app injected to show the model what it just built, so a
 * later turn can find the stale ones again. It is a visible prefix rather than
 * a side channel because the state array is handed straight to the provider -
 * anything not part of the wire format would be rejected.
 */
export const VISION_NOTE_PREFIX = '[ui-capture]';

/**
 * Strips the images out of earlier injected captures, leaving their note.
 *
 * The agent loop resends its whole message array every turn, so without this a
 * long UI-building run would re-upload every screenshot it ever took on every
 * one of up to sixty turns. Only the newest capture still shows the app; the
 * older notes stay so the model can see that it did look, and when.
 */
export const withoutVisionImages = (
  items: any[],
  isImage: (part: any) => boolean,
  key: 'content' | 'parts' = 'content',
): any[] =>
  items.map((item) => {
    const parts = item?.[key];
    if (!Array.isArray(parts) || !parts.some(isImage)) {
      return item;
    }
    const note = parts.find(
      (part) =>
        typeof part?.text === 'string' &&
        part.text.startsWith(VISION_NOTE_PREFIX),
    );
    if (!note) {
      return item;
    }
    return {
      ...item,
      [key]: parts
        .filter((part) => !isImage(part))
        .map((part) =>
          part === note
            ? {
                ...part,
                text: `${part.text}\n(Image dropped from context: a newer capture has replaced it.)`,
              }
            : part,
        ),
    };
  });

const anthropicImage = (part: any) => ({
  type: 'image',
  source: { type: 'base64', media_type: part.mimeType, data: part.data },
});
const openAIImage = (part: any) => ({
  type: 'input_image',
  image_url: imageUrl(part),
});
const kimiImage = (part: any) => ({
  type: 'image_url',
  image_url: { url: imageUrl(part) },
});
const geminiImage = (part: any) => ({
  inlineData: { mimeType: part.mimeType, data: part.data },
});

const isAnthropicImage = (part: any) => part?.type === 'image';
const isOpenAIImage = (part: any) => part?.type === 'input_image';
const isKimiImage = (part: any) => part?.type === 'image_url';
const isGeminiImage = (part: any) => part?.inlineData !== undefined;

const mapMessages = (
  messages: any[],
  image: (part: any) => unknown,
  text: (part: any) => unknown,
  role = (value: string) => value,
) =>
  messages.map((message) => ({
    role: role(message.role),
    content: (message.content || []).map((part: any) =>
      part.type === 'image' ? image(part) : text(part),
    ),
  }));

const anthropicTools = (tools: AIProviderTool[]) =>
  tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    input_schema: inputSchema,
  }));

const openAITools = (tools: AIProviderTool[]) =>
  tools.map(({ name, description, inputSchema }) => ({
    type: 'function',
    name,
    description,
    parameters: inputSchema,
  }));

function buildAnthropic(
  request: AIProviderTurnRequest,
): PreparedAIProviderTurn {
  const usePromptCache = Boolean(request.tools?.length);
  let messages = request.state?.messages
    ? [...request.state.messages]
    : mapMessages(request.messages || [], anthropicImage, (part) => ({
        type: 'text',
        text: part.text || '',
      }));
  if (request.attachments?.length) {
    messages = withoutVisionImages(messages, isAnthropicImage);
  }
  // One user turn carrying, in this order: every tool_result for the calls
  // just made (they have to lead the turn that answers them), then the capture
  // and its note. Merging rather than sending two user messages keeps the turn
  // structure explicit instead of leaning on the api folding them together.
  const followUp = [
    ...(request.toolResults || []).map((result) => ({
      type: 'tool_result',
      tool_use_id: result.callId,
      content: result.content,
      is_error: result.isError,
    })),
    ...(request.attachments || []).map(anthropicImage),
    // an empty text block is rejected outright, so only send a real one
    ...(request.message ? [{ type: 'text', text: request.message }] : []),
  ];
  if (followUp.length) {
    messages.push({ role: 'user', content: followUp });
  }
  return {
    state: { messages },
    body: {
      ...options(request, [
        'model',
        'system',
        'max_tokens',
        'messages',
        'tools',
        'stream',
      ]),
      model: request.model,
      system: usePromptCache
        ? [
            {
              type: 'text',
              text: request.systemPrompt || '',
              cache_control: { type: 'ephemeral' },
            },
          ]
        : request.systemPrompt || '',
      max_tokens: request.maxTokens || 16384,
      messages,
      ...(request.tools?.length
        ? { tools: anthropicTools(request.tools) }
        : {}),
      // Let Anthropic place a cache breakpoint on the last cacheable block on
      // every agent turn. The system marker above also keeps the stable tools
      // and system-prompt prefix reusable across separate conversations.
      ...(usePromptCache ? { cache_control: { type: 'ephemeral' } } : {}),
    },
  };
}

function buildOpenAI(request: AIProviderTurnRequest): PreparedAIProviderTurn {
  let input = request.state?.input
    ? [...request.state.input]
    : mapMessages(request.messages || [], openAIImage, (part) => ({
        type: 'input_text',
        text: part.text || '',
      }));
  for (const result of request.toolResults || []) {
    input.push({
      type: 'function_call_output',
      call_id: result.callId,
      output: result.content,
    });
  }
  // function_call_output takes a string, so an image that answers a tool call
  // rides in the user message just behind it instead
  if (request.attachments?.length) {
    input = withoutVisionImages(input, isOpenAIImage);
    input.push({
      role: 'user',
      content: [
        ...request.attachments.map(openAIImage),
        ...(request.message
          ? [{ type: 'input_text', text: request.message }]
          : []),
      ],
    });
  } else if (request.message) {
    input.push({ role: 'user', content: request.message });
  }
  return {
    state: { input },
    body: {
      ...options(request, [
        'model',
        'instructions',
        'max_output_tokens',
        'max_tokens',
        'input',
        'tools',
        'store',
        'stream',
      ]),
      model: request.model,
      instructions: request.systemPrompt || '',
      max_output_tokens: request.maxTokens || 16384,
      input,
      ...(request.tools?.length ? { tools: openAITools(request.tools) } : {}),
      store: false,
    },
  };
}

function buildKimi(request: AIProviderTurnRequest): PreparedAIProviderTurn {
  let messages = request.state?.messages
    ? [...request.state.messages]
    : [
        ...(request.systemPrompt
          ? [{ role: 'system', content: request.systemPrompt }]
          : []),
        ...mapMessages(request.messages || [], kimiImage, (part) => ({
          type: 'text',
          text: part.text || '',
        })),
      ];
  for (const result of request.toolResults || []) {
    messages.push({
      role: 'tool',
      tool_call_id: result.callId,
      content: result.content,
    });
  }
  if (request.attachments?.length) {
    messages = withoutVisionImages(messages, isKimiImage);
    messages.push({
      role: 'user',
      content: [
        ...request.attachments.map(kimiImage),
        ...(request.message ? [{ type: 'text', text: request.message }] : []),
      ],
    });
  } else if (request.message) {
    messages.push({ role: 'user', content: request.message });
  }
  const tools = openAITools(request.tools || []).map(
    ({ type, ...definition }) => ({ type, function: definition }),
  );
  return {
    state: { messages },
    body: {
      ...options(request, [
        'model',
        'messages',
        'tools',
        'max_tokens',
        'max_completion_tokens',
        'stream',
      ]),
      model: request.model,
      messages,
      ...(tools.length ? { tools } : {}),
      max_completion_tokens: request.maxTokens || 16384,
    },
  };
}

function buildGemini(request: AIProviderTurnRequest): PreparedAIProviderTurn {
  let contents = request.state?.contents
    ? [...request.state.contents]
    : mapMessages(
        request.messages || [],
        geminiImage,
        (part) => ({ text: part.text || '' }),
        (role) => (role === 'assistant' ? 'model' : 'user'),
      ).map(({ role, content }) => ({ role, parts: content }));
  if (request.attachments?.length) {
    contents = withoutVisionImages(contents, isGeminiImage, 'parts');
  }
  // functionResponse carries no inline data of its own, but a part list can
  // hold both, so the capture rides in the same user turn as the responses
  const followUp = [
    ...(request.toolResults || []).map((result) => ({
      functionResponse: {
        ...(result.callId.startsWith('gemini-') ? {} : { id: result.callId }),
        name: result.name,
        response: { output: result.content, isError: !!result.isError },
      },
    })),
    ...(request.attachments || []).map(geminiImage),
    ...(request.message ? [{ text: request.message }] : []),
  ];
  if (followUp.length) {
    contents.push({ role: 'user', parts: followUp });
  }
  return {
    state: { contents },
    body: {
      model: request.model,
      contents,
      systemInstruction: request.systemPrompt
        ? { parts: [{ text: request.systemPrompt }] }
        : undefined,
      ...(request.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: request.tools.map(
                  ({ name, description, inputSchema }) => ({
                    name,
                    description,
                    parameters: inputSchema,
                  }),
                ),
              },
            ],
          }
        : {}),
      generationConfig: {
        ...(contents.some((content: any) =>
          content.parts?.some((part: any) => part.inlineData),
        )
          ? { responseModalities: ['TEXT', 'IMAGE'] }
          : {}),
        ...options(request, [
          'model',
          'contents',
          'config',
          'generationConfig',
          'max_tokens',
          'maxOutputTokens',
        ]),
        maxOutputTokens: request.maxTokens || 16384,
      },
    },
  };
}

export function prepareAIProviderTurn(
  request: AIProviderTurnRequest,
): PreparedAIProviderTurn {
  switch (request.provider) {
    case 'claude':
    case 'deepseek':
      return buildAnthropic(request);
    case 'openai':
      return buildOpenAI(request);
    case 'kimi':
      return buildKimi(request);
    case 'gemini':
      return buildGemini(request);
  }
}

export function parseAIProviderTurn(
  provider: AIProvider,
  data: any,
  state: any,
): AIProviderTurn {
  if (provider === 'claude' || provider === 'deepseek') {
    const content = Array.isArray(data.content) ? data.content : [];
    state.messages.push({ role: 'assistant', content });
    return {
      text: joinTextParts(content, 'text'),
      toolCalls: content
        .filter((part: any) => part.type === 'tool_use')
        .map((part: any) => ({
          id: part.id,
          name: part.name,
          arguments: part.input || {},
        })),
      stopReason: data.stop_reason || 'complete',
      state,
      usage: {
        inputTokens: count(data.usage?.input_tokens),
        outputTokens: count(data.usage?.output_tokens),
        cacheCreationInputTokens: count(
          data.usage?.cache_creation_input_tokens,
        ),
        cacheReadInputTokens: count(data.usage?.cache_read_input_tokens),
      },
    };
  }

  if (provider === 'openai') {
    const output = Array.isArray(data.output) ? data.output : [];
    state.input.push(...output);
    const cached = count(data.usage?.input_tokens_details?.cached_tokens);
    return {
      text: joinTextParts(
        output.flatMap((item: any) => item.content || []),
        'output_text',
      ),
      toolCalls: output
        .filter((item: any) => item.type === 'function_call')
        .map((item: any) => ({
          id: item.call_id,
          name: item.name,
          arguments: parseArguments(item.arguments),
        })),
      stopReason: data.status || 'complete',
      state,
      usage: {
        inputTokens: Math.max(count(data.usage?.input_tokens) - cached, 0),
        outputTokens: count(data.usage?.output_tokens),
        cacheReadInputTokens: cached,
      },
    };
  }

  if (provider === 'kimi') {
    const choice = data.choices?.[0] || {};
    const message = choice.message || {};
    state.messages.push(message);
    const cached = count(
      data.usage?.cached_tokens ??
        data.usage?.prompt_tokens_details?.cached_tokens,
    );
    return {
      text: message.content || '',
      toolCalls: (message.tool_calls || []).map((call: any) => ({
        id: call.id,
        name: call.function?.name,
        arguments: parseArguments(call.function?.arguments),
      })),
      stopReason: choice.finish_reason || 'complete',
      state,
      usage: {
        inputTokens: Math.max(count(data.usage?.prompt_tokens) - cached, 0),
        outputTokens: count(data.usage?.completion_tokens),
        cacheReadInputTokens: cached,
      },
    };
  }

  const content = data.candidates?.[0]?.content || {
    role: 'model',
    parts: [],
  };
  state.contents.push(content);
  const parts = content.parts || [];
  return {
    text: joinTextParts(parts),
    toolCalls: parts
      .filter((part: any) => part.functionCall)
      .map((part: any, index: number) => ({
        id: part.functionCall.id || `gemini-${state.contents.length}-${index}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      })),
    stopReason: data.candidates?.[0]?.finishReason || 'complete',
    state,
    usage: {
      inputTokens: count(data.usageMetadata?.promptTokenCount),
      outputTokens:
        count(data.usageMetadata?.candidatesTokenCount) +
        count(data.usageMetadata?.thoughtsTokenCount),
    },
  };
}
