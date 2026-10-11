jest.mock('../../../src/classes/GraphClass', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: { notifyListeners: jest.fn(), showSnackBar: jest.fn() },
  ListenEvent: { newAIMessageArrived: 'message' },
}));
jest.mock('../../../src/services/TailrmadeMCPServer', () => ({}));
jest.mock('../../../src/components/useUserPreferences', () => ({
  getCachedUserPreferences: () => ({ aiLocation: 'local' }),
}));
jest.mock('../../../src/services/BackendGateway', () => ({}));
jest.mock('../../../src/nodes/allNodes', () => ({}));
jest.mock('../../../src/services/AIVisionService', () => ({}));
jest.mock('../../../src/services/AIRequest', () => ({
  requestAI: jest.fn(),
  readAIJSON: jest.fn(),
}));

import { AIBackend } from '../../../src/services/AIBackend';
import { requestAI } from '../../../src/services/AIRequest';
import { DEFAULT_MODEL } from '../../../src/services/aiModels';

describe('AI conversation titles', () => {
  beforeEach(() => {
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    jest.spyOn(AIBackend.prototype as any, 'canUseAI').mockReturnValue(true);
    jest
      .spyOn(AIBackend.prototype as any, 'getAIRelayEndpoint')
      .mockReturnValue('/ai/request');
    jest
      .spyOn(AIBackend.prototype as any, 'logAIUsage')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete (globalThis as any).localStorage;
  });

  const response = {
    content: [{ type: 'text', text: '"Build a dashboard"' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  it('generates and persists a title without changing the ID or transcript', async () => {
    (requestAI as jest.Mock).mockResolvedValue(response);
    const backend = new AIBackend();
    const id = backend.selectedConversationID;
    await backend.generateConversationTitle(
      id,
      'Build a dashboard for sales',
      DEFAULT_MODEL,
    );
    expect(backend.getConversationTitle(id)).toBe('Build a dashboard');
    expect(backend.conversations[id]).toEqual([]);
    expect(new AIBackend().getConversationTitle(id)).toBe('Build a dashboard');
    await backend.generateConversationTitle(id, 'Follow up', DEFAULT_MODEL);
    expect(requestAI).toHaveBeenCalledTimes(1);
  });

  it('deduplicates pending requests and does not resurrect a deleted chat', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    (requestAI as jest.Mock).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const backend = new AIBackend();
    const id = backend.selectedConversationID;
    const pending = backend.generateConversationTitle(
      id,
      'Build a dashboard',
      DEFAULT_MODEL,
    );
    await backend.generateConversationTitle(
      id,
      'Build a dashboard',
      DEFAULT_MODEL,
    );
    expect(requestAI).toHaveBeenCalledTimes(1);
    backend.deleteConversation(id);
    expect((requestAI as jest.Mock).mock.calls[0][0].signal.aborted).toBe(true);
    resolve(response);
    await pending;
    expect(backend.conversations[id]).toBeUndefined();
    expect(backend.titles[id]).toBeUndefined();
    expect(new AIBackend().conversations[id]).toBeUndefined();
  });

  it('keeps a usable fallback when naming fails and allows a retry', async () => {
    (requestAI as jest.Mock)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(response);
    const backend = new AIBackend();
    const id = backend.selectedConversationID;
    await backend.generateConversationTitle(
      id,
      'Build a dashboard',
      DEFAULT_MODEL,
    );
    expect(backend.getConversationTitle(id)).toBe('New conversation');
    await backend.generateConversationTitle(
      id,
      'Build a dashboard',
      DEFAULT_MODEL,
    );
    expect(backend.getConversationTitle(id)).toBe('Build a dashboard');
  });

  it('persists partial replies and keeps them when a run is stopped', () => {
    const backend = new AIBackend();
    const id = backend.selectedConversationID;
    backend.conversations[id].push({
      sender: 'assistant' as any,
      content: '',
      date: new Date(),
    });
    (backend as any).applyAssistantText(id, 0, 'Work so far');
    expect(new AIBackend().conversations[id][0].content).toBe('Work so far');
    const controller = new AbortController();
    (backend as any).requestAbortControllers[id] = controller;
    backend.cancelCurrentRequest(id);
    expect(controller.signal.aborted).toBe(true);
    expect(new AIBackend().conversations[id][0].content).toBe('Work so far');
  });

  it('aborts a deleted conversation and ignores subsequent reply updates', () => {
    const backend = new AIBackend();
    const id = backend.selectedConversationID;
    backend.conversations[id].push({
      sender: 'assistant' as any,
      content: '',
      date: new Date(),
    });
    const controller = new AbortController();
    (backend as any).requestAbortControllers[id] = controller;
    backend.deleteConversation(id);
    (backend as any).applyAssistantText(id, 0, 'Late response');
    expect(controller.signal.aborted).toBe(true);
    expect(new AIBackend().conversations[id]).toBeUndefined();
  });
});
