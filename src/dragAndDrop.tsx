import React, { useEffect, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { useDropzone } from 'react-dropzone';
import { Box, Typography } from '@mui/material';
import PPStorage from './PPStorage';
import PPGraph from './classes/GraphClass';
import PPNode from './classes/NodeClass';
import {
  COLOR_DARK,
  DATA_DASHBOARD_EDITABLE,
  DRAGANDDROP_GRID_MARGIN,
  MAIN_COLOR,
  PXSHOW_SQL_QUERY,
} from './utils/constants';
import {
  constructLocalResourceId,
  convertBlobToBase64,
  getFileExtension,
} from './utils/utils';
import { inputResourceIdSocketName } from './nodes/draw/video';
import { sqlQuerySocketName } from './nodes/utility/database';
import { Table2, tableDataInputName } from './nodes/table/table2';
import InterfaceController, { ListenEvent } from './InterfaceController';
import { readParquetFile } from './utils/parquet';
import {
  createMarkdownFromText,
  textEditorAutoHeightName,
  textEditorMarkdownName,
} from './nodes/textEditor/textEditor2';
import { editorInputSocketName } from './nodes/editor/abstractEditor';
import { TRgba } from './utils/color';
import { inputResourceIdSocketName as pdfInputResourceIdSocketName } from './nodes/pdf/PDF';
import { imageOutputName } from './nodes/image/image';

export const SUPPORTED_FILE_EXTENSIONS = {
  graph: ['tmapp', 'ppgraph'],
  spreadsheet: ['csv', 'ods', 'numbers', 'xls', 'xlsm', 'xlsb', 'xlsx'],
  parquet: ['parquet'],
  text: ['txt', 'md', 'markdown'],
  code: ['htm', 'html', 'json', 'js', 'jsx', 'ts', 'tsx', 'xml'],
  image: ['jpg', 'jpeg', 'png'],
  svg: ['svg'],
  video: [
    '3gp',
    'avi',
    'flv',
    'mov',
    'mkv',
    'm4v',
    'mp4',
    'ogg',
    'qt',
    'swf',
    'webm',
    'wmv',
  ],
  database: ['db', 'db3', 's3db', 'sl3', 'sqlite', 'sqlite3', 'pxshow'],
  pdf: ['pdf'],
};

const FILE_TYPE_GROUPS = {
  'Code files': ['code'],
  Databases: ['database'],
  Images: ['image'],
  SVG: ['svg'],
  Apps: ['graph'],
  Spreadsheets: ['spreadsheet', 'parquet'],
  'Text files': ['text'],
  Videos: ['video'],
  'PDF files': ['pdf'],
};

// TODO TURN ACTIONS HERE INTO PROPER ACTIONS

export type FileInterpretation =
  | 'auto'
  | 'graph'
  | 'spreadsheet'
  | 'parquet'
  | 'text'
  | 'code'
  | 'image'
  | 'svg'
  | 'video'
  | 'database'
  | 'pdf'
  | 'binary';

interface FileDropOptions {
  clientX?: number;
  clientY?: number;
  shiftKey?: boolean;
  fileHandler?: (data: any, file: File) => void;
  fileInterpretation?: FileInterpretation;
}

export const handleFileDrop = async (
  files: File[],
  options: FileDropOptions = {},
) => {
  const {
    clientX = 0,
    clientY = 0,
    fileHandler,
    fileInterpretation = 'auto',
  } = options;

  const dropPoint = PPGraph.currentGraph.viewport.toWorld(
    new PIXI.Point(clientX, clientY),
  );

  let nodePosX = dropPoint.x;
  const nodePosY = dropPoint.y;
  const newNodeSelection: PPNode[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const objectURL = URL.createObjectURL(file);

    const extension = getFileExtension(file.name);

    // Find which category this extension belongs to, or use override
    const detectedCategory = Object.entries(SUPPORTED_FILE_EXTENSIONS).find(
      ([_, extensions]) => extensions.includes(extension),
    )?.[0];
    const fileCategory =
      fileInterpretation === 'auto' ? detectedCategory : fileInterpretation;

    // Get the response
    const response = await fetch(objectURL);
    let data;
    let newNode;

    let encounteredUnexpectedFileFormat = false;

    const existingNode = PPGraph.currentGraph.selection.selectedNodes[
      index
    ] as any;

    // Process data based on file category
    try {
      switch (fileCategory) {
        case 'graph':
          data = PPStorage.getInstance().stringToStoredGraph(
            await response.text(),
          );
          break;

        case 'spreadsheet':
          // todo enable new method
          //if (extension === 'csv') {
          //  data = [Table2.convertCSVToJSONArray(await response.text())];
          //} else {
          data = await Table2.convertArrayBufferToTableInput(
            await response.arrayBuffer(),
          );
          //}
          break;

        case 'parquet':
          data = await readParquetFile(await response.arrayBuffer());
          break;

        case 'text':
          data = await createMarkdownFromText({
            plain: await response.text(),
          });
          break;

        case 'code':
          data = await response.text();
          break;

        case 'image':
          data = await convertBlobToBase64(await response.blob()).catch(
            (err) => {
              console.error(err);
            },
          );
          break;

        case 'svg':
          data = await response.text();
          break;

        case 'video':
        case 'database':
        case 'pdf':
          // NOTE, we pass the resourceId down to the node
          data = constructLocalResourceId(file.name, file.size);
          await PPStorage.getInstance().storeResource(
            data,
            file.size,
            await response.blob(),
            file.name,
          );
          break;

        case 'binary':
          data = await response.arrayBuffer();
          break;

        default:
          data = await response.arrayBuffer();
          encounteredUnexpectedFileFormat = true;
      }
    } catch (error) {
      console.error(`Error processing ${fileCategory} file:`, error);
      continue;
    }

    // Use the provided handler or fallback to InterfaceController's handler
    if (fileHandler) {
      fileHandler(data, file);
    } else {
      if (encounteredUnexpectedFileFormat) {
        InterfaceController.showSnackBar(
          `.${extension} files are not supported.`,
        );
        continue;
      } else {
        // Handle node creation based on file type
        switch (fileCategory) {
          case 'graph':
            await PPStorage.getInstance().loadGraphFromData(data);
            break;

          case 'spreadsheet':
            await Table2.dataToTableCreation(
              data,
              nodePosX,
              nodePosY,
              file.name.split('.')[0],
            );
            break;

          case 'parquet':
            await PPGraph.currentGraph.addNewNode('Table2', {
              defaultArguments: { [tableDataInputName]: data },
              nodePosX,
              nodePosY,
            });
            break;

          case 'text':
            newNode = await PPGraph.currentGraph.addNewNode('TextEditor2', {
              defaultArguments: {
                [textEditorMarkdownName]: data,
                [textEditorAutoHeightName]: false,
              },
              nodePosX,
              nodePosY,
            });
            break;

          case 'code':
            newNode = await PPGraph.currentGraph.addNewNode('CodeEditor', {
              nodePosX,
              nodePosY,
              defaultArguments: { [editorInputSocketName]: data },
            });
            break;

          case 'image':
            if (data) {
              if (existingNode?.type === 'Image' && options.shiftKey) {
                await existingNode.updateAndExecute(data as string);
              } else {
                newNode = await PPGraph.currentGraph.addNewNode('Image', {
                  nodePosX,
                  nodePosY,
                  defaultArguments: { Image: data },
                });
              }
            }
            break;
          case 'svg':
            newNode = await PPGraph.currentGraph.addNewNode('SvgImage', {
              nodePosX,
              nodePosY,
              defaultArguments: { 'Svg Image': data },
            });
            const newNode2 = await PPGraph.currentGraph.addNewNode('Image', {
              nodePosX: nodePosX + 200,
              nodePosY,
            });
            PPGraph.currentGraph.connect(
              newNode.getOutputSocketByName(imageOutputName),
              newNode2.getInputSocketByName('Image'),
              true,
            );
            break;

          case 'video':
            if (existingNode?.type === 'Video' && options.shiftKey) {
              existingNode.updateAndExecute(data);
            } else {
              newNode = await PPGraph.currentGraph.addNewNode('Video', {
                nodePosX,
                nodePosY,
                defaultArguments: {
                  [inputResourceIdSocketName]: data,
                },
              });
            }
            break;

          case 'database':
            if (existingNode?.type === 'SqliteReader' && options.shiftKey) {
              existingNode.updateAndExecute(data);
            } else {
              const sqlQuery =
                extension === 'pxshow' ? PXSHOW_SQL_QUERY : undefined;
              newNode = await PPGraph.currentGraph.addNewNode('SqliteReader', {
                nodePosX,
                nodePosY,
                defaultArguments: {
                  [inputResourceIdSocketName]: data,
                  [sqlQuerySocketName]: sqlQuery,
                },
              });
            }
            break;

          case 'pdf':
            if (existingNode?.type === 'PDFReader' && options.shiftKey) {
              existingNode.updateAndExecute(data);
            } else {
              newNode = await PPGraph.currentGraph.addNewNode('PDFReader', {
                nodePosX,
                nodePosY,
                defaultArguments: {
                  [pdfInputResourceIdSocketName]: data,
                },
              });
            }
            break;
        }
      }
    }

    // Update position if there are more than one
    if (newNode) {
      newNodeSelection.push(newNode);
      nodePosX = nodePosX + newNode.nodeWidth + DRAGANDDROP_GRID_MARGIN;
    }
  }

  // Select the newly added nodes
  if (newNodeSelection.length > 0) {
    PPGraph.currentGraph.selection.selectNodes(newNodeSelection, false);
  }

  return newNodeSelection;
};

export const onDrop = (
  acceptedFiles: File[],
  fileRejections: any,
  event: React.DragEvent<HTMLElement>,
) => {
  void handleFileDrop(acceptedFiles, {
    clientX: event?.clientX,
    clientY: event?.clientY,
    shiftKey: event?.shiftKey,
  });
};

export const onOpenFileBrowser = async (fileHandler?: (data: any) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute(DATA_DASHBOARD_EDITABLE, 'true');
  input.onchange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const files = Array.from(target.files) as File[];
      await handleFileDrop(files, {
        fileHandler,
      });
    }
  };
  input.click();
};

