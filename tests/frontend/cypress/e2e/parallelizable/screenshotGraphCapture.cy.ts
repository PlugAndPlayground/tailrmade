import { doWithTestController, openNewGraph } from '../helpers';

type Capturer = { capture: () => Promise<void> };

// The graph sources are the compositing path: pixi renders the world space
// frame into a texture and html2canvas-pro rasterises the hybrid node overlays,
// and the two have to land on the same output pixels.
describe('Screenshot node, graph capture', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('captures the viewport, pixi layer and widget dom together', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('WidgetButton', 'graph-widget', 100, 100);
      await tc.addNode('Constant', 'graph-constant', 500, 100);
      await tc.addNode('Screenshot', 'shot', 100, 500);
      tc.setNodeInputValue('shot', 'Source', 'Graph');
      tc.setNodeInputValue('shot', 'Scale', 1);
    });

    cy.get('#Container-graph-widget').should('exist');

    doWithTestController(async (tc) => {
      await (tc.getNodeByID('shot') as unknown as Capturer).capture();

      const details = tc.getNodeOutputValue('shot', 'Details');
      expect(details.source).to.equal('Graph');
      // the default region is what the window shows, in world units
      expect(details.width, 'as wide as the visible world').to.be.closeTo(
        Cypress.config('viewportWidth'),
        2,
      );
      expect(tc.getNodeOutputValue('shot', 'Image')).to.match(
        /^data:image\/png;base64,/,
      );
    });
  });

  it('captures only the selected nodes, at their world size', () => {
    doWithTestController(async (tc) => {
      const widget = await tc.addNode('WidgetButton', 'sel-widget', 100, 100);
      await tc.addNode('Constant', 'sel-constant', 900, 100);
      await tc.addNode('Screenshot', 'shot', 100, 600);
      tc.setNodeInputValue('shot', 'Source', 'Node selection');
      tc.setNodeInputValue('shot', 'Scale', 1);

      tc.getGraph().selection.selectNodes([widget]);
    });

    cy.get('#Container-sel-widget').should('exist');

    doWithTestController(async (tc) => {
      const bounds = tc
        .getGraph()
        .selection.getBoundsFromNodes([tc.getNodeByID('sel-widget')]);

      await (tc.getNodeByID('shot') as unknown as Capturer).capture();

      const details = tc.getNodeOutputValue('shot', 'Details');
      expect(details.source).to.equal('Node selection');
      expect(details.width, 'the selected node, not the window').to.be.closeTo(
        bounds.width,
        2,
      );
      expect(details.height).to.be.closeTo(bounds.height, 2);
      // clearly smaller than the full viewport capture above
      expect(details.width).to.be.lessThan(Cypress.config('viewportWidth'));
    });
  });

  it('paints the canvas background rather than leaving it transparent', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('WidgetButton', 'bg-widget', 100, 100);
      await tc.addNode('Screenshot', 'shot', 100, 500);
      tc.setNodeInputValue('shot', 'Source', 'Graph');
    });

    cy.get('#Container-bg-widget').should('exist');

    doWithTestController(async (tc) => {
      await (tc.getNodeByID('shot') as unknown as Capturer).capture();
    });

    cy.window().then((win) =>
      doWithTestController(
        (tc) =>
          new Cypress.Promise<void>((resolve, reject) => {
            const element = new win.Image();
            element.onload = () => {
              const canvas = win.document.createElement('canvas');
              canvas.width = element.width;
              canvas.height = element.height;
              const context = canvas.getContext('2d');
              context.drawImage(element, 0, 0);
              const [red, green, blue, alpha] = context.getImageData(
                2,
                2,
                1,
                1,
              ).data;
              try {
                expect(alpha, 'background is opaque').to.equal(255);
                // the canvas colour is a light tint, not black and not clear
                expect(
                  Math.min(red, green, blue),
                  'background is light',
                ).to.be.greaterThan(180);
                resolve();
              } catch (error) {
                reject(error);
              }
            };
            element.onerror = () => reject(new Error('capture did not decode'));
            element.src = tc.getNodeOutputValue('shot', 'Image');
          }),
      ),
    );
  });

  // Capture has to stay a trigger socket. As a plain input, connecting a button
  // back propagates the trigger's own value into the button's "On value"
  // (NodeClass.populateDefaults skips SOCKET_TYPE.TRIGGER but not
  // SOCKET_TYPE.IN), so the button sent 0 for both press and release and the
  // rising edge the trigger waits for never arrived.
  it('lets a wired button actually fire the capture', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('WidgetButton', 'pref-btn', 100, 100);
      await tc.addNode('Screenshot', 'pref-shot', 700, 100);
      await tc.connectNodesByID('pref-btn', 'pref-shot', 'Out', 'Capture');
      tc.setNodeInputValue('pref-shot', 'Source', 'Graph');

      const socket = tc.getTriggerSocketByIDandName('pref-shot', 'Capture');
      expect(socket, 'Capture is a trigger socket').to.not.equal(undefined);
      expect(socket.links.length, 'the button is on Capture').to.equal(1);

      // the button must still emit a rising edge, not the trigger's own value
      expect(
        tc.getNodeInputValue('pref-btn', 'On value'),
        'connecting did not overwrite the button On value',
      ).to.equal(1);
    });

    cy.get('[data-cy="button-Button"]').realClick();

    doWithTestController((tc) => {
      expect(
        tc.getNodeOutputValue('pref-shot', 'Image'),
        'clicking the button captured',
      ).to.match(/^data:image\/png;base64,/);
    });
  });
});
