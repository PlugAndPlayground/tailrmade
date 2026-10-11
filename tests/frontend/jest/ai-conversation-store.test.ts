import {
  AIConversationStore,
  AI_CONVERSATIONS_STORAGE_KEY,
} from '../../../src/services/AIConversationStore';
import { writeConversations } from '../../../src/services/aiConversationStorage';

describe('AI conversation storage', () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    saved = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((key: string) => saved.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => saved.set(key, value)),
      },
    });
  });
  afterEach(() => {
    delete (globalThis as any).localStorage;
  });

  it('restores upstream history and persists subsequent deletion', () => {
    writeConversations({
      conversations: { previous: [] },
      titles: { previous: 'Saved upstream' },
      selectedId: 'previous',
    });
    const store = new AIConversationStore();
    expect(store.selectedConversationID).toBe('previous');
    expect(store.getConversationTitle('previous')).toBe('Saved upstream');
    store.deleteConversation('previous');
    expect(new AIConversationStore().conversations.previous).toBeUndefined();
  });

  it('restores messages, dates, token usage, titles and selection after reload', () => {
    const store = new AIConversationStore();
    const id = store.createConversation();
    store.titles[id] = 'Build a dashboard';
    store.conversations[id].push({
      sender: 'assistant' as any,
      content: 'Done',
      date: new Date('2026-09-13T12:00:00Z'),
      tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    store.persistConversations();
    const restored = new AIConversationStore();
    expect(restored.selectedConversationID).toBe(id);
    expect(restored.getConversationTitle(id)).toBe('Build a dashboard');
    expect(restored.conversations[id]).toEqual(store.conversations[id]);
    expect(restored.conversations[id][0].date.toLocaleTimeString()).toEqual(
      store.conversations[id][0].date.toLocaleTimeString(),
    );
  });

  it('deletes permanently, selects another chat and never reuses an ID', () => {
    const store = new AIConversationStore();
    const first = store.selectedConversationID;
    const second = store.createConversation();
    store.titles[second] = 'Old chat';
    store.deleteConversation(second);
    const restored = new AIConversationStore();
    expect(restored.selectedConversationID).toBe(first);
    expect(restored.conversations[second]).toBeUndefined();
    expect(restored.titles[second]).toBeUndefined();
    expect(restored.createConversation()).not.toBe(second);
    restored.deleteConversation(first);
    restored.deleteConversation(restored.selectedConversationID);
    expect(Object.keys(restored.conversations)).toEqual([
      restored.selectedConversationID,
    ]);
    expect(restored.conversations[restored.selectedConversationID]).toEqual([]);
  });

  it('keeps distinct IDs when titles are identical', () => {
    const store = new AIConversationStore();
    const first = store.selectedConversationID;
    const second = store.createConversation();
    store.titles[first] = store.titles[second] = 'Same title';
    store.selectConversation(first);
    store.deleteConversation(second);
    expect(new AIConversationStore().selectedConversationID).toBe(first);
  });

  it('recovers from malformed storage and skips invalid messages', () => {
    saved.set(AI_CONVERSATIONS_STORAGE_KEY, 'broken json');
    expect(Object.keys(new AIConversationStore().conversations)).toHaveLength(
      1,
    );
    saved.set(
      AI_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        conversations: [
          null,
          {
            id: 'valid',
            messages: [
              { sender: 'user', content: 'Hi', date: 'bad date' },
              {
                sender: 'user',
                content: 'Hello',
                date: '2026-09-13T12:00:00Z',
              },
            ],
          },
        ],
      }),
    );
    const restored = new AIConversationStore();
    expect(restored.selectedConversationID).toBe('valid');
    expect(restored.conversations.valid).toHaveLength(1);
  });

  it('keeps chats usable and reports storage write failures', () => {
    const warning = jest.fn();
    (localStorage.setItem as jest.Mock).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = new AIConversationStore(warning);
    expect(warning).toHaveBeenCalled();
    expect(store.conversations[store.createConversation()]).toEqual([]);
  });
});
