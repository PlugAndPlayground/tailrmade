jest.mock('../../../src/classes/NodeClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/SocketClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/classes/UpdateBehaviourClass', () => ({
  __esModule: true,
  default: class {},
}));
jest.mock('../../../src/utils/constants', () => ({
  NODE_TYPE_COLOR: {},
  SOCKET_TYPE: {},
}));
jest.mock('../../../src/utils/color', () => ({ TRgba: {} }));
jest.mock('../../../src/nodes/datatypes/anyType', () => ({
  AnyType: class {},
}));
jest.mock('../../../src/nodes/datatypes/arrayType', () => ({
  ArrayType: class {},
}));
jest.mock('../../../src/nodes/datatypes/booleanType', () => ({
  BooleanType: class {},
}));
jest.mock('../../../src/nodes/datatypes/dynamicEnumType', () => ({
  DynamicEnumType: class {},
}));
jest.mock('../../../src/nodes/datatypes/jsonType', () => ({
  JSONType: class {},
}));
jest.mock('../../../src/nodes/datatypes/stringType', () => ({
  StringType: class {},
}));
jest.mock('../../../src/nodes/api/http', () => ({
  outputContentName: 'Content',
  HTTPNode: class {
    clearStatuses() {}
    pushStatusCode() {}
  },
}));
jest.mock('../../../src/services/AIBackend', () => ({
  AIBackend: { getInstance: jest.fn() },
}));

import { AINode } from '../../../src/nodes/api/ai';
import { AIBackend } from '../../../src/services/AIBackend';

describe('AI node failure output', () => {
  it.each(['message', 'error'])(
    'preserves the backend %s in the Content output',
    async (field) => {
      const message =
        'AI request failed (HTTP 400): Unknown name "extra_parameter"';
      (AIBackend.getInstance as jest.Mock).mockReturnValue({
        sendAIMessage: jest.fn().mockResolvedValue({
          success: false,
          [field]: message,
        }),
      });
      const node = Object.create(AINode.prototype);
      const output: Record<string, unknown> = {};

      await node.onExecute({ Provider: 'gemini', Data: 'Hello' }, output);

      expect(output.Content).toEqual({ error: true, message });
      expect(output.Response).toBe('');
      expect(output.Conversation).toEqual([]);
    },
  );
});

describe('AI node risks', () => {
  it.each([
    [false, 'ai-usage'],
    [true, 'local-ai'],
  ])('raises one risk when local AI is %s', (local, kind) => {
    (AIBackend.getInstance as jest.Mock).mockReturnValue({
      isLocalAI: () => local,
    });
    const node = Object.create(AINode.prototype);
    node.getStaticInputData = () => ({ known: true, value: 'claude' });
    expect(node.getRisks().map((risk) => risk.kind)).toEqual([kind]);
  });

  it.each([
    [{ known: true, value: 'claude' }, 'Anthropic (Claude)'],
    [{ known: true, value: 'gemini' }, 'Google (Gemini)'],
    [{ known: true, value: 'openai' }, 'OpenAI'],
    [{ known: true, value: '' }, 'Anthropic (Claude)'],
    [{ known: false, value: undefined }, undefined],
  ])('names the provider %o as %s', (provider, target) => {
    (AIBackend.getInstance as jest.Mock).mockReturnValue({
      isLocalAI: () => false,
    });
    const node = Object.create(AINode.prototype);
    node.getStaticInputData = () => provider;
    const [risk] = node.getRisks();
    expect(risk.target).toBe(target);
    expect(risk.resolved).toBe(provider.known);
  });
});
