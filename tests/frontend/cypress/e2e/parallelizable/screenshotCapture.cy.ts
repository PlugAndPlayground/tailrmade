import { doWithTestController, openNewGraph } from '../helpers';

describe('Screenshot node, user interface capture', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('captures the open user interface as a png the image sockets can use', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'shot-surface', 0, 0);
      await tc.addNode('WidgetButton', 'shot-button', 400, 0);

      const connected = await tc.callAITool('connect_sockets', {
        from_node: 'shot-button',
        from_socket: 'ReactUI',
        to_node: 'shot-surface',
        to_socket: 'Button',
      });
      expect(
        connected.is_error,
        `widget should reach the surface: ${connected.content}`,
      ).to.not.equal(true);

      tc.toggleDashboard('OPEN');
    });

    // wait for the surface, not for a timeout: html2canvas only sees what has
    // actually been laid out
    cy.get('[data-cy="widget of NODE_shot-button"]').should('be.visible');
    cy.get('[data-cy="dashboard"] #ROOT').should('be.visible');

    doWithTestController(async (tc) => {
      await tc.addNode('Screenshot', 'shot', 0, 500);
      tc.setNodeInputValue('shot', 'Source', 'User interface');
      tc.setNodeInputValue('shot', 'Scale', 1);

      await tc.executeNodeByID('shot');

      const image = tc.getNodeOutputValue('shot', 'Image');
      expect(image, 'Image output is a png data url').to.match(
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/,
      );

      const details = tc.getNodeOutputValue('shot', 'Details');
      expect(details.source).to.equal('User interface');
      expect(new Date(details.timestamp).getTime()).to.be.a('number');

      // the craftjs root, not the surface node's small canvas thumbnail and
      // not the transparent frame that merely fills the column
      const root = Cypress.$('[data-cy="dashboard"] #ROOT')[0];
      expect(details.width, 'as wide as the surface root').to.be.closeTo(
        root.offsetWidth,
        2,
      );
      expect(details.height, 'as tall as the surface root').to.be.closeTo(
        root.offsetHeight,
        2,
      );
    });

    // and it is not a blank canvas
    cy.window().then((win) => {
      return doWithTestController((tc) => {
        const image = tc.getNodeOutputValue('shot', 'Image');
        return new Cypress.Promise<void>((resolve, reject) => {
          const element = new win.Image();
          element.onload = () => {
            const canvas = win.document.createElement('canvas');
            canvas.width = element.width;
            canvas.height = element.height;
            const context = canvas.getContext('2d');
            context.drawImage(element, 0, 0);
            const { data } = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );

            const seen = new Set<string>();
            for (let i = 0; i < data.length; i += 4 * 97) {
              seen.add(
                `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`,
              );
            }

            try {
              expect(canvas.width, 'decodes to a real png').to.be.greaterThan(
                0,
              );
              expect(
                seen.size,
                'the capture is not one flat colour',
              ).to.be.greaterThan(1);
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          element.onerror = () =>
            reject(new Error('the captured data url did not decode'));
          element.src = image;
        });
      });
    });
  });

  // The ReactUI source renders a connected widget off screen at a fixed size,
  // and the png it produces has to drop straight into the image nodes.
  it('captures a connected ReactUI widget and feeds it to an Image node', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('WidgetButton', 'w-button', 100, 100);
      await tc.addNode('Screenshot', 'shot', 600, 100);
      await tc.addNode('Image', 'downstream', 1100, 100);
      await tc.connectNodesByID('w-button', 'shot', 'ReactUI', 'ReactUI');
      await tc.connectNodesByID('shot', 'downstream', 'Image', 'Image');
      tc.setNodeInputValue('shot', 'Source', 'ReactUI');
      tc.setNodeInputValue('shot', 'Widget width', 300);
      tc.setNodeInputValue('shot', 'Widget height', 120);
    });

    cy.get('#Container-w-button').should('exist');

    doWithTestController(async (tc) => {
      await tc.executeNodeByID('shot');

      const details = tc.getNodeOutputValue('shot', 'Details');
      expect(details.source).to.equal('ReactUI');
      expect(details.width, 'rendered at the requested size').to.equal(300);
      expect(details.height).to.equal(120);

      expect(
        tc.getNodeInputValue('downstream', 'Image'),
        'the Image node received the png as is',
      ).to.match(/^data:image\/png;base64,/);
    });

    doWithTestController((tc) => {
      const node = tc.getNodeByID('downstream') as unknown as {
        texture?: { width: number };
      };
      expect(node.texture, 'and decoded it into a texture').to.not.equal(
        undefined,
      );
      expect(node.texture.width).to.be.greaterThan(0);
    });
  });

  // an image data url as text/plain pastes as a wall of base64, so the
  // clipboard node has to recognise it and write an image/png item instead
  it('hands a capture to the clipboard node as an image', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('Screenshot', 'clip-shot', 100, 100);
      await tc.addNode('WriteToClipboard', 'clip', 700, 100);
      tc.setNodeInputValue('clip-shot', 'Source', 'Graph');

      await tc.executeNodeByID('clip-shot');
      await tc.connectNodesByID('clip-shot', 'clip', 'Image', 'Input');

      expect(
        tc.getNodeInputValue('clip', 'Input'),
        'the clipboard node received the png',
      ).to.match(/^data:image\/png;base64,/);

      // headless chrome denies the clipboard write itself, but the node has to
      // build the item without throwing on the way
      await tc.executeNodeByID('clip');
    });
  });

  // the root lays out to its content while the scroll box around it does not,
  // so a surface taller than the panel still comes out whole
  it('captures the surface below the fold', () => {
    doWithTestController(async (tc) => {
      await tc.addNode('UISurfaceNode', 'tall-surface', 0, 0);
      for (let i = 0; i < 10; i++) {
        await tc.addNode('WidgetSlider', `tall-s${i}`, 400, i * 200);
        await tc.callAITool('connect_sockets', {
          from_node: `tall-s${i}`,
          from_socket: 'ReactUI',
          to_node: 'tall-surface',
          to_socket: `Slider ${i}`,
        });
      }
      tc.toggleDashboard('OPEN');
    });

    cy.get('[data-cy="widget of NODE_tall-s0"]').should('be.visible');
    cy.get('[data-cy="dashboard"] #ROOT').should('be.visible');

    doWithTestController(async (tc) => {
      await tc.addNode('Screenshot', 'tall-shot', 0, 2400);
      tc.setNodeInputValue('tall-shot', 'Source', 'User interface');

      const root = Cypress.$('[data-cy="dashboard"] #ROOT')[0];
      const frame = Cypress.$('[data-cy="device-preview-frame"]')[0];
      expect(
        root.offsetHeight,
        'the surface has to outgrow its scroll box for this to mean anything',
      ).to.be.greaterThan(frame.clientHeight);

      await tc.executeNodeByID('tall-shot');
      expect(
        tc.getNodeOutputValue('tall-shot', 'Details').height,
        'the capture reaches the bottom of the surface',
      ).to.be.closeTo(root.offsetHeight, 2);
    });
  });
});
