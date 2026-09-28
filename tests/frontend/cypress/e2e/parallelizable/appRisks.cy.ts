import {
  openNewGraph,
  doWithTestController,
  shouldWithTestController,
  serializedNode,
  serializedSocket,
} from '../helpers';

describe('app risk review', () => {
  let loading: Promise<boolean>;

  beforeEach(() => {
    openNewGraph();
  });

  const beginLoad = (nodes: any[], links: any[] = [], start = true): void => {
    doWithTestController((controller) => {
      const graph = controller.getGraph();
      const stored = graph.getSerializedStoredGraph();
      stored.name = 'Risk review test';
      stored.graphData.nodes = nodes;
      stored.graphData.links = links;
      loading = graph.configure(stored);
    });
    cy.then(() => loading).should('equal', true);
    cy.get('[data-cy="app-not-running"]').should('be.visible');
    if (start) cy.get('[data-cy="start-app"]').click();
  };

  const codeNode = (version = 3) => ({
    ...serializedNode('customfunction', 'code', [
      serializedSocket(
        'Code',
        '() => { window.__riskCodeRuns = (window.__riskCodeRuns || 0) + 1; return 7; }',
        'CodeType',
      ),
      serializedSocket('Main Thread', version === 3, 'BooleanType'),
    ]),
    version,
  });

  it('blocks main-thread code, HTML scripts and HTTP until approval', () => {
    let requests = 0;
    cy.intercept('GET', '**/risk-review-probe', (request) => {
      requests++;
      request.reply({ body: { ok: true } });
    });
    beginLoad(
      [
        codeNode(),
        serializedNode('iframerenderer', 'html', [
          serializedSocket(
            'Html',
            '<script>parent.__riskHtmlRuns = (parent.__riskHtmlRuns || 0) + 1;</script><p>Approved HTML</p>',
            'HtmlType',
          ),
          serializedSocket('Header', '', 'CodeType'),
          serializedSocket('Sanitize input', false, 'BooleanType'),
        ]),
        serializedNode('httpnode', 'http', [
          serializedSocket('URL', '/risk-review-probe'),
          serializedSocket('Headers', {}, 'JSONType'),
        ]),
      ],
      [],
      false,
    );
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.get('[data-cy="paused-widget"]').should('exist');
    cy.window().then((win: any) => {
      expect(win.__riskCodeRuns).to.be.undefined;
      expect(win.__riskHtmlRuns).to.be.undefined;
      expect(requests).to.equal(0);
    });
    cy.viewport(1280, 900);
    cy.screenshot('app-paused-desktop');
    cy.viewport(390, 844);
    cy.get('[data-cy="start-app"]').should('be.visible');
    cy.screenshot('app-paused-mobile');
    cy.get('[data-cy="start-app"]').click();
    cy.get('[data-cy="app-risk-dialog"]')
      .should('be.visible')
      .and('contain', 'Runs unrestricted JavaScript');
    doWithTestController(async (controller) => {
      await controller.getNodeByID('code').execute();
      expect(controller.getNodeByID('code').debug_timesExecuted).to.equal(0);
    });
    cy.window().then((win: any) => {
      expect(win.__riskCodeRuns).to.be.undefined;
      expect(win.__riskHtmlRuns).to.be.undefined;
      expect(requests).to.equal(0);
    });
    cy.viewport(1280, 900);
    cy.screenshot('app-risk-review-desktop');
    cy.viewport(390, 844);
    cy.get('[data-cy="run-reviewed-app"]').should('be.visible');
    cy.screenshot('app-risk-review-mobile');
    cy.get('[data-cy="run-reviewed-app"]').click();
    cy.then(() => loading).should('equal', true);
    cy.window().should((win: any) => {
      expect(win.__riskCodeRuns).to.be.greaterThan(0);
      expect(win.__riskHtmlRuns).to.be.greaterThan(0);
      expect(requests).to.equal(1);
    });
  });

  it('keeps the app inspectable after declining and requires approval for harmless apps', () => {
    beginLoad([codeNode()]);
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    doWithTestController((controller) =>
      expect(controller.getNodes()).to.have.length(1),
    );
    beginLoad([serializedNode('add', 'add', [])], [], false);
    cy.then(() => loading).should('equal', true);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    doWithTestController(async (controller) => {
      await controller.getNodeByID('add').execute();
      expect(controller.getNodeByID('add').debug_timesExecuted).to.equal(0);
      expect(controller.getGraph().graphConfiguredAndReady).to.equal(true);
    });
    cy.get('[data-cy="start-app"]').click();
    cy.get('[data-cy="app-not-running"]').should('not.exist');
    doWithTestController((controller) =>
      expect(
        controller.getNodeByID('add').debug_timesExecuted,
      ).to.be.greaterThan(0),
    );
  });

  it('reviews legacy main-thread migration before running it', () => {
    beginLoad([codeNode(2)]);
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Runs unrestricted JavaScript',
    );
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    cy.get('[data-cy="run-reviewed-app"]').click();
    cy.then(() => loading).should('equal', true);
    cy.window().should((win: any) =>
      expect(win.__riskCodeRuns).to.be.greaterThan(0),
    );
  });

  it('discloses connected main-thread settings before their source executes', () => {
    const code = codeNode();
    code.socketArray[1].data = false;
    beginLoad(
      [
        code,
        serializedNode('constant', 'flag', [
          serializedSocket('In', true, 'BooleanType'),
        ]),
      ],
      [
        {
          id: 'flag-link',
          sourceNodeId: 'flag',
          sourceSocketName: 'Out',
          targetNodeId: 'code',
          targetSocketName: 'Main Thread',
        },
      ],
    );
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Runs unrestricted JavaScript',
    );
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
  });

  it('runs sandboxed worker code without a risk confirmation', () => {
    beginLoad([
      {
        ...serializedNode('customfunction', 'worker', [
          serializedSocket('Code', '() => { return 42; }', 'CodeType'),
          serializedSocket('Main Thread', false, 'BooleanType'),
        ]),
        version: 3,
      },
    ]);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.then(() => loading).should('equal', true);
    shouldWithTestController((controller) =>
      expect(
        controller.getNodeByID('worker').getOutputData('OutData'),
      ).to.equal(42),
    );
  });

  it('discards an outstanding approval when another app is loaded', () => {
    beginLoad([codeNode()]);
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    beginLoad([serializedNode('add', 'replacement', [])], [], false);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    doWithTestController((controller) =>
      expect(
        controller.getNodeByID('replacement').debug_timesExecuted,
      ).to.equal(0),
    );
    cy.get('[data-cy="start-app"]').click();
    shouldWithTestController((controller) =>
      expect(
        controller.getNodeByID('replacement').debug_timesExecuted,
      ).to.be.greaterThan(0),
    );
  });

  it('lists named API keys and strips sensitive URL details', () => {
    beginLoad([
      serializedNode('httpnode', 'http', [
        serializedSocket(
          'URL',
          'https://example.com/private?token=not-for-display',
        ),
        serializedSocket(
          'Headers',
          { Authorization: 'Bearer $TM_KEY{OPENAI_KEY}' },
          'JSONType',
        ),
        serializedSocket('Send Through Companion', true, 'BooleanType'),
      ]),
    ]);
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'OPENAI_KEY')
      .and('contain', 'https://example.com')
      .and('not.contain', 'not-for-display');
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
  });
});
