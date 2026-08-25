import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import useInterval from 'use-interval';
import { Box, IconButton, Menu, MenuItem, ToggleButton } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WarningIcon from '@mui/icons-material/Warning';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import InterfaceController, { ListenEvent } from './../InterfaceController';
import {
  COLOR_WARNING,
  DISABLED_OPACITY,
  STATUS_SEVERITY,
} from './../utils/constants';
import { writeDataToClipboard } from './../utils/utils';
import { TRgba } from './../utils/color';
import * as styles from './../utils/style.module.css';
import PPNode from './../classes/NodeClass';
import Socket from './../classes/SocketClass';
import { AbstractType, DataTypeProps } from './../nodes/datatypes/abstractType';
import {
  allDataTypes,
  dropDownSelectableTypes,
} from './../nodes/datatypes/dataTypesMap';

type SocketContainerProps = {
  index: number;
  dataType: AbstractType;
  data: any;
  selectedNode: PPNode;
  // All sockets to update when editing. socketsToUpdate[0] is the reference socket.
  socketsToUpdate: Socket[];
};

const onChangeDropdown = (
  event,
  props: SocketContainerProps,
  setDataTypeValue,
  setHasError,
) => {
  const { myValue } = event.currentTarget.dataset;
  // Change type on all sockets
  for (const socket of props.socketsToUpdate) {
    const socketEntry = new allDataTypes[myValue]();
    socket.changeSocketDataType(socketEntry);
    socket.getNode().metaInfoChanged();
  }
  // Update local state using reference socket
  const referenceSocket = props.socketsToUpdate[0];
  setDataTypeValue(referenceSocket.dataType);
  setHasError(referenceSocket.status.getSeverity() >= STATUS_SEVERITY.WARNING);
};
export const SocketContainer = memo(
  (props: SocketContainerProps) => {
    // Reference socket for reading state (first socket in the array)
    const referenceSocket = props.socketsToUpdate[0];

    const [hasError, setHasError] = useState(
      referenceSocket.status.getSeverity() >= STATUS_SEVERITY.WARNING,
    );

    useEffect(() => {
      setDataTypeValue(props.dataType);
    }, [props.dataType]);

    const [dataTypeValue, setDataTypeValue] = useState(props.dataType);

    const isCollapsible = dataTypeValue.isInspectorCollapsible();
    // persist the collapsed state on the socket so it survives remounts of
    // this container (the inspector re-renders frequently)
    const [collapsed, setCollapsed] = useState(() =>
      referenceSocket.getInspectorCollapsed(),
    );
    const toggleCollapsed = useCallback(() => {
      const next = !referenceSocket.getInspectorCollapsed();
      referenceSocket.setInspectorCollapsed(next);
      setCollapsed(next);
    }, [referenceSocket]);

    const baseProps: DataTypeProps = {
      index: props.index,
      dataType: referenceSocket.dataType,
      socketsToUpdate: props.socketsToUpdate,
    };

    const widget = referenceSocket.isInput()
      ? dataTypeValue.getInputWidget(baseProps)
      : dataTypeValue.getOutputWidget(baseProps);

    useInterval(() => {
      const newHasError =
        referenceSocket.status.getSeverity() >= STATUS_SEVERITY.WARNING;
      if (hasError !== newHasError) {
        setHasError(
          referenceSocket.status.getSeverity() >= STATUS_SEVERITY.WARNING,
        );
      }
    }, 100);

    const disabled = !referenceSocket.isInput() || referenceSocket.hasLink();

    return (
      <Box
        id={`inspector-socket-${props.dataType.getName()}`} // TODO: should be socket id instead of data type name as that is not unique
        sx={{
          bgcolor: hasError ? COLOR_WARNING : 'background.default',
          opacity: disabled && !hasError ? DISABLED_OPACITY : 1,
        }}
      >
        <SocketHeader
          key={`SocketHeader-${props.dataType.getName()}`}
          hasError={hasError}
          index={props.index}
          onChangeDropdown={(event) =>
            onChangeDropdown(event, props, setDataTypeValue, setHasError)
          }
          socketsToUpdate={props.socketsToUpdate}
          collapsible={isCollapsible}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        {!(isCollapsible && collapsed) && (
          <Box
            sx={{
              px: 1,
              pb: 1,
            }}
            className={styles.propertyContainerContent}
          >
            <SocketBody
              referenceSocket={referenceSocket}
              selectedNode={props.selectedNode}
              widget={widget}
            />
          </Box>
        )}
      </Box>
    );
  },
  (prevProps, nextProps) => {
    const prevRef = prevProps.socketsToUpdate[0];
    const nextRef = nextProps.socketsToUpdate[0];
    return (
      prevRef.name === nextRef.name &&
      prevProps.index === nextProps.index &&
      prevProps.dataType.getName() === nextProps.dataType.getName() &&
      prevProps.selectedNode.id === nextProps.selectedNode.id &&
      prevProps.socketsToUpdate.length === nextProps.socketsToUpdate.length
    );
  },
);

