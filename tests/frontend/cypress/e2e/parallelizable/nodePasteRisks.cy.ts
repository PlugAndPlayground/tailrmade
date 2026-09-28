import {
  openNewGraph,
  doWithTestController,
  serializedNode,
  serializedSocket,
} from '../helpers';

describe('node paste warning', () => {
  let paste: Promise<any>;
  const external = () => ({
    version: 1,
    links: [],
    nodes: [
      {
        ...serializedNode('customfunction', 'pasted-code', [
          serializedSocket(
            'Code',
            '() => { window.__pasteRuns = (window.__pasteRuns || 0) + 1; return 1; }',
            'CodeType',
          ),
          serializedSocket('Main Thread', true, 'BooleanType'),
        ]),
        version: 3,
      },
    ],
  });
  beforeEach(() => {
    openNewGraph();
  });

  it('creates and executes external nodes only after approval', () => {
    doWithTestController((controller) => {
      paste = controller.getGraph().perform_action_pasteNodes(external());
    });
    cy.get('[data-cy="node-paste-dialog"]').should('be.visible');
    doWithTestController((controller) => {
      expect(controller.getNodes()).to.have.length(0);
    });
    cy.window().then((win: any) => {
      expect(win.__pasteRuns).to.be.undefined;
    });
    cy.get('[data-cy="confirm-node-paste"]').click();
    cy.then(() => paste);
    cy.window().should((win: any) => {
      expect(win.__pasteRuns).to.be.greaterThan(0);
    });
  });

  it('cancels without creating nodes', () => {
    doWithTestController((controller) => {
      paste = controller.getGraph().perform_action_pasteNodes(external());
    });
    cy.get('[data-cy="node-paste-dialog"]')
      .contains('button', 'Cancel')
      .click();
    cy.then(() => paste).should('have.length', 0);
    doWithTestController((controller) => {
      expect(controller.getNodes()).to.have.length(0);
    });
  });

  it('duplicates local nodes without a warning', () => {
    doWithTestController(async (controller) => {
      await controller.addNode('Add', 'local');
      const graph = controller.getGraph();
      const data = graph.serializeNodes(
        [controller.getNodeByID('local')],
        false,
      );
      expect(await graph.perform_action_pasteNodes(data)).to.have.length(1);
    });
    cy.get('[data-cy="node-paste-dialog"]').should('not.exist');
  });

  it('cancels a pending paste when the graph is cleared', () => {
    doWithTestController((controller) => {
      paste = controller.getGraph().perform_action_pasteNodes(external());
    });
    cy.get('[data-cy="node-paste-dialog"]').should('be.visible');
    doWithTestController(async (controller) => {
      await controller.getGraph().clear();
    });
    cy.then(() => paste).should('have.length', 0);
    cy.get('[data-cy="node-paste-dialog"]').should('not.exist');
  });

  it('exempts a clipboard copy only while still in its source app', () => {
    let copied: any;
    doWithTestController(async (controller) => {
      await controller.addNode('Add', 'copied');
      const graph = controller.getGraph();
      graph.selection.selectNodes([controller.getNodeByID('copied')], false);
      copied = JSON.parse(JSON.stringify(graph.serializeSelection(false)));
    });
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'write').resolves();
      win.getSelection()?.removeAllRanges();
      win.document.dispatchEvent(new win.Event('copy'));
    });
    doWithTestController(async (controller) => {
      expect(
        await controller.getGraph().perform_action_pasteNodes(copied),
      ).to.have.length(1);
      await controller.getGraph().clear();
      paste = controller.getGraph().perform_action_pasteNodes(copied);
    });
    cy.get('[data-cy="node-paste-dialog"]').should('be.visible');
    cy.get('[data-cy="node-paste-dialog"]')
      .contains('button', 'Cancel')
      .click();
    cy.then(() => paste).should('have.length', 0);
  });

  it('clears sandbox globals when another app is loaded', () => {
    const load = () => {
      doWithTestController(async (controller) => {
        const graph = controller.getGraph();
        const stored = graph.getSerializedStoredGraph();
        stored.graphData.nodes = [
          {
            ...serializedNode('customfunction', 'stateful', [
              serializedSocket(
                'Code',
                '() => { const previous = globalThis.saved; globalThis.saved = "private"; return previous || "empty"; }',
                'CodeType',
              ),
              serializedSocket('Main Thread', false, 'BooleanType'),
            ]),
            version: 3,
          },
        ];
        stored.graphData.links = [];
        await graph.configure(stored);
      });
      cy.get('[data-cy="start-app"]').click();
      cy.window()
        .its('testController')
        .should((controller) => {
          expect(
            controller.getNodeByID('stateful').getOutputData('OutData'),
          ).to.equal('empty');
        });
    };
    load();
    doWithTestController(async (controller) => {
      await controller.getNodeByID('stateful').execute();
      expect(
        controller.getNodeByID('stateful').getOutputData('OutData'),
      ).to.equal('private');
    });
    load();
  });
});
