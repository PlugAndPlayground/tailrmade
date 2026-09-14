export type AIProvider = 'claude' | 'deepseek' | 'gemini' | 'openai' | 'kimi';

export interface AIModelDefinition {
  value: string;
  label: string;
  generatesImages?: boolean;
  maxOutputTokens?: number;
}

export interface AIProviderDefinition {
  value: AIProvider;
  label: string;
  defaultModel: string;
  supportsAgent: boolean;
  models: AIModelDefinition[];
  extractResponseText: (data: unknown) => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function joinTextParts(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) =>
      isRecord(part) && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}

function extractContentResponseText(data: unknown): string {
  return isRecord(data) ? joinTextParts(data.content) : '';
}

function extractGeminiResponseText(data: unknown): string {
  if (!isRecord(data)) return '';
  const normalized = joinTextParts(data.content);
  if (normalized) return normalized;
  if (!Array.isArray(data.candidates)) return '';
  const firstCandidate = data.candidates[0];
  if (!isRecord(firstCandidate) || !isRecord(firstCandidate.content)) return '';
  return joinTextParts(firstCandidate.content.parts);
}

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_MODEL_GEMINI = 'gemini-3.8-flash';
export const DEEPSEEK_V4_PRO_MODEL = 'deepseek-v4-pro';
export const DEFAULT_MODEL_OPENAI = 'gpt-5.6-sol';
export const DEFAULT_MODEL_KIMI = 'kimi-k3';

// Resolve saved selections without keeping superseded models in the menus.
const MODEL_REPLACEMENTS: Readonly<Record<string, string>> = {
  'claude-fable-5': 'claude-fable-5-1',
  'claude-opus-4-8': 'claude-opus-5',
  'claude-sonnet-4-6': DEFAULT_MODEL,
  'deepseek-v4-flash': 'deepseek-flash',
  'gemini-3.7-flash': DEFAULT_MODEL_GEMINI,
  'gemini-3.6-flash': DEFAULT_MODEL_GEMINI,
  'gemini-3.5-flash': DEFAULT_MODEL_GEMINI,
  'gemini-3-flash-preview': DEFAULT_MODEL_GEMINI,
  'gemini-2.5-flash': DEFAULT_MODEL_GEMINI,
  'gemini-3.1-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.5-flash-image': 'gemini-3.1-flash-image',
  'gpt-5.6': DEFAULT_MODEL_OPENAI,
  'kimi-k2.6': DEFAULT_MODEL_KIMI,
};

function resolveAIModel(model: string): string {
  return Object.prototype.hasOwnProperty.call(MODEL_REPLACEMENTS, model)
    ? MODEL_REPLACEMENTS[model]
    : model;
}

// Shared by agent and graph AI controls; verified against provider docs 2026-09-14.
export const AI_PROVIDERS: AIProviderDefinition[] = [
  {
    value: 'claude',
    label: 'Anthropic',
    defaultModel: DEFAULT_MODEL,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
      { value: 'claude-opus-5', label: 'Claude Opus 5' },
      { value: DEFAULT_MODEL, label: 'Claude Sonnet 5' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultModel: DEEPSEEK_V4_PRO_MODEL,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: DEEPSEEK_V4_PRO_MODEL, label: 'DeepSeek V4 Pro' },
      { value: 'deepseek-flash', label: 'DeepSeek V4.1 Flash' },
    ],
  },
  {
    value: 'gemini',
    label: 'Google',
    defaultModel: DEFAULT_MODEL_GEMINI,
    supportsAgent: true,
    extractResponseText: extractGeminiResponseText,
    models: [
      { value: DEFAULT_MODEL_GEMINI, label: 'Gemini 3.8 Flash' },
      { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
      {
        value: 'gemini-3-pro-image',
        label: 'Nano Banana Pro',
        generatesImages: true,
      },
      {
        value: 'gemini-3.1-flash-image',
        label: 'Nano Banana 2',
        generatesImages: true,
      },
      {
        value: 'gemini-3.1-flash-lite-image',
        label: 'Nano Banana 2 Lite',
        generatesImages: true,
        maxOutputTokens: 4096,
      },
    ],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: DEFAULT_MODEL_OPENAI,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: 'gpt-6-astra', label: 'GPT-6 Astra' },
      { value: DEFAULT_MODEL_OPENAI, label: 'GPT-5.6 Sol' },
      { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    ],
  },
  {
    value: 'kimi',
    label: 'Kimi',
    defaultModel: DEFAULT_MODEL_KIMI,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: DEFAULT_MODEL_KIMI, label: 'Kimi K3' },
      { value: 'kimi-k2.7-code', label: 'Kimi K2.7 Code' },
      { value: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code High-Speed' },
    ],
  },
];

export const AI_AGENT_PROVIDERS = AI_PROVIDERS.filter(
  (provider) => provider.supportsAgent,
);
export const AI_AGENT_MODELS = AI_AGENT_PROVIDERS.flatMap((provider) =>
  getAIAgentModelsForProvider(provider.value),
);

export type AIAgentProvider = AIProvider;

export function getAIProvider(provider: AIProvider): AIProviderDefinition {
  const definition = AI_PROVIDERS.find(
    (candidate) => candidate.value === provider,
  );
  if (!definition) throw new Error(`Unknown AI provider: ${provider}`);
  return definition;
}

export function getAIModelsForProvider(
  provider: AIProvider,
): AIModelDefinition[] {
  return getAIProvider(provider).models;
}

export function getDefaultAIModel(provider: AIProvider): string {
  return getAIProvider(provider).defaultModel;
}

export function getAIAgentModelsForProvider(
  provider: AIProvider,
): AIModelDefinition[] {
  const definition = getAIProvider(provider);
  return definition.supportsAgent
    ? definition.models.filter((model) => !model.generatesImages)
    : [];
}

export function getAIModelDefinition(
  provider: AIProvider,
  model: string,
): AIModelDefinition | undefined {
  return getAIModelsForProvider(provider).find(
    (candidate) => candidate.value === model,
  );
}

export function getAIResponseText(provider: AIProvider, data: unknown): string {
  return getAIProvider(provider).extractResponseText(data);
}

export function getAIProviderForModel(model: string): AIProvider {
  const resolvedModel = resolveAIModel(model);
  const provider = AI_PROVIDERS.find((candidate) =>
    candidate.models.some(
      (modelDefinition) => modelDefinition.value === resolvedModel,
    ),
  );
  if (!provider) throw new Error(`Unknown AI model: ${model}`);
  return provider.value;
}

export function normalizeAIModel(provider: AIProvider, model?: string): string {
  const definition = getAIProvider(provider);
  const resolvedModel = resolveAIModel(model || '');
  return definition.models.some(
    (candidate) => candidate.value === resolvedModel,
  )
    ? resolvedModel
    : definition.defaultModel;
}

export function normalizeAIAgentModel(model?: string): string {
  const resolvedModel = resolveAIModel(model || '');
  return AI_AGENT_MODELS.some((candidate) => candidate.value === resolvedModel)
    ? resolvedModel
    : DEFAULT_MODEL;
}

export function getAIAgentProvider(model: string): AIAgentProvider {
  return getAIProviderForModel(model);
}

export function getAIAgentEndpoint(model: string): string {
  getAIAgentProvider(model);
  return '/auth/ai-request';
}
