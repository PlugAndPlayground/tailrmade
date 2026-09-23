import type { AIConversationMessage } from './AIBackend';

export const AI_CONVERSATIONS_KEY = 'tailrmade.ai-conversations.v1';

export interface ConversationSnapshot {
  conversations: Record<string, AIConversationMessage[]>;
  titles: Record<string, string>;
  selectedId: string;
}

export function readConversations(): ConversationSnapshot | undefined {
  try {
    const saved = JSON.parse(
      localStorage.getItem(AI_CONVERSATIONS_KEY) || 'null',
    );
    if (!saved || saved.version !== 1 || !Array.isArray(saved.entries)) return;
    const conversations: ConversationSnapshot['conversations'] =
      Object.create(null);
    const titles: Record<string, string> = Object.create(null);
    for (const entry of saved.entries) {
      if (
        !entry ||
        typeof entry.id !== 'string' ||
        !Array.isArray(entry.messages)
      )
        continue;
      conversations[entry.id] = entry.messages.flatMap((message: any) => {
        if (
          !message ||
          !['user', 'assistant'].includes(message.sender) ||
          typeof message.content !== 'string' ||
          typeof message.date !== 'string'
        )
          return [];
        const date = new Date(message.date);
        return Number.isNaN(date.getTime()) ? [] : [{ ...message, date }];
      });
      if (typeof entry.title === 'string') titles[entry.id] = entry.title;
    }
    return {
      conversations,
      titles,
      selectedId: Object.hasOwn(conversations, saved.selectedId)
        ? saved.selectedId
        : Object.keys(conversations)[0] || '',
    };
  } catch {
    return undefined;
  }
}

export function writeConversations(snapshot: ConversationSnapshot): boolean {
  try {
    localStorage.setItem(
      AI_CONVERSATIONS_KEY,
      JSON.stringify({
        version: 1,
        selectedId: snapshot.selectedId,
        entries: Object.entries(snapshot.conversations).map(
          ([id, messages]) => ({
            id,
            messages,
            title: snapshot.titles[id],
          }),
        ),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
