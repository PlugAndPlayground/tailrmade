import { doWithTestController, openNewGraph } from '../helpers';

// A Custom Function derives its input sockets from the code's parameter names.
// A fresh node ships with the default parameter "a", so connecting before the
// code is finalized (or renaming a parameter afterwards) strands the link on a
// socket that is no longer a parameter — its data is silently ignored. The
// inspect_warnings_and_errors MCP tool must surface that misconfiguration.
describe('AI inspect_warnings_and_errors: Custom Function orphaned sockets', () => {
  beforeEach(() => {
    openNewGraph();
  });

  // the node surfaces this through its own node status (setStatus), which
  // inspect_warnings_and_errors already reports as a source: 'node' issue
  const configWarningsFor = (content: string, nodeId: string) =>
    JSON.parse(content).issues.filter(
      (i: { node_id: string; status_name: string }) =>
        i.node_id === nodeId && i.status_name === 'Node Configuration Warning',
    );

  it('flags a link left on a socket that is no longer a function parameter', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('CustomFunction', 'cf-1', 0, 0);
      await tc.addNode('WidgetButton', 'btn-1', 300, 0);

      // connect into the default "a" parameter socket, the mistake the AI makes
      const connect = await tc.callAITool('connect_sockets', {
        from_node: 'btn-1',
        from_socket: 'Out',
        to_node: 'cf-1',
        to_socket: 'a',
      });
      expect(connect.is_error, `connect: ${connect.content}`).to.not.equal(
        true,
      );

      // now rewrite the code with a different parameter name — the link to "a"
      // does not follow, so "a" is connected but no longer a parameter
      await tc.callAITool('set_socket_value', {
        node_id: 'cf-1',
        socket_name: 'Code',
        value: '(geoResult) => { return geoResult; }',
      });

      const warnings = await tc.callAITool('inspect_warnings_and_errors', {});
      const configIssues = configWarningsFor(warnings.content, 'cf-1');

      expect(
        configIssues.length,
        `expected a configuration warning, got: ${warnings.content}`,
      ).to.be.greaterThan(0);
      expect(configIssues[0].severity).to.equal('warning');
      expect(configIssues[0].message).to.match(/"a" is connected/);
      expect(configIssues[0].message, 'names the real parameter').to.match(
        /geoResult/,
      );
    });
  });

  it('does not warn once the link is on the actual parameter socket', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('CustomFunction', 'cf-1', 0, 0);
      await tc.addNode('WidgetButton', 'btn-1', 300, 0);

      // set the final code FIRST, then connect to the named parameter socket
      await tc.callAITool('set_socket_value', {
        node_id: 'cf-1',
        socket_name: 'Code',
        value: '(geoResult) => { return geoResult; }',
      });
      const connect = await tc.callAITool('connect_sockets', {
        from_node: 'btn-1',
        from_socket: 'Out',
        to_node: 'cf-1',
        to_socket: 'geoResult',
      });
      expect(connect.is_error, `connect: ${connect.content}`).to.not.equal(
        true,
      );

      const warnings = await tc.callAITool('inspect_warnings_and_errors', {});
      expect(configWarningsFor(warnings.content, 'cf-1')).to.have.length(0);
    });
  });
});
