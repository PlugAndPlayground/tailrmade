import * as XLSX from 'xlsx';
import {
  doWithTestController,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

describe('raw spreadsheet import', () => {
  it('inserts a live converter when connected to a table', () => {
    openNewGraph();
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Title'],
        [],
        ['Value', 'Value'],
        [0, false],
        [],
        [3, 4],
      ]),
      'Source',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Other'], [42]]),
      'Second',
    );
    cy.get('#pixi-container').selectFile(
      {
        contents: Cypress.Buffer.from(
          XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }),
        ),
        fileName: 'raw-cells.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      { action: 'drag-drop', force: true },
    );
    cy.get('#pixi-container').trigger('dragleave', { force: true });
    shouldWithTestController((controller) => {
      expect(
        controller.getNodes().some((node) => node.type === 'rawspreadsheet'),
      ).to.equal(true);
    });
    cy.contains('button', 'Convert to Table').should('not.exist');
    doWithTestController(async (controller) => {
      const source = controller
        .getNodes()
        .find((node) => node.type === 'rawspreadsheet')!;
      await controller.addNode(
        'Table2',
        'target-table',
        source.x + 1100,
        source.y,
      );
      await controller.connectNodesByIDAction(
        source.id,
        'target-table',
        'Workbook',
        'Data',
      );
      const converters = controller
        .getNodes()
        .filter((node) => node.type === 'spreadsheettotable');
      expect(converters).to.have.length(1);
      controller.setNodeInputValue(converters[0].id, 'Header Row', 3);
      await controller.executeNodeByID(converters[0].id);
      await controller.waitForPendingExecution();
      expect(
        controller.getNodeInputValue('target-table', 'Data'),
      ).to.deep.equal([
        { Value: 0, Value_1: false },
        { Value: null, Value_1: null },
        { Value: 3, Value_1: 4 },
      ]);
      const raw = controller.getNodeInputValue(source.id, 'Workbook');
      expect(raw.Sheets.Source.A1.v).to.equal('Title');
      raw.Sheets.Source.A4.v = 99;
      controller.setNodeInputValue(source.id, 'Workbook', raw);
      await controller.executeNodeByID(source.id);
      await controller.waitForPendingExecution();
      expect(
        controller.getNodeInputValue('target-table', 'Data')[0].Value,
      ).to.equal(99);
      controller.setNodeInputValue(converters[0].id, 'Sheet', 'Second');
      controller.setNodeInputValue(converters[0].id, 'Header Row', 1);
      await controller.executeNodeByID(converters[0].id);
      await controller.waitForPendingExecution();
      expect(
        controller.getNodeInputValue('target-table', 'Data'),
      ).to.deep.equal([{ Other: 42 }]);
      controller.zoomToFitNodesById();
    });
    cy.screenshot('raw-spreadsheet-connected');
  });
});
