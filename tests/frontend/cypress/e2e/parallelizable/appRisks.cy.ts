import { inflate } from 'pako';
import {
  openNewGraph,
  doWithTestController,
  shouldWithTestController,
  serializedNode,
  serializedSocket,
  clickNode,
  getNodeCenterById,
  controlOrMetaKey,
} from '../helpers';

describe('app risk review', () => {
  let loading: Promise<boolean>;
  let loadedFile: any;
  let png: string;

  beforeEach(() => {
    openNewGraph();
    cy.window().then((win) => {
      const canvas = win.document.createElement('canvas');
      canvas.width = canvas.height = 1;
      canvas.getContext('2d')!.fillRect(0, 0, 1, 1);
      png = canvas.toDataURL('image/png').split(',')[1];
      Object.keys(win.localStorage)
        .filter((key) => key.startsWith('tailrmade.app-approval.'))
        .forEach((key) => win.localStorage.removeItem(key));
    });
  });

  const beginLoad = (nodes: any[], links: any[] = []): void => {
    doWithTestController((controller) => {
      const graph = controller.getGraph();
      const stored = graph.getSerializedStoredGraph();
      stored.name = 'Risk review test';
      stored.graphData.nodes = nodes;
      stored.graphData.links = links;
      loadedFile = JSON.parse(JSON.stringify(stored));
      loading = graph.configure(stored);
    });
    cy.then(() => loading).should('equal', true);
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

  const externalImageURL =
    'https://images.example.test/risk-static-image.png?token=hidden-secret';
  const imageNode = (source: string) =>
    serializedNode('image', 'image', [
      serializedSocket('Image', source, 'ImageType'),
    ]);

  ['external', 'local', 'embedded', 'raw base64'].forEach((kind, index) => {
    it(`runs a fixed ${kind} image without a warning`, () => {
      const source = [
        externalImageURL,
        '/risk-static-image.png',
        `data:image/png;base64,${png}`,
        png,
      ][index];
      cy.intercept('GET', '**/risk-static-image.png*', {
        headers: {
          'content-type': 'image/png',
          'access-control-allow-origin': '*',
        },
        body: Uint8Array.from(atob(png), (char) => char.charCodeAt(0)).buffer,
      }).as('imageRequest');
      beginLoad([imageNode(source)]);
      shouldWithTestController((controller) => {
        const node = controller.getNodeByID('image');
        expect(node.debug_timesExecuted).to.be.greaterThan(0);
        expect(node.getRisks().map((risk) => risk.severity)).to.deep.equal(
          index === 0 ? ['info'] : [],
        );
        expect(node.getOutputData('Details')).to.include({
          textureWidth: 1,
          textureHeight: 1,
        });
      });
      cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
      cy.get('[data-cy="app-not-running"]').should('not.exist');
      cy.window().should((win) => {
        expect(
          Object.keys(win.localStorage).filter((key) =>
            key.startsWith('tailrmade.app-approval.'),
          ),
        ).to.be.empty;
      });
      if (index < 2) cy.wait('@imageRequest');
    });
  });

  it('shows fixed external images as information alongside blocking risks', () => {
    cy.viewport(1280, 900);
    beginLoad([codeNode(), { ...imageNode(externalImageURL), x: 400 }]);
    cy.get('[data-cy="go-to-risk-node"][data-node-id="image"]')
      .should('contain', 'Loads external images')
      .and('not.contain', 'Connects to external services')
      .and('not.contain', 'hidden-secret');
    cy.get('[data-cy="app-risk-dialog"] .MuiAlert-colorInfo').should(
      'contain',
      'Loads external images',
    );
    shouldWithTestController((controller) => {
      expect(controller.getNodeByID('code').debug_timesExecuted).to.equal(0);
    });
    cy.screenshot('external-image-information', { capture: 'runner' });
  });

  it('requires review for connected image sources before evaluating them', () => {
    beginLoad(
      [
        serializedNode('constant', 'source', [
          serializedSocket('In', externalImageURL),
        ]),
        imageNode(`data:image/png;base64,${png}`),
      ],
      [
        {
          id: 'image-link',
          sourceNodeId: 'source',
          sourceSocketName: 'Out',
          targetNodeId: 'image',
          targetSocketName: 'Image',
        },
      ],
    );
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Loads images from dynamic URLs',
    );
    shouldWithTestController((controller) => {
      expect(controller.getNodeByID('source').debug_timesExecuted).to.equal(0);
      expect(controller.getNodeByID('image').debug_timesExecuted).to.equal(0);
    });
  });

  ['CG Test.ppgraph'].forEach((fixture) => {
    it(`persists approval without saving ${fixture}`, () => {
      cy.fixture(fixture).then((raw) => {
        const stored =
          typeof raw === 'string'
            ? JSON.parse(
                new TextDecoder().decode(
                  inflate(
                    Uint8Array.from(
                      atob(raw.trim().replace(/-/g, '+').replace(/_/g, '/')),
                      (char) => char.charCodeAt(0),
                    ),
                  ),
                ),
              )
            : raw;
        (stored.graphData ?? stored).nodes.push(codeNode());
        const load = () =>
          doWithTestController(async (controller) => {
            await controller.loadStringifiedGraph(JSON.stringify(stored));
          });
        load();
        cy.get('[data-cy="run-reviewed-app"]').should('be.visible');
        doWithTestController((controller) => {
          controller.getNodeByID('code').x += 100;
        });
        cy.get('[data-cy="run-reviewed-app"]').click();
        cy.window().should((win) => {
          expect(
            Object.keys(win.localStorage).filter((key) =>
              key.startsWith('tailrmade.app-approval.'),
            ),
          ).to.have.length.greaterThan(0);
        });
        load();
        cy.get('[data-cy="app-not-running"]').should('not.exist');
        cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
      });
    });
  });

  [1280, 390].forEach((width) => {
    it(`navigates to a specific risk node without running the app at ${width}px`, () => {
      cy.viewport(width, 900);
      beginLoad([
        codeNode(),
        { ...codeNode(), id: 'second-code', x: 5000, y: 5000 },
      ]);
      cy.get('[data-cy="app-risk-dialog"]').should(
        'have.attr',
        'aria-modal',
        'false',
      );
      cy.get(
        '[aria-label="Center review"], [aria-label="Inspect alongside graph"]',
      ).should('not.exist');
      cy.get('[data-cy="go-to-risk-node"]').should('have.length', 2);
      cy.get('[data-cy="go-to-risk-node"][data-node-id="second-code"]').click();
      cy.get('[data-cy="app-risk-dialog"]')
        .should('be.visible')
        .and('have.attr', 'aria-modal', 'false');
      cy.get('[data-cy="app-not-running"]').should('not.exist');
      shouldWithTestController((controller) => {
        const graph = controller.getGraph();
        expect(
          graph.selection.selectedNodes.map((node) => node.id),
        ).to.deep.equal(['second-code']);
        const node = controller.getNodeByID('second-code');
        const position = graph.viewport.toScreen(node.x, node.y);
        expect(position.x).to.be.within(width >= 900 ? 444 : 0, width);
        expect(position.y).to.be.within(0, width >= 900 ? 900 : 468);
        expect(node.debug_timesExecuted).to.equal(0);
      });
      cy.window().then(
        (win: any) => expect(win.__riskCodeRuns).to.be.undefined,
      );
      if (width >= 900) {
        doWithTestController((controller) =>
          controller.getGraph().selection.selectNodes([], false),
        );
        clickNode('second-code');
        shouldWithTestController((controller) => {
          expect(
            controller
              .getGraph()
              .selection.selectedNodes.map((node) => node.id),
          ).to.deep.equal(['second-code']);
        });
      }
      getNodeCenterById('second-code').then(([x, y]) => {
        expect(x).to.be.within(width >= 900 ? 444 : 0, width);
        expect(y).to.be.within(0, width >= 900 ? 900 : 468);
      });
      cy.screenshot(`app-risk-panel-${width}`, { capture: 'runner' });
      cy.get('[data-cy="go-to-risk-node"][data-node-id="code"]').click();
      shouldWithTestController((controller) => {
        expect(
          controller.getGraph().selection.selectedNodes.map((node) => node.id),
        ).to.deep.equal(['code']);
      });
      cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
      cy.get('[data-cy="app-risk-dialog"]')
        .contains('button', 'Keep inspecting')
        .click();
    });
  });

  it('searches a large node list and inspects every affected node at once', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `code-${index}`);
    beginLoad(ids.map((id, index) => ({ ...codeNode(), id, x: index * 300 })));
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 30);
    cy.get('[data-cy="app-risk-dialog"]').find('input').type('code-29');
    cy.get('[data-cy="go-to-risk-node"]')
      .should('have.length', 1)
      .and('have.attr', 'data-node-id', 'code-29');
    cy.get('[data-cy="inspect-all-risk-nodes"]').click();
    cy.get('[data-cy="app-risk-dialog"]')
      .should('be.visible')
      .and('have.attr', 'aria-modal', 'false');
    shouldWithTestController((controller) => {
      expect(
        controller.getGraph().selection.selectedNodes.map((node) => node.id),
      ).to.have.members(ids);
      ids.forEach((id) =>
        expect(controller.getNodeByID(id).debug_timesExecuted).to.equal(0),
      );
    });
    cy.get('[data-cy="app-risk-dialog"]')
      .find('input')
      .should('have.value', 'code-29')
      .clear();
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 30);
  });

  it('runs the app from the review panel only after approval', () => {
    beginLoad([codeNode()]);
    cy.get('[data-cy="app-risk-dialog"]').should(
      'have.attr',
      'aria-modal',
      'false',
    );
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    cy.get('[data-cy="run-reviewed-app"]').click();
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.window().should((win: any) =>
      expect(win.__riskCodeRuns).to.be.greaterThan(0),
    );
  });

  [1280, 900].forEach((width) => {
    it(`keeps the inspector beside the review at ${width}px, including after resizing`, () => {
      cy.viewport(width, 900);
      beginLoad([codeNode()]);
      cy.get('[data-cy="go-to-risk-node"]').click();
      cy.get('[data-cy="inspector-column"]').then(($column) => {
        if ($column.width() === 0)
          cy.get('[data-cy="right-drawer-toggle-btn"]').click();
      });
      cy.get('#inspector-container-node').should('be.visible');
      const checkLayout = () => {
        cy.get('[data-cy="inspector-column"]').should(($column) => {
          const inspector = $column[0].getBoundingClientRect();
          const review = $column[0].ownerDocument
            .querySelector('[data-cy="app-risk-dialog"]')
            .getBoundingClientRect();
          expect(inspector.width).to.be.at.least(240);
          expect(inspector.left).to.be.at.least(review.right);
          expect(inspector.right).to.be.at.most(width + 1);
        });
      };
      checkLayout();
      cy.get('[data-cy="inspector-column"]')
        .children()
        .first()
        .trigger('pointerdown', {
          clientX: width - 340,
          pointerId: 1,
          eventConstructor: 'PointerEvent',
        });
      cy.get('body')
        .trigger('pointermove', {
          clientX: 0,
          pointerId: 1,
          eventConstructor: 'PointerEvent',
        })
        .trigger('pointerup', {
          pointerId: 1,
          eventConstructor: 'PointerEvent',
        });
      cy.get('[data-cy="inspector-column"]').should(($column) => {
        expect($column.width()).to.be.closeTo(width - 548, 1);
      });
      checkLayout();
      getNodeCenterById('code');
      cy.screenshot(`app-risk-inspector-${width}`, { capture: 'runner' });
      cy.get('[data-cy="graph-inspector-tab"]').click();
      cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    });
  });

  it('lists a node only once when it has several risks', () => {
    beginLoad([
      serializedNode('httpnode', 'http', [
        serializedSocket('URL', 'https://example.com/api?token=hidden-secret'),
        serializedSocket(
          'Headers',
          { Authorization: 'Bearer $TM_KEY{TEST_KEY}' },
          'JSONType',
        ),
        serializedSocket('Send Through Companion', true, 'BooleanType'),
      ]),
    ]);
    cy.get('[data-cy="inspect-risk-group"]').should(
      'have.length.greaterThan',
      1,
    );
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.get('[data-cy="go-to-risk-node"]')
      .should('contain', 'Connects to external services')
      .and('contain', 'Uses API keys')
      .and('contain', 'Uses your Companion')
      .and('contain', 'https://example.com/api')
      .and('contain', 'TEST_KEY')
      .and('not.contain', 'hidden-secret');
    cy.get('[data-cy="app-risk-dialog"]').find('input').type('TEST_KEY');
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.get('[data-cy="app-risk-dialog"]')
      .find('input')
      .clear()
      .type('external services');
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.viewport(1280, 900);
    cy.get('[data-cy="go-to-risk-node"]').scrollIntoView();
    cy.screenshot('node-capabilities-desktop', { capture: 'runner' });
    cy.viewport(390, 900);
    cy.get('[data-cy="go-to-risk-node"]').scrollIntoView();
    cy.screenshot('node-capabilities-mobile', { capture: 'runner' });
    cy.get('[data-cy="inspect-risk-group"]').first().click();
    shouldWithTestController((controller) => {
      expect(
        controller.getGraph().selection.selectedNodes.map((node) => node.id),
      ).to.deep.equal(['http']);
      expect(controller.getNodeByID('http').debug_timesExecuted).to.equal(0);
    });
  });

  [false, true].forEach((saveAs) => {
    it(`trusts an app after ${saveAs ? 'Save As' : 'Save'} without running it first`, () => {
      beginLoad([codeNode()]);
      cy.get('[data-cy="app-risk-dialog"]')
        .contains('button', 'Keep inspecting')
        .click();
      cy.get('body').type(`${controlOrMetaKey()}${saveAs ? '{shift}' : ''}s`);
      cy.contains('was saved to local database').should('be.visible');
      cy.window().then(
        (win: any) => expect(win.__riskCodeRuns).to.be.undefined,
      );
      cy.reload();
      cy.window().should((win: any) =>
        expect(win.__riskCodeRuns).to.be.greaterThan(0),
      );
      cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
      doWithTestController(async (controller) => {
        const changed = controller.getGraph().getSerializedStoredGraph();
        changed.graphData.nodes[0].socketArray.find(
          (socket: any) => socket.name === 'Code',
        ).data = '() => { window.__unsavedRiskRan = true; return 9; }';
        await controller.getGraph().configure(changed);
      });
      cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
      cy.window().then(
        (win: any) => expect(win.__unsavedRiskRan).to.be.undefined,
      );
    });
  });

  it('remembers approval on reload and reviews changed code again', () => {
    let saved: any;
    // Missing defaults are regenerated on load, including the shape's random color.
    beginLoad([codeNode(), serializedNode('DRAW_Shape', 'shape', [])]);
    cy.then(() => {
      saved = JSON.parse(JSON.stringify(loadedFile));
    });
    cy.get('[data-cy="run-reviewed-app"]').click();
    cy.get('[data-cy="app-not-running"]').should('not.exist');
    doWithTestController(async (controller) => {
      await controller.getGraph().configure(saved);
    });
    cy.get('[data-cy="app-not-running"]').should('not.exist');
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    doWithTestController(async (controller) => {
      saved.graphData.nodes[0].socketArray.find(
        (socket: any) => socket.name === 'Code',
      ).data = '() => { window.__changedRiskCodeRan = true; return 8; }';
      await controller.getGraph().configure(saved);
    });
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    cy.window().then(
      (win: any) => expect(win.__changedRiskCodeRan).to.be.undefined,
    );
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
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
    );
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    cy.get('[data-cy="paused-widget"]').should('exist');
    cy.window().then((win: any) => {
      expect(win.__riskCodeRuns).to.be.undefined;
      expect(win.__riskHtmlRuns).to.be.undefined;
      expect(requests).to.equal(0);
    });
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

  it('keeps the app inspectable after declining and automatically runs harmless apps', () => {
    beginLoad([codeNode()]);
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    doWithTestController((controller) =>
      expect(controller.getNodes()).to.have.length(1),
    );
    beginLoad([serializedNode('add', 'add', [])]);
    cy.then(() => loading).should('equal', true);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.get('[data-cy="app-not-running"]').should('not.exist');
    shouldWithTestController((controller) =>
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
    cy.get('[data-cy="app-not-running"]').should('not.exist');
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
    beginLoad([serializedNode('add', 'replacement', [])]);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    cy.get('[data-cy="app-not-running"]').should('not.exist');
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
      .and('contain', 'https://example.com/private')
      .and('not.contain', 'not-for-display');
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
  });
});
