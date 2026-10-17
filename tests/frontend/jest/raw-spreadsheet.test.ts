import * as XLSX from 'xlsx';
import {
  rawSheetToTable,
  readRawWorkbook,
} from '../../../src/utils/rawSpreadsheet';

it('preserves addressed cells and metadata through import and JSON serialization', () => {
  const workbook = XLSX.utils.book_new();
  const sheet: XLSX.WorkSheet = {
    '!ref': 'C3:F7',
    C3: { t: 's', v: 'Duplicate' },
    D3: { t: 's', v: 'Duplicate' },
    C5: { t: 'n', v: 0 },
    D5: { t: 'b', v: false },
    E5: { t: 'n', v: 45292, z: 'yyyy-mm-dd' },
    F5: { t: 'n', v: 2, f: '1+1' },
    C7: { t: 's', v: 'last' },
    '!merges': [{ s: { r: 5, c: 2 }, e: { r: 5, c: 3 } }],
  };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Original');
  XLSX.utils.book_append_sheet(workbook, {}, 'Empty');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const saved = JSON.parse(JSON.stringify(readRawWorkbook(bytes)));
  expect(saved.SheetNames).toEqual(['Original', 'Empty']);
  expect(saved.Sheets.Original.C3.v).toBe('Duplicate');
  expect(saved.Sheets.Original.D3.v).toBe('Duplicate');
  expect(saved.Sheets.Original.C5.v).toBe(0);
  expect(saved.Sheets.Original.D5.v).toBe(false);
  expect(saved.Sheets.Original.E5).toMatchObject({ v: 45292, z: 'yyyy-mm-dd' });
  expect(saved.Sheets.Original.F5).toMatchObject({ v: 2, f: '1+1' });
  expect(saved.Sheets.Original['!merges']).toEqual(sheet['!merges']);
  expect(saved.Sheets.Original.C7.v).toBe('last');
});

it('converts a chosen header row with typed values and blanks without changing source cells', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Title'],
    [],
    ['Value', 'Value'],
    [0, false],
    [],
    [3, 4],
  ]);
  const before = JSON.stringify(sheet);
  expect(rawSheetToTable(sheet, 3)).toEqual([
    { Value: 0, Value_1: false },
    { Value: null, Value_1: null },
    { Value: 3, Value_1: 4 },
  ]);
  expect(JSON.stringify(sheet)).toBe(before);
  expect(rawSheetToTable({}, 1)).toEqual([]);
});
