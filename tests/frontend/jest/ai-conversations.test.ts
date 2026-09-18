jest.mock('../../../src/classes/GraphClass', () => ({}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    notifyListeners: jest.fn(),
    showSnackBar: jest.fn(),
    showSpinner: jest.fn(),
    hideSpinner: jest.fn(),
  },
  ListenEvent: { newAIMessageArrived: 1 },
}));
jest.mock('../../../src/services/TailrmadeMCPServer', () => ({
  TailrmadeMCPServer: { getInstance: jest.fn() },
}));
jest.mock('../../../src/services/AIRequest', () => ({
  ...jest.requireActual('../../../src/services/AIRequest'),
  requestAI: jest.fn(),
}));
jest.mock('../../../src/services/aiProviderAdapters', () => ({
  prepareAIProviderTurn: jest.fn(() => ({ body: {} })),
  parseAIProviderTurn: jest.fn((_, data) => data),
}));
jest.mock('../../../src/components/useUserPreferences', () => ({}));
jest.mock('../../../src/services/BackendGateway', () => ({}));
jest.mock('../../../src/utils/constants_shared', () => ({}));
jest.mock('../../../src/utils/imageDownscale', () => ({
  downscaleImagesForAI: async () => [],
}));
jest.mock('../../../src/nodes/allNodes', () => ({}));
jest.mock('../../../src/services/AIVisionService', () => ({
  isAutoCaptureEnabled: () => false,
}));
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
import { TailrmadeMCPServer } from '../../../src/services/TailrmadeMCPServer';
import { requestAI } from '../../../src/services/AIRequest';

describe('conversation lifecycle', () => {
  it.each(['Partial response', ''])(
    'keeps received text when cancelling %p',
    (content) => {
      const backend = new AIBackend();
      const controller = new AbortController();
      backend.conversations.test = [
        {
          sender: AIConversationSender.USER,
          content: 'Hello',
          date: new Date(),
        },
        { sender: AIConversationSender.AI, content, date: new Date() },
      ];
      (backend as any).requestAbortControllers.test = controller;
      backend.cancelCurrentRequest('test');
      expect(controller.signal.aborted).toBe(true);
      expect(
        backend.conversations.test.map((message) => message.content),
      ).toEqual(content ? ['Hello', content] : ['Hello']);
      backend.cancelCurrentRequest('test');
      expect(backend.conversations.test).toHaveLength(content ? 2 : 1);
    },
  );

  it.each([false, true])(
    'cuts off an agent reply cancelled during a tool call (throws: %p)',
    async (throws) => {
      const backend = new AIBackend();
      jest
        .spyOn(backend as any, 'getConversationStartInstructions')
        .mockResolvedValue('');
      jest.spyOn(backend as any, 'getSelectedNodeIds').mockReturnValue([]);
      jest.spyOn(backend as any, 'getSelectedNodesContext').mockReturnValue('');
      jest.spyOn(backend as any, 'getAIRelayEndpoint').mockReturnValue('/ai');
      const callTool = jest.fn(async () => {
        backend.cancelCurrentRequest('Conversation 1');
        if (throws) throw new Error('Tool failed after cancellation');
        return { content: 'Done' };
      });
      const finishAgentTurn = jest.fn(async () => undefined);
      (TailrmadeMCPServer.getInstance as jest.Mock).mockReturnValue({
        beginAgentTurn: jest.fn(),
        finishAgentTurn,
        listTools: () => [],
        callTool,
      });
      (requestAI as jest.Mock).mockResolvedValue({
        text: 'Working on your request.',
        toolCalls: [
          { id: '1', name: 'set_node_name', arguments: {} },
          { id: '2', name: 'set_node_name', arguments: {} },
        ],
      });
      const result = await (backend as any).sendAgenticMessage(
        'Conversation 1',
        'Rename nodes',
        DEFAULT_MODEL,
        {},
        2048,
      );
      expect(result.status).toBe(499);
      expect(backend.conversations['Conversation 1'][1].content).toBe(
        'Working on your request.\n\n*Using set_node_name...*',
      );
      expect(callTool).toHaveBeenCalledTimes(1);
      expect(finishAgentTurn).toHaveBeenCalledTimes(1);
    },
  );

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
