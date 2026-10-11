import type { AIConversationMessage } from './AIBackend';
import { v4 as uuid } from 'uuid';
import { readConversations } from './aiConversationStorage';

export const AI_CONVERSATIONS_STORAGE_KEY = 'tailrmade.aiConversations.v1';

export class AIConversationStore {
  conversations: Record<string, AIConversationMessage[]> = Object.create(null);
  titles: Record<string, string> = Object.create(null);
  selectedConversationID = '';

  constructor(private onStorageError: () => void = () => undefined) {
    try {
      const saved = JSON.parse(
        localStorage.getItem(AI_CONVERSATIONS_STORAGE_KEY) || 'null',
      );
      if (saved?.version === 1 && Array.isArray(saved.conversations)) {
        for (const entry of saved.conversations) {
          if (
            !entry ||
            typeof entry.id !== 'string' ||
            !entry.id ||
            !Array.isArray(entry.messages)
          )
            continue;
          const messages = entry.messages
            .filter(
              (message: any) =>
                message &&
                ['user', 'assistant'].includes(message.sender) &&
                typeof message.content === 'string' &&
                typeof message.date === 'string' &&
                Number.isFinite(Date.parse(message.date)),
            )
            .map((message: any) => ({
              ...message,
              date: new Date(message.date),
            }));
          this.conversations[entry.id] = messages;
          this.titles[entry.id] =
            typeof entry.title === 'string' ? entry.title : '';
        }
        if (Object.hasOwn(this.conversations, saved.selectedConversationID))
          this.selectedConversationID = saved.selectedConversationID;
      }
    } catch {
      // Unavailable or malformed storage must not prevent opening the helper.
    }
    if (!Object.keys(this.conversations).length) {
      const previous = readConversations();
      if (previous) {
        this.conversations = previous.conversations;
        this.titles = previous.titles;
        this.selectedConversationID = previous.selectedId;
      }
    }
    if (!Object.keys(this.conversations).length) this.createConversation();
    this.selectedConversationID ||= Object.keys(this.conversations)[0];
  }

  persistConversations(): void {
    try {
      localStorage.setItem(
        AI_CONVERSATIONS_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          selectedConversationID: this.selectedConversationID,
          conversations: Object.entries(this.conversations).map(
            ([id, messages]) => ({
              id,
              title: this.titles[id] || '',
              messages,
            }),
          ),
        }),
      );
    } catch {
      this.onStorageError();
    }
  }

  createConversation(): string {
    const id = uuid();
    this.conversations[id] = [];
    this.selectedConversationID = id;
    this.persistConversations();
    return id;
  }

  selectConversation(id: string): void {
    if (!Object.hasOwn(this.conversations, id)) return;
    this.selectedConversationID = id;
    this.persistConversations();
  }

  deleteConversation(id: string): void {
    delete this.conversations[id];
    delete this.titles[id];
    if (this.selectedConversationID === id)
      this.selectedConversationID = Object.keys(this.conversations)[0] || '';
    if (!Object.keys(this.conversations).length) this.createConversation();
    this.persistConversations();
  }

  getConversationTitle(id: string): string {
    return this.titles[id] || 'New conversation';
  }
}
