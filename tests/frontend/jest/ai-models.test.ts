import {
  AI_PROVIDERS,
  DEFAULT_MODEL,
  getAIAgentModelsForProvider,
  getAIAgentProvider,
  getAIModelsForProvider,
  normalizeAIAgentModel,
  normalizeAIModel,
  type AIProvider,
} from '../../../src/services/aiModels';
import {
  parseAIProviderTurn,
  prepareAIProviderTurn,
} from '../../../src/services/aiProviderAdapters';

describe('current AI models', () => {
  it('carries OpenAI reasoning and tool results through stateless follow-up turns', () => {
    const first = prepareAIProviderTurn({
      provider: 'openai',
      model: 'gpt-6-astra',
      message: 'Inspect the graph',
      options: { include: ['message.output_text.logprobs'] },
    });
    expect(first.body.store).toBe(false);
    expect(first.body.include).toEqual([
      'message.output_text.logprobs',
      'reasoning.encrypted_content',
    ]);
    const reasoning = {
      type: 'reasoning',
      id: 'rs_1',
      summary: [],
      encrypted_content: 'encrypted-state',
    };
    const call = {
      type: 'function_call',
      call_id: 'call_1',
      name: 'inspect_graph',
      arguments: '{}',
    };
    const turn = parseAIProviderTurn(
      'openai',
      { output: [reasoning, call] },
      first.state,
    );
    const next = prepareAIProviderTurn({
      provider: 'openai',
      model: 'gpt-6-astra',
      state: turn.state,
      toolResults: [
        {
          callId: turn.toolCalls[0].id,
          name: turn.toolCalls[0].name,
          content: 'graph data',
        },
      ],
    });
    expect(next.body.input).toEqual([
      { role: 'user', content: 'Inspect the graph' },
      reasoning,
      call,
      { type: 'function_call_output', call_id: 'call_1', output: 'graph data' },
    ]);
  });
  it.each<[AIProvider, string]>([
    ['claude', 'claude-fable-5-1'],
    ['claude', 'claude-opus-5'],
    ['claude', 'claude-haiku-4-5-20251001'],
    ['openai', 'gpt-6-astra'],
    ['openai', 'gpt-5.6-sol'],
    ['openai', 'gpt-5.6-terra'],
    ['openai', 'gpt-5.6-luna'],
    ['gemini', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3.5-flash-lite'],
    ['deepseek', 'deepseek-flash'],
    ['kimi', 'kimi-k2.7-code'],
    ['kimi', 'kimi-k2.7-code-highspeed'],
  ])('preserves and routes %s model %s', (provider, model) => {
    expect(normalizeAIModel(provider, model)).toBe(model);
    expect(normalizeAIAgentModel(model)).toBe(model);
    expect(getAIAgentProvider(model)).toBe(provider);
    expect(
      prepareAIProviderTurn({ provider, model, message: 'Hello' }).body.model,
    ).toBe(model);
  });

  it('keeps defaults selectable and model IDs unambiguous', () => {
    const ids = AI_PROVIDERS.flatMap((provider) =>
      provider.models.map((model) => model.value),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const provider of AI_PROVIDERS) {
      expect(
        getAIAgentModelsForProvider(provider.value).some(
          (model) => model.value === provider.defaultModel,
        ),
      ).toBe(true);
    }
  });

  it.each<[AIProvider, string, string]>([
    ['claude', 'claude-fable-5', 'claude-fable-5-1'],
    ['claude', 'claude-opus-4-8', 'claude-opus-5'],
    ['claude', 'claude-sonnet-4-6', 'claude-sonnet-5'],
    ['openai', 'gpt-5.6', 'gpt-5.6-sol'],
    ['gemini', 'gemini-3.7-flash', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3.6-flash', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3.5-flash', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3-flash-preview', 'gemini-3.8-flash'],
    ['gemini', 'gemini-2.5-flash', 'gemini-3.8-flash'],
    ['gemini', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'],
    ['gemini', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'],
    ['gemini', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'],
    ['deepseek', 'deepseek-v4-flash', 'deepseek-flash'],
    ['kimi', 'kimi-k2.6', 'kimi-k3'],
  ])('migrates saved %s model %s to %s', (provider, model, replacement) => {
    expect(normalizeAIModel(provider, model)).toBe(replacement);
    expect(normalizeAIAgentModel(model)).toBe(replacement);
    expect(getAIAgentProvider(model)).toBe(provider);
    expect(
      getAIModelsForProvider(provider).some((item) => item.value === model),
    ).toBe(false);
  });

  it('migrates the old image model to an image model only in graph controls', () => {
    expect(normalizeAIModel('gemini', 'gemini-2.5-flash-image')).toBe(
      'gemini-3.1-flash-image',
    );
    expect(normalizeAIAgentModel('gemini-2.5-flash-image')).toBe(DEFAULT_MODEL);
    expect(
      getAIModelsForProvider('gemini').some(
        (item) => item.value === 'gemini-2.5-flash-image',
      ),
    ).toBe(false);
  });

  it.each([
    'gemini-3-pro-image',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
  ])('offers %s only in graph AI controls', (model) => {
    expect(
      getAIModelsForProvider('gemini').some((item) => item.value === model),
    ).toBe(true);
    expect(
      getAIAgentModelsForProvider('gemini').some(
        (item) => item.value === model,
      ),
    ).toBe(false);
    expect(normalizeAIModel('gemini', model)).toBe(model);
    expect(normalizeAIAgentModel(model)).toBe(DEFAULT_MODEL);
    const { body } = prepareAIProviderTurn({
      provider: 'gemini',
      model,
      message: 'Draw a house',
    });
    expect(body.generationConfig).toMatchObject({
      responseModalities: ['TEXT', 'IMAGE'],
    });
  });

  it('limits Nano Banana 2 Lite output to its supported token budget', () => {
    const { body } = prepareAIProviderTurn({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite-image',
      maxTokens: 16384,
    });
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 4096 });
  });
});