// CommonSocket interface for multi-node editing
import { TSocketType } from './../utils/interfaces';
import { MAIN_COLOR } from '../utils/constants';

export interface CommonSocket {
  name: string;
  socketType: TSocketType;
  dataTypeSignature: string;
  sockets: Socket[];
  referenceSocket: Socket;
}

interface MenuItemsProps {
  dropDownSelectableTypes: any;
  allDataTypes: any;
  isInput: boolean;
  currentTypeName: string;
  onSelect: (event: React.MouseEvent<HTMLLIElement>) => void;
  handleClose: () => void;
}

const MenuItems = React.memo(
  ({
    dropDownSelectableTypes,
    allDataTypes,
    isInput,
    currentTypeName,
    onSelect,
    handleClose,
  }: MenuItemsProps) => {
    return Object.keys(dropDownSelectableTypes)
      .filter((name) => {
        const dataTypeItem = new dropDownSelectableTypes[name]();
        if (isInput) {
          return dataTypeItem.allowedAsInput();
        } else {
          return dataTypeItem.allowedAsOutput();
        }
      })
      .sort()
      .map((name) => {
        const entry = new allDataTypes[name]().getName();
        return (
          <MenuItem
            key={name}
            value={name}
            data-my-value={name}
            selected={currentTypeName === name}
            onClick={(event) => {
              onSelect(event);
              handleClose();
            }}
            sx={{
              '&.Mui-selected': {
                backgroundColor: `${TRgba.fromString(MAIN_COLOR).negate()}`,
              },
            }}
          >
            {entry}
          </MenuItem>
        );
      });
  },
);

MenuItems.displayName = 'MenuItems';

