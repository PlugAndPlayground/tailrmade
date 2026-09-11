import {
  clearGraph,
  closeBothDrawers,
  doWithTestController,
  exitDashboardEditMode,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const surfaceId = 'text-node-surface';

const canvasEditor = (nodeId: string) => cy.get(`[data-cy="${nodeId}-canvas"]`);

// a native click: Cypress's simulated click closes the menu before the
// option is pressed, which real pointer input does not
const clickPickerOption = (label: string) =>
  cy.get('[data-cy="text-token-picker-option"]').contains(label).realClick();

const pickerOption = (label: string) =>
  cy.get('[data-cy="text-token-picker-option"]').contains(label);

const inputNames = (testController, nodeId: string) =>
  testController.getInputSockets(nodeId).map((socket) => socket.name);

const addTextNode = (nodeId: string) => {
  doWithTestController(async (testController) => {
    await testController.addNode('Text', nodeId, -300, -150);
    // a user edits a node they selected; canvas editing ends on the next
    // redraw (e.g. a new socket) for a node that is not the only selection
    testController.selectNodesById([nodeId]);
  });
  // focus without a click: a click would leave canvas editing again. Auto
  // focus is covered by testText, which runs after the app has been used -
  // before any real interaction the browser does not hand focus over
  canvasEditor(nodeId).should('have.attr', 'contenteditable', 'true').focus();
};

const setContent = (nodeId: string, content: unknown) => {
  doWithTestController(async (testController) => {
    testController.setNodeInputValue(nodeId, 'Content', content);
    await testController.executeNodeByID(nodeId);
  });
};

const placeOnSurface = (children: unknown[], surface = surfaceId) => {
  doWithTestController(async (testController) => {
    if (!testController.getNodes().some((node) => node.id === surface)) {
      await testController.addNode('UISurfaceNode', surface, 500, 0);
    }
    const result = await testController.callAITool('set_surface_layout', {
      node_id: surface,
      layout: { direction: 'column', children },
    });
    expect(result.is_error, result.content).to.not.equal(true);
    testController.toggleDashboard('OPEN');
  });
  cy.get('[data-cy="dashboard"]').should('be.visible');
};

const openEditMode = () => {
  cy.get('body').then(($body) => {
    if (
      $body.find('[data-cy="toggle-edit-mode-btn"] svg[data-testid="EditIcon"]')
        .length > 0
    ) {
      cy.get('[data-cy="toggle-edit-mode-btn"]').first().click({ force: true });
    }
  });
  cy.get(
    '[data-cy="toggle-edit-mode-btn"] svg[data-testid="CloseIcon"]',
  ).should('exist');
};

const surfaceTree = (testController, surface = surfaceId) =>
  testController.getNodeInputValue(surface, 'Layout JSON').tree;

// node types are stored lowercased
const textNodes = (testController) =>
  testController.getNodes().filter((node) => node.type === 'text');

describe('dynamic Text node', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('creates inputs from the token picker through the undo stack', () => {
    addTextNode('dyn-text');
    canvasEditor('dyn-text').type('{selectall}{backspace}Temp: @temp', {
      force: true,
    });
    clickPickerOption('＋ new input "temp"');

    shouldWithTestController((testController) => {
      expect(inputNames(testController, 'dyn-text')).to.include('temp');
      expect(testController.getInputSocketType('dyn-text', 'temp')).to.eq(
        'Any',
      );
    });
    canvasEditor('dyn-text')
      .find('[data-cy="text-token"][data-token-source="{{temp}}"]')
      .should('have.attr', 'data-token-state', 'unresolved');

    doWithTestController(async (testController) => {
      const { entries } = testController.getActionHistory();
      const addInput = entries.findIndex((entry) => entry.name === 'Add input');
      expect(addInput, 'socket creation is an undo entry').to.be.gte(0);
      // undo everything from the socket creation on, then redo it all
      const steps = entries.length - addInput;
      for (let i = 0; i < steps; i++) await testController.undo();
      expect(inputNames(testController, 'dyn-text')).to.not.include('temp');
      for (let i = 0; i < steps; i++) await testController.redo();
      expect(inputNames(testController, 'dyn-text')).to.include('temp');
    });
  });

  it('rejects reserved and duplicate input names', () => {
    addTextNode('names-text');
    canvasEditor('names-text').type('{selectall}{backspace}@format', {
      force: true,
    });
    pickerOption('＋ new input "format"')
      .closest('[data-cy="text-token-picker-option"]')
      .should('have.class', 'Mui-disabled')
      .and('contain.text', 'reserved');
    canvasEditor('names-text').type('{esc}{selectall}{backspace}@Content', {
      force: true,
    });
    pickerOption('＋ new input "Content"')
      .closest('[data-cy="text-token-picker-option"]')
      .should('have.class', 'Mui-disabled')
      .and('contain.text', 'already exists');
  });

  it('resolves object input paths', () => {
    addTextNode('object-text');
    canvasEditor('object-text').type('{selectall}{backspace}@d', {
      force: true,
    });
    clickPickerOption('＋ new object input "d"');
    shouldWithTestController((testController) => {
      expect(testController.getInputSocketType('object-text', 'd')).to.eq(
        'JSON',
      );
    });
    doWithTestController(async (testController) => {
      testController.setNodeInputValue('object-text', 'd', { temp: 21.5 });
      await testController.executeNodeByID('object-text');
    });
    canvasEditor('object-text')
      .focus()
      .type('{moveToEnd} @d.temp', { force: true });
    clickPickerOption('d.temp');

    canvasEditor('object-text')
      .find('[data-token-source="{{d.temp}}"]')
      .should('have.attr', 'data-token-state', 'resolved')
      .and('have.text', '21.5');
    shouldWithTestController((testController) => {
      expect(
        testController.getNodeOutputValue('object-text', 'Output'),
      ).to.contain('21.5');
    });
  });

  it('shows the text on the app theme card, styled through its sockets', () => {
    addTextNode('styled-text');
    // the canvas shows the text on the app theme's ground, not the editor's
    canvasEditor('styled-text')
      .closest('[data-cy="text-canvas-card"]')
      .should(($card) => {
        const { backgroundColor, color } = getComputedStyle($card[0]);
        expect(backgroundColor).to.not.eq('rgba(0, 0, 0, 0)');
        expect(color).to.not.eq(backgroundColor);
      });

    // the node inspector is its plain socket list
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="Variant-type-selector-button"]').should('exist');
    cy.get('[data-cy="text-settings"]').should('not.exist');

    doWithTestController(async (testController) => {
      testController.setNodeInputValue('styled-text', 'Variant', 'h2');
      await testController.executeNodeByID('styled-text');
    });
    canvasEditor('styled-text').should('have.css', 'font-size', '24px');
  });

  it('marks invalid tokens while editing and hides them at runtime', () => {
    addTextNode('invalid-text');
    setContent(
      'invalid-text',
      'Now: {{missing}} / {{format missing fallback="none"}}',
    );
    canvasEditor('invalid-text')
      .find('[data-token-state="unresolved"]')
      .should('have.length', 2);
    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue('invalid-text', 'Output')).to.eq(
        'Now:  / none',
      );
    });

    placeOnSurface([{ widget: 'invalid-text' }]);
    exitDashboardEditMode();
    cy.get('[data-cy="widget of NODE_invalid-text"]')
      .should('contain.text', 'Now:  / none')
      .and('not.contain.text', '{{')
      .find('[data-cy="text-token"]')
      .should('not.exist');

    openEditMode();
    cy.get('[data-cy="widget of NODE_invalid-text"]')
      .find('[data-token-state="unresolved"]')
      .should('have.length', 2);
  });

  it('converts static to dynamic and back as single undo steps', () => {
    placeOnSurface([
      { id: 'greeting', text: 'Hello ', variant: 'h2', tone: 'accent' },
    ]);
    openEditMode();
    cy.get('[data-cy="dashboard"] [data-cy="static-text"]').click({
      force: true,
    });
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="convert-to-dynamic-text"]').click({ force: true });

    let nodeId: string;
    shouldWithTestController((testController) => {
      const [node] = textNodes(testController);
      expect(node, 'a Text node was created').to.exist;
      nodeId = node.id;
      const item = surfaceTree(testController).greeting;
      expect(item.type.resolvedName).to.eq('DynamicWidget');
      expect(item.props.id).to.eq(`NODE_${nodeId}`);
      expect(testController.getNodeInputValue(nodeId, 'Variant')).to.eq('h2');
      expect(testController.getNodeInputValue(nodeId, 'Tone')).to.eq('accent');
    });

    doWithTestController(async (testController) => {
      await testController.undo();
      expect(textNodes(testController)).to.have.length(0);
      expect(surfaceTree(testController).greeting.type.resolvedName).to.eq(
        'Text',
      );
      await testController.redo();
      expect(textNodes(testController).map((node) => node.id)).to.deep.eq([
        nodeId,
      ]);
      expect(surfaceTree(testController).greeting.props.id).to.eq(
        `NODE_${nodeId}`,
      );

      testController.createTokenInput(nodeId, 'name', 'scalar');
    });
    doWithTestController(async (testController) => {
      testController.setNodeInputValue(nodeId, 'name', 'Ada');
      testController.setNodeInputValue(nodeId, 'Content', '**Hello {{name}}**');
      await testController.executeNodeByID(nodeId);
      testController.selectDashboardItemByElementId(`NODE_${nodeId}`);
    });

    cy.get('[data-cy="convert-to-static-text"]')
      .should('not.be.disabled')
      .click({ force: true });

    shouldWithTestController((testController) => {
      expect(textNodes(testController)).to.have.length(0);
      const item = surfaceTree(testController).greeting;
      expect(item.type.resolvedName).to.eq('Text');
      expect(item.props.tone).to.eq('accent');
      expect(item.props.content).to.eq('**Hello Ada**');
    });

    doWithTestController(async (testController) => {
      await testController.undo();
      expect(textNodes(testController)).to.have.length(1);
      expect(surfaceTree(testController).greeting.props.id).to.eq(
        `NODE_${nodeId}`,
      );
      expect(testController.getSocketLinks(nodeId, 'ReactUI')).to.have.length(
        1,
      );
      await testController.redo();
      expect(textNodes(testController)).to.have.length(0);
      expect(surfaceTree(testController).greeting.type.resolvedName).to.eq(
        'Text',
      );
    });
  });

  it('only offers static conversion for a single, unshared placement', () => {
    addTextNode('shared-text');
    placeOnSurface([{ widget: 'shared-text' }]);
    doWithTestController(async (testController) => {
      await testController.addNode('Label', 'consumer', 0, 300);
      await testController.connectNodesByID(
        'shared-text',
        'consumer',
        'Output',
        'Input',
      );
    });
    openEditMode();
    doWithTestController((testController) => {
      testController.selectDashboardItemByElementId('NODE_shared-text');
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="convert-to-static-text"]').should('be.disabled');
    cy.get('[data-cy="text-conversion-guard"]').should(
      'contain.text',
      'Other nodes use this text node',
    );

    doWithTestController(async (testController) => {
      await testController.disconnectLink('consumer', 'Input');
    });
    placeOnSurface([{ widget: 'shared-text' }], 'second-surface');
    doWithTestController((testController) => {
      testController.selectDashboardItemByElementId('NODE_shared-text');
    });
    cy.get('[data-cy="text-conversion-guard"]').should(
      'contain.text',
      'more than one UI surface',
    );
  });

  it('migrates legacy Text nodes and keeps their links', () => {
    const legacyText = (id: string, input: string) => ({
      type: 'Text',
      id,
      x: 0,
      y: id === 'legacy-linked' ? 200 : 0,
      width: 160,
      height: 60,
      socketArray: [
        {
          socketType: 'out',
          name: 'Output',
          dataType: '{"class":"StringType"}',
        },
        {
          socketType: 'in',
          name: 'Input',
          dataType: '{"class":"StringType"}',
          data: input,
        },
        {
          socketType: 'in',
          name: 'Font size',
          dataType: '{"class":"NumberType"}',
          data: 40,
        },
        {
          socketType: 'in',
          name: 'Font weight',
          dataType: '{"class":"EnumType"}',
          data: 'Bold',
        },
        {
          socketType: 'in',
          name: 'Text color',
          dataType: '{"class":"ColorType"}',
          data: { r: 10, g: 200, b: 30, a: 1 },
        },
      ],
      updateBehaviour: { load: true, update: true, interval: false },
    });
    const graph = {
      version: 7,
      graphSettings: {
        showExecutionVisualisation: true,
        viewportCenterPosition: { x: 0, y: 0 },
        viewportScale: 1,
      },
      nodes: [
        legacyText('legacy-plain', 'kept text'),
        legacyText('legacy-linked', 'stale'),
        {
          type: 'Constant',
          id: 'legacy-constant',
          x: -300,
          y: 200,
          width: 100,
          height: 60,
          socketArray: [
            {
              socketType: 'in',
              name: 'In',
              dataType: '{"class":"NumberType"}',
              data: 42,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [
        {
          sourceNodeId: 'legacy-constant',
          sourceSocketName: 'Out',
          targetNodeId: 'legacy-linked',
          targetSocketName: 'Input',
        },
        {
          sourceNodeId: 'legacy-constant',
          sourceSocketName: 'Out',
          targetNodeId: 'legacy-linked',
          targetSocketName: 'Font size',
        },
      ],
    };

    doWithTestController(async (testController) => {
      await testController.loadStringifiedGraph(JSON.stringify(graph));
      await testController.waitForPendingExecution();
    });

    shouldWithTestController((testController) => {
      expect(testController.getNodeOutputValue('legacy-plain', 'Output')).to.eq(
        'kept text',
      );
      expect(
        testController.getNodeOutputValue('legacy-linked', 'Output'),
      ).to.eq('42');
      expect(
        testController.getInputLinkSourceNodeID('legacy-linked', 'Input'),
      ).to.eq('legacy-constant');
      expect(
        testController.getNodeInputValue('legacy-linked', 'Custom styles'),
      ).to.deep.eq({
        fontSize: '40px',
        fontWeight: '700',
        lineHeight: 1.15,
        color: 'rgb(10, 200, 30)',
      });
      expect(inputNames(testController, 'legacy-plain')).to.not.include(
        'Input',
      );
    });
  });
});
