import {
  openNewGraph,
  doWithTestController,
  exitDashboardEditMode,
  setSurfaceLayout,
} from '../helpers';

const openShareMenu = () =>
  cy.get('[data-cy="shareCurrentButton"]').click({ force: true });

// the app only reads the error's name, so this realm's DOMException will do
const domError = (name: string) => new DOMException(name, name);

describe('Share menu', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('explains why a local app has no link', () => {
    openShareMenu();
    cy.get('[data-cy="share-app-status"]').should(
      'contain',
      'Saved in this browser only',
    );
    cy.get('[data-cy="copy-url"]').should('have.class', 'Mui-disabled');
  });

  it('offers a copy dialog when the browser blocks the clipboard', () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText')
        .as('writeText')
        .onFirstCall()
        .rejects(domError('NotAllowedError'))
        .onSecondCall()
        .resolves();
    });
    openShareMenu();
    cy.get('[data-cy="share-tailrmade-link"]').click();
    cy.get('[data-cy="share-app-status"]').should('not.exist');
    cy.get('[data-cy="manual-copy-dialog"] textarea')
      .first()
      .invoke('val')
      .should('contain', '#loadFullGraph=');
    cy.get('[data-cy="manual-copy-button"]').click();
    cy.get('[data-cy="manual-copy-dialog"]').should('not.exist');
    cy.contains('Copied app link to clipboard').should('be.visible');
    cy.get('@writeText').should('have.been.calledTwice');
  });

  describe('for a public app', () => {
    beforeEach(() => {
      doWithTestController((controller) => {
        const graph = controller.getGraph();
        graph.isRemote = true;
        graph.access = 'public';
        graph.owner = 'someone';
        graph.name = 'Shared app';
      });
    });

    it('opens the share sheet with the app link', () => {
      cy.window().then((win) => {
        win.navigator.share = cy.stub().as('share').resolves();
      });
      openShareMenu();
      cy.get('[data-cy="share-app-status"]').should('contain', 'Public');
      cy.get('[data-cy="share-url"]').click();
      cy.get('@share').should('have.been.calledOnce');
      cy.get('@share')
        .its('firstCall.args.0')
        .should((data) => {
          expect(data.title).to.equal('Shared app');
          expect(data.url).to.contain('?loadGraph=someone;;Shared%20app;;');
        });
    });

    it('stays quiet when the share sheet is closed', () => {
      cy.window().then((win) => {
        win.navigator.share = cy
          .stub()
          .as('share')
          .rejects(domError('AbortError'));
        cy.stub(win.navigator.clipboard, 'writeText').as('writeText');
      });
      openShareMenu();
      cy.get('[data-cy="share-url"]').click();
      cy.get('@share').should('have.been.calledOnce');
      cy.get('@writeText').should('not.have.been.called');
      cy.contains('Link copied').should('not.exist');
    });

    it('copies the link when the browser refuses to share', () => {
      cy.window().then((win) => {
        win.navigator.share = cy.stub().rejects(domError('NotAllowedError'));
        cy.stub(win.navigator.clipboard, 'writeText')
          .as('writeText')
          .resolves();
      });
      openShareMenu();
      cy.get('[data-cy="share-url"]').click();
      cy.contains('Link copied').should('be.visible');
      cy.get('@writeText')
        .its('firstCall.args.0')
        .should('contain', '?loadGraph=someone;;');
    });
  });
});

