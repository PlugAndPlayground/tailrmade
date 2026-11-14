import { inflate } from 'pako';
import {
  approveLoadedTestApp,
  openNewGraph,
  doWithTestController,
  shouldWithTestController,
  serializedNode,
  serializedGraph,
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

  it('reviews a Load NPM package before importing it', () => {
    let requests = 0;
    cy.intercept('GET', 'https://esm.run/**', (request) => {
      requests += 1;
      request.reply({
        headers: { 'content-type': 'text/javascript' },
        body: 'window.__riskPackageRuns = 1; export default {};',
      });
    });
    beginLoad([
      {
        ...serializedNode('loadnpm', 'package', [
          serializedSocket(
            'Package Name',
            'risk-test-package@1.0.0',
            'StringType',
          ),
        ]),
        version: 6,
      },
    ]);
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'Run unsandboxed code')
      .and('contain', 'Load data from other sites')
      .and('contain', 'https://esm.run/risk-test-package@1.0.0');
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('package');
      expect(node.getRisks().map((risk) => risk.kind)).to.deep.equal([
        'unrestricted-code',
        'network',
      ]);
      expect(node.debug_timesExecuted).to.equal(0);
    });
    cy.window().then((win: any) => {
      expect(win.__riskPackageRuns).to.be.undefined;
      expect(requests).to.equal(0);
    });
  });

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
    cy.get('[data-cy="risk-nodes-tab"]').click();
    cy.get('[data-cy="go-to-risk-node"][data-node-id="image"]')
      .should('contain', 'Can load images from other sites')
      .and('not.contain', 'send data to other sites')
      .and('not.contain', 'hidden-secret');
    cy.get('[data-cy="risk-actions-tab"]').click();
    cy.get('[data-cy="risk-details"][data-risk-severity="info"]').should(
      'contain',
      'Load images from other sites',
    );
    shouldWithTestController((controller) => {
      expect(controller.getNodeByID('code').debug_timesExecuted).to.equal(0);
    });
    cy.screenshot('external-image-information', { capture: 'runner' });
  });

  it('runs a connected constant image source without a warning', () => {
    cy.intercept('GET', '**/risk-static-image.png*', {
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': '*',
      },
      body: Uint8Array.from(atob(png), (char) => char.charCodeAt(0)).buffer,
    }).as('imageRequest');
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
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('image');
      expect(node.debug_timesExecuted).to.be.greaterThan(0);
      expect(node.getRisks().map((risk) => risk.severity)).to.deep.equal([
        'info',
      ]);
      expect(node.getOutputData('Details')).to.include({
        textureWidth: 1,
        textureHeight: 1,
      });
    });
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.get('[data-cy="app-not-running"]').should('not.exist');
    cy.wait('@imageRequest');
  });

  it('requires review for dynamic image sources before evaluating them', () => {
    beginLoad(
      [
        {
          ...serializedNode('customfunction', 'source', [
            serializedSocket(
              'Code',
              `() => ${JSON.stringify(externalImageURL)}`,
              'CodeType',
            ),
            serializedSocket('Main Thread', false, 'BooleanType'),
          ]),
          version: 3,
        },
        imageNode(`data:image/png;base64,${png}`),
      ],
      [
        {
          id: 'image-link',
          sourceNodeId: 'source',
          sourceSocketName: 'OutData',
          targetNodeId: 'image',
          targetSocketName: 'Image',
        },
      ],
    );
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Load images from addresses set while running',
    );
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('source').debug_timesExecuted,
      ).to.be.greaterThan(0);
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
      // An app without a UI opens on the graph, also on mobile, so the
      // review is the non-modal panel from the start
      cy.get('[data-cy="app-risk-dialog"]').should(
        'have.attr',
        'aria-modal',
        'false',
      );
      cy.get(
        '[aria-label="Center review"], [aria-label="Inspect alongside graph"]',
      ).should('not.exist');
      cy.get('[data-cy="risk-nodes-tab"]').click();
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
    cy.get('[data-cy="risk-nodes-tab"]').click();
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
      cy.get('[data-cy="risk-nodes-tab"]').click();
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
    cy.get('[data-cy="risk-nodes-tab"]').click();
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.get('[data-cy="go-to-risk-node"]')
      .should('contain', 'Can send data to other sites')
      .and('contain', 'Can use API keys')
      .and('contain', 'Can use your Companion')
      .and('contain', 'https://example.com/api')
      .and('contain', 'TEST_KEY')
      .and('not.contain', 'hidden-secret');
    cy.get('[data-cy="app-risk-dialog"]').find('input').type('TEST_KEY');
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.get('[data-cy="app-risk-dialog"]')
      .find('input')
      .clear()
      .type('other sites');
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 1);
    cy.viewport(1280, 900);
    cy.get('[data-cy="go-to-risk-node"]').scrollIntoView();
    cy.screenshot('node-capabilities-desktop', { capture: 'runner' });
    cy.viewport(390, 900);
    cy.get('[data-cy="go-to-risk-node"]').scrollIntoView();
    cy.screenshot('node-capabilities-mobile', { capture: 'runner' });
    cy.get('[data-cy="risk-actions-tab"]').click();
    cy.get('[data-cy="inspect-risk-group"]').first().click();
    shouldWithTestController((controller) => {
      expect(
        controller.getGraph().selection.selectedNodes.map((node) => node.id),
      ).to.deep.equal(['http']);
      expect(controller.getNodeByID('http').debug_timesExecuted).to.equal(0);
    });
  });

  it('reviews Pixotope nodes, which have no HTTP node sockets', () => {
    beginLoad([
      serializedNode('pixotopegatewayget', 'gateway-get', []),
      serializedNode('pixotopegatewayset', 'gateway-set', []),
      serializedNode('pixotopegatewaycall', 'gateway-call', []),
    ]);
    cy.get('[data-cy="risk-nodes-tab"]').click();
    cy.get('[data-cy="go-to-risk-node"]').should('have.length', 3);
    cy.get('[data-cy="go-to-risk-node"]').each((node) => {
      cy.wrap(node)
        .should('contain', 'Can send data to other sites')
        .and('contain', 'localhost:16208')
        .and('not.contain', 'use your Companion');
    });
  });

  [false, true].forEach((saveAs) => {
    it(`asks again after ${saveAs ? 'Save As' : 'Save'} on an app that is still paused`, () => {
      beginLoad([codeNode()]);
      cy.get('[data-cy="app-risk-dialog"]')
        .contains('button', 'Keep inspecting')
        .click();
      cy.get('body').type(`${controlOrMetaKey()}${saveAs ? '{shift}' : ''}s`);
      cy.contains('was saved to local database').should('be.visible');
      cy.window().then((win: any) => {
        expect(win.__riskCodeRuns).to.be.undefined;
        expect(
          Object.keys(win.localStorage).filter((key) =>
            key.startsWith('tailrmade.app-approval.'),
          ),
        ).to.be.empty;
      });
      cy.reload();
      cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
      cy.window().then(
        (win: any) => expect(win.__riskCodeRuns).to.be.undefined,
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

  it('blocks main-thread code, HTML scripts and HTTP writes until approval', () => {
    let requests = 0;
    cy.intercept('POST', '**/risk-review-probe', (request) => {
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
          serializedSocket('Method', 'Post', 'EnumType'),
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
      .and('contain', 'Run unsandboxed code');
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

  it('resolves constant concatenated HTTP URLs before approval and runs safe GETs', () => {
    let requests = 0;
    const origin = new URL(
      Cypress.expose('pnpBaseUrl') || 'http://127.0.0.1:8080',
    ).origin;
    cy.intercept('GET', '**/constant-risk-probe*', (request) => {
      requests++;
      request.reply({ body: { ok: true } });
    });
    beginLoad(
      [
        codeNode(),
        serializedNode('constant_string', 'host', [
          serializedSocket('String', origin),
        ]),
        serializedNode('constant_string', 'path', [
          serializedSocket('String', '/constant-risk-probe?value='),
        ]),
        serializedNode('constant_number', 'query', [
          serializedSocket('Number', 42, 'NumberType'),
        ]),
        serializedNode('concatenate', 'url', [
          serializedSocket('host', ''),
          serializedSocket('path', ''),
          serializedSocket('query', ''),
        ]),
        serializedNode('httpnode', 'get', [
          serializedSocket('Headers', {}, 'JSONType'),
        ]),
      ],
      [
        {
          sourceNodeId: 'host',
          sourceSocketName: 'String',
          targetNodeId: 'url',
          targetSocketName: 'host',
        },
        {
          sourceNodeId: 'path',
          sourceSocketName: 'String',
          targetNodeId: 'url',
          targetSocketName: 'path',
        },
        {
          sourceNodeId: 'query',
          sourceSocketName: 'Number',
          targetNodeId: 'url',
          targetSocketName: 'query',
        },
        {
          sourceNodeId: 'url',
          sourceSocketName: 'Concatenated',
          targetNodeId: 'get',
          targetSocketName: 'URL',
        },
      ],
    );
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      `${origin}/constant-risk-probe`,
    );
    shouldWithTestController((controller) => {
      expect(
        controller
          .getNodeByID('get')
          .getRisks()
          .map((risk) => risk.severity),
      ).to.deep.equal(['info']);
      expect(requests).to.equal(1);
      expect(controller.getNodeByID('code').debug_timesExecuted).to.equal(0);
    });
  });

  it('runs sanitized static HTML with informational external URLs', () => {
    beginLoad([
      serializedNode('htmlrenderer', 'static-html', [
        serializedSocket(
          'Html',
          '<p>Safe HTML</p><a href="https://example.com/path?token=hidden">Link</a><img src="/assets/Tailrmade512.png">',
          'HtmlType',
        ),
        serializedSocket('Sanitize input', true, 'BooleanType'),
      ]),
    ]);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('static-html');
      expect(node.debug_timesExecuted).to.be.greaterThan(0);
      expect(
        node
          .getRisks()
          .map((risk) => ({ target: risk.target, severity: risk.severity })),
      ).to.deep.equal([
        { target: 'https://example.com/path?token=…', severity: 'info' },
      ]);
    });
  });

  const workerSource = (id: string, value: string) => ({
    ...serializedNode('customfunction', id, [
      serializedSocket('Code', `() => ${JSON.stringify(value)}`, 'CodeType'),
      serializedSocket('Main Thread', false, 'BooleanType'),
    ]),
    version: 3,
  });
  const riskKinds = (controller, id: string) =>
    controller
      .getNodeByID(id)
      .getRisks()
      .map((risk) => risk.kind);

  it('reports markup set while running as content, not as sending data', () => {
    beginLoad(
      [
        workerSource('markup', '<a href="https://example.com">Link</a>'),
        serializedNode('htmlrenderer', 'html', [
          serializedSocket('Sanitize input', true, 'BooleanType'),
        ]),
        serializedNode('slideshow', 'slides', [
          serializedSocket('Sanitize input', true, 'BooleanType'),
        ]),
      ],
      [
        linkTo('markup', 'OutData', 'html', 'Html'),
        linkTo('markup', 'OutData', 'slides', 'Data'),
      ],
    );
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'Load content from addresses set while running')
      .and('not.contain', 'Send data to other sites');
    shouldWithTestController((controller) => {
      expect(riskKinds(controller, 'html')).to.deep.equal(['dynamic-content']);
      expect(riskKinds(controller, 'slides')).to.deep.equal([
        'network',
        'dynamic-content',
      ]);
    });
  });

  it('reports unsanitized markup only as unrestricted code', () => {
    beginLoad([
      serializedNode('htmlrenderer', 'html', [
        serializedSocket('Html', '<script>1</script>', 'HtmlType'),
        serializedSocket('Sanitize input', false, 'BooleanType'),
      ]),
      serializedNode('slideshow', 'slides', [
        serializedSocket('Sanitize input', false, 'BooleanType'),
      ]),
    ]);
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    shouldWithTestController((controller) => {
      for (const id of ['html', 'slides']) {
        expect(riskKinds(controller, id)).to.deep.equal(['unrestricted-code']);
      }
    });
  });

  it('reports a stock Embed website as unrestricted code', () => {
    beginLoad([serializedNode('embedwebsite', 'embed', [])]);
    cy.get('[data-cy="app-risk-dialog"]').should('be.visible');
    shouldWithTestController((controller) => {
      const node = controller.getNodeByID('embed');
      expect(node.getInputData('Sanitize input')).to.equal(false);
      expect(riskKinds(controller, 'embed')).to.deep.equal([
        'unrestricted-code',
      ]);
    });
  });

  it('keeps all unsanitized iframe markup unrestricted', () => {
    const embed = (id: string, html: string) =>
      serializedNode('embedwebsite', id, [
        serializedSocket('Html', html, 'HtmlType'),
      ]);
    beginLoad([
      // A leading script is parsed into the head, where DOMPurify drops it
      // without listing it as removed.
      embed('script', '<script>1</script><p>Hi</p>'),
      embed('document', '<!DOCTYPE html><html><body><p>Hi</p></body></html>'),
      embed(
        'handler',
        '<iframe src="https://example.com" onload="1"></iframe>',
      ),
      embed('own-page', '<iframe src="/?new=true"></iframe>'),
      embed('template', '<iframe src="{{url}}"></iframe>'),
      serializedNode('iframerenderer', 'stock-iframe', []),
    ]);
    shouldWithTestController((controller) => {
      for (const id of [
        'script',
        'document',
        'handler',
        'own-page',
        'template',
        'stock-iframe',
      ]) {
        expect(riskKinds(controller, id), id).to.deep.equal([
          'unrestricted-code',
        ]);
      }
    });
  });

  // The suite runs self-hosted, where AI goes through the Companion before the
  // configured provider. The provider can still receive data and charge its
  // account.
  it('lists the provider and Companion for locally relayed AI', () => {
    beginLoad([serializedNode('ainode', 'ai', [])]);
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'Use AI services')
      .and('contain', 'Anthropic (Claude)')
      .and('contain', 'Use your Companion')
      .and('contain', 'Can cost money')
      .and('contain', 'Can send your data out')
      .and('contain', 'provider account');
    shouldWithTestController((controller) => {
      expect(riskKinds(controller, 'ai')).to.deep.equal([
        'ai-usage',
        'companion',
      ]);
    });
  });

  it('treats a fixed Sqlite file as a download only', () => {
    cy.intercept('GET', '**/risk-probe.sqlite', { statusCode: 404 });
    beginLoad(
      [
        serializedNode('sqlitereader', 'fixed', [
          serializedSocket(
            'Resource URL',
            'https://example.com/risk-probe.sqlite',
          ),
        ]),
        workerSource('address', 'https://example.com/risk-probe.sqlite'),
        serializedNode('sqlitereader', 'connected', []),
      ],
      [linkTo('address', 'OutData', 'connected', 'Resource URL')],
    );
    shouldWithTestController((controller) => {
      const [fixed] = controller.getNodeByID('fixed').getRisks();
      expect(fixed.severity).to.equal('info');
      expect(fixed.target).to.equal('https://example.com/risk-probe.sqlite');
      const [connected] = controller.getNodeByID('connected').getRisks();
      expect(connected.severity).to.equal('warning');
      expect(connected.resolved).to.equal(false);
    });
  });

  it("does not list Open URL for Tailrmade's own pages", () => {
    cy.window().then((win) => cy.stub(win, 'open'));
    beginLoad([
      {
        ...serializedNode('openurl', 'own', [
          serializedSocket('url', '/?new=true'),
        ]),
        version: 4,
      },
      {
        ...serializedNode('openurl', 'other', [
          serializedSocket('url', 'https://example.com/docs'),
        ]),
        version: 4,
      },
    ]);
    shouldWithTestController((controller) => {
      expect(riskKinds(controller, 'own')).to.deep.equal([]);
      expect(riskKinds(controller, 'other')).to.deep.equal(['navigation']);
    });
  });

  it('names the saved data a storage node reaches when it is fixed', () => {
    const fixedAddress = [
      serializedSocket('Location', 'Notes'),
      serializedSocket('Key', 'draft'),
    ];
    beginLoad(
      [
        serializedNode('storagewrite', 'write', [
          ...fixedAddress,
          serializedSocket(
            'Additional keys',
            ['published', 'archive'],
            'ArrayType',
          ),
        ]),
        serializedNode('storageread', 'read', fixedAddress),
        serializedNode('storagebrowse', 'browse-all', []),
        workerSource('key', 'draft'),
        serializedNode('storageread', 'wired', [
          serializedSocket('Location', 'Notes'),
        ]),
        serializedNode('storagebrowse', 'browse-notes', [
          serializedSocket('Filter by Location', true, 'BooleanType'),
          serializedSocket('Location', 'Notes'),
        ]),
      ],
      [linkTo('key', 'OutData', 'wired', 'Key')],
    );
    shouldWithTestController((controller) => {
      const risk = (id: string) => controller.getNodeByID(id).getRisks()[0];
      const writeRisks = controller.getNodeByID('write').getRisks();
      expect(writeRisks.map(({ target }) => target)).to.deep.equal([
        'Notes › draft · this browser',
        'Notes › published · this browser',
        'Notes › archive · this browser',
      ]);
      expect(writeRisks[0].description).to.equal(
        'Can change the saved data below.',
      );
      expect(risk('read').description).to.equal(
        'Can read the saved data below.',
      );
      expect(risk('wired').resolved).to.equal(false);
      expect(risk('wired').target).to.equal(undefined);
      expect(risk('browse-all').resolved).to.equal(true);
      expect(risk('browse-all').target).to.equal(undefined);
      expect(risk('browse-notes').target).to.equal('Notes · this browser');
    });
    cy.get('[data-cy="risk-details"][data-risk-kind="storage-write"]')
      .should('contain', 'Can change the saved data below.')
      .and('contain', 'Notes › draft · this browser')
      .and('contain', 'Notes › published · this browser')
      .and('contain', 'Notes › archive · this browser');
    // One card holds fixed and wired reads, so it makes the broader claim.
    cy.get('[data-cy="risk-details"][data-risk-kind="storage-read"]')
      .should('contain', "including your other apps' data")
      .and('contain', 'Chosen while the app runs')
      .and('contain', 'Notes › draft · this browser')
      .find('[data-access-level]')
      .first()
      .should('have.attr', 'data-access-level', 'dynamic');
  });

  it('names the nodes sharing a card instead of their type', () => {
    const named = (id: string, name: string) => ({ ...codeNode(), id, name });
    beginLoad([
      named('draw', 'Draw plot'),
      named('sketch', 'Sketch plot'),
      named('a', 'Axis'),
      named('b', 'Axis'),
      named('c', 'Legend'),
    ]);
    cy.get('[data-cy="risk-details"][data-risk-kind="unrestricted-code"]')
      .should('not.contain', 'Chosen while the app runs')
      .find('[data-cy="risk-node-type"]')
      .should('have.length', 1)
      .and('contain', 'Draw plot, Sketch plot, +3')
      .and('not.contain', 'Custom function')
      .and('not.contain', '5 nodes');
  });

  it('says a destination is chosen while running only where there is one', () => {
    beginLoad(
      [codeNode(), openURLNode()],
      [linkTo('code', 'OutData', 'open', 'url')],
    );
    cy.get('[data-cy="risk-details"][data-risk-kind="navigation"]').should(
      'contain',
      'Chosen while the app runs',
    );
    cy.get('[data-cy="risk-details"][data-risk-kind="unrestricted-code"]')
      .should('exist')
      .and('not.contain', 'Chosen while the app runs');
  });

  it('summarizes risks in the app inspector and reviews them in the side panel', () => {
    cy.viewport(1280, 900);
    beginLoad([serializedNode('add', 'add', [])]);
    cy.get('[data-cy="inspector-column"]').then(($column) => {
      if ($column.width() === 0)
        cy.get('[data-cy="right-drawer-toggle-btn"]').click();
    });
    cy.get('[data-cy="app-info-tab"]').click();
    cy.get('[data-cy="app-risk-summary"]')
      .should('contain', 'No access')
      .and('not.contain', 'to review')
      .and('contain', 'Unknown publisher');
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    beginLoad([codeNode()]);
    cy.get('[data-cy="run-reviewed-app"]').click();
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.get('[data-cy="app-risk-summary"]')
      .should('contain', '1 node to review')
      .and('contain', 'Unrestricted');
    cy.get('[data-cy="open-risk-review"]').click();
    cy.get('[data-cy="app-risk-dialog"]')
      .should('contain', 'Run unsandboxed code')
      .and('contain', 'Risk review');
    cy.get('[data-cy="run-reviewed-app"]').should('not.exist');
    cy.screenshot('app-risk-summary', { capture: 'runner' });
    cy.get('[data-cy="risk-nodes-tab"]').click();
    cy.get('[data-cy="node-action"]').click();
    cy.get('[data-cy="risk-actions-tab"]').should(
      'have.attr',
      'aria-selected',
      'true',
    );
    cy.focused()
      .should('have.attr', 'data-cy', 'risk-details')
      .and('have.attr', 'data-risk-kind', 'unrestricted-code');
    cy.get('[data-cy="risk-nodes-tab"]').click();
    cy.get('[data-cy="go-to-risk-node"]').click();
    // the list stays open beside the node inspector
    cy.get('#inspector-container-node').should('be.visible');
    // the inspected node is gone when the open review is refreshed
    doWithTestController((controller) => controller.removeNode('code'));
    cy.get('[data-cy="app-info-tab"]').click();
    cy.get('[data-cy="app-risk-summary"]').should('contain', 'No access');
    cy.get('[data-cy="open-risk-review"]').click();
    cy.get('[data-cy="app-risk-dialog"]').should('contain', 'No access');
    cy.get('[data-cy="app-risk-dialog"]').contains('button', 'Close').click();
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
  });

  it('does not verify an owner claimed by a graph file', () => {
    doWithTestController(async (controller) => {
      const stored = controller.getGraph().getSerializedStoredGraph();
      stored.owner = 'publicUser';
      stored.isRemote = true;
      stored.graphData.nodes = [codeNode()];
      await controller.loadStringifiedGraph(JSON.stringify(stored));
    });
    cy.get('[data-cy="app-risk-source"]').should(
      'contain',
      'Unknown publisher',
    );
    cy.get('[aria-label="Verified Tailrmade"]').should('not.exist');
  });

  it('names the publisher of an app loaded from a cloud account', () => {
    const pnpBaseUrl = Cypress.expose('pnpBaseUrl') || 'http://127.0.0.1:8080';
    const openPublicApp = (ownerId: string, owner?: object) => {
      cy.readFile('tests/frontend/cypress/fixtures/button.ppgraph').then(
        (data) => {
          cy.intercept('GET', `/public/graph/${ownerId}/Test/TestPublic`, {
            success: true,
            data,
            owner,
          });
          cy.visit(
            `${pnpBaseUrl}/?loadGraph=${ownerId};;TestPublic;;Test;;public`,
          );
        },
      );
      approveLoadedTestApp();
      cy.viewport(1280, 900);
      cy.get('[data-cy="inspector-column"]').then(($column) => {
        if ($column.width() === 0)
          cy.get('[data-cy="right-drawer-toggle-btn"]').click();
      });
      cy.get('[data-cy="app-info-tab"]').click();
    };

    openPublicApp('publicUser');
    cy.get('[data-cy="app-risk-source"]').should('contain', 'Published by');
    cy.get('[aria-label="Verified Tailrmade"]').should('be.visible');

    openPublicApp('test-owner', {
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    cy.get('[data-cy="app-risk-source"]')
      .should('contain', 'Published by')
      .and('contain', 'Jane Doe')
      .and('contain', 'jane@example.com');
    cy.get('[aria-label="Verified Tailrmade"]').should('not.exist');
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

  // A wired-up input used to count as dynamic without anyone looking at what
  // was wired up, so these pin that the whole chain is followed.
  const openURLNode = () => ({
    ...serializedNode('openurl', 'open', []),
    version: 4,
  });
  const linkTo = (
    sourceNodeId: string,
    sourceSocketName: string,
    targetNodeId: string,
    targetSocketName: string,
  ) => ({ sourceNodeId, sourceSocketName, targetNodeId, targetSocketName });
  it('resolves a constant wired into Open URL instead of calling it dynamic', () => {
    beginLoad(
      [
        openURLNode(),
        serializedNode('constant_string', 'address', [
          serializedSocket('String', 'https://example.com/docs?token=secret'),
        ]),
      ],
      [linkTo('address', 'String', 'open', 'url')],
    );
    shouldWithTestController((controller) => {
      const risk = controller.getNodeByID('open').getRisks()[0];
      expect(risk.resolved).to.equal(true);
      expect(risk.target).to.equal('https://example.com/docs?token=…');
    });
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
  });

  it('follows the chain through a constant whose own input is connected', () => {
    beginLoad(
      [
        openURLNode(),
        serializedNode('constant_string', 'address', [
          serializedSocket('String', 'https://example.com/chained'),
        ]),
        serializedNode('constant', 'relay', [
          serializedSocket('In', '', 'StringType'),
        ]),
      ],
      [
        linkTo('address', 'String', 'relay', 'In'),
        linkTo('relay', 'Out', 'open', 'url'),
      ],
    );
    shouldWithTestController((controller) => {
      const risk = controller.getNodeByID('open').getRisks()[0];
      expect(risk.resolved).to.equal(true);
      expect(risk.target).to.equal('https://example.com/chained');
    });
  });

  it('follows a constant through a label into Open URL', () => {
    beginLoad(
      [
        openURLNode(),
        serializedNode('constant_string', 'address', [
          serializedSocket('String', 'https://example.com/via-label'),
        ]),
        serializedNode('label', 'caption', [
          serializedSocket('Input', '', 'StringType'),
        ]),
      ],
      [
        linkTo('address', 'String', 'caption', 'Input'),
        linkTo('caption', 'Output', 'open', 'url'),
      ],
    );
    shouldWithTestController((controller) => {
      const risk = controller.getNodeByID('open').getRisks()[0];
      expect(risk.resolved).to.equal(true);
      expect(risk.target).to.equal('https://example.com/via-label');
    });
  });

  it('stays dynamic when the chain reaches something it cannot work out', () => {
    beginLoad(
      [openURLNode(), codeNode()],
      [linkTo('code', 'OutData', 'open', 'url')],
    );
    shouldWithTestController((controller) => {
      const risk = controller.getNodeByID('open').getRisks()[0];
      expect(risk.resolved).to.equal(false);
      expect(risk.target).to.equal(undefined);
    });
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Chosen while the app runs',
    );
  });

  it('reviews legacy main-thread migration before running it', () => {
    beginLoad([codeNode(2)]);
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Run unsandboxed code',
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
      'Run unsandboxed code',
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
      .should('contain', 'OPENAI_KEY → example.com')
      .and('contain', 'https://example.com/private')
      .and('not.contain', 'not-for-display');
    cy.get('[data-cy="app-risk-dialog"]')
      .contains('button', 'Keep inspecting')
      .click();
    cy.get('[data-cy="app-not-running"]').should('be.visible');
  });

  it('does not trust a sanitize setting whose source never delivers it', () => {
    beginLoad(
      [
        {
          ...serializedNode('constant', 'setting', [
            serializedSocket('In', true, 'BooleanType'),
          ]),
          updateBehaviour: { load: false, update: false, interval: false },
        },
        serializedNode('htmlrenderer', 'html', [
          serializedSocket('Html', '<p>Checked</p>', 'HtmlType'),
          serializedSocket('Sanitize input', true, 'BooleanType'),
        ]),
      ],
      [linkTo('setting', 'Out', 'html', 'Sanitize input')],
    );
    cy.get('[data-cy="app-risk-dialog"]').should(
      'contain',
      'Run unsandboxed code',
    );
    shouldWithTestController((controller) => {
      expect(riskKinds(controller, 'html')).to.deep.equal([
        'unrestricted-code',
      ]);
    });
  });

  it('keeps sanitized HTML in its own box, without stylesheets or forms', () => {
    beginLoad([
      serializedNode('htmlrenderer', 'boxed', [
        serializedSocket(
          'Html',
          '<p class="kept">Kept</p><style>p { color: red; }</style><form><input name="q"></form>',
          'HtmlType',
        ),
        serializedSocket('Sanitize input', true, 'BooleanType'),
      ]),
    ]);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    cy.get('#boxed-div .kept').should('exist');
    cy.get('#boxed-div').should(($box) => {
      expect($box.find('style, form')).to.have.length(0);
      expect(getComputedStyle($box[0]).contain).to.equal('paint');
    });
  });

  it('does not load an image address that reaches Draw image while running', () => {
    let requests = 0;
    cy.intercept('GET', 'https://images.example.test/**', (request) => {
      requests += 1;
      request.reply({ statusCode: 404 });
    });
    beginLoad(
      [
        workerSource('address', 'https://images.example.test/running.png'),
        serializedNode('draw_image', 'draw', []),
      ],
      [linkTo('address', 'OutData', 'draw', 'Image')],
    );
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('address').debug_timesExecuted,
      ).to.be.greaterThan(0);
      expect(controller.getNodeByID('draw').status.node.isProblem()).to.equal(
        true,
      );
      expect(requests).to.equal(0);
    });
  });

  it('does not hand Draw image a loader instruction instead of an image', () => {
    let requests = 0;
    cy.intercept('GET', 'https://images.example.test/**', (request) => {
      requests += 1;
      request.reply({ statusCode: 404 });
    });
    beginLoad([
      serializedNode('draw_image', 'draw', [
        serializedSocket(
          'Image',
          { src: 'https://images.example.test/instruction.png' },
          'ImageType',
        ),
      ]),
    ]);
    cy.get('[data-cy="app-risk-dialog"]').should('not.exist');
    shouldWithTestController((controller) => {
      expect(controller.getNodeByID('draw').status.node.isProblem()).to.equal(
        true,
      );
    });
    cy.wait(500).then(() => expect(requests).to.equal(0));
  });

  it('reviews the address a template and its data add up to', () => {
    const template = (id: string, html: string, data: unknown) =>
      serializedNode('htmlrenderer', id, [
        serializedSocket('Html', html, 'HtmlType'),
        serializedSocket('Data', data, 'AnyType'),
        serializedSocket('Sanitize input', true, 'BooleanType'),
      ]);
    beginLoad([
      template('built', '<a href="{{scheme}}://{{host}}/page">Link</a>', {
        scheme: 'https',
        host: 'built.example.test',
        unused: 'https://unused.example.test/',
      }),
      template('macro', '<p>{{macro "anything"}}</p>', {}),
    ]);
    shouldWithTestController((controller) => {
      expect(
        controller
          .getNodeByID('built')
          .getRisks()
          .map((risk) => risk.target),
      ).to.deep.equal(['https://built.example.test/page']);
      expect(riskKinds(controller, 'macro')).to.deep.equal(['dynamic-content']);
    });
  });

  it('reviews input values a link sets before the app runs with them', () => {
    const graph = serializedGraph([
      {
        ...serializedNode('customfunction', 'code', [
          serializedSocket(
            'Code',
            '() => { window.__riskCodeRuns = (window.__riskCodeRuns || 0) + 1; return 7; }',
            'CodeType',
          ),
          serializedSocket('Main Thread', false, 'BooleanType'),
        ]),
        version: 3,
      },
    ]);
    const values = JSON.stringify([
      { node: 'code', socket: 'Main Thread', data: true },
    ]);
    cy.location('origin').then((origin) => {
      cy.visit(
        `${origin}/?toastEverything=true&loadFullGraph=${encodeURIComponent(graph)}&setSocketData=${encodeURIComponent(values)}`,
      );
    });
    cy.get('[data-cy="app-risk-dialog"]', { timeout: 60000 }).should(
      'contain',
      'Run unsandboxed code',
    );
    cy.window().then((win: any) => expect(win.__riskCodeRuns).to.be.undefined);
    shouldWithTestController((controller) => {
      expect(
        controller.getNodeByID('code').getInputData('Main Thread'),
      ).to.equal(true);
    });
  });
});
