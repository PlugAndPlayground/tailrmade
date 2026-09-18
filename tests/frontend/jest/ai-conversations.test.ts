jest.mock('../../../src/classes/GraphClass', () => ({}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    notifyListeners: jest.fn(),
    showSnackBar: jest.fn(),
  },
  ListenEvent: { newAIMessageArrived: 1 },
}));
jest.mock('../../../src/services/TailrmadeMCPServer', () => ({}));
jest.mock('../../../src/components/useUserPreferences', () => ({}));
jest.mock('../../../src/services/BackendGateway', () => ({}));
jest.mock('../../../src/utils/constants_shared', () => ({}));
jest.mock('../../../src/utils/imageDownscale', () => ({
  downscaleImagesForAI: async () => [],
}));
jest.mock('../../../src/nodes/allNodes', () => ({}));
jest.mock('../../../src/services/AIVisionService', () => ({}));
jest.mock('../../../src/services/aiConversationStorage', () => ({
  readConversations: jest.fn(),
  writeConversations: jest.fn(() => true),
}));

import {
  AIBackend,
  AIConversationSender,
} from '../../../src/services/AIBackend';
import {
  getAIAgentProvider,
  DEFAULT_MODEL,
} from '../../../src/services/aiModels';

describe('conversation lifecycle', () => {
  const failedConversation = () => [
    {
      sender: AIConversationSender.USER,
      content: 'Build a chart\n\nSelected node IDs at send time: chart',
      date: new Date(),
    },
    {
      sender: AIConversationSender.AI,
      content: 'Something went wrong while running the AI agent: offline',
      date: new Date(),
    },
  ];

  it('retries using the saved prompt, model, settings and images', async () => {
    const backend = new AIBackend();
    backend.conversations.test = failedConversation();
    const request = {
      message: 'Build a chart',
      model: DEFAULT_MODEL,
      context: { performActions: false, attachmentContext: 'chart structure' },
      maxTokens: 2048,
      images: ['data:image/png;base64,test'],
    };
    backend.conversations.test[0].retryRequest = request;
    const send = jest
      .spyOn(backend, 'sendMessageClaude')
      .mockResolvedValue({ success: true });
    await backend.retryConversation('test', 'different-model', {
      performActions: true,
    });
    expect(send).toHaveBeenCalledWith(
      'test',
      request.message,
      request.model,
      request.context,
      true,
      request.maxTokens,
      request.images,
    );
  });

  it('supports old failures without duplicating the selected-node annotation', async () => {
    const backend = new AIBackend();
    backend.conversations.test = failedConversation();
    const send = jest
      .spyOn(backend, 'sendMessageClaude')
      .mockResolvedValue({ success: true });
    await backend.retryConversation('test', DEFAULT_MODEL, {
      performActions: true,
    });
    expect(send.mock.calls[0][1]).toBe('Build a chart');
    (backend as any).pruneFailedConversationTurns(backend.conversations.test);
    expect(backend.conversations.test).toEqual([]);
  });

  it('does not retry successful replies or while another request is running', async () => {
    const backend = new AIBackend();
    backend.conversations.test = failedConversation();
    const send = jest.spyOn(backend, 'sendMessageClaude');
    (backend as any).activeConversationRequests.add('other');
    expect(
      (await backend.retryConversation('test', DEFAULT_MODEL, {})).status,
    ).toBe(409);
    (backend as any).activeConversationRequests.clear();
    backend.conversations.test[1].content = 'Done';
    expect(backend.canRetryConversation('test')).toBe(false);
    await backend.retryConversation('test', DEFAULT_MODEL, {});
    expect(send).not.toHaveBeenCalled();
  });
  it('uses unique IDs and replaces the last deleted conversation', () => {
    const backend = new AIBackend();
    const first = backend.createConversation();
    backend.deleteConversation(first);
    const second = backend.createConversation();
    expect(second).not.toBe(first);
    backend.deleteConversation('Conversation 1');
    backend.deleteConversation(second);
    expect(Object.keys(backend.conversations)).toEqual([
      backend.selectedConversationId,
    ]);
    expect(backend.getConversation(backend.selectedConversationId)).toEqual([]);
  });

  it('names a conversation once with the same provider and model', async () => {
    const backend = new AIBackend();
    const request = jest
      .spyOn(backend as any, 'sendNormalizedMessage')
      .mockResolvedValue({
        success: true,
        data: { content: [{ text: 'A useful title' }] },
      });
    await (backend as any).nameConversation('Conversation 1', DEFAULT_MODEL);
    await (backend as any).nameConversation('Conversation 1', DEFAULT_MODEL);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(getAIAgentProvider(DEFAULT_MODEL));
    expect(request.mock.calls[0][3]).toBe(DEFAULT_MODEL);
    expect(backend.conversationTitles['Conversation 1']).toBe('A useful title');
  });

  it('ignores a title arriving after deletion', async () => {
    const backend = new AIBackend();
    let resolve: (value: any) => void = () => undefined;
    jest.spyOn(backend as any, 'sendNormalizedMessage').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = (backend as any).nameConversation(
      'Conversation 1',
      DEFAULT_MODEL,
    );
    backend.deleteConversation('Conversation 1');
    resolve({ success: true, data: { content: [{ text: 'Late title' }] } });
    await pending;
    expect(backend.conversationTitles['Conversation 1']).toBeUndefined();
    expect(backend.conversations['Conversation 1']).toBeUndefined();
  });
});
