import React, { useCallback, useState } from 'react';
import { TRgba } from '../../utils/color';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Button,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import prettyBytes from 'pretty-bytes';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import {
  DashboardIconProps,
  DashboardWidgetProps,
  Layoutable,
  WidgetContentProps,
  WidgetProps,
} from '../../utils/interfaces';
import { ArrayType } from '../datatypes/arrayType';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import {
  COLOR_WHITE,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
} from '../../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../../components/dashboard/dashboardIcons';
import {
  handleFileDrop,
  SUPPORTED_FILE_EXTENSIONS,
  FileInterpretation,
} from '../../dragAndDrop';
import { DynamicWidgetContainerNode } from '../layout/dynamicLayout';
import InterfaceController from '../../InterfaceController';
import { EnumType } from '../datatypes/enumType';

const backgroundColor = TRgba.fromString(COLOR_WHITE);

const defaultProps: WidgetProps = {
  background: backgroundColor.setAlpha(0),
  width: '100%',
  height: '240px',
  minWidth: '48px',
  minHeight: '48px',
};

// Socket names
const activeExtensionsName = 'Allowed file types';
const disabledName = 'Disabled';
const maxFilesName = 'MaxFiles';
const maxSizeName = 'MaxSize';
const persistName = 'Persist data';
const labelName = 'Label';
const dataName = 'Data';
const outputFilesData = 'Filedata';
const outputFileInfoName = 'FileInfo';
const showPasteFromClipboardName = 'Show paste from clipboard button';
const fileInterpretationModeName = 'File interpretation';

export class FileDropzone extends PPNode implements Layoutable {
  public getName(): string {
    return 'File upload (interface)';
  }

  public getDescription(): string {
    return 'A dropzone and file picker for the interface';
  }

  public getTags(): string[] {
    return ['Widget', 'Input', 'Files'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getRoundedCorners(): boolean {
    return false;
  }

  protected getDefaultIO(): PPSocket[] {
    // Create an array of all available file extension groups

    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        activeExtensionsName,
        new ArrayType(),
        Object.values(SUPPORTED_FILE_EXTENSIONS).flat(), // Default: all groups enabled
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        disabledName,
        new BooleanType(),
        false,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        maxFilesName,
        new NumberType(false, 0, 100),
        0, // 0 means no limit
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        maxSizeName,
        new NumberType(false, 0, 1000),
        0, // 0 means no limit (in MB)
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        persistName,
        new BooleanType(),
        false,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        'Drop files here or click to select',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        fileInterpretationModeName,
        new EnumType([
          {
            text: 'Auto',
            value: 'Auto',
          },
          {
            text: 'Text',
            value: 'Text',
          },
          {
            text: 'Binary',
            value: 'Binary',
          },
        ]),
        'Auto',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        showPasteFromClipboardName,
        new BooleanType(),
        true,
        true,
      ),
      new PPSocket(SOCKET_TYPE.IN, dataName, new ArrayType(), [], false),
      new PPSocket(SOCKET_TYPE.OUT, outputFilesData, new ArrayType(), [], true),
      new PPSocket(
        SOCKET_TYPE.OUT,
        outputFileInfoName,
        new ArrayType(),
        [],
        false,
      ),
    ];
  }

  public isLayoutable(): boolean {
    return true;
  }

  isContainer(): boolean {
    return false;
  }

  getWidgetProps(): WidgetProps {
    return { ...defaultProps };
  }

  getDashboardId(): string {
    return `NODE_${this.id}`;
  }

  getDashboardName(): string {
    return this.nodeName;
  }

  getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return DEFAULT_DASHBOARD_ICON;
  }

  getRelatedNode(): PPNode {
    return this;
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return <DynamicWidgetContainerNode property={this} {...props} />;
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <FileDropzoneComponent {...props} />;
  }

  protected onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    if (inputObject[persistName]) {
      outputObject[outputFilesData] = inputObject[dataName] || [];
    }
    return Promise.resolve();
  }

  public getVersion(): number {
    return 2;
  }

  public migrate(previousVersion: number): Promise<void> {
    if (previousVersion === 1) {
      // Migrate old terms "Images" and "Videos" to file extensions
      const currentValue = this.getInputData(activeExtensionsName);
      if (Array.isArray(currentValue)) {
        const migratedExtensions: string[] = [];

        for (const item of currentValue) {
          if (item === 'Images') {
            // Replace "Images" with image file extensions
            migratedExtensions.push('jpg', 'jpeg', 'png', 'gif', 'webp');
          } else if (item === 'Videos') {
            // Replace "Videos" with video file extensions
            migratedExtensions.push(
              'mp4',
              'webm',
              'ogg',
              'avi',
              'mov',
              'flv',
              'wmv',
              'mkv',
            );
          } else {
            // Keep other values as is (they might already be file extensions)
            migratedExtensions.push(item);
          }
        }

        // Remove duplicates and update the socket
        const uniqueExtensions = [...new Set(migratedExtensions)];
        this.setInputData(activeExtensionsName, uniqueExtensions);
      }
    }
    return Promise.resolve();
  }
}