interface SelectedNodesInfoProps {
  isShiftPressed: boolean;
  selectedNodesCount: number;
}

const SelectedNodesInfo: React.FC<SelectedNodesInfoProps> = ({
  isShiftPressed,
  selectedNodesCount,
}) => (
  <Box sx={{ color: 'white', fontSize: 16 }}>
    <Typography variant="h6" component="div" sx={{ fontSize: 20 }}>
      {isShiftPressed ? (
        'Replace'
      ) : (
        <>
          Press <em>Shift</em> to replace
        </>
      )}{' '}
      the selected {selectedNodesCount > 1 ? 'nodes' : 'node'}
    </Typography>
    <Typography variant="body2" sx={{ fontSize: 14 }}>
      if it is of the same type
    </Typography>
  </Box>
);

const SupportedFileTypes: React.FC = () => (
  <Box sx={{ p: 2, color: 'white', maxWidth: 600, textAlign: 'left' }}>
    <Box sx={{ width: '100%' }}>
      <Typography variant="h6" component="div" sx={{ mb: 2 }}>
        Supported file types
      </Typography>
      {Object.entries(FILE_TYPE_GROUPS).map(
        ([groupName, categories], index) => (
          <Box
            key={groupName}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr',
              py: 0.25,
              borderBottom:
                index < Object.keys(FILE_TYPE_GROUPS).length - 1
                  ? '1px solid rgba(255,255,255,0.05)'
                  : 'none',
            }}
          >
            <Typography
              variant="body1"
              sx={{ fontWeight: 'medium', textAlign: 'left' }}
            >
              {groupName}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: '#cccccc', textAlign: 'left' }}
            >
              {categories
                .flatMap((category) =>
                  SUPPORTED_FILE_EXTENSIONS[category].map((ext) => `.${ext}`),
                )
                .sort((a, b) => a.localeCompare(b))
                .join(', ')}
            </Typography>
          </Box>
        ),
      )}
    </Box>
  </Box>
);

