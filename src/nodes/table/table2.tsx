import * as PIXI from 'pixi.js';
import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as XLSX from 'xlsx';
import '@glideapps/glide-data-grid/dist/index.css';
import debounce from 'lodash/debounce';
import {
  Box,
  Button,
  ButtonGroup,
  ClickAwayListener,
  Divider,
  Grow,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Menu,
  Paper,
  Popper,
  ThemeProvider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import SortIcon from '@mui/icons-material/Sort';
import PPSocket from '../../classes/SocketClass';
import ViewListIcon from '@mui/icons-material/ViewList';

import { SOCKET_TYPE, customTheme } from '../../utils/constants';
import {
  getCanvasWidgetPointerEvents,
  shouldAutoFocusWidgetContent,
} from '../../utils/nodeInteractivity';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import { JSONArrayType } from '../datatypes/jsonArrayType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { DynamicImport } from '../../utils/dynamicImport';
import PPGraph from '../../classes/GraphClass';
import {
  ActionHandler,
  ACTIONS,
  AddNodeActionArgs,
  BakedAction,
  PNPAction,
  SerializableAction,
  SetSocketValueActionArgs,
} from '../../classes/Action';
import { hri } from 'human-readable-ids';
import { inputArrayName } from '../data/json';
import InterfaceController from '../../InterfaceController';

const rowObjectsNames = 'JSON Array';
export const tableDataInputName = 'Data';
const columnMetaName = 'Column Meta';

// Selection output socket names
const selectedRowName = 'Selected Row';
const selectedColumnName = 'Selected Column';

const hyperlinkProtocolRegex =
  /^(?:https?:\/\/|mailto:|tel:|ftp:\/\/|file:\/\/)/i;
const hyperlinkWwwRegex = /^www\./i;

const EXTRA_ROWS = 10;

const STANDARD_COLUMN_WIDTH = 100;
import { EditListItem, GridCellKind } from '@glideapps/glide-data-grid'; // direct import as its being used early
import { StringType } from '../datatypes/stringType';

// Lazy load the DataGrid and its types
const LazyDataEditor = React.lazy(() => import('@glideapps/glide-data-grid'));
// Types that we need from the data grid - keep these separate to avoid bundling the whole package
type DataEditorRef = import('@glideapps/glide-data-grid').DataEditorRef;
type Item = import('@glideapps/glide-data-grid').Item;
type GridCell = import('@glideapps/glide-data-grid').GridCell;
type EditableGridCell = import('@glideapps/glide-data-grid').EditableGridCell;
type GridColumn = import('@glideapps/glide-data-grid').GridColumn;
type GridMouseEventArgs =
  import('@glideapps/glide-data-grid').GridMouseEventArgs;
type HeaderClickedEventArgs =
  import('@glideapps/glide-data-grid').HeaderClickedEventArgs;
type CellClickedEventArgs =
  import('@glideapps/glide-data-grid').CellClickedEventArgs;
type BaseGridMouseEventArgs =
  import('@glideapps/glide-data-grid').BaseGridMouseEventArgs;
type Rectangle = import('@glideapps/glide-data-grid').Rectangle;

// Create a loading fallback component
const LoadingFallback = () => (
  <Box
    sx={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f8f8f8',
    }}
  >
    <CircularProgress />
  </Box>
);

interface DataGridWrapperProps {
  node: Table2;
  tableColumns: any[];
  tableData: any[];
  readonly: boolean;
  gridColumns: GridColumn[];
  onContextMenuClick: (cell: Item, e: React.MouseEvent) => void;
  onHeaderContextMenu: (colIndex: number, event: React.MouseEvent) => void;
  onHeaderMenuClick: (col: number, event: HeaderClickedEventArgs) => void;
  getRowThemeOverride: (row: number) => any;
  onItemHovered: (args: GridMouseEventArgs) => void;
  onCellClicked: (cell: Item, event: CellClickedEventArgs) => void;
}

const readOnlyTheme = {
  bgCell: '#e0e0e0',
  bgCellMedium: '#d0d0d0',
  accentLight: '#b0b0b0',
  textDark: '#333333',
  cellHorizontalPadding: 8,
  baseFontStyle: '13px',
  border: '1px solid #999999',
  borderRadius: '4px',
};

