import {
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  doWithTestController,
  exitDashboardEditMode,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const surfaceId = 'static-text-surface';

const getSurface = (testController) =>
  testController.getNodes().find((node) => node.isSurface());

const getTextItems = (testController) =>
  Object.values(
    getSurface(testController).getInputData('Layout JSON').tree,
  ).filter((item: any) => item.type.resolvedName === 'Text') as any[];

const openEditMode = () => {
  doWithTestController((testController) => {
    testController.toggleDashboard('OPEN');
  });
  cy.get('[data-cy="dashboard"]').should('be.visible');
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

const setLayout = (children: unknown[]) => {
  doWithTestController(async (testController) => {
    if (!testController.getNodes().some((node) => node.id === surfaceId)) {
      await testController.addNode('UISurfaceNode', surfaceId, 400, 0);
    }
    const result = await testController.callAITool('set_surface_layout', {
      node_id: surfaceId,
      layout: { direction: 'column', children },
    });
    expect(result.is_error, result.content).to.not.equal(true);
    testController.toggleDashboard('OPEN');
  });
  cy.get('[data-cy="dashboard"]').should('be.visible');
};

const appText = (text: string) =>
  cy.get('[data-cy="dashboard"] [data-cy="static-text"]').contains(text);

describe('static Text', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('creates one primitive from the Heading, Text and Caption tools', () => {
    openEditMode();
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="vertical-toolbox"]:visible').length === 0) {
        cy.get('[data-cy="toggle-toolbox-btn"]').click({ force: true });
      }
    });
    ['tool-heading', 'tool-text', 'tool-caption'].forEach((tool) => {
      cy.get(`[data-cy="${tool}"]`).click({ force: true });
    });

    shouldWithTestController((testController) => {
      const items = getTextItems(testController);
      expect(items.map((item) => item.props.variant)).to.have.members([
        'h1',
        'body',
        'caption',
      ]);
      items.forEach((item) => {
        expect(item.displayName).to.eq('Text');
        expect(item.props.customStyles).to.deep.eq({});
      });
    });

    cy.get('[data-cy="static-text-editor"]').should('have.length', 3);
    // scoped to Text elements: the toolbox inside the dashboard has the same
    // labels
    appText('Heading')
      .closest('[data-cy="static-text"] > div')
      .should('have.css', 'font-size', '32px');
    appText('Caption')
      .closest('[data-cy="static-text"] > div')
      .should('have.css', 'font-size', '12px');
  });

  it('shows {{name}} literally and never offers tokens', () => {
    setLayout([{ text: 'Hello {{name}}' }]);
    exitDashboardEditMode();
    appText('Hello {{name}}').should('be.visible');
    cy.get('[data-cy="dashboard"] [data-cy="text-token"]').should('not.exist');

    openEditMode();
    cy.get('[data-cy="static-text-editor"]')
      .first()
      .click({ force: true })
      .type('{moveToEnd} @x {{}{{}typed}}', { force: true });
    cy.get('[data-cy="text-token-picker"]').should('not.exist');
    cy.get('[data-cy="static-text-editor"] [data-cy="text-token"]').should(
      'not.exist',
    );
    shouldWithTestController((testController) => {
      const [item] = getTextItems(testController);
      expect(item.props.content).to.eq('Hello {{name}} @x {{typed}}');
    });
  });

  it('renders run marks and tones on top of the element style', () => {
    setLayout([
      {
        text: '**bold** *italic* `mono` [site](https://example.com) [alarm]{.negative .nowrap}',
        tone: 'muted',
      },
      { text: 'element negative', tone: 'negative' },
    ]);
    exitDashboardEditMode();

    appText('bold').should('match', 'strong');
    appText('italic').should('match', 'em');
    appText('mono').should('match', 'code');
    appText('site')
      .closest('a')
      .should('have.attr', 'href', 'https://example.com');
    appText('alarm')
      .should('have.css', 'white-space', 'nowrap')
      .then(($alarm) => {
        const runColor = getComputedStyle($alarm[0]).color;
        appText('element negative')
          .closest('[data-cy="static-text"] > div')
          .should('have.css', 'color', runColor);
        appText('bold')
          .closest('[data-cy="static-text"] > div')
          .should(($element) => {
            expect(getComputedStyle($element[0]).color).to.not.eq(runColor);
          });
      });
  });

  it('keeps the selected run on one line from the toolbar below the text', () => {
    setLayout([{ text: 'keep together' }]);
    openEditMode();
    cy.get('[data-cy="static-text-editor"]')
      .first()
      .click({ force: true })
      .type(`${controlOrMetaKey()}a`, { force: true });
    cy.get('[data-cy="static-text-editor"]')
      .first()
      .then(($editor) => {
        const editorBottom = $editor[0].getBoundingClientRect().bottom;
        cy.get('[data-cy="text-inline-toolbar"]').should(($toolbar) => {
          expect($toolbar[0].getBoundingClientRect().top).to.be.gte(
            editorBottom,
          );
        });
      });
    cy.get('[data-cy="text-inline-toolbar"]').within(() => {
      cy.get('[data-cy="undo-button"]').should('not.exist');
      cy.get('[data-cy="strikethrough-button"]').should('exist');
      cy.get('[data-cy="tone-select"]').should('not.exist');
      cy.get('[data-cy="nowrap-button"]').click();
    });

    shouldWithTestController((testController) => {
      const [item] = getTextItems(testController);
      expect(item.props.content).to.eq('[keep together]{.nowrap}');
    });
    cy.get('[data-cy="static-text-editor"]')
      .contains('keep together')
      .should('have.css', 'white-space', 'nowrap');
  });

  it('edits a link in a field as wide as its overlay', () => {
    setLayout([{ text: 'a link here' }]);
    openEditMode();
    cy.get('[data-cy="static-text-editor"]')
      .first()
      .click({ force: true })
      .type(`${controlOrMetaKey()}a`, { force: true });
    cy.get('[data-cy="text-inline-toolbar"] [data-cy="link-button"]').click();

    cy.get('[data-cy="link-input"]')
      .should('be.visible')
      .then(($input) => {
        const inputWidth = $input[0].getBoundingClientRect().width;
        cy.get('[data-cy="link-editor"]').should(($editor) => {
          // all of the overlay but the confirm button and the field's padding
          expect(inputWidth).to.be.greaterThan(
            $editor[0].getBoundingClientRect().width - 80,
          );
        });
      });
  });

  it('sets the variant and tone from the inspector', () => {
    setLayout([{ text: 'Styled' }]);
    openEditMode();
    cy.get('[data-cy="dashboard"] [data-cy="static-text"]')
      .first()
      .click({ force: true });
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="text-tone-accent"]').click();
    cy.get('[data-cy="text-variant-select"] [aria-haspopup="listbox"]').click();
    cy.get('[data-cy="text-variant-h2"]').click();

    shouldWithTestController((testController) => {
      const [item] = getTextItems(testController);
      expect(item.props.tone).to.eq('accent');
      expect(item.props.variant).to.eq('h2');
    });
    cy.get('[data-cy="text-settings"]').should('not.contain.text', 'Font size');
  });

  it('migrates legacy static Text without changing how it looks', () => {
    const legacyTree = {
      ROOT: {
        type: { resolvedName: 'Container' },
        displayName: 'Container',
        isCanvas: true,
        props: { color: { r: 20, g: 120, b: 60, a: 1 } },
        custom: {},
        hidden: false,
        nodes: ['legacy-a', 'legacy-b'],
        linkedNodes: {},
      },
      'legacy-a': {
        type: { resolvedName: 'Text' },
        displayName: 'Text',
        isCanvas: false,
        props: {
          text: 'Legacy bold\nsecond line',
          fontSize: 24,
          fontWeight: '700',
          textAlign: 'center',
          color: { r: 200, g: 10, b: 10, a: 1 },
        },
        custom: {},
        hidden: false,
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
      'legacy-b': {
        type: { resolvedName: 'Text' },
        displayName: 'Text',
        isCanvas: false,
        props: {
          text: 'Inherited',
          fontSize: 20,
          fontWeight: 'normal',
          textAlign: 'left',
          color: 'inherit',
        },
        custom: {},
        hidden: false,
        parent: 'ROOT',
        nodes: [],
        linkedNodes: {},
      },
    };
    const graph = {
      version: 5,
      graphSettings: {
        showExecutionVisualisation: true,
        viewportCenterPosition: { x: 0, y: 0 },
        viewportScale: 1,
        defaultUISurfaceNodeId: 'legacy-surface',
      },
      nodes: [
        {
          type: 'UISurfaceNode',
          id: 'legacy-surface',
          x: 0,
          y: 0,
          width: 400,
          height: 400,
          socketArray: [
            {
              socketType: 'in',
              name: 'Layout JSON',
              dataType: '{"class":"JSONType"}',
              data: { version: 1, tree: legacyTree },
              visible: false,
            },
          ],
          updateBehaviour: { load: true, update: true, interval: false },
        },
      ],
      links: [],
    };

    doWithTestController(async (testController) => {
      await testController.loadStringifiedGraph(JSON.stringify(graph));
      testController.toggleDashboard('OPEN');
    });
    exitDashboardEditMode();

    appText('Legacy')
      .closest('[data-cy="static-text"] > div')
      .should('have.css', 'font-size', '24px')
      .and('have.css', 'line-height', '28.8px')
      .and('have.css', 'font-weight', '700')
      .and('have.css', 'text-align', 'center')
      .and('have.css', 'color', 'rgb(200, 10, 10)');
    appText('second line').should('be.visible');
    appText('Inherited')
      .closest('[data-cy="static-text"] > div')
      .should('have.css', 'font-size', '20px')
      .and('have.css', 'line-height', '24px')
      .and('have.css', 'font-weight', '400')
      .and('have.css', 'color', 'rgb(20, 120, 60)');

    shouldWithTestController((testController) => {
      const tree = testController.getNodeInputValue(
        'legacy-surface',
        'Layout JSON',
      ).tree;
      expect(tree['legacy-a'].props).to.not.have.property('text');
      expect(tree['legacy-a'].props.alignment).to.eq('center');
      expect(tree['legacy-a'].props.customStyles).to.deep.eq({
        fontSize: '24px',
        fontWeight: '700',
        lineHeight: 1.2,
        color: 'rgb(200, 10, 10)',
      });
    });
  });
});
