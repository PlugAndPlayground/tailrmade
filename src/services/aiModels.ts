export type AIProvider = 'claude' | 'deepseek' | 'gemini' | 'openai' | 'kimi';

export interface AIModelDefinition {
  value: string;
  label: string;
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

export const DEFAULT_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_MODEL_GEMINI = 'gemini-2.5-flash';
export const DEEPSEEK_V4_PRO_MODEL = 'deepseek-v4-pro';
export const DEFAULT_MODEL_OPENAI = 'gpt-5.6';
export const DEFAULT_MODEL_KIMI = 'kimi-k2.6';

// This is the single catalog used by both the agent and graph AI controls.
export const AI_PROVIDERS: AIProviderDefinition[] = [
  {
    value: 'claude',
    label: 'Anthropic',
    defaultModel: DEFAULT_MODEL,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: 'claude-fable-5', label: 'Claude Fable 5' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { value: DEFAULT_MODEL, label: 'Claude Sonnet 4.6' },
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
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    ],
  },
  {
    value: 'gemini',
    label: 'Google',
    defaultModel: DEFAULT_MODEL_GEMINI,
    supportsAgent: true,
    extractResponseText: extractGeminiResponseText,
    models: [
      { value: 'gemini-2.5-flash-image', label: 'Nano Banana' },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: DEFAULT_MODEL_GEMINI, label: 'Gemini 2.5 Flash' },
    ],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    defaultModel: DEFAULT_MODEL_OPENAI,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [{ value: DEFAULT_MODEL_OPENAI, label: 'GPT-5.6' }],
  },
  {
    value: 'kimi',
    label: 'Kimi',
    defaultModel: DEFAULT_MODEL_KIMI,
    supportsAgent: true,
    extractResponseText: extractContentResponseText,
    models: [
      { value: 'kimi-k3', label: 'Kimi K3' },
      { value: DEFAULT_MODEL_KIMI, label: 'Kimi K2.6' },
    ],
  },
];

export const AI_AGENT_PROVIDERS = AI_PROVIDERS.filter(
  (provider) => provider.supportsAgent,
);
export const AI_AGENT_MODELS = AI_AGENT_PROVIDERS.flatMap(
  (provider) => provider.models,
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

export function getAIResponseText(provider: AIProvider, data: unknown): string {
  return getAIProvider(provider).extractResponseText(data);
}

export function getAIProviderForModel(model: string): AIProvider {
  const provider = AI_PROVIDERS.find((candidate) =>
    candidate.models.some((modelDefinition) => modelDefinition.value === model),
  );
  if (!provider) throw new Error(`Unknown AI model: ${model}`);
  return provider.value;
}

export function normalizeAIModel(provider: AIProvider, model?: string): string {
  const definition = getAIProvider(provider);
  return definition.models.some((candidate) => candidate.value === model)
    ? model!
    : definition.defaultModel;
}

export function normalizeAIAgentModel(model?: string): string {
  return AI_AGENT_MODELS.some((candidate) => candidate.value === model)
    ? model!
    : DEFAULT_MODEL;
}

export function getAIAgentProvider(model: string): AIAgentProvider {
  return getAIProviderForModel(model);
}

export function getAIAgentEndpoint(model: string): string {
  getAIAgentProvider(model);
  return '/auth/ai-request';
}