// Separate the DataGrid component into its own component for better organization
const DataGridWrapper = React.forwardRef<DataEditorRef, DataGridWrapperProps>(
  (
    {
      node,
      tableColumns,
      tableData,
      readonly,
      gridColumns,
      onContextMenuClick,
      onHeaderContextMenu,
      onHeaderMenuClick,
      getRowThemeOverride,
      onItemHovered,
      onCellClicked,
    },
    ref,
  ) => {
    const baseTheme = readonly ? readOnlyTheme : undefined;

    return (
      <Suspense fallback={<LoadingFallback />}>
        <LazyDataEditor
          ref={ref}
          getCellContent={(cell) =>
            node.getContent(cell, tableColumns, tableData, readonly)
          }
          columns={gridColumns}
          rows={tableData.length + EXTRA_ROWS}
          overscrollX={40}
          maxColumnAutoWidth={500}
          maxColumnWidth={2000}
          onColumnResize={(column, newSize) =>
            node.onColumnResize(column, newSize)
          }
          width="100%"
          height="100%"
          getRowThemeOverride={(row) => ({
            ...getRowThemeOverride(row),
            ...baseTheme,
          })}
          theme={baseTheme}
          onCellsEdited={(newValues: readonly EditListItem[]) => {
            // this function cant be async, so we need to create a new async function
            const pre = structuredClone(node.getInputData(tableDataInputName));
            const editCells = async () => {
              for (let i = 0; i < newValues.length; i++) {
                const [col, row] = newValues[i].location;
                await node.updateCellData(
                  row,
                  tableColumns[col],
                  newValues[i].value.data,
                );
              }
              await node.executeChildren();
            };
            const undoAction = async () => {
              node.setInputData(tableDataInputName, structuredClone(pre));
              await node.executeChildren();
            };
            void ActionHandler.performRawAction(
              new BakedAction(
                new SerializableAction(editCells, undoAction, 'Edit Cells'),
              ),
            );
          }}
          onCellEdited={async (item, newValue) => {
            await node.onCellEdited(item, newValue, tableColumns);
          }}
          onCellContextMenu={onContextMenuClick as any}
          onColumnMoved={(start, end) => {
            if (!readonly) {
              node.onColumnMoved(start, end, tableColumns);
            }
          }}
          onHeaderContextMenu={onHeaderContextMenu as any}
          onHeaderMenuClick={onHeaderMenuClick as any}
          onItemHovered={onItemHovered}
          onCellClicked={onCellClicked as any}
          onPaste={true}
          onRowAppended={() => {
            if (!readonly) {
              void node.addRow(node.createNewRow(tableColumns));
            }
          }}
          onRowMoved={(from, end) => {
            if (!readonly) void node.onRowMoved(from, end, tableData);
          }}
          fillHandle={!readonly}
          rowSelect="multi"
          rowMarkers={'both'}
          smoothScrollX={true}
          smoothScrollY={true}
          rowSelectionMode="multi"
          getCellsForSelection={true}
          keybindings={{ search: true }}
          rightElement={
            !readonly ? (
              <Box
                sx={{
                  width: '40px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#f1f1f1',
                }}
              >
                <IconButton
                  sx={{ pt: '4px' }}
                  size="small"
                  onClick={() => {
                    void node.perform_action_addColumn();
                  }}
                >
                  <AddIcon
                    sx={{ fontSize: '16px' }}
                    data-cy="add-column-button"
                  />
                </IconButton>
              </Box>
            ) : undefined
          }
          rightElementProps={{
            fill: false,
            sticky: false,
          }}
        />
      </Suspense>
    );
  },
);

const exportOptions = ['xlsx', 'csv', 'txt', 'html', 'rtf'];
export class Table2 extends HybridNode2 {
  //workBook: XLSX.WorkBook;

  // refreshes the UI table with new array of json input, function added by react component further down
  refreshTable = (number) => {};

  public getName(): string {
    return 'Table';
  }

