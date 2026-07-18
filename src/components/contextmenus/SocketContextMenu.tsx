import {
  Paper,
  MenuList,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
} from '@mui/material';
import React, { useEffect } from 'react';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import Socket from '../../classes/SocketClass';
import { getAllNodeTypes } from '../../nodes/allNodes';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import DeleteIcon from '@mui/icons-material/Delete';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import { SOCKET_TYPE } from '../../utils/constants';
import { writeTextToClipboard } from '../../utils/utils';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { URLSetSocketData } from '../../nodes/state/storage';

function constructRecommendedNodeOptions(selectedSocket: Socket): any {
  const preferredNodes = selectedSocket.getPreferredNodes();
  const allNodeTypes = getAllNodeTypes();
  return preferredNodes
    .filter((preferredNodesType) => {
      if (allNodeTypes[preferredNodesType] == null) {
        console.error(
          `Recommended node type "${preferredNodesType}" not found in registry`,
        );
        return false;
      }
      return true;
    })
    .map((preferredNodesType) => {
      return (
        <MenuItem
          key={preferredNodesType}
          onClick={() => {
            void PPGraph.currentGraph.perform_action_addConnectedNode(
              selectedSocket,
              preferredNodesType,
            );
          }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            <Box
              component="span"
              sx={{
                display: 'inline',
                color: 'text.secondary',
                typography: 'body2',
              }}
            >
              Connect{' '}
            </Box>
            {allNodeTypes[preferredNodesType].name}
          </ListItemText>
        </MenuItem>
      );
    });
}

export const SocketContextMenu = (props) => {
  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  function handleContextMenu(e: Event) {
    e.preventDefault();
  }

  const selectedSocket: Socket = props.selectedSocket;
  const node: PPNode = selectedSocket.getNode();
  const isDeletable = node.socketCanBeRemoved(selectedSocket);

  return (
    <Paper
      id="socket-contextmenu"
      sx={{
        minWidth: 240,
        maxWidth: '100%',
        position: 'absolute',
        zIndex: 1230,
        left: props.contextMenuPosition[0],
        top: props.contextMenuPosition[1],
      }}
    >
      <MenuList dense>
        <MenuItem
          onClick={() => {
            InterfaceController.notifyListeners(
              ListenEvent.AddToDashboard,
              selectedSocket,
            );
          }}
        >
          <ListItemIcon>
            <DashboardCustomizeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add to user interface</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            PPGraph.currentGraph.selection.selectNodes(
              [selectedSocket.getNode()],
              false,
            );
            InterfaceController.toggleRightSideDrawer(VISIBILITY_ACTION.OPEN);
          }}
        >
          <ListItemIcon>
            <TuneIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Show node inspector</ListItemText>
        </MenuItem>
        <Divider />
        {selectedSocket.hasLink() && (
          <MenuItem
            onClick={async () => {
              for (let i = 0; i < selectedSocket.links.length; i++) {
                const link = selectedSocket.links[i];
                await PPGraph.currentGraph.perform_action_Disconnect(link);
              }
            }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove connection</ListItemText>
          </MenuItem>
        )}
        {selectedSocket.hasLink() &&
          selectedSocket.socketType == SOCKET_TYPE.IN && (
            <MenuItem
              onClick={async () => {
                const link = selectedSocket.links[0];
                const sourceSocket = link.getSource();
                await PPGraph.currentGraph.perform_action_Disconnect(link);
                selectedSocket.data = structuredClone(sourceSocket.data);
                await selectedSocket.getNode().executeOptimizedChain();
              }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                Remove connection but copy data to socket
              </ListItemText>
            </MenuItem>
          )}
        {selectedSocket.hasLink() && <Divider />}
        {constructRecommendedNodeOptions(selectedSocket)}
        {isDeletable && <Divider />}
        {isDeletable && (
          <MenuItem
            onClick={() => {
              node.removeSocket(selectedSocket);
            }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete Socket</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            const node = selectedSocket.getNode();
            const reference = {
              node: node.id,
              socket: selectedSocket.name,
              data: '',
            } as URLSetSocketData;
            writeTextToClipboard(JSON.stringify(reference));
          }}
        >
          <Divider />
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy Socket Reference</ListItemText>
        </MenuItem>
      </MenuList>
    </Paper>
  );
};

export default SocketContextMenu;
