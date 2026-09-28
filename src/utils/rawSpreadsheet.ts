import * as XLSX from 'xlsx';

export function readRawWorkbook(input: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(input, {
    type: 'array',
    dense: false,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    sheetStubs: true,
    cellDates: false,
  });
}

export function rawSheetToTable(sheet: XLSX.WorkSheet, headerRow: number) {
  if (!sheet['!ref']) return [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (headerRow < 1 || headerRow > range.e.r + 1) return [];
  // Conversion is explicit; the source worksheet is never normalized or mutated.
  return XLSX.utils.sheet_to_json(structuredClone(sheet), {
    range: { s: { r: headerRow - 1, c: 0 }, e: range.e },
    raw: true,
    defval: null,
    blankrows: true,
  });
}