  public getDescription(): string {
    return 'Table (Sheet/Excel/CSV) node';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  static async getXLSXModule(): Promise<typeof XLSX> {
    return DynamicImport.dynamicImport('xlsx');
  }

  refreshTableDebounce = debounce(() => {
    this.refreshTable(Math.random());
  }, 100);

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    this.refreshTableDebounce();
    this.setOutputData(rowObjectsNames, this.getInputData(tableDataInputName));
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.OUT,
        rowObjectsNames,
        new JSONArrayType(),
        [],
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        selectedRowName,
        new NumberType(true, 0, 10000, 1),
        0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        selectedColumnName,
        new StringType(),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        tableDataInputName,
        new JSONArrayType(),
        [
          { A: '', B: '' },
          { A: '', B: '' },
        ],
        true,
      ),
      new PPSocket(SOCKET_TYPE.IN, columnMetaName, new JSONType(), {}, false),
    ];
  }

  public getMinNodeWidth(): number {
    return 200;
  }

  public getMinNodeHeight(): number {
    return 150;
  }

  public getDefaultNodeWidth(): number {
    return 800;
  }

  public getDefaultNodeHeight(): number {
    return 400;
  }

  public async onExport(selectedExportIndex: number) {
    const xlsx = await Table2.getXLSXModule();
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(
      this.getInputData(tableDataInputName),
    );
    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet');
    xlsx.writeFile(
      workbook,
      `${this.name}.${exportOptions[selectedExportIndex]}`,
      {
        sheet: workbook.SheetNames[0],
      },
    );
  }

  public async onImport() {
    const fileHandler = async (data: any) => {
      this.setInputData(tableDataInputName, data[0]);
      await this.executeChildren();
    };

    InterfaceController.onOpenFileBrowser(fileHandler);
  }

  public setInputData(name: string, data: any, loud = true): void {
    super.setInputData(name, data);
    this.setOutputData(rowObjectsNames, this.getInputData(tableDataInputName));
    if (loud) {
      this.refreshTable(Math.random());
    }
  }

  public createNewRow(columns: string[]) {
    const newObject = {};
    columns.forEach((column, index) => {
      newObject[column] = '';
    });
    return newObject;
  }

  public async addRow(rowObject: any) {
    const objects: any[] = this.getInputData(tableDataInputName);
    objects.push(rowObject);
    this.setInputData(tableDataInputName, objects);
    await this.executeChildren();
  }

  public async updateColumnOrder(
    columnName: string,
    newOrder: number,
    data: any[],
  ) {
    const dataPost = [];
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      const otherColumns = columns.filter((column) => column !== columnName);

      data.forEach((oldObject) => {
        let otherColumnsIndex = 0;
        const newObject = {};
        for (; otherColumnsIndex < newOrder; otherColumnsIndex++) {
          newObject[otherColumns[otherColumnsIndex]] =
            oldObject[otherColumns[otherColumnsIndex]];
        }
        newObject[columnName] = oldObject[columnName];
        for (; otherColumnsIndex < otherColumns.length; otherColumnsIndex++) {
          newObject[otherColumns[otherColumnsIndex]] =
            oldObject[otherColumns[otherColumnsIndex]];
        }
        dataPost.push(newObject);
      });
    } else {
      console.error('cant change order of table, no input');
    }
    this.setInputData(tableDataInputName, dataPost);
    await this.executeChildren();
  }

  public async removeRow(row: number) {
    const objects: any[] = this.getInputData(tableDataInputName);
    objects.splice(Math.max(row, 0), 1);
    this.setInputData(tableDataInputName, objects);
    await this.executeChildren();
  }

  public async perform_action_flipRowsAndColumns() {
    const tableData = this.getInputData(tableDataInputName);
    const aoa = Table2.JSONArrayToArrayOfArrays(tableData);
    const flipped = Table2.flipArrayOfArrays(aoa);
    const jsonArray = Table2.arrayOfArraysToJSONArray(flipped);
    const dataPre = structuredClone(tableData);

    const undoAction = async () => {
      this.setInputData(tableDataInputName, structuredClone(dataPre));
      await this.executeChildren();
    };

    const action = async () => {
      this.setInputData(tableDataInputName, structuredClone(jsonArray));
      await this.executeChildren();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Flip rows and Columns'),
      ),
    );
  }

  public async perform_action_removeColumn(columnName: string) {
    // TODO SERIALIZED ACTION
    // bit silly making entire copy of table but it is easiest
    const dataPre: any[] = structuredClone(
      this.getInputData(tableDataInputName),
    );
    const undoAction = async () => {
      this.setInputData(tableDataInputName, structuredClone(dataPre));
      await this.executeChildren();
    };

    const action = async () => {
      const prevData = this.getInputData(tableDataInputName);
      prevData.forEach((obj) => delete obj[columnName]);
      this.setInputData(tableDataInputName, prevData);
      await this.executeChildren();
    };
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(action, undoAction, 'Remove Column'),
      ),
    );
  }

  private static getAcceptableColumnName(
    desiredName: string,
    columns: string[],
  ): string {
    let currentNewColumnName = desiredName;
    let index = 2;
    while (columns.includes(currentNewColumnName)) {
      currentNewColumnName = desiredName + ' ' + index;
      index++;
    }
    return currentNewColumnName;
  }

  public async perform_action_addColumn(
    location: undefined | number = undefined,
  ) {
    const dataPre: any[] = this.getInputData(tableDataInputName);
    const dataPreCloned = structuredClone(dataPre);
    const currentNewColumnName = Table2.getAcceptableColumnName(
      'New',
      dataPre.length > 0 ? Object.keys(dataPre[0]) : [],
    );

    const action = async () => {
      // we need at least one object in order to have categories
      if (dataPre.length == 0) {
        dataPre.push({});
      }
      dataPre.forEach((object) => {
        object[currentNewColumnName] = '';
      });
      this.setInputData(tableDataInputName, dataPre);
      if (location !== undefined) {
        await this.updateColumnOrder(currentNewColumnName, location, dataPre);
      }
      await this.executeChildren();
    };
    const undoAction = async () => {
      this.setInputData(tableDataInputName, structuredClone(dataPreCloned));
      await this.executeChildren();
    };

    await ActionHandler.performRawAction(
      new BakedAction(new SerializableAction(action, undoAction, 'Add Column')),
    );
  }

  isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  private getHyperlinkTarget(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (hyperlinkProtocolRegex.test(trimmed)) {
      return trimmed;
    }
    if (hyperlinkWwwRegex.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return undefined;
  }

  private openHyperlinkTarget(target: string) {
    if (!target) {
      return;
    }
    if (typeof window === 'undefined') {
      console.warn('Unable to open hyperlink without window context');
      return;
    }
    //const popup =
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  public isBoringData(data: any) {
    return data == undefined || data === '';
  }

  public async updateCellData(
    row: number,
    columnName: string,
    data: any,
    loud = false,
  ) {
    const dataPre = this.getInputData(tableDataInputName);

    const newDataIsBoring = this.isBoringData(data);
    // we are trying to assign undefined to something that doesnt exist, seems unneccessary
    if (newDataIsBoring && dataPre.length <= row) {
      return;
    }

    // convert to number if it seems like it is one
    if (this.isNumeric(data)) {
      data = Number(data);
    }

    // if we dont have any data we need to push something
    if (dataPre.length == 0) {
      await this.perform_action_addColumn();
    }

    // we potentially have to add new entries to fill out
    for (let i = dataPre.length; i < row + 1; i++) {
      await this.addRow(this.createNewRow(Object.keys(dataPre[0])));
    }

    const entry = dataPre[row];
    if (newDataIsBoring) {
      const allEmpty =
        Object.values(entry).find(
          (entry) => entry !== undefined && entry !== '',
        ) === undefined;
      if (allEmpty) {
        await this.removeRow(row);
        return;
      }
    }

    dataPre[row][columnName] = data;
    this.setInputData(tableDataInputName, dataPre, loud);
    if (loud) {
      await this.executeChildren();
    }
  }

  public async updateColumnName(oldName: string, newName: string) {
    const dataPre: any[] = this.getInputData(tableDataInputName);
    if (dataPre.length > 0) {
      const prevIndex = Object.keys(dataPre[0]).indexOf(oldName);
      // dont allow colliding names
      const usedNewName = Table2.getAcceptableColumnName(
        newName,
        Object.keys(dataPre[0]),
      );
      dataPre.forEach((object) => {
        object[usedNewName] = object[oldName];
        delete object[oldName];
      });
      this.setInputData(tableDataInputName, dataPre);
      await this.updateColumnOrder(usedNewName, prevIndex, dataPre);
    } else {
      console.error('cannot change column name, no input data');
    }
  }

  public updateColumnMeta(columnName: string, fieldName: string, data: any) {
    const columnMeta = this.getInputData(columnMetaName);
    const newMeta =
      columnMeta[columnName] !== undefined ? columnMeta[columnName] : {};
    newMeta[fieldName] = data;
    columnMeta[columnName] = newMeta;
    this.setInputData(columnMetaName, columnMeta);
    this.refreshTable(Math.random());
  }

  public getColumns(tableData: any[]): [string[], GridColumn[]] {
    const columnMeta = this.getInputData(columnMetaName);
    const tableColumns: string[] =
      tableData.length > 0 ? Object.keys(tableData[0]) : [];
    let gridColumns: GridColumn[] = tableColumns.map((column) => ({
      title: column,
      id: column,
    }));
    const fallbackProps = { width: STANDARD_COLUMN_WIDTH };
    gridColumns = gridColumns.map((column) => ({
      ...fallbackProps,
      ...column,
      ...columnMeta[column.title],
    }));
    return [tableColumns, gridColumns];
  }

  public static JSONArrayToArrayOfArrays(JSONArray: any[]): any[][] {
    if (JSONArray.length < 1) {
      return [];
    } else {
      const columns = Object.keys(JSONArray[0]);
      const toReturn: any[][] = [];

      const columnsArray = [];
      for (let j = 0; j < columns.length; j++) {
        columnsArray.push(columns[j]);
      }
      toReturn.push(columnsArray);
      for (let i = 0; i < JSONArray.length; i++) {
        const newArray = [];
        for (let j = 0; j < columns.length; j++) {
          newArray.push(JSONArray[i][columns[j]]);
        }
        toReturn.push(newArray);
      }

      return toReturn;
    }
  }

  public static flipArrayOfArrays(arrayOfArrays: any[][]) {
    const newArrayOfArrays = [];
    if (arrayOfArrays.length > 0) {
      const lenX = arrayOfArrays.length;
      const lenY = arrayOfArrays[0].length;
      for (let i = 0; i < lenY; i++) {
        const newArray = [];
        for (let j = 0; j < lenX; j++) {
          newArray.push(arrayOfArrays[j][i]);
        }
        newArrayOfArrays.push(newArray);
      }
    }
    return newArrayOfArrays;
  }

  public static arrayOfArraysToJSONArray(arrayOfArrays: any[][]) {
    if (arrayOfArrays.length < 1) {
      return {};
    } else {
      const columns = arrayOfArrays[0];
      const toReturn = [];
      for (let i = 1; i < arrayOfArrays.length; i++) {
        const newObject = {};
        for (let j = 0; j < columns.length; j++) {
          newObject[columns[j]] = arrayOfArrays[i][j];
        }
        toReturn.push(newObject);
      }
      return toReturn;
    }
  }

  public getContent(
    cell: Item,
    tableColumns: any[],
    tableData: any[],
    readonly: boolean,
  ): GridCell {
    const [col, row] = cell;
    let dataToDisplay = '';
    let data = '';
    if (col < tableColumns.length && row < tableData.length) {
      data = tableData[row][tableColumns[col]];
      dataToDisplay = String(data ?? '');
    }
    const commonProps = {
      allowOverlay: !readonly,
      readonly: readonly,
      displayData: dataToDisplay,
      themeOverride: readonly ? readOnlyTheme : undefined,
      data: data as any,
    };
    if (data === null || data === undefined) {
      return {
        ...commonProps,
        kind: GridCellKind.Text,
        displayData: '',
        data: '',
      };
    }
    const hyperlinkTarget = this.getHyperlinkTarget(data);
    if (hyperlinkTarget) {
      return {
        ...commonProps,
        kind: GridCellKind.Uri,
        data: data as string,
        displayData: dataToDisplay,
        hoverEffect: true,
        onClickUri: (
          args: BaseGridMouseEventArgs & { preventDefault: () => void },
        ) => {
          args.preventDefault();
          this.openHyperlinkTarget(hyperlinkTarget);
        },
      };
    }
    // these kinda didnt work because you want to be able to change the type of property something is whenever
    /*else if (typeof data == 'number') {
      return {
        ...commonProps,
        kind: GridCellKind.Number,
      }
    }
    else if (typeof data == 'boolean') {
      return {
        ...commonProps,
        allowOverlay: false,
        kind: GridCellKind.Boolean,
      }
    }
    */
    return {
      kind: GridCellKind.Text,
      allowWrapping: true,
      ...commonProps,
    };
  }
  public onCellEdited = async (
    cell: Item,
    newValue: EditableGridCell,
    tableColumns: any[],
  ) => {
    const [col, row] = cell;
    const entry = this.getInputData(tableDataInputName)[row];
    let dataPre = undefined;
    if (entry == undefined) {
      dataPre = undefined;
    } else {
      dataPre = structuredClone(entry[tableColumns[col]]);
    }
    const newData = newValue.data;
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          async () => {
            await this.updateCellData(row, tableColumns[col], newData);
          },
          async () => {
            await this.updateCellData(row, tableColumns[col], dataPre);
          },
          'Update Cell data',
        ),
      ),
    );
  };

  public getColumnData = async (
    tableColumns: any[],
    colMenu,
    flattenMapID: string = hri.random(),
  ) => {
    const name = tableColumns[colMenu.col];
    const formatMapNodeID = hri.random();
    const args: AddNodeActionArgs = {
      nodeName: 'FormatMap',
      nodeID: formatMapNodeID,
      addLinkNodeID: this.id,
      addLinkSocketName: rowObjectsNames,
      addLinkSocketType: SOCKET_TYPE.OUT,
      position: new PIXI.Point(
        this.x + this.nodeWidth + 100,
        this.y + this.nodeHeight / 2,
      ),
    };
    const socketValueArgs: SetSocketValueActionArgs = {
      nodeID: formatMapNodeID,
      socketType: SOCKET_TYPE.IN,
      socketName: 'Format ' + name,
      oldValue: { Enabled: false, Alias: '' },
      newValue: { Enabled: true, Alias: '' },
    };
    const args2: AddNodeActionArgs = {
      nodeName: 'FlattenMap',
      nodeID: flattenMapID,
      addLinkNodeID: formatMapNodeID,
      addLinkSocketName: inputArrayName,
      addLinkSocketType: SOCKET_TYPE.OUT,
      position: new PIXI.Point(
        this.x + this.nodeWidth + 300,
        this.y + this.nodeHeight / 2,
      ),
    };
    await PNPAction(ACTIONS.ADD_NODE, args, args);
    await PNPAction(ACTIONS.SET_SOCKET_VALUE, socketValueArgs, socketValueArgs);
    await PNPAction(ACTIONS.ADD_NODE, args2, args2);
  };

  public perform_action_onSort = async (
    tableColumns: any[],
    columnIndex: number,
    desc: boolean,
  ) => {
    // TODO SERIALIZED ACTION
    const dataPre = JSON.parse(
      JSON.stringify(this.getInputData(tableDataInputName)),
    );
    const action = async () => {
      this.getInputData(tableDataInputName).sort((a, b) => {
        const valA = a[tableColumns[columnIndex]];
        const valB = b[tableColumns[columnIndex]];

        // Handle empty values (they go to bottom)
        if (valA === '' || valA == null) return 1;
        if (valB === '' || valB == null) return -1;

        // Compare values directly with localeCompare for strings
        // and simple subtraction for numbers
        const result =
          typeof valA === 'number' && typeof valB === 'number'
            ? valA - valB
            : String(valA).localeCompare(String(valB), undefined, {
                numeric: true,
              });

        return desc ? -result : result;
      });
      this.setInputData(
        tableDataInputName,
        this.getInputData(tableDataInputName),
      );
      await this.executeChildren();
    };
    const undoAction = async () => {
      this.setInputData(tableDataInputName, dataPre);
      await this.executeChildren();
    };
    await ActionHandler.performRawAction(
      new BakedAction(new SerializableAction(action, undoAction, 'Sort Table')),
    );
  };

  public setNodeName(text: string): void {
    super.setNodeName(text);
    if (this.hasBeenAdded) {
      this.refreshTable(Math.random());
    }
  }

  public async onRowMoved(from: number, to: number, tableData: any[]) {
    const pre = tableData;
    const row = tableData[from];
    pre.splice(from, 1);
    pre.splice(to, 0, row);
    this.setInputData(tableDataInputName, pre);
    await this.executeChildren();
  }

  public onColumnMoved(
    startIndex: number,
    endIndex: number,
    tableColumns: any[],
  ) {
    console.log(
      'index: ' +
        startIndex +
        ' updating: ' +
        tableColumns[startIndex] +
        ' to position: ' +
        endIndex,
    );
    void this.updateColumnOrder(
      tableColumns[startIndex],
      endIndex,
      this.getInputData(tableDataInputName),
    );
  }

  public onColumnResize(column: GridColumn, newSize: number) {
    this.updateColumnMeta(column.title, 'width', newSize);
  }

  public async updateSelection(col: number, row: number) {
    const tableData: any[] = this.getInputData(tableDataInputName);
    const [tableColumns] = this.getColumns(tableData);

    this.setOutputData(selectedRowName, row);
    this.setOutputData(selectedColumnName, tableColumns[col]);

    const outputLinkedConnections = [selectedRowName, selectedColumnName];
    // no need to update all the children nodes, might be nodes listening to the main data doing expensive stuff
    for (const connectionName of outputLinkedConnections) {
      const socket = this.getOutputSocketByName(connectionName);
      const linksToTrigger = socket.links.filter(
        (link) => link.getTarget().getNode().updateBehaviour.update,
      );
      linksToTrigger.forEach(async (link) => {
        await link.getTarget().getNode().executeOptimizedChain();
      });
    }
  }

  getWidgetContent(
    props: HybridWidgetContentProps<Table2>,
  ): React.ReactElement {
    const node = props.node;

    const dataGridRef = useRef<DataEditorRef | null>(null);
    const setDataGridRef = useCallback((instance: DataEditorRef | null) => {
      dataGridRef.current = instance;
    }, []);
    const [colMenu, setColMenu] = useState<{
      col: number;
      pos: PIXI.Point;
    }>();
    const [rowMenu, setRowMenu] = useState<{
      cell: Item;
      pos: PIXI.Point;
    }>();

    const [hoverRow, setHoverRow] = useState<number | undefined>(undefined);
    const [openExportFormat, setExportFormatOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [selectedExportIndex, setSelectedExportIndex] = useState(0);
    const [refreshValue, setRefreshValue] = useState(0);
    node.refreshTable = setRefreshValue;
    const tableContent = node.getInputData(tableDataInputName);

    const [tableColumns, gridColumns] = node.getColumns(tableContent);
    const tableData: any[] = tableContent;

    const handleExportFormatClose = (event: Event) => {
      if (
        anchorRef.current &&
        anchorRef.current.contains(event.target as HTMLElement)
      ) {
        return;
      }

      setExportFormatOpen(false);
    };

    const handleExportFormatToggle = () => {
      setExportFormatOpen((prevOpen) => !prevOpen);
    };

    const handleExportFormatClick = (
      event: React.MouseEvent<HTMLLIElement, MouseEvent>,
      index: number,
    ) => {
      setSelectedExportIndex(index);
      setExportFormatOpen(false);
    };

    const onItemHovered = useCallback((args: GridMouseEventArgs) => {
      const [_, row] = args.location;
      setHoverRow(args.kind !== 'cell' ? undefined : row);
    }, []);

    const getRowThemeOverride = useCallback(
      (row) => {
        if (row !== hoverRow) return undefined;
        return {
          bgCell: '#f7f7f7',
          bgCellMedium: '#f0f0f0',
        };
      },
      [hoverRow],
    );

    const isColOpen = colMenu !== undefined;
    const isRowOpen = rowMenu !== undefined;

    useEffect(() => {
      if (!dataGridRef.current || !shouldAutoFocusWidgetContent(props)) {
        return;
      }

      const frameId = requestAnimationFrame(() => {
        dataGridRef.current?.focus();
      });

      return () => {
        cancelAnimationFrame(frameId);
      };
    }, [props.disabled, props.inDashboard, props.isInteractionEnabled]);

    const onHeaderMenuClick = useCallback((col: number, bounds: Rectangle) => {
      setColMenu({
        col,
        pos: new PIXI.Point(bounds.x + bounds.width, bounds.y),
      });
    }, []);

    const onHeaderContextMenu = useCallback(
      (col: number, event: HeaderClickedEventArgs) => {
        event.preventDefault();
        setColMenu({
          col,
          pos: new PIXI.Point(
            event.bounds.x + event.localEventX,
            event.bounds.y + event.localEventY,
          ),
        });
      },
      [],
    );

    const onContextMenuClick = useCallback(
      (cell: Item, event: CellClickedEventArgs) => {
        event.preventDefault();
        setRowMenu({
          cell,
          pos: new PIXI.Point(
            event.bounds.x + event.localEventX,
            event.bounds.y + event.localEventY,
          ),
        });
      },
      [],
    );

    const onCellClicked = (cell: Item) => {
      const [col, row] = cell;
      void node.updateSelection(col, row);
    };

    const readOnly =
      node.getInputSocketByName(tableDataInputName).hasLink() || props.disabled;

    interface ColumnRenameState {
      isRenameModalOpen: boolean;
      selectedColumn: string;
      newColumnName: string;
    }

    const [tableState, setTableState] = useState<ColumnRenameState>({
      isRenameModalOpen: false,
      selectedColumn: '',
      newColumnName: '',
    });

    const handleOpenRenameModal = (columnName: string) => {
      setTableState({
        isRenameModalOpen: true,
        selectedColumn: columnName,
        newColumnName: columnName,
      });
    };

    const handleCloseRenameModal = () => {
      setTableState({
        ...tableState,
        isRenameModalOpen: false,
      });
    };

    const perform_action_rename = async () => {
      const newName = tableState.newColumnName;
      const oldName = tableState.selectedColumn;

      if ((newName as string).trim().length == 0) {
        InterfaceController.showSnackBar(
          'Empty string is not a valid column name',
        );
      } else {
        const validName = Number.isNaN(parseFloat(newName as string));
        if (validName) {
          await ActionHandler.performRawAction(
            new BakedAction(
              new SerializableAction(
                async () => {
                  await node.updateColumnName(oldName, newName as string);
                },
                async () => {
                  await node.updateColumnName(newName as string, oldName);
                },
                'Change table column name',
              ),
            ),
          );
        } else {
          InterfaceController.showSnackBar('Column name cannot be a number');
        }
      }

      handleCloseRenameModal();
    };

    return (
      <Box
        sx={{
          alignItems: 'center',
          position: 'relative',
          height: '100%',
          backgroundColor: '#f8f8f8',
          pointerEvents: getCanvasWidgetPointerEvents(props),
        }}
      >
        {' '}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            p: 0.75,
            backgroundColor: '#e0e5f7',
            fontSize: '1.5rem',
            fontWeight: 500,
            color: '#2c2c2c',
          }}
        >
          <ViewListIcon
            sx={{
              fontSize: '25px',
              color: '#666', // Slightly darker icon color too
            }}
          />
          {node.nodeName}
        </Box>
        {(props.isInteractionEnabled || props.inDashboard) && (
          <ThemeProvider theme={customTheme}>
            <ButtonGroup
              variant="contained"
              size="small"
              ref={anchorRef}
              sx={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                zIndex: 10,
              }}
            >
              {!readOnly && (
                <Button
                  onClick={() => {
                    if (!readOnly) {
                      void node.onImport();
                    }
                  }}
                >
                  <UploadIcon sx={{ ml: 0.5, fontSize: '16px' }} />
                  Replace
                </Button>
              )}
              <Button
                size="small"
                onClick={handleExportFormatToggle}
                sx={{ px: 1 }}
              >
                {exportOptions[selectedExportIndex]}
              </Button>
              <Button onClick={() => node.onExport(selectedExportIndex)}>
                <DownloadIcon sx={{ ml: 0.5, fontSize: '16px' }} />
              </Button>
            </ButtonGroup>

            <Popper
              sx={{
                zIndex: 1,
              }}
              open={openExportFormat}
              anchorEl={anchorRef.current}
              role={undefined}
              transition
              disablePortal
              placement="top-start"
            >
              {({ TransitionProps }) => (
                <Grow
                  {...TransitionProps}
                  style={{
                    transformOrigin: 'center bottom',
                  }}
                >
                  <Paper>
                    <ClickAwayListener onClickAway={handleExportFormatClose}>
                      <MenuList id="split-button-menu" autoFocusItem>
                        {exportOptions.map((option, index) => (
                          <MenuItem
                            key={option}
                            selected={index === selectedExportIndex}
                            onClick={(event) =>
                              handleExportFormatClick(event, index)
                            }
                          >
                            {option}
                          </MenuItem>
                        ))}
                      </MenuList>
                    </ClickAwayListener>
                  </Paper>
                </Grow>
              )}
            </Popper>
          </ThemeProvider>
        )}
        <Box sx={{ height: 'calc(100% - 50px)' }}>
          {' '}
          <DataGridWrapper
            node={node}
            tableColumns={tableColumns}
            tableData={tableData}
            readonly={readOnly}
            gridColumns={gridColumns}
            ref={setDataGridRef}
            onContextMenuClick={onContextMenuClick as any}
            onHeaderContextMenu={onHeaderContextMenu as any}
            onHeaderMenuClick={onHeaderMenuClick as any}
            getRowThemeOverride={getRowThemeOverride}
            onItemHovered={onItemHovered}
            onCellClicked={onCellClicked as any}
          />
        </Box>
        <Menu
          open={isColOpen}
          onClose={() => {
            setColMenu(undefined);
          }}
          anchorReference="anchorPosition"
          anchorPosition={{
            top: colMenu?.pos.y ?? 0,
            left: colMenu?.pos.x ?? 0,
          }}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
        >
          <div>
            <MenuItem onClick={() => node.getColumnData(tableColumns, colMenu)}>
              <ListItemIcon>
                <AddIcon fontSize="small" data-cy="get-column-data-icon" />
              </ListItemIcon>
              <ListItemText>Get column data</ListItemText>
            </MenuItem>
          </div>
          {!readOnly && (
            <div>
              <Divider />
              <MenuItem
                onClick={() => {
                  handleOpenRenameModal(tableColumns[colMenu.col]);
                }}
              >
                <ListItemIcon>
                  <AddIcon fontSize="small" data-cy="rename-column-icon" />
                </ListItemIcon>
                <ListItemText>Rename Column</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  // TODO ACTIONIZE
                  void node.perform_action_addColumn(Math.max(colMenu.col, 0));
                }}
              >
                <ListItemIcon>
                  <AddIcon fontSize="small" data-cy="add-column-left-icon" />
                </ListItemIcon>
                <ListItemText>Add column left</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  // TODO ACTIONIZE
                  void node.perform_action_addColumn(colMenu.col + 1);
                }}
              >
                <ListItemIcon>
                  <AddIcon fontSize="small" data-cy="add-column-right-icon" />
                </ListItemIcon>
                <ListItemText>Add column right</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  const name = colMenu.col;
                  await node.perform_action_removeColumn(tableColumns[name]);
                }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Delete column</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  void node.perform_action_onSort(
                    tableColumns,
                    colMenu.col,
                    false,
                  );
                  setColMenu(undefined);
                }}
              >
                <ListItemIcon>
                  <SortIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort A-Z</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  void node.perform_action_onSort(
                    tableColumns,
                    colMenu.col,
                    true,
                  );
                  setColMenu(undefined);
                }}
              >
                <ListItemIcon>
                  <SortIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Sort Z-A</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={async () => {
                  await node.perform_action_flipRowsAndColumns();
                }}
              >
                <ListItemText>Flip rows and columns (!)</ListItemText>
              </MenuItem>
            </div>
          )}
        </Menu>
        <Menu
          open={isRowOpen}
          onClose={() => {
            setRowMenu(undefined);
          }}
          anchorReference="anchorPosition"
          anchorPosition={{
            top: rowMenu?.pos.y ?? 0,
            left: rowMenu?.pos.x ?? 0,
          }}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
        >
          {!readOnly && (
            <div>
              <Divider />
              <MenuItem
                onClick={() => {
                  const rowsNum = tableData.length;
                  void node.addRow(node.createNewRow(tableColumns));
                  void node.onRowMoved(rowsNum, rowMenu.cell[1], tableData);
                }}
              >
                <ListItemIcon>
                  <AddIcon fontSize="small" data-cy="add-row-above-icon" />
                </ListItemIcon>
                <ListItemText>Add row above</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={async () => {
                  const rowsNum = tableData.length;
                  await node.addRow(node.createNewRow(tableColumns));
                  await node.onRowMoved(
                    rowsNum,
                    rowMenu.cell[1] + 1,
                    tableData,
                  );
                }}
              >
                <ListItemIcon>
                  <AddIcon fontSize="small" data-cy="add-row-below-icon" />
                </ListItemIcon>
                <ListItemText>Add row below</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={async () => {
                  tableData.splice(Math.max(rowMenu.cell[1], 0), 1);
                  node.setInputData(tableDataInputName, tableData);
                  setRowMenu(undefined);
                  await node.executeChildren();
                }}
              >
                <ListItemIcon></ListItemIcon>
                <ListItemText>Delete row</ListItemText>
              </MenuItem>
            </div>
          )}
          <MenuItem
            onClick={async () => {
              const arrayGetID = hri.random();
              const args: AddNodeActionArgs = {
                nodeName: 'ArrayGet',
                nodeID: arrayGetID,
                addLinkNodeID: node.id,
                addLinkSocketName: inputArrayName,
                addLinkSocketType: SOCKET_TYPE.OUT,
                position: new PIXI.Point(
                  node.x + node.nodeWidth + 300,
                  node.y + node.nodeHeight / 2,
                ),
              };
              const socketValueArgs: SetSocketValueActionArgs = {
                nodeID: arrayGetID,
                socketType: SOCKET_TYPE.IN,
                socketName: 'Index',
                oldValue: 0,
                newValue: rowMenu.cell[1],
              };
              await PNPAction(ACTIONS.ADD_NODE, args, args);
              await PNPAction(
                ACTIONS.SET_SOCKET_VALUE,
                socketValueArgs,
                socketValueArgs,
              );
            }}
          >
            <ListItemIcon>
              <AddIcon fontSize="small" data-cy="get-row-object-icon" />
            </ListItemIcon>
            <ListItemText>Get row object</ListItemText>
          </MenuItem>
        </Menu>
        <Dialog
          open={tableState.isRenameModalOpen}
          onClose={handleCloseRenameModal}
        >
          <DialogTitle>Rename Column</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="New Column Name"
              fullWidth
              value={tableState.newColumnName}
              onChange={(e) =>
                setTableState({
                  ...tableState,
                  newColumnName: e.target.value,
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void perform_action_rename();
                }
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseRenameModal}>Cancel</Button>
            <Button onClick={perform_action_rename} variant="contained">
              Rename
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // returns an array of arrays of JSON objects (one array per sheet), to be use for table nodes
  public static async convertArrayBufferToTableInput(
    input: any,
  ): Promise<any[][]> {
    const xlsx = await Table2.getXLSXModule();
    if (input !== undefined) {
      const workBook: XLSX.WorkBook = xlsx.read(input, {
        type: typeof input === 'string' ? 'string' : 'array',
        dense: true,
      });
      return workBook.SheetNames.map((name) =>
        xlsx.utils.sheet_to_json(workBook.Sheets[name], {
          raw: false,
        }),
      );
    } else {
      return [];
    }
  }

  // converts CSV string to array of JSON objects
  public static convertCSVToJSONArray(csvData: string): any[] {
    const lines = csvData.trim().split('\n');
    const delimiter = ',';

    // Parse CSV to array of JSON objects
    const headers = lines[0]
      .split(delimiter)
      .map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const jsonArray: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.split(delimiter);
      const obj: any = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[j] || '';
      }
      jsonArray.push(obj);
    }

    return jsonArray;
  }

  public static async dataToTableCreation(
    inputData: any[],
    mouseX: number,
    mouseY: number,
    fileName: string,
  ) {
    let currY = mouseY;
    for (let i = 0; i < inputData.length; i++) {
      // try to figure out number of columns to set size
      let nodeWidth = 400;
      if (inputData[i].length > 0 && typeof inputData[i][0] == 'object') {
        const keys = Object.keys(inputData[i][0]);
        nodeWidth = Math.min(keys.length, 10) * STANDARD_COLUMN_WIDTH + 150;
        console.log('manually setting width of table');
      }
      const newTableNode = await PPGraph.currentGraph.addNewNode('Table2', {
        defaultArguments: { [tableDataInputName]: inputData[i] },
        nodePosX: mouseX,
        nodePosY: currY,
        nodeWidth,
      });
      const name = i > 1 ? `${fileName} ${i}` : fileName;
      newTableNode.setNodeName(name);
      currY = newTableNode.y + newTableNode.height + 50;
    }
  }
}
