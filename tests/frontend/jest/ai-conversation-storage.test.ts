import {
  AI_CONVERSATIONS_KEY,
  readConversations,
  writeConversations,
} from '../../../src/services/aiConversationStorage';

describe('local conversation history', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((key) => values.get(key) ?? null),
        setItem: jest.fn((key, value) => values.set(key, value)),
      },
    });
  });
  afterEach(() => {
    delete (globalThis as any).localStorage;
  });
  it('restores messages, dates, token usage, titles and selection', () => {
    const snapshot = {
      conversations: {
        one: [
          {
            sender: 'assistant' as any,
            content: 'Hello',
            date: new Date('2026-09-18T10:00:00Z'),
            tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          },
        ],
        two: [],
      },
      titles: { one: 'A useful title' },
      selectedId: 'two',
    };
    expect(writeConversations(snapshot)).toBe(true);
    expect(readConversations()).toEqual(snapshot);
    expect(readConversations()?.conversations.one[0].date).toBeInstanceOf(Date);
  });
  it('persists deletion without resurrecting removed conversations', () => {
    writeConversations({
      conversations: { one: [], two: [] },
      titles: {},
      selectedId: 'one',
    });
    writeConversations({
      conversations: { two: [] },
      titles: {},
      selectedId: 'two',
    });
    expect(Object.keys(readConversations()!.conversations)).toEqual(['two']);
  });
  it('ignores invalid entries and repairs a missing selection', () => {
    values.set(
      AI_CONVERSATIONS_KEY,
      JSON.stringify({
        version: 1,
        selectedId: 'missing',
        entries: [
          null,
          {
            id: 'valid',
            messages: [
              null,
              { sender: 'user', content: 'bad date', date: 'invalid' },
            ],
          },
        ],
      }),
    );
    expect(readConversations()).toEqual({
      conversations: { valid: [] },
      titles: {},
      selectedId: 'valid',
    });
  });
  it('handles malformed or unavailable storage', () => {
    values.set(AI_CONVERSATIONS_KEY, '{broken');
    expect(readConversations()).toBeUndefined();
    (localStorage.setItem as jest.Mock).mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(
      writeConversations({ conversations: {}, titles: {}, selectedId: '' }),
    ).toBe(false);
  });
});
