import React, { Suspense, useState } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import { GridCellKind } from '@glideapps/glide-data-grid';
import * as XLSX from 'xlsx';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import PPSocket from '../../classes/SocketClass';
import { SOCKET_TYPE } from '../../utils/constants';
import { getCanvasWidgetPointerEvents } from '../../utils/nodeInteractivity';
import { WorkbookType } from '../datatypes/workbookType';

const DataEditor = React.lazy(() => import('@glideapps/glide-data-grid'));
const workbookInput = 'Workbook';

export class RawSpreadsheet extends HybridNode2 {
  getName() {
    return 'Raw Spreadsheet';
  }
  getDescription() {
    return 'Spreadsheet cells with original addresses, values, formulas and sheet metadata.';
  }
  getTags() {
    return ['Input', 'Excel', 'Spreadsheet'].concat(super.getTags());
  }
  getDefaultNodeWidth() {
    return 800;
  }
  getDefaultNodeHeight() {
    return 400;
  }
  getMinNodeWidth() {
    return 360;
  }
  getMinNodeHeight() {
    return 200;
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        workbookInput,
        new WorkbookType(),
        { SheetNames: [], Sheets: {} },
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        workbookInput,
        new WorkbookType(),
        { SheetNames: [], Sheets: {} },
        true,
      ),
    ];
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    await super.onExecute(input, output);
    output[workbookInput] = input[workbookInput];
  }

  getWidgetContent(
    props: HybridWidgetContentProps<RawSpreadsheet>,
  ): React.ReactElement {
    const { node } = props;
    const workbook: XLSX.WorkBook =
      props[workbookInput] ?? node.getInputData(workbookInput);
    const [selectedSheet, setSelectedSheet] = useState('');
    const names = workbook?.SheetNames ?? [];
    const name = names.includes(selectedSheet)
      ? selectedSheet
      : (names[0] ?? '');
    const sheet = workbook?.Sheets?.[name];
    const range = sheet?.['!ref']
      ? XLSX.utils.decode_range(sheet['!ref'])
      : undefined;
    const columns = Array.from(
      { length: range ? range.e.c + 1 : 0 },
      (_, c) => ({
        title: XLSX.utils.encode_col(c),
        width: 120,
      }),
    );
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: getCanvasWidgetPointerEvents(props),
          backgroundColor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            p: 1,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <TextField
            select
            size="small"
            label="Sheet"
            value={name}
            sx={{ minWidth: 120, flex: 1 }}
            onChange={(e) => {
              setSelectedSheet(e.target.value);
            }}
          >
            {names.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Suspense fallback={<Box>Loading...</Box>}>
            <DataEditor
              columns={columns}
              rows={range ? range.e.r + 1 : 0}
              width="100%"
              height="100%"
              rowMarkers="number"
              getCellsForSelection={true}
              getCellContent={([c, r]) => {
                const cell = sheet?.[XLSX.utils.encode_cell({ c, r })];
                const value = cell?.v;
                const display =
                  cell?.w ??
                  (value == null
                    ? cell?.f
                      ? `=${cell.f}`
                      : ''
                    : String(value));
                return {
                  kind: GridCellKind.Text,
                  data: String(value ?? ''),
                  displayData: display,
                  allowOverlay: true,
                  readonly: true,
                };
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }
}
