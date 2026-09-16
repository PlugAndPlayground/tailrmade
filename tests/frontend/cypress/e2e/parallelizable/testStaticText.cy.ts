import {
  clearGraph,
  closeBothDrawers,
  controlOrMetaKey,
  doWithTestController,
  enterDashboardEditMode,
  exitDashboardEditMode,
  openNewGraph,
  serializedGraph,
  serializedNode,
  serializedSocket,
  setSurfaceLayout,
  shouldWithTestController,
} from '../helpers';

const surfaceId = 'static-text-surface';

const getTextItems = (testController) =>
  Object.values(
    testController
      .getNodes()
      .find((node) => node.isSurface())
      .getInputData('Layout JSON').tree,
  ).filter((item: any) => item.type.resolvedName === 'Text') as any[];

const setLayout = (children: unknown[]) =>
  setSurfaceLayout(surfaceId, children);

const appText = (text: string) =>
  cy.get('[data-cy="dashboard"] [data-cy="static-text"]').contains(text);

const selectAllInFirstEditor = () =>
  cy
    .get('[data-cy="static-text-editor"]')
    .first()
    .click({ force: true })
    .type(`${controlOrMetaKey()}a`, { force: true });

describe('static Text', () => {
  before(() => {
    openNewGraph();
  });

  beforeEach(() => {
    clearGraph();
    closeBothDrawers();
  });

  it('creates one primitive from the Heading, Text and Caption tools', () => {
    enterDashboardEditMode();
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

    enterDashboardEditMode();
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
        text: '**bold** *italic* `mono` [site](https://example.com) [alarm]{.error .nowrap}',
        tone: 'muted',
      },
      { text: 'element error', tone: 'error' },
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
        appText('element error')
          .closest('[data-cy="static-text"] > div')
          .should('have.css', 'color', runColor);
        appText('bold')
          .closest('[data-cy="static-text"] > div')
          .should(($element) => {
            expect(getComputedStyle($element[0]).color).to.not.eq(runColor);
          });
      });
  });

  it('formats the selected run from the toolbar below the text', () => {
    setLayout([{ text: 'keep together' }]);
    enterDashboardEditMode();
    selectAllInFirstEditor();
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

    // the link editor opens over the run the toolbar acted on
    selectAllInFirstEditor();
    cy.get('[data-cy="text-inline-toolbar"] [data-cy="link-button"]').click();
    cy.get('[data-cy="link-input"]').should('be.visible');
  });

  it('sets the variant and tone from the inspector', () => {
    setLayout([{ text: 'Styled' }]);
    enterDashboardEditMode();
    cy.get('[data-cy="dashboard"] [data-cy="static-text"]')
      .first()
      .click({ force: true });
    doWithTestController((testController) => {
      testController.toggleRightSideDrawer('OPEN');
    });
    cy.get('[data-cy="text-tone-select"] [aria-haspopup="listbox"]').click();
    cy.get('[data-cy="text-tone-primary"]').click();
    cy.get('[data-cy="text-variant-select"] [aria-haspopup="listbox"]').click();
    cy.get('[data-cy="text-variant-h2"]').click();

    shouldWithTestController((testController) => {
      const [item] = getTextItems(testController);
      expect(item.props.tone).to.eq('primary');
      expect(item.props.variant).to.eq('h2');
    });
    cy.get('[data-cy="text-settings"]').should('not.contain.text', 'Font size');
  });

  // the migration itself is covered by tests/frontend/jest/text-migrations;
  // what only the app can show is that it still looks the way it did
  it('migrates legacy static Text without changing how it looks', () => {
    const legacyItem = (props: Record<string, unknown>) => ({
      type: { resolvedName: 'Text' },
      displayName: 'Text',
      isCanvas: false,
      props,
      custom: {},
      hidden: false,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
    });
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
      'legacy-a': legacyItem({
        text: 'Legacy bold\nsecond line',
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        color: { r: 200, g: 10, b: 10, a: 1 },
      }),
      // no color of its own: the old widget followed its container
      'legacy-b': legacyItem({
        text: 'Inherited',
        fontSize: 20,
        fontWeight: 'normal',
        textAlign: 'left',
        color: 'inherit',
      }),
    };

    doWithTestController(async (testController) => {
      await testController.loadStringifiedGraph(
        serializedGraph(
          [
            serializedNode('UISurfaceNode', 'legacy-surface', [
              {
                ...serializedSocket(
                  'Layout JSON',
                  { version: 1, tree: legacyTree },
                  'JSONType',
                ),
                visible: false,
              },
            ]),
          ],
          [],
          { defaultUISurfaceNodeId: 'legacy-surface' },
        ),
      );
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
  });
});
