import {
  openNewGraph,
  doWithTestController,
  serializedNode,
  serializedSocket,
} from '../helpers';

describe('Open URL safety', () => {
  beforeEach(() => {
    openNewGraph();
    cy.window().then((win) => {
      cy.stub(win, 'open').as('openWindow');
    });
  });

  it('opens normalized HTTP(S) links without an opener or referrer', () => {
    doWithTestController(async (controller) => {
      await controller.addNode('OpenURL', 'url');
      const node = controller.getNodeByID('url');
      for (const url of [
        'https://example.com/path',
        'http://example.com/',
        '/relative',
      ]) {
        node.setInputData('url', url);
        await node.execute();
      }
    });
    cy.get('@openWindow').should('have.callCount', 3);
    cy.get('@openWindow').should(
      'have.been.calledWithExactly',
      'https://example.com/path',
      '_blank',
      'noopener,noreferrer',
    );
    cy.get('@openWindow').should(
      'have.been.calledWithExactly',
      'http://example.com/',
      '_blank',
      'noopener,noreferrer',
    );
    cy.window().then((win) => {
      cy.get('@openWindow').should(
        'have.been.calledWithExactly',
        new URL('/relative', win.document.baseURI).href,
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('rejects executable, unsupported, empty and malformed URLs at runtime', () => {
    doWithTestController(async (controller) => {
      await controller.addNode('OpenURL', 'url');
      const node = controller.getNodeByID('url');
      for (const url of [
        'javascript:alert(1)',
        ' \nJaVaScRiPt:alert(1)',
        'java\tscript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///tmp/file',
        'mailto:user@example.com',
        'blob:https://example.com/id',
        '',
        'http://[',
      ]) {
        node.setInputData('url', url);
        await node.execute();
        expect(node.status.node.message).to.match(/HTTP.*HTTPS/);
      }
    });
    cy.get('@openWindow').should('not.have.been.called');
  });

  it('discloses navigation before running a loaded app', () => {
    doWithTestController(async (controller) => {
      const graph = controller.getGraph();
      const stored = graph.getSerializedStoredGraph();
      stored.graphData.nodes = [
        {
          ...serializedNode('openurl', 'url', [
            serializedSocket(
              'url',
              'https://user:secret@example.com/path?token=secret#secret',
            ),
          ]),
          version: 4,
        },
      ];
      stored.graphData.links = [];
      await graph.configure(stored);
    });
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'Opens web pages')
      .and('contain', 'https://example.com/path')
      .and('not.contain', 'secret');
    cy.get('@openWindow').should('not.have.been.called');
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
  });
});
