import {
  checkingWarningsMarker,
  completedToolCallsMarker,
  createToolMarkerRegex,
  lookedAtUIMarker,
  runStoppedEarlyMarker,
  stripAIToolMarkers,
  toolFailedMarker,
  turnLimitMarker,
  usedToolMarker,
  usingToolMarker,
  type ToolMarkerGroups,
} from '../../../src/services/aiToolMarkers';
import {
  isTruncatedStopReason,
  prepareAIProviderTurn,
} from '../../../src/services/aiProviderAdapters';

const matchAllMarkers = (content: string) =>
  Array.from(content.matchAll(createToolMarkerRegex()));

const groupsOf = (content: string): ToolMarkerGroups =>
  (matchAllMarkers(content)[0]?.groups || {}) as ToolMarkerGroups;

describe('tool markers match the strings the agent actually emits', () => {
  // Every marker builder paired with the group the panel identifies it by. A
  // marker whose wording drifts from its pattern leaks into the chat as raw
  // text and reaches the model as a written-out tool call.
  const markers: Array<[string, string, keyof ToolMarkerGroups]> = [
    ['using', usingToolMarker('set_socket_value'), 'usingTool'],
    ['used', usedToolMarker('set_socket_value'), 'usedTool'],
    ['failed', toolFailedMarker('add_node', 'node not found'), 'failedTool'],
    ['checking warnings', checkingWarningsMarker(), 'checkingWarnings'],
    ['looked at the UI', lookedAtUIMarker(), 'lookedAtUI'],
    [
      'completed, no inspections',
      completedToolCallsMarker(3, ''),
      'completedCount',
    ],
    [
      'completed, with inspections',
      completedToolCallsMarker(
        10,
        'describe_node x2, inspect_warnings_and_errors',
      ),
      'completedCount',
    ],
    ['turn limit', turnLimitMarker(60), 'limitTurns'],
    ['stopped early', runStoppedEarlyMarker('length'), 'stoppedEarly'],
  ];

  it.each(markers)('matches the %s marker whole', (_name, marker, group) => {
    const matches = matchAllMarkers(marker);

    expect(matches).toHaveLength(1);
    expect(matches[0][0]).toBe(marker);
    expect(groupsOf(marker)[group]).toBeDefined();
  });

  it('carries the payload the panel puts on a chip', () => {
    expect(groupsOf(usedToolMarker('connect_sockets')).usedTool).toBe(
      'connect_sockets',
    );
    expect(groupsOf(toolFailedMarker('add_node', 'boom')).failedDetail).toBe(
      'boom',
    );
    expect(groupsOf(turnLimitMarker(60)).limitTurns).toBe('60');
  });

  it("leaves the model's own prose alone", () => {
    // what a model writes when it describes tool calls instead of making them
    const prose = [
      'I will fix it:',
      '',
      '**1.** `set_socket_value` — popular-dingo-85 "Callback" → ", "',
      '**2.** `inspect_nodes` — [popular-dingo-85]',
    ].join('\n');

    expect(matchAllMarkers(prose)).toHaveLength(0);
  });
});

describe('stripAIToolMarkers', () => {
  const message = [
    "I'll insert a function that joins the array with commas:",
    '',
    usingToolMarker('add_node'),
    usedToolMarker('add_node'),
    usingToolMarker('set_socket_value'),
    usedToolMarker('set_socket_value'),
    lookedAtUIMarker(),
    '',
    'Done. The label now shows a comma separated list.',
    '',
    completedToolCallsMarker(
      10,
      'describe_node x2, inspect_warnings_and_errors',
    ),
  ].join('\n');

  it('removes every trace of tool use from what the model is replayed', () => {
    const stripped = stripAIToolMarkers(message);

    expect(stripped).toBe(
      "I'll insert a function that joins the array with commas:\n\n" +
        'Done. The label now shows a comma separated list.',
    );
    expect(matchAllMarkers(stripped)).toHaveLength(0);
  });

  it('keeps a reply that never used a tool byte for byte', () => {
    const answer = 'Use a CustomFunction node with items.join(", ").';

    expect(stripAIToolMarkers(answer)).toBe(answer);
  });

  it('empties a turn that only ran tools, so the caller can substitute', () => {
    expect(
      stripAIToolMarkers(
        `${usedToolMarker('add_node')}\n${completedToolCallsMarker(1, '')}`,
      ),
    ).toBe('');
  });
});

describe('isTruncatedStopReason', () => {
  it.each(['max_tokens', 'length', 'incomplete', 'MAX_TOKENS'])(
    'treats %s as a cut-off turn',
    (stopReason) => {
      expect(isTruncatedStopReason(stopReason)).toBe(true);
    },
  );

  it.each(['end_turn', 'tool_calls', 'stop', 'completed', 'STOP', undefined])(
    'treats %s as a finished turn',
    (stopReason) => {
      expect(isTruncatedStopReason(stopReason)).toBe(false);
    },
  );
});

describe('per-provider output token field', () => {
  const request = {
    model: 'test-model',
    systemPrompt: 'system',
    maxTokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  };

  // Each provider names this differently, and a name the provider does not
  // recognise is ignored rather than rejected - the reply then gets capped at
  // the provider's own default and turns end mid-tool-call.
  it.each([
    ['claude' as const, 'max_tokens'],
    ['openai' as const, 'max_output_tokens'],
    ['kimi' as const, 'max_tokens'],
  ])('sends %s the %s field', (provider, field) => {
    const { body } = prepareAIProviderTurn({ ...request, provider });

    expect(body[field]).toBe(4096);
  });

  it('does not send Kimi the OpenAI-only max_completion_tokens', () => {
    const { body } = prepareAIProviderTurn({ ...request, provider: 'kimi' });

    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('sends Gemini its limit under generationConfig', () => {
    const { body } = prepareAIProviderTurn({ ...request, provider: 'gemini' });

    expect((body.generationConfig as any).maxOutputTokens).toBe(4096);
  });
});