const FileDropzoneComponent: React.FC<{
  node: PPNode;
  disabled?: boolean;
  [activeExtensionsName]?: string[];
  [disabledName]?: boolean;
  [maxFilesName]?: number;
  [maxSizeName]?: number;
  [labelName]?: string;
  [fileInterpretationModeName]?: string;
}> = (props) => {
  const {
    node,
    disabled: externalDisabled = false,
    [activeExtensionsName]: activeExtensions = [],
    [disabledName]: configDisabled = false,
    [maxFilesName]: maxFiles = 0,
    [maxSizeName]: maxSize = 0,
    [labelName]: label = 'Drop files here or click to select',
    [fileInterpretationModeName]: fileInterpretationMode = 'Auto',
  } = props;

  const [files, setFiles] = useState<File[]>([]);
  const [fileInfo, setFileInfo] = useState<any[]>([]);
  const [dataArray, setDataArray] = useState<any[]>([]);

  // Check if the drop is enabled
  const isDisabled = externalDisabled || configDisabled;

  const removeFile = useCallback(
    async (index: number) => {
      const newFiles = files.filter((_, i) => i !== index);
      const newFileInfo = fileInfo.filter((_, i) => i !== index);
      const newDataArray = dataArray.filter((_, i) => i !== index);

      setFiles(newFiles);
      setFileInfo(newFileInfo);
      setDataArray(newDataArray);

      // Update node data
      if (node.getInputData(persistName)) {
        node.setInputData(dataName, newDataArray);
      }

      // Update outputs
      node.setOutputData(outputFilesData, newDataArray);
      node.setOutputData(outputFileInfoName, newFileInfo);

      // Execute the node to update downstream nodes
      await node.executeOptimizedChain();
    },
    [files, fileInfo, dataArray, node],
  );

  const onDrop = async (acceptedFiles: File[]) => {
    if (isDisabled) return;

    // Filter by file size if maxSize is set (convert MB to bytes)
    const maxSizeBytes = maxSize > 0 ? maxSize * 1024 * 1024 : Infinity;
    const sizeFilteredFiles = acceptedFiles.filter(
      (file) => file.size <= maxSizeBytes,
    );

    // Check if we need to respect maxFiles limit
    let filesToAdd = sizeFilteredFiles;
    if (maxFiles > 0) {
      const remainingSlots = maxFiles - files.length;
      if (remainingSlots <= 0) {
        InterfaceController.showSnackBar(
          `Maximum number of files (${maxFiles}) already reached.`,
        );
        return;
      }
      filesToAdd = sizeFilteredFiles.slice(0, remainingSlots);
    }

    // Add files to existing ones instead of replacing
    const newFiles = [...files, ...filesToAdd];
    setFiles(newFiles);

    // Create file info objects for new files
    const newFileInfoItems = filesToAdd.map((file) => ({
      name: file.name,
      extension: file.name.split('.').pop(),
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    }));

    const updatedFileInfo = [...fileInfo, ...newFileInfoItems];
    setFileInfo(updatedFileInfo);

    // Process the new files and add their data to existing data
    const newDataItems: any[] = [];

    // Create a handler specific to this FileDropzone instance
    const fileHandler = (data: any) => {
      newDataItems.push(data);
    };

    // Convert UI value to FileInterpretation type
    const interpretation =
      fileInterpretationMode.toLowerCase() as FileInterpretation;

    await handleFileDrop(filesToAdd, {
      fileHandler,
      fileInterpretation: interpretation,
    });

    // Update data array with new items
    const updatedDataArray = [...dataArray, ...newDataItems];
    setDataArray(updatedDataArray);

    if (node.getInputData(persistName)) {
      // store on input side to persist data
      node.setInputData(dataName, updatedDataArray);
    }

    // Update outputs
    node.setOutputData(outputFilesData, updatedDataArray);
    node.setOutputData(outputFileInfoName, updatedFileInfo);

    // Execute the node to update downstream nodes
    await node.executeOptimizedChain();
  };

  const handlePasteFromClipboard = async () => {
    if (isDisabled) return;

    try {
      const clipboardItems = await navigator.clipboard.read();
      const pastedFiles: File[] = [];

      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            const extension = type.split('/')[1] || 'png';
            const fileName = `pasted-image-${Date.now()}.${extension}`;
            const file = new File([blob], fileName, { type });
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length === 0) {
        InterfaceController.showSnackBar('No images found in clipboard');
        return;
      }

      // Use the existing onDrop handler to process the pasted files
      await onDrop(pastedFiles);
    } catch (error) {
      console.error('Error reading clipboard:', error);
      InterfaceController.showSnackBar('Failed to read from clipboard');
    }
  };

  // Create accept object for useDropzone
  const getAcceptObject = () => {
    const extensions = activeExtensions;
    if (extensions.length === 0) return undefined;

    const accept: Record<string, string[]> = {};
    extensions.forEach((ext) => {
      const mimeCategory = getMimeTypeFromExtension(ext);
      if (!accept[mimeCategory]) {
        accept[mimeCategory] = [];
      }
      accept[mimeCategory].push(`.${ext}`);
    });
    return accept;
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: getAcceptObject(),
      onDropRejected: () => {
        InterfaceController.showSnackBar(`File type not accepted.`);
      },
      disabled: isDisabled,
      maxFiles: maxFiles > 0 ? maxFiles : undefined,
      multiple: maxFiles != 1,
      noDragEventsBubbling: true,
    });

  return (
    <Paper
      elevation={3}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {files.length > 0 && (
        <Box sx={{ maxHeight: '40%', overflow: 'auto', p: 1 }}>
          <List dense>
            {files.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="remove"
                    onClick={() => removeFile(index)}
                    size="small"
                    sx={{ ml: 1 }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
              >
                <Box
                  title={file.name}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minWidth: 0, // Important to allow text truncation to work properly
                    pr: 1, // Add padding to account for the remove button
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      flexGrow: 1,
                      minWidth: 0,
                      maxWidth: 'calc(100% - 110px)', // Account for size text and remove button
                    }}
                  >
                    {file.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      ml: 1,
                      flexShrink: 0,
                      minWidth: '60px',
                      textAlign: 'right',
                    }}
                  >
                    {prettyBytes(file.size)}
                  </Typography>
                </Box>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
      <Box
        {...getRootProps()}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          borderRadius: 1,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          bgcolor: isDragActive ? 'primary.main' : 'transparent',
          transition: 'background-color 0.2s, border-color 0.2s',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          '&:hover': {
            // action.hover is the palette's interaction layer, so it
            // follows light/dark instead of always darkening
            bgcolor: isDisabled ? 'transparent' : 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <Typography
          variant="body1"
          textAlign="center"
          color={isDisabled ? 'text.disabled' : 'text.primary'}
        >
          {isDragActive ? 'Drop files here...' : label}
        </Typography>
        <FileUploadIcon fontSize="large" sx={{ mt: 0.5 }} />
        {node.getInputData(showPasteFromClipboardName) && (
          <Button
            size="small"
            startIcon={<ContentPasteIcon />}
            onClick={(e) => {
              e.stopPropagation();
              void handlePasteFromClipboard();
            }}
            disabled={isDisabled}
            sx={{ mt: 2 }}
          >
            Paste from Clipboard
          </Button>
        )}
      </Box>
    </Paper>
  );
};

// Helper function to map file extensions to MIME types
function getMimeTypeFromExtension(ext: string): string {
  const mimeMap: Record<string, string> = {
    // Images
    jpg: 'image/*',
    jpeg: 'image/*',
    png: 'image/*',
    gif: 'image/*',
    webp: 'image/*',
    // Video
    mp4: 'video/*',
    webm: 'video/*',
    ogg: 'video/*',
    avi: 'video/*',
    mov: 'video/*',
    flv: 'video/*',
    wmv: 'video/*',
    mkv: 'video/*',
    // Documents
    pdf: 'application/pdf',
    // Spreadsheets and tabular data
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Code
    js: 'text/javascript',
    json: 'application/json',
    html: 'text/html',
    xml: 'application/xml',
    // Text
    txt: 'text/plain',
    // Archives
    zip: 'application/zip',
    // Databases and others
    db: 'application/octet-stream',
    sqlite: 'application/octet-stream',
  };

  return mimeMap[ext] || 'application/octet-stream';
}