type SocketHeaderProps = {
  index: number;
  hasError: boolean;
  onChangeDropdown: (event) => void;
  // All sockets to update - socketsToUpdate[0] is the reference socket
  socketsToUpdate: Socket[];
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

const handleCopyToClipboard = (referenceSocket: Socket) => {
  InterfaceController.showSnackBar('Data copied to clipboard');
  const shouldStringify =
    referenceSocket?.dataType.shouldStringifyForClipboard();
  writeDataToClipboard(referenceSocket?.data, shouldStringify);
};

const SocketHeader = React.memo(
  (props: SocketHeaderProps) => {
    // Reference socket for reading state
    const referenceSocket = props.socketsToUpdate[0];

    const [visible, setVisible] = useState(referenceSocket.visible);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
    }, []);

    const handleClose = useCallback(() => {
      setAnchorEl(null);
    }, []);

    const handleVisibilityToggle = useCallback(() => {
      const newVisibility = !visible;
      // Apply to all sockets
      for (const socket of props.socketsToUpdate) {
        socket.setVisible(newVisibility);
      }
      setVisible(newVisibility);
    }, [props.socketsToUpdate, visible]);

    const handleAddToDashboard = useCallback(() => {
      // Add all sockets to dashboard
      for (const socket of props.socketsToUpdate) {
        InterfaceController.notifyListeners(ListenEvent.AddToDashboard, socket);
      }
    }, [props.socketsToUpdate]);

    const typeAvailableInDropdown = useMemo(
      () =>
        dropDownSelectableTypes[referenceSocket.dataType.constructor.name] !==
        undefined,
      [referenceSocket.dataType.constructor.name],
    );

    return (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          width: '100%',
        }}
        title={`${props.hasError ? referenceSocket.status.message : ''}`}
      >
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            opacity: visible ? 1 : 0.5,
          }}
        >
          <Box
            sx={{ flexGrow: 1, display: 'inline-flex', alignItems: 'center' }}
          >
            {props.collapsible && (
              <IconButton
                data-cy="socket-collapse-button"
                size="small"
                title={props.collapsed ? 'Expand' : 'Collapse'}
                onClick={props.onToggleCollapsed}
                sx={{ borderRadius: 0, p: 0.25 }}
              >
                {props.collapsed ? (
                  <ChevronRightIcon sx={{ fontSize: '16px' }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: '16px' }} />
                )}
              </IconButton>
            )}
            {referenceSocket.hasLink() ? (
              <Box
                sx={{ px: 1, opacity: DISABLED_OPACITY, textAlign: 'center' }}
              >
                <LockIcon sx={{ fontSize: '12px' }} />
              </Box>
            ) : (
              <ToggleButton
                data-cy="socket-visible-button"
                value="check"
                size="small"
                selected={!visible}
                onChange={handleVisibilityToggle}
                sx={{
                  fontSize: '12px',
                  border: 0,
                }}
              >
                {visible ? (
                  <VisibilityIcon fontSize="inherit" />
                ) : (
                  <VisibilityOffIcon fontSize="inherit" />
                )}
              </ToggleButton>
            )}
            <IconButton
              title="Add to user interface"
              size="small"
              onClick={handleAddToDashboard}
              sx={{
                borderRadius: 0,
              }}
            >
              <DashboardCustomizeIcon sx={{ fontSize: '16px' }} />
            </IconButton>
            <IconButton
              size="small"
              title="Copy to clipboard"
              onClick={() => handleCopyToClipboard(referenceSocket)}
              sx={{
                pl: 0.5,
                borderRadius: 0,
              }}
            >
              <ContentCopyIcon sx={{ fontSize: '12px' }} />
            </IconButton>
            <Box sx={{ p: 0.5, color: 'text.primary', fontSize: '14px' }}>
              {referenceSocket.name}
            </Box>
            {props.hasError && (
              <WarningIcon
                sx={{
                  fontSize: '16px',
                  pl: 0.5,
                }}
              />
            )}
          </Box>
          <IconButton
            data-cy={referenceSocket.name + '-type-selector-button'}
            title={referenceSocket.dataType.constructor.name}
            aria-label="more"
            id="select-type"
            aria-controls="long-menu"
            aria-expanded={open ? 'true' : undefined}
            aria-haspopup="true"
            onClick={handleClick}
            sx={{
              borderRadius: 0,
              pr: 1.5,
            }}
          >
            <Box
              sx={{
                color: 'text.secondary',
                fontSize: '10px',
              }}
            >
              {referenceSocket.dataType.getName()}
            </Box>
            {typeAvailableInDropdown && (
              <MoreVertIcon sx={{ fontSize: '12px' }} />
            )}
          </IconButton>
          {typeAvailableInDropdown && (
            <Menu
              sx={{
                fontSize: '12px',
                zIndex: 1500,
              }}
              MenuListProps={{
                'aria-labelledby': 'long-button',
              }}
              anchorEl={anchorEl}
              open={open}
              onClose={handleClose}
            >
              <MenuItems
                dropDownSelectableTypes={dropDownSelectableTypes}
                allDataTypes={allDataTypes}
                isInput={referenceSocket.isInput()}
                currentTypeName={referenceSocket.dataType.constructor.name}
                onSelect={props.onChangeDropdown}
                handleClose={handleClose}
              />
            </Menu>
          )}
        </Box>
      </Box>
    );
  },
  (prevProps, newProps) => {
    const prevRef = prevProps.socketsToUpdate[0];
    const newRef = newProps.socketsToUpdate[0];
    return (
      prevRef.visible === newRef.visible &&
      prevRef.hasLink() === newRef.hasLink() &&
      prevRef.name === newRef.name &&
      prevProps.hasError === newProps.hasError &&
      prevProps.collapsed === newProps.collapsed &&
      prevProps.socketsToUpdate.length === newProps.socketsToUpdate.length
    );
  },
);

type SocketBodyProps = {
  referenceSocket: Socket;
  selectedNode: PPNode;
  widget: React.ReactNode;
};

export const SocketBody: React.FunctionComponent<SocketBodyProps> = (props) => {
  return props.widget;
};
