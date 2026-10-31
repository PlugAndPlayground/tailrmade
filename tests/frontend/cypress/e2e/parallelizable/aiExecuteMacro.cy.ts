import { doWithTestController, openNewGraph } from '../helpers';

// A value set through set_socket_value never goes through the macro dropdown's
// onChange, which is what grows a caller's parameter inputs.
describe('AI set_socket_value on a macro caller', () => {
  beforeEach(() => {
    openNewGraph();
  });

  const expectParameterAfterSettingMacro = (nodeType: string) => {
    doWithTestController(async (tc) => {
      const call = async (name: string, input: Record<string, unknown>) => {
        const result = await tc.callAITool(name, input);
        expect(result.is_error, `${name}: ${result.content}`).to.not.equal(
          true,
        );
      };
      await call('add_node', { node_type: 'Macro', node_id: 'ai-node-1' });
      await call('set_node_name', { node_id: 'ai-node-1', name: 'Doubler' });
      await call('add_node', { node_type: nodeType, node_id: 'ai-node-2' });
      const caller = tc.getNodeByID('ai-node-2');
      expect(caller.getInputSocketByName('Parameter 1')).to.equal(undefined);

      await call('set_socket_value', {
        node_id: 'ai-node-2',
        socket_name: 'Macro',
        value: 'Doubler',
      });
      expect(caller.getInputSocketByName('Parameter 1')).to.not.equal(
        undefined,
      );
    });
  };

  it('creates the parameter inputs of an Execute Macro', () => {
    expectParameterAfterSettingMacro('Execute Macro');
  });

  it('creates the parameter inputs of a Map Execute Macro', () => {
    expectParameterAfterSettingMacro('Map Execute Macro');
  });
});