describe('Share links in text', () => {
  const content = [
    '[Send envelope](share:?text=Hi%20Anna&url=https%3A%2F%2Fx.test%2F%23santa%3Dab)',
    '[Unsafe](share:?url=javascript%3Ax)',
    '[Share this app](share:app?text=Try%20this)',
  ].join(' · ');

  // the link itself: its text spans pass the pointer through to it
  const shareLink = (label: string) =>
    cy.contains('[data-cy="dashboard"] [data-cy="share-link"]', label);

  beforeEach(() => {
    openNewGraph();
    setSurfaceLayout('share-surface', [{ id: 'share-text', text: content }]);
    exitDashboardEditMode();
    cy.window().then((win) => {
      win.navigator.share = cy.stub().as('share').resolves();
    });
  });

  it('shares the content a link carries', () => {
    shareLink('Send envelope').realClick();
    cy.get('@share').should('have.been.calledOnce');
    cy.get('@share').its('firstCall.args.0').should('deep.include', {
      text: 'Hi Anna',
      url: 'https://x.test/#santa=ab',
    });
  });

  it('shows a link with a non-HTTP address as plain text', () => {
    cy.get('[data-cy="dashboard"]').should('contain', 'Unsafe');
    cy.get('[data-cy="dashboard"] [data-cy="share-link"]').should(
      'have.length',
      2,
    );
  });

  it('says so when the app has no public link', () => {
    shareLink('Share this app').realClick();
    cy.contains('This app has no public link to share yet.').should(
      'be.visible',
    );
    cy.get('@share').should('not.have.been.called');
  });

  it("shares a public app's own link", () => {
    doWithTestController((controller) => {
      const graph = controller.getGraph();
      graph.isRemote = true;
      graph.access = 'public';
      graph.owner = 'someone';
      graph.name = 'Shared app';
    });
    shareLink('Share this app').realClick();
    cy.get('@share')
      .its('firstCall.args.0')
      .should((data) => {
        expect(data.title).to.equal('Shared app');
        expect(data.text).to.equal('Try this');
        expect(data.url).to.contain('?loadGraph=someone;;Shared%20app;;');
      });
  });
});

describe('Share Button', () => {
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const button = () => cy.get('[data-cy="dashboard"] [data-cy="button-Share"]');
  const result = () =>
    cy
      .window()
      .its('testController')
      .invoke('getNodeOutputValue', 'share-button', 'Result');

  beforeEach(() => {
    openNewGraph();
    doWithTestController(async (controller) => {
      await controller.addNode('WidgetShareButton', 'share-button', 0, 0);
      controller.setNodeInputValue('share-button', 'Text', 'A card for you');
      controller.setNodeInputValue('share-button', 'URL', 'https://x.test/#a');
      await controller.executeNodeByID('share-button');
    });
    setSurfaceLayout('share-surface', [{ widget: 'share-button' }]);
    exitDashboardEditMode();
  });

  it('shares its text, link and files on click and reports the result', () => {
    doWithTestController((controller) => {
      controller.setNodeInputValue('share-button', 'Files', [pngDataUrl]);
      controller.setNodeInputValue('share-button', 'File name', 'card');
    });
    cy.window().then((win) => {
      win.navigator.share = cy.stub().as('share').resolves();
      win.navigator.canShare = () => true;
    });
    button().realClick();
    cy.get('@share')
      .its('firstCall.args.0')
      .should((data) => {
        expect(data.text).to.equal('A card for you');
        expect(data.url).to.equal('https://x.test/#a');
        expect(data.files.map((file) => file.name)).to.deep.equal(['card.png']);
      });
    result().should('equal', 'shared');
  });

  it('copies when the browser has no share sheet', () => {
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'share', {
        value: undefined,
        configurable: true,
      });
      cy.stub(win.navigator.clipboard, 'writeText').as('writeText').resolves();
    });
    button().realClick();
    cy.get('@writeText').should(
      'have.been.calledWith',
      'A card for you\nhttps://x.test/#a',
    );
    result().should('equal', 'copied');
  });

  it('reports a closed share sheet as cancelled', () => {
    cy.window().then((win) => {
      win.navigator.share = cy.stub().rejects(domError('AbortError'));
    });
    button().realClick();
    result().should('equal', 'cancelled');
  });

  it('says when there is nothing to share', () => {
    doWithTestController((controller) => {
      controller.setNodeInputValue('share-button', 'Text', '');
      controller.setNodeInputValue('share-button', 'URL', '');
    });
    button().realClick();
    cy.contains('Nothing to share yet.').should('be.visible');
  });
});
