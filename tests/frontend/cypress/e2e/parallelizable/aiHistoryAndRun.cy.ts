import { doWithTestController, openNewGraph } from '../helpers';

describe('AI history and execution tools', () => {
  beforeEach(() => openNewGraph());

  it('inspects shared history and undoes/redoes one entry at a time', () => {
    doWithTestController(async (tc) => {
      tc.clearActionHistory();
      for (const tool of ['undo', 'redo']) {
        expect((await tc.callAITool(tool, {})).is_error).to.equal(true);
      }
      await tc.addNodeAction('Constant', 'history-human');
      await tc.addNodeAction('Constant', 'history-ai', 220, 0, 'ai');
      const history = JSON.parse(
        (await tc.callAITool('inspect_history', {})).content,
      );
      expect(history.entries.map((entry) => entry.source)).to.deep.equal([
        'human',
        'ai',
      ]);
      const undone = await tc.callAITool('undo', {});
      expect(undone.is_error).to.not.equal(true);
      expect(JSON.parse(undone.content).action.source).to.equal('ai');
      expect(tc.getNodeByID('history-ai')).to.equal(undefined);
      expect(tc.getNodeByID('history-human')).to.not.equal(undefined);
      const redone = await tc.callAITool('redo', {});
      expect(redone.is_error).to.not.equal(true);
      expect(tc.getNodeByID('history-ai')).to.not.equal(undefined);
      await tc.callAITool('undo', {});
      await tc.addNodeAction('Constant', 'history-new');
      expect((await tc.callAITool('redo', {})).is_error).to.equal(true);
    });
  });

  it('runs the requested node and downstream nodes and returns output data', () => {
    doWithTestController(async (tc) => {
      const source = await tc.addNode('Constant', 'run-source');
      const target = await tc.addNode('Constant', 'run-target');
      await tc.callAITool('connect_sockets', {
        from_node: source.id,
        from_socket: source.outputSocketArray[0].name,
        to_node: target.id,
        to_socket: target.inputSocketArray[0].name,
      });
      source.setInputData(source.inputSocketArray[0].name, 42);
      await tc.waitForPendingExecution();
      const executions = source.debug_timesExecuted;
      const downstreamExecutions = target.debug_timesExecuted;
      const result = await tc.callAITool('run_node', { node_id: source.id });
      expect(result.is_error, result.content).to.not.equal(true);
      expect(source.debug_timesExecuted).to.be.greaterThan(executions);
      expect(target.debug_timesExecuted).to.be.greaterThan(
        downstreamExecutions,
      );
      expect(target.outputSocketArray[0].data).to.equal(42);
      const data = JSON.parse(result.content);
      expect(data.status).to.equal('executed');
      expect(
        data.node.sockets.find(
          (socket) => socket.name === source.outputSocketArray[0].name,
        ).data,
      ).to.equal(42);
    });
  });

  it('returns errors for invalid IDs and failed node execution', () => {
    doWithTestController(async (tc) => {
      for (const input of [
        {},
        { node_id: 42 },
        { node_id: 'missing' },
        { node_id: 'toString' },
      ]) {
        expect((await tc.callAITool('run_node', input)).is_error).to.equal(
          true,
        );
      }
      await tc.addNode('CustomFunction', 'run-failure');
      await tc.callAITool('set_socket_value', {
        node_id: 'run-failure',
        socket_name: 'Code',
        value: '() => { throw new Error("test execution failure"); }',
      });
      const result = await tc.callAITool('run_node', {
        node_id: 'run-failure',
      });
      expect(result.is_error, result.content).to.equal(true);
      expect(JSON.parse(result.content).status).to.equal('error');
      expect(result.content).to.include('test execution failure');
    });
  });
});
