import {
  prepareAIProviderTurn,
  withoutVisionImages,
  VISION_NOTE_PREFIX,
} from '../../../src/services/aiProviderAdapters';

const attachment = { mimeType: 'image/webp', data: 'AAAA' };
const olderAttachment = { mimeType: 'image/webp', data: 'BBBB' };

const baseRequest = {
  model: 'test-model',
  systemPrompt: 'system',
  maxTokens: 1024,
  tools: [{ name: 'inspect_ui', description: '', inputSchema: {} }],
  toolResults: [{ callId: 'call-1', name: 'set_socket_value', content: 'ok' }],
  message: `${VISION_NOTE_PREFIX} current dashboard state`,
  attachments: [attachment],
};

describe('withoutVisionImages', () => {
  const visionMessage = () => ({
    role: 'user',
    content: [
      { type: 'image', source: { data: 'BBBB' } },
      { type: 'text', text: `${VISION_NOTE_PREFIX} an earlier look` },
    ],
  });

  const isImage = (part: any) => part?.type === 'image';

  it('drops the image but keeps the note', () => {
    const [pruned] = withoutVisionImages([visionMessage()], isImage);

    expect(pruned.content.some(isImage)).toBe(false);
    expect(pruned.content[0].text).toContain('an earlier look');
    expect(pruned.content[0].text).toContain('Image dropped from context');
  });

  it("leaves the user's own attachments alone", () => {
    const userAttachment = {
      role: 'user',
      content: [
        { type: 'image', source: { data: 'CCCC' } },
        { type: 'text', text: 'what is wrong with this?' },
      ],
    };

    expect(withoutVisionImages([userAttachment], isImage)[0]).toBe(
      userAttachment,
    );
  });

  it('does not mutate the array it was given', () => {
    const messages = [visionMessage()];
    const before = JSON.stringify(messages);
    withoutVisionImages(messages, isImage);

    expect(JSON.stringify(messages)).toBe(before);
  });

  it('skips messages whose content is a plain string', () => {
    const items = [{ role: 'user', content: 'plain text' }];

    expect(withoutVisionImages(items, isImage)[0]).toBe(items[0]);
  });
});

describe('prepareAIProviderTurn with a capture attached', () => {
  it('leads the anthropic turn with tool results, then the capture', () => {
    const { body } = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'claude',
    } as any);
    const messages = body.messages as any[];

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.map((part: any) => part.type)).toEqual([
      'tool_result',
      'image',
      'text',
    ]);
    expect(messages[0].content[1].source).toEqual({
      type: 'base64',
      media_type: 'image/webp',
      data: 'AAAA',
    });
    expect(messages[0].content[2].text).toContain(VISION_NOTE_PREFIX);
  });

  it('puts openai function outputs ahead of the injected capture', () => {
    const { body } = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'openai',
    } as any);
    const input = body.input as any[];

    expect(input[0].type).toBe('function_call_output');
    expect(input[1].content[0]).toEqual({
      type: 'input_image',
      image_url: 'data:image/webp;base64,AAAA',
    });
  });

  it('leads the gemini turn with function responses, then the capture', () => {
    const { body } = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'gemini',
    } as any);
    const contents = body.contents as any[];

    expect(contents).toHaveLength(1);
    expect(contents[0].parts[0].functionResponse).toBeDefined();
    expect(contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'image/webp', data: 'AAAA' },
    });
    expect(contents[0].parts[2].text).toContain(VISION_NOTE_PREFIX);
  });

  it('puts kimi tool messages ahead of the injected capture', () => {
    const { body } = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'kimi',
    } as any);
    const messages = body.messages as any[];

    // kimi carries the system prompt as the first message
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('tool');
    expect(messages[2].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/webp;base64,AAAA' },
    });
  });

  it('keeps only the newest capture across turns', () => {
    const first = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'claude',
      attachments: [olderAttachment],
    } as any);
    const second = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'claude',
      state: first.state,
    } as any);

    const images = (second.body.messages as any[]).flatMap((message) =>
      Array.isArray(message.content)
        ? message.content.filter((part: any) => part.type === 'image')
        : [],
    );

    expect(images).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/webp', data: 'AAAA' },
      },
    ]);
  });

  it('still sends a plain message when nothing is attached', () => {
    const { body } = prepareAIProviderTurn({
      ...baseRequest,
      provider: 'claude',
      attachments: undefined,
      message: 'no capture here',
    } as any);
    const messages = body.messages as any[];

    expect(messages[0].content.map((part: any) => part.type)).toEqual([
      'tool_result',
      'text',
    ]);
    expect(messages[0].content[1].text).toBe('no capture here');
  });
});
