import { doWithTestController, openNewGraph } from '../helpers';

describe('AI add_node caller-supplied ID', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('lets following mutation tools configure and connect new nodes by their chosen IDs', () => {
    doWithTestController(async (tc) => {
      const source = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-1',
      });
      const target = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-2',
      });
      const value = await tc.callMCPTool('set_socket_value', {
        node_id: 'ai-node-1',
        socket_name: 'In',
        value: 42,
      });
      const comment = await tc.callMCPTool('set_node_comment', {
        node_id: 'ai-node-1',
        comment: 'configured after creation in the same ordered batch',
      });
      const connection = await tc.callMCPTool('connect_sockets', {
        from_node: 'ai-node-1',
        from_socket: 'Out',
        to_node: 'ai-node-2',
        to_socket: 'In',
      });

      [source, target, value, comment, connection].forEach((result) => {
        expect(result.is_error, result.content).to.not.eq(true);
      });
      expect(tc.getNodeInputValue('ai-node-1', 'In')).to.eq(42);
      expect(tc.getNodeByID('ai-node-1').comment).to.eq(
        'configured after creation in the same ordered batch',
      );
    });
  });

  it('rejects invalid and duplicate IDs without replacing an existing node', () => {
    doWithTestController(async (tc) => {
      const invalid = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'source',
      });
      expect(invalid.is_error).to.eq(true);

      const first = await tc.callMCPTool('add_node', {
        node_type: 'Constant',
        node_id: 'ai-node-1',
      });
      expect(first.is_error, first.content).to.not.eq(true);

      const duplicate = await tc.callMCPTool('add_node', {
        node_type: 'HTTP',
        node_id: 'ai-node-1',
      });
      expect(duplicate.is_error).to.eq(true);
      expect(tc.getNodeByID('ai-node-1').type).to.eq('constant');
    });
  });

  it('documents ordered same-response use in the system prompt', () => {
    doWithTestController(async (tc) => {
      const systemPrompt = await tc.getAISystemPrompt();

      expect(systemPrompt).to.include('Tool calls in one response execute');
      expect(systemPrompt).to.include('do not wait for add_node');
      expect(systemPrompt).to.include('## Available Node Types');
      expect(systemPrompt).to.include('CustomFunction');
    });
  });

  it('derives the next safe ID from the highest existing numeric AI node ID', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Constant', 'ai-node-4');
      await tc.addNode('Constant', 'ai-node-27');
      await tc.addNode('Constant', 'ai-node-legacy-name');

      const addNodeTool = tc
        .getAIToolDefinitions()
        .find((tool) => tool.name === 'add_node');

      expect(addNodeTool).to.exist;
      expect(addNodeTool!.description).to.include(
        'highest existing ai-node number in the app is 27',
      );
      expect(addNodeTool!.description).to.include('next safe ID is ai-node-28');
      expect(addNodeTool!.description).to.include(
        'start with ai-node-28 and increment',
      );
    });
  });
});