interface DragOverlayProps {
  isShiftPressed: boolean;
  selectedNodesCount: number;
}

const DragOverlay: React.FC<DragOverlayProps> = ({
  isShiftPressed,
  selectedNodesCount,
}) => (
  <Box
    sx={{
      position: 'relative',
      width: '100%',
      height: '100dvh',
      bgcolor: TRgba.fromString(COLOR_DARK).setAlpha(0.6).toString(),
      border: `8px solid ${MAIN_COLOR}`,
      zIndex: 9999,
      textAlign: 'center',
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        zIndex: 9999,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        p: 2,
        bgcolor: TRgba.fromString(COLOR_DARK).setAlpha(0.6).toString(),
        borderRadius: 1,
      }}
    >
      {selectedNodesCount > 0 ? (
        <SelectedNodesInfo
          isShiftPressed={isShiftPressed}
          selectedNodesCount={selectedNodesCount}
        />
      ) : (
        <SupportedFileTypes />
      )}
    </Box>
  </Box>
);

interface StyledDropzoneProps {
  children: React.ReactNode;
}

export const StyledDropzone: React.FC<StyledDropzoneProps> = ({ children }) => {
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [dashboardFullscreen, setDashboardFullscreen] = useState(false);
  const [isDraggingOverOverlay, setIsDraggingOverOverlay] = useState(false);
  const selectedNodesCount =
    PPGraph.currentGraph?.selection?.selectedNodes.length || 0;

  // Function to check if event is over any overlay panel
  const isEventOverOverlay = (clientX: number, clientY: number): boolean => {
    const overlayState = InterfaceController.getOverlayState();

    // Calculate combined width of left-side overlays
    const leftDrawerWidth = overlayState.leftSide.visible
      ? overlayState.leftSide.width
      : 0;
    const dashboardWidth = overlayState.dashboard.visible
      ? window.innerWidth * (overlayState.dashboard.widthPercentage / 100)
      : 0;

    const overlayExtensionLeft = leftDrawerWidth + dashboardWidth;

    // Check if over any left-side overlay
    if (clientX < overlayExtensionLeft) {
      return true;
    }

    // Check if over right drawer
    if (
      overlayState.rightSide.visible &&
      clientX >= window.innerWidth - overlayState.rightSide.width
    ) {
      return true;
    }

    return false;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (
      acceptedFiles,
      fileRejections,
      event: React.DragEvent<HTMLElement>,
    ) => {
      if (!isDraggingOverOverlay) {
        void handleFileDrop(acceptedFiles, {
          clientX: event?.clientX,
          clientY: event?.clientY,
          shiftKey: event?.shiftKey,
        });
      }
    },
    onDragOver: (event) => {
      const isOverOverlay = isEventOverOverlay(event.clientX, event.clientY);
      setIsDraggingOverOverlay(isOverOverlay);

      // If over overlay, prevent drop behavior
      if (isOverOverlay) {
        event.stopPropagation();
      }
    },
    disabled: dashboardFullscreen,
  });

  const isDashboardFullscreenAndVisible = (state: any) => {
    return (
      (!!state.dashboard?.fullscreen || !!state.dashboard?.maximized) &&
      !!state.dashboard?.visible
    );
  };

  useEffect(() => {
    // initial check
    const overlayState = InterfaceController.getOverlayState();
    setDashboardFullscreen(isDashboardFullscreenAndVisible(overlayState));

    const listenerId = InterfaceController.addListener(
      ListenEvent.OverlayStateChanged,
      (newState) => {
        setDashboardFullscreen(isDashboardFullscreenAndVisible(newState));
      },
    );

    return () => {
      InterfaceController.removeListener(listenerId);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive && !dashboardFullscreen && !isDraggingOverOverlay && (
        <DragOverlay
          isShiftPressed={isShiftPressed}
          selectedNodesCount={selectedNodesCount}
        />
      )}
      {children}
    </div>
  );
};
