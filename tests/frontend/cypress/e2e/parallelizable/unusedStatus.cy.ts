import {
  closeBothDrawers,
  doWithTestController,
  getStableScreenCoordinates,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

describe('unused node status', () => {
  it('defaults to unused outputs and lets nodes with independent effects opt out', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      // These types had no opt-in override under the previous implementation.
      const source = await controller.addNode('JSONGet', 'default-source');
      const consumer = await controller.addNode(
        'MathMax',
        'default-consumer',
        600,
        0,
      );
      expect(source.getSeemsUnused()).to.eq(true);
      expect(consumer.getSeemsUnused()).to.eq(true);
      expect(source.getSeemsUnused.call({ outputSocketArray: [] })).to.eq(true);
      await controller.connectNodesByID(source.id, consumer.id);
      expect(source.getSeemsUnused()).to.eq(false);

      for (const type of [
        'WidgetButton',
        'UISurfaceNode',
        'ConsolePrint',
        'StateWrite',
        'StorageWrite',
        'Macro',
        'ExecuteMacro',
      ]) {
        const node = await controller.addNode(type, `protected-${type}`);
        expect(node.getSeemsUnused(), type).to.eq(false);
        expect(
          node
            .getVisibleStatuses()
            .some((status) => status.getSeverityName() === 'unused'),
          type,
        ).to.eq(false);
      }
    });
  });

  it('uses execution mode and operation settings, updating badges without execution', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      const cases: Array<[string, string, unknown, unknown]> = [
        ['CustomFunction', 'Main Thread', false, true],
        ['HTTPNode', 'Method', 'Get', 'Post'],
        ['AINode', 'Persistant conversation', false, true],
        ['Screenshot', 'Source', 'Graph', 'Screen sharing'],
        ['Theme', 'Mode', 'Keep app setting', 'dark'],
      ];
      for (const [type, setting, unusedValue, usefulValue] of cases) {
        const node = await controller.addNode(type, `conditional-${type}`);
        controller.setNodeInputValue(node.id, setting, unusedValue);
        expect(node.getSeemsUnused(), `${type}: unused result`).to.eq(true);
        const executions = node.debug_timesExecuted;
        controller.setNodeInputValue(node.id, setting, usefulValue);
        expect(node.getSeemsUnused(), `${type}: independent effect`).to.eq(
          false,
        );
        expect(
          node
            .getVisibleStatuses()
            .some((status) => status.getSeverityName() === 'unused'),
        ).to.eq(false);
        controller.setNodeInputValue(node.id, setting, unusedValue);
        expect(node.getSeemsUnused(), `${type}: restored setting`).to.eq(true);
        expect(
          controller.getStatusBadgeCenter(node.id, 'status'),
          `${type}: badge refreshed`,
        ).not.to.be.null;
        expect(node.debug_timesExecuted, `${type}: not executed`).to.eq(
          executions,
        );
      }

      const custom = controller.getNodeByID('conditional-CustomFunction');
      const consumer = await controller.addNode('Constant', 'code-consumer');
      await controller.connectNodesByID(custom.id, consumer.id, 'Code', 'In');
      expect(custom.getSeemsUnused(), 'connected Code output is used').to.eq(
        false,
      );
      await controller.disconnectLink(consumer.id, 'In');
      expect(custom.getSeemsUnused()).to.eq(true);

      const socket = await controller.addNode(
        'WebSocketNode',
        'conditional-websocket',
      );
      expect(socket.getSeemsUnused(), 'empty URL').to.eq(true);
      socket.setInputData('Enabled', false);
      socket.setInputData('URL', 'wss://example.invalid');
      expect(socket.getSeemsUnused(), 'disabled').to.eq(true);
      socket.setInputData('Enabled', true);
      expect(socket.getSeemsUnused(), 'configured sender').to.eq(false);
      socket.setInputData('Enabled', false);

      const state = await controller.addNode('State', 'conditional-state');
      expect(state.getSeemsUnused(), 'unconsumed internal state').to.eq(true);
      await controller.connectNodesByID(consumer.id, state.id, 'Out', 'State');
      expect(
        state.getSeemsUnused(),
        'writes back to the linked state source',
      ).to.eq(false);
      await controller.disconnectLink(state.id, 'State');
      expect(state.getSeemsUnused()).to.eq(true);

      for (const type of [
        'ArrayMethod',
        'MapNode',
        'Filter',
        'ArrayFind',
        'Reduce',
        'LoadNPM',
        'ReactUICombineArray',
        'PixotopeGatewayGet',
      ]) {
        const node = await controller.addNode(type, `unused-${type}`);
        expect(node.getSeemsUnused(), type).to.eq(true);
      }
      const call = await controller.addNode(
        'PixotopeGatewayCall',
        'gateway-call',
      );
      call.setInputData('Method', 'Get');
      expect(call.getSeemsUnused(), 'RPC method is not an HTTP verb').to.eq(
        false,
      );
      const write = await controller.addNode(
        'PixotopeGatewaySet',
        'gateway-set',
      );
      expect(
        write.getSeemsUnused(),
        'gateway writes have independent effects',
      ).to.eq(false);
    });
  });

  it('shows unused status below warnings and updates without executing the source', () => {
    openNewGraph();
    closeBothDrawers();
    doWithTestController(async (controller) => {
      await controller.addNode('Add', 'source');
      await controller.addNode('Add', 'consumer', 600, 0);
    });
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('source');
      expect(node.getWorstStatus()?.getSeverityName()).to.eq('unused');
      expect(node.getWorstStatus()?.getBucketName()).to.eq('Unused');
      expect(node.getWorstStatus()?.getName()).to.eq('Possibly unused');
      expect(node.getWarningsAndErrors()).to.have.length(0);
      expect(controller.getStatusBadgeCenter('source', 'status')).not.to.be
        .null;
    });

    doWithTestController(async (controller) => {
      await controller.connectNodesByID(
        'source',
        'consumer',
        'Added',
        'Addend',
      );
    });
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('source').getVisibleStatuses(),
      ).to.have.length(0);
      expect(controller.getStatusBadgeCenter('source', 'status')).to.be.null;
    });

    doWithTestController(async (controller) => {
      await controller.disconnectLink('consumer', 'Addend');
    });
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('source').getWorstStatus()?.getSeverityName(),
      ).to.eq('unused');
      expect(controller.getStatusBadgeCenter('source', 'status')).not.to.be
        .null;
    });

    doWithTestController(async (controller) => {
      controller.setNodeInputValue('source', 'Addend', 'not a number');
      await controller.executeNodeByID('source');
    });
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('source');
      expect(
        node.getVisibleStatuses().map((status) => status.getSeverityName()),
      ).to.deep.eq(['warning', 'unused']);
      expect(node.getWorstStatus()?.getSeverityName()).to.eq('warning');
    });

    doWithTestController((controller) =>
      controller.zoomToFitNodesById(['source']),
    );
    getStableScreenCoordinates((controller) =>
      controller.getStatusBadgeCenter('source', 'status'),
    ).then(([x, y]) => cy.get('#pixi-container').realClick({ x, y }));
    cy.get('[data-cy="status-detail-message"]').should('have.length', 2);
    doWithTestController(async (controller) => {
      controller.setNodeInputValue('source', 'Addend', 5);
      await controller.executeNodeByID('source');
    });
    cy.get('[data-cy="status-detail-message"]')
      .should('have.length', 1)
      .and(
        'contain',
        'may be unused because none of its outputs are connected',
      );
    cy.get('[role="img"][aria-label="Unused"]').should('be.visible');
  });
});
