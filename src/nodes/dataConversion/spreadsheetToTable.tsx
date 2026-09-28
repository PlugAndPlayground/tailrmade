import { TypeConversionNode } from './conversionBase';
import Socket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { WorkbookType } from '../datatypes/workbookType';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import { NumberType } from '../datatypes/numberType';
import { DynamicEnumType } from '../datatypes/dynamicEnumType';
import { rawSheetToTable } from '../../utils/rawSpreadsheet';

export class SpreadsheetToTable extends TypeConversionNode {
  getName(): string {
    return 'Spreadsheet to Table';
  }
  getDescription(): string {
    return 'Converts a workbook sheet to table rows using a selected header row.';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Workbook', new WorkbookType(), {
        SheetNames: [],
        Sheets: {},
      }),
      new Socket(
        SOCKET_TYPE.IN,
        'Sheet',
        new DynamicEnumType(
          () =>
            (this.getInputData('Workbook')?.SheetNames ?? []).map(
              (name: string) => ({ text: name, value: name }),
            ),
          () => {},
        ),
        '',
      ),
      new Socket(
        SOCKET_TYPE.IN,
        'Header Row',
        new NumberType(true, 1, 1048576, 1),
        1,
      ),
      new Socket(SOCKET_TYPE.OUT, 'JSON Array', new JSONArrayType(), []),
    ];
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const workbook = input.Workbook;
    const sheetName = input.Sheet || workbook?.SheetNames?.[0];
    const sheet = workbook?.Sheets?.[sheetName];
    output['JSON Array'] = sheet
      ? rawSheetToTable(sheet, input['Header Row'])
      : [];
  }
}
