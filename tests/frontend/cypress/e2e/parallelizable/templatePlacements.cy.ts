import { VISIBILITY_ACTION } from '../../../../../src/utils/constants_shared';
import {
  doWithTestController,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

const VALUE = 'Initial Value';
const SELECTED = 'Selected Options';
const IS_EVEN_ROW =
  '(a) => {\n\treturn Number(String(a).split("-")[1]) % 2 === 0;\n}';

async function addTemplate(tc: any, id: string) {
  await tc.addNode('UITemplate', id, -1500, -400);
  await tc.addNode('UISurfaceNode', `${id}-sf`, 400, 0);
  await tc.connectNodesByID(`${id}-sf`, id, 'ReactUI', 'UI');
  return tc.getNodeByID(id);
}

async function addWidget(
  tc: any,
  template: string,
  id: string,
  type = 'WidgetTextField',
) {
  await tc.addNode(type, id, -200, 0);
  await tc.connectNodesByID(id, `${template}-sf`, 'ReactUI');
  return tc.getNodeByID(id);
}

async function addRepeat(tc: any, template: any, id: string, items: unknown) {
  await tc.addNode('RepeatTemplate', id, 800, 0);
  const repeat = tc.getNodeByID(id);
  repeat.setInputData('Template', template.nodeName);
  repeat.updateTemplateSockets();
  if (repeat.getInputSocketByName('Parameter 1 from')) {
    repeat.setInputData('Parameter 1 from', 'entry');
  }
  repeat.setInputData('Items', items);
  await repeat.executeOptimizedChain();
  return repeat;
}

async function addPlace(tc: any, template: any, id: string) {
  await tc.addNode('PlaceTemplate', id, 800, 400);
  const place = tc.getNodeByID(id);
  place.setInputData('Template', template.nodeName);
  place.updateTemplateSockets();
  await place.executeOptimizedChain();
  return place;
}

const rowValues = (repeat: any, nodeId: string, socket = VALUE) =>
  repeat.rows.map((row: any) => row.capture.snapshots[nodeId]?.[socket]);

const rowInstance = (repeat: any, nodeId: string, index: number) => ({
  ownerId: repeat.id,
  rowKey: repeat.rows[index].key,
  snapshot: repeat.rows[index].capture.snapshots[nodeId],
});

// a hung pass would otherwise only show up as Cypress's generic timeout
const settlesWithin = (promise: Promise<unknown>, ms = 5000) =>
  Promise.race([
    promise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ]);

describe('template placements', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('runs a placement nested in a template, per row of the outer one', () => {
    doWithTestController(async (tc: any) => {
      const inner = await addTemplate(tc, 'inner');
      await addWidget(tc, 'inner', 'inner-w');
      await tc.connectNodesByID('inner', 'inner-w', 'Parameter 1', VALUE);

      const outer = await addTemplate(tc, 'outer');
      const place = await addPlace(tc, inner, 'nested');
      await tc.connectNodesByID(
        'outer',
        'nested',
        'Parameter 1',
        'Parameter 1',
      );
      await tc.connectNodesByID('nested', 'outer-sf', 'ReactUI');

      const repeat = await addRepeat(tc, outer, 'outer-rep', ['x', 'y']);
      expect(await settlesWithin(repeat.executeOptimizedChain())).to.equal(
        true,
      );
      expect(
        repeat.rows.map(
          (row: any) =>
            row.capture.snapshots.nested.__templatePlacedState.snapshots[
              'inner-w'
            ][VALUE],
        ),
      ).to.deep.equal(['x', 'y']);

      // and the queues are not left blocked for anything run afterwards
      expect(await settlesWithin(place.executeOptimizedChain())).to.equal(true);
    });
  });

  it('reports a template that places itself instead of hanging', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const inside = await addPlace(tc, template, 'inside');
      await tc.connectNodesByID('t', 'inside', 'Parameter 2', 'Parameter 1');

      const outside = await addPlace(tc, template, 'outside');
      expect(await settlesWithin(outside.executeOptimizedChain())).to.equal(
        true,
      );
      expect(outside.status.node.getName()).to.contain('Error');
      expect(inside).to.exist;
    });
  });

  it('types a conditional the same whichever order it was built in', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      await addWidget(tc, 't', 't-w');
      await tc.addNode('CustomFunction', 'test', -500, 600);
      const test = tc.getNodeByID('test');
      test.setInputData('Main Thread', true);
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      await tc.connectNodesByID('t', 'test', 'Parameter 1', 'a');
      // the code arrives after the wiring, so the output has its default type
      test.setInputData('Code', IS_EVEN_ROW);
      await test.executeOptimizedChain();
      await tc.connectNodesByID(
        'test',
        't-sf',
        undefined,
        'Text Field visible',
      );

      const repeat = await addRepeat(tc, template, 'rep', [
        'row-0',
        'row-1',
        'row-2',
        'row-3',
      ]);
      expect(
        repeat.rows.map((row: any) => {
          const items: any[] = Object.values(row.capture.trees['t-sf']);
          return items.find((item) => item.props?.id === 'NODE_t-w').hidden;
        }),
      ).to.deep.equal([false, true, false, true]);
    });
  });

  it('keeps an edit in the placement and row it was made in', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t-w', 't', 'Out', 'Output 1');
      widget.setInputData(VALUE, 'AUTHORED');
      await widget.executeOptimizedChain();

      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b']);
      const placeA = await addPlace(tc, template, 'place-a');
      const placeB = await addPlace(tc, template, 'place-b');

      await widget.applyWidgetEdit(VALUE, 'EDITED', {
        ownerId: 'rep',
        rowKey: '1',
      });
      expect(rowValues(repeat, 't-w')).to.deep.equal(['AUTHORED', 'EDITED']);
      // no parameter reaches this widget, and its output still has to follow
      expect(repeat.getOutputData('Output')).to.deep.equal([
        'AUTHORED',
        'EDITED',
      ]);

      await widget.applyWidgetEdit(VALUE, 'A-ONLY', { ownerId: 'place-a' });
      await placeB.executeOptimizedChain();
      expect(placeA.capture.snapshots['t-w'][VALUE]).to.equal('A-ONLY');
      expect(placeB.capture.snapshots['t-w'][VALUE]).to.equal('AUTHORED');
      expect(placeB.capture.outputs['Output 1']).to.equal('AUTHORED');

      // the shared node stays the author's, and a later change reaches everyone
      expect(widget.getInputData(VALUE)).to.equal('AUTHORED');
      widget.setInputData(VALUE, 'AUTHOR-CHANGED');
      await repeat.executeOptimizedChain();
      expect(rowValues(repeat, 't-w')).to.deep.equal([
        'AUTHOR-CHANGED',
        'EDITED',
      ]);
    });
  });

  it('re-evaluates only the edited row', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b', 'c']);

      const [first, , third] = repeat.rows;
      await widget.applyWidgetEdit(VALUE, 'B!', {
        ownerId: 'rep',
        rowKey: '1',
      });
      expect(repeat.rows[0].capture).to.equal(first.capture);
      expect(repeat.rows[2].capture).to.equal(third.capture);
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'B!', 'c']);
    });
  });

  it('lets the latest edit of a parameter with several targets win', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const first = await addWidget(tc, 't', 'w0');
      const second = await addWidget(tc, 't', 'w1');
      await tc.connectNodesByID('t', 'w0', 'Parameter 1', VALUE);
      await tc.connectNodesByID('t', 'w1', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b']);

      const row = { ownerId: 'rep', rowKey: '0' };
      await first.applyWidgetEdit(VALUE, 'first-edit', row);
      await second.applyWidgetEdit(VALUE, 'second-edit', row);
      expect(rowValues(repeat, 'w0')).to.deep.equal(['second-edit', 'b']);
      expect(rowValues(repeat, 'w1')).to.deep.equal(['second-edit', 'b']);
    });
  });

  it('puts a row back to following its data when an edit is undone', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b']);
      const setItems = async (items: string[]) => {
        repeat.setInputData('Items', items);
        await repeat.executeOptimizedChain();
      };

      await widget.handleOnChange('edited', rowInstance(repeat, 't-w', 1));
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'edited']);

      await tc.undo();
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'b']);
      await setItems(['a', 'changed']);
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'changed']);

      await tc.redo();
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'edited']);
      await setItems(['a', 'ignored']);
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'edited']);

      await tc.undo();
      expect(rowValues(repeat, 't-w')).to.deep.equal(['a', 'ignored']);
    });
  });

  it('puts a placement back to following its author when undone', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      widget.setInputData(VALUE, 'AUTHORED');
      await widget.executeOptimizedChain();
      const place = await addPlace(tc, template, 'place');

      await widget.handleOnChange('edited', { ownerId: 'place' });
      expect(place.capture.snapshots['t-w'][VALUE]).to.equal('edited');

      await tc.undo();
      expect(place.capture.snapshots['t-w'][VALUE]).to.equal('AUTHORED');
      widget.setInputData(VALUE, 'CHANGED');
      await place.executeOptimizedChain();
      expect(place.capture.snapshots['t-w'][VALUE]).to.equal('CHANGED');
    });
  });

  it('brings back the edit a newer one replaced when undone', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const first = await addWidget(tc, 't', 'w0');
      const second = await addWidget(tc, 't', 'w1');
      await tc.connectNodesByID('t', 'w0', 'Parameter 1', VALUE);
      await tc.connectNodesByID('t', 'w1', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b']);

      await first.handleOnChange('first', rowInstance(repeat, 'w0', 0));
      await second.handleOnChange('second', rowInstance(repeat, 'w1', 0));
      expect(rowValues(repeat, 'w0')).to.deep.equal(['second', 'b']);

      await tc.undo();
      expect(rowValues(repeat, 'w0')).to.deep.equal(['first', 'b']);
      await tc.undo();
      expect(rowValues(repeat, 'w0')).to.deep.equal(['a', 'b']);
    });
  });

  it('still undoes a widget outside any template', () => {
    doWithTestController(async (tc: any) => {
      await tc.addNode('WidgetTextField', 'plain', 0, 0);
      const widget = tc.getNodeByID('plain');
      widget.setInputData(VALUE, 'before');
      await widget.handleOnChange('after');
      expect(widget.getInputData(VALUE)).to.equal('after');
      expect(widget.getOutputData('Out')).to.equal('after');

      await tc.undo();
      expect(widget.getInputData(VALUE)).to.equal('before');
      expect(widget.getOutputData('Out')).to.equal('before');
    });
  });

  it('applies the settings of the row being edited', () => {
    doWithTestController(async (tc: any) => {
      const slider = await addTemplate(tc, 'num');
      const number = await addWidget(tc, 'num', 'num-w', 'WidgetSlider');
      await tc.connectNodesByID('num', 'num-w', 'Parameter 1', 'Decimals');
      const decimals = await addRepeat(tc, slider, 'num-rep', [3, 0]);
      await number.handleValueChange(1.2345, rowInstance(decimals, 'num-w', 0));
      expect(rowValues(decimals, 'num-w')[0]).to.equal(1.235);

      const fallback = await addTemplate(tc, 'fall');
      const dropdown = await addWidget(tc, 'fall', 'fall-w', 'WidgetDropdown');
      await tc.connectNodesByID(
        'fall',
        'fall-w',
        'Parameter 1',
        'Fallback Option',
      );
      const fallbacks = await addRepeat(tc, fallback, 'fall-rep', ['f0', 'f1']);
      await dropdown.handleOnChange(
        { target: { value: 'not-an-option' } },
        rowInstance(fallbacks, 'fall-w', 0),
      );
      expect(rowValues(fallbacks, 'fall-w', 'Selected Option')[0]).to.equal(
        'f0',
      );

      const free = await addTemplate(tc, 'free');
      const autocomplete = await addWidget(
        tc,
        'free',
        'free-w',
        'WidgetAutocomplete',
      );
      await tc.connectNodesByID(
        'free',
        'free-w',
        'Parameter 1',
        'Allow custom values',
      );
      const frees = await addRepeat(tc, free, 'free-rep', [true, false]);
      await autocomplete.handleOnChange(
        'custom',
        rowInstance(frees, 'free-w', 0),
      );
      expect(rowValues(frees, 'free-w', 'Selected Option')[0]).to.equal(
        'custom',
      );
    });
  });

  it('never gives two rows the same key', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', [
        { id: 'x' },
        { id: 'x#1' },
        { id: 'x' },
      ]);
      repeat.setInputData('Key field', 'id');
      await repeat.executeOptimizedChain();
      expect(repeat.rows.map((row: any) => row.key)).to.deep.equal([
        'x',
        'x#1',
        'x#2',
      ]);
    });
  });

  it('reads what a row shows, not what the shared node holds', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', ['first', 'last']);

      expect(widget.getInputData(VALUE)).to.equal('last');
      expect(
        widget.readWidgetValue(VALUE, {
          ownerId: 'rep',
          rowKey: '0',
          snapshot: repeat.rows[0].capture.snapshots['t-w'],
        }),
      ).to.equal('first');
    });
  });

  it('fires a button with its own row in the shared nodes', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const button = await addWidget(tc, 't', 't-b', 'WidgetButton');
      await tc.connectNodesByID('t', 't-b', 'Parameter 1', 'On value');
      const repeat = await addRepeat(tc, template, 'rep', ['a', 'b']);

      const fired: unknown[] = [];
      const fire = button.getOutputSocketByName('Out');
      const setDataAndWait = fire.setDataAndWait.bind(fire);
      fire.setDataAndWait = (value: unknown) => {
        fired.push(value);
        return setDataAndWait(value);
      };
      await button.handleOnClick({
        ownerId: 'rep',
        rowKey: '0',
        snapshot: repeat.rows[0].capture.snapshots['t-b'],
      });
      expect(fired).to.deep.equal(['a', 0]);
      expect(button.getInputData('On value')).to.equal('a');
    });
  });

  it('routes a checkbox and validates a selection against the row', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const box = await addWidget(tc, 't', 't-c', 'WidgetCheckbox');
      const dropdown = await addWidget(tc, 't', 't-d', 'WidgetDropdown');
      await tc.connectNodesByID('t', 't-d', 'Parameter 1', 'Options');
      const repeat = await addRepeat(tc, template, 'rep', [
        ['a', 'b'],
        ['c', 'd'],
      ]);
      const authored = box.getInputData(SELECTED);

      await box.handleCheckboxChange(
        { target: { value: box.getInputData('Options')[0] } },
        true,
        { ownerId: 'rep', rowKey: '0' },
      );
      expect(box.getInputData(SELECTED)).to.deep.equal(authored);
      expect(repeat.rows[0].capture.snapshots['t-c'][SELECTED]).to.have.length(
        authored.length + 1,
      );

      // 'a' is an option of row 0, while the shared node holds row 1's options
      await dropdown.handleOnChange(
        { target: { value: 'a' } },
        {
          ownerId: 'rep',
          rowKey: '0',
          snapshot: repeat.rows[0].capture.snapshots['t-d'],
        },
      );
      expect(rowValues(repeat, 't-d', 'Selected Option')[0]).to.equal('a');
    });
  });

  it('only stops what a pass runs from adapting, and releases it again', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.addNode('CustomFunction', 'feeder', -800, 0);
      await tc.connectNodesByID('feeder', 't-w', undefined, 'Label');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      await addRepeat(tc, template, 'rep', ['a']);

      expect(widget.isInTemplateBody()).to.equal(true);
      expect(tc.getNodeByID('feeder').isInTemplateBody()).to.equal(false);

      await tc.getGraph().linkDisconnect('t-w', VALUE, false);
      expect(widget.isInTemplateBody()).to.equal(false);
    });
  });

  it('refuses a placement that would embed its own template', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const place = await addPlace(tc, template, 'place');
      const added = await tc.connectNodesByID('place', 't-sf', 'ReactUI');
      expect(added).to.not.equal(true);
      expect(place.getOutputSocketByName('ReactUI').hasLink()).to.equal(false);
    });
  });

  it('binds entries and lays rows out as asked', () => {
    doWithTestController(async (tc: any) => {
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      const repeat = await addRepeat(tc, template, 'rep', [
        { key: 'field-key', id: 'same' },
        { key: 'other', id: 'same' },
      ]);

      // an explicit "from" means the entry's field, even one called key
      repeat.setInputData('Parameter 1 from', 'key');
      // repeated key values must not collide
      repeat.setInputData('Key field', 'id');
      await repeat.executeOptimizedChain();
      expect(rowValues(repeat, 't-w')).to.deep.equal(['field-key', 'other']);
      expect(repeat.rows.map((row: any) => row.key)).to.deep.equal([
        'same',
        'same#1',
      ]);
      await widget.applyWidgetEdit(VALUE, 'edited', {
        ownerId: 'rep',
        rowKey: 'same#1',
      });
      expect(rowValues(repeat, 't-w')).to.deep.equal(['field-key', 'edited']);
    });
  });

  it('types into one row of a dashboard, and into a nested placement', () => {
    doWithTestController(async (tc: any) => {
      await tc.addNode('UISurfaceNode', 'page', 2400, 0);
      const template = await addTemplate(tc, 't');
      await addWidget(tc, 't', 't-w');
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      await addRepeat(tc, template, 'rep', ['first', 'second']);
      await tc.connectNodesByID('rep', 'page', 'ReactUI');

      const outer = await addTemplate(tc, 'outer');
      await addPlace(tc, template, 'nested');
      await tc.connectNodesByID(
        'outer',
        'nested',
        'Parameter 1',
        'Parameter 1',
      );
      await tc.connectNodesByID('nested', 'outer-sf', 'ReactUI');
      await addRepeat(tc, outer, 'outer-rep', ['x', 'y']);
      await tc.connectNodesByID('outer-rep', 'page', 'ReactUI');
      await tc.waitForPendingExecution();
      tc.toggleDashboard(VISIBILITY_ACTION.OPEN);
    });

    const rows =
      '[data-cy="dashboard"] [data-cy="repeat-template of rep"] input';
    const nested =
      '[data-cy="dashboard"] [data-cy="repeat-template of outer-rep"] input';
    cy.get(rows).eq(0).should('have.value', 'first');
    cy.get(rows).eq(1).should('have.value', 'second').type('!');
    cy.get(rows).eq(1).should('have.value', 'second!').and('be.focused');
    cy.get(rows).eq(0).should('have.value', 'first');

    cy.get(nested).eq(0).should('have.value', 'x');
    cy.get(nested).eq(1).should('have.value', 'y');

    shouldWithTestController((tc: any) => {
      const snapshots = tc
        .getNodeByID('rep')
        .rows.map((row: any) => row.capture.snapshots['t-w'][VALUE]);
      expect(snapshots).to.deep.equal(['first', 'second!']);
    });
  });

  it('can be built with the AI tools, as the node docs describe', () => {
    doWithTestController(async (tc: any) => {
      const call = async (name: string, input: Record<string, unknown>) => {
        const result = await tc.callAITool(name, input);
        expect(result.is_error, `${name}: ${result.content}`).to.not.equal(
          true,
        );
        return result;
      };
      const add = (node_type: string, node_id: string) =>
        call('add_node', { node_type, node_id });
      const connect = (
        from_node: string,
        from_socket: string,
        to_node: string,
        to_socket?: string,
      ) =>
        call('connect_sockets', { from_node, from_socket, to_node, to_socket });

      await add('UI Template', 'ai-node-1');
      await add('UI surface', 'ai-node-2');
      await add('WidgetTextField', 'ai-node-3');
      await call('set_node_name', { node_id: 'ai-node-1', name: 'Card' });
      await connect('ai-node-3', 'ReactUI', 'ai-node-2');
      await connect('ai-node-2', 'ReactUI', 'ai-node-1', 'UI');
      await connect('ai-node-1', 'Parameter 1', 'ai-node-3', VALUE);

      await add('Place Template', 'ai-node-4');
      await call('set_socket_value', {
        node_id: 'ai-node-4',
        socket_name: 'Template',
        value: 'Card',
      });
      await call('set_socket_value', {
        node_id: 'ai-node-4',
        socket_name: 'Parameter 1',
        value: 'placed',
      });
      expect(
        tc.getNodeByID('ai-node-4').capture.snapshots['ai-node-3'][VALUE],
      ).to.equal('placed');

      await add('Repeat Template', 'ai-node-5');
      await call('set_socket_value', {
        node_id: 'ai-node-5',
        socket_name: 'Template',
        value: 'Card',
      });
      await call('set_socket_value', {
        node_id: 'ai-node-5',
        socket_name: 'Parameter 1 from',
        value: 'name',
      });
      await call('set_socket_value', {
        node_id: 'ai-node-5',
        socket_name: 'Items',
        value: [{ name: 'a' }, { name: 'b' }],
      });
      expect(rowValues(tc.getNodeByID('ai-node-5'), 'ai-node-3')).to.deep.equal(
        ['a', 'b'],
      );

      await add('UI surface', 'ai-node-6');
      await connect('ai-node-5', 'ReactUI', 'ai-node-6');
      const refused = await tc.callAITool('connect_sockets', {
        from_node: 'ai-node-5',
        from_socket: 'ReactUI',
        to_node: 'ai-node-2',
      });
      expect(refused.is_error).to.equal(true);

      const docs = await call('describe_node', { node_type: 'UI Template' });
      expect(docs.content).to.contain('Build order');
    });
  });

  it('does not re-render every row per row when the template yields', () => {
    cy.window().then({ timeout: 60000 }, async (win: any) => {
      const tc = win.testController;
      const template = await addTemplate(tc, 't');
      const widget = await addWidget(tc, 't', 't-w');
      // in a worker by default, so every row hands control back to the browser
      await tc.addNode('CustomFunction', 'test', -500, 600);
      const test = tc.getNodeByID('test');
      test.setInputData('Code', IS_EVEN_ROW);
      await test.executeOptimizedChain();
      await tc.connectNodesByID('t', 't-w', 'Parameter 1', VALUE);
      await tc.connectNodesByID('t', 'test', 'Parameter 1', 'a');
      await tc.connectNodesByID(
        'test',
        't-sf',
        undefined,
        'Text Field visible',
      );
      const rows = 30;
      const repeat = await addRepeat(
        tc,
        template,
        'rep',
        Array.from({ length: rows }, (_, i) => `row-${i}`),
      );
      const idle = () =>
        new Promise((resolve) =>
          win.requestAnimationFrame(() =>
            win.requestIdleCallback(resolve, { timeout: 3000 }),
          ),
        );
      await idle();

      const render = widget.getWidgetContent;
      let renders = 0;
      widget.getWidgetContent = function counted(props: unknown) {
        renders++;
        return render.call(this, props);
      };
      await repeat.executeOptimizedChain();
      await idle();
      // visible rows only, and a mounted row must not render once per row
      expect(renders).to.be.greaterThan(0);
      expect(renders).to.be.lessThan(rows * 3);
    });
  });
});
