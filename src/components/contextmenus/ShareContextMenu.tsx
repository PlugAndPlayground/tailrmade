import React from 'react';
import {
  Paper,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import LinkIcon from '@mui/icons-material/Link';
import PPStorage from '../../PPStorage';
import {
  controlOrMetaKey,
  writeTextToClipboard,
  getLoadCloudGraphURL,
} from '../../utils/utils';
import PPGraph from '../../classes/GraphClass';
import InterfaceController from '../../InterfaceController';

export function shareOptions(): any {
  const currentGraph = PPGraph.currentGraph;
  const isRemote = currentGraph.isRemote;
  const url = isRemote
    ? getLoadCloudGraphURL({
        id: currentGraph.id,
        name: currentGraph.name,
        isRemote: true,
        location: currentGraph.location,
        date: new Date(),
      })
    : null;

  const handleCopyUrl = (event: React.MouseEvent) => {
    event.stopPropagation();
    InterfaceController.setIsGraphSearchOpen(false);
    if (url) writeTextToClipboard(url);
  };

  return [
    <Tooltip
      title={
        !isRemote || currentGraph.access === 'private'
          ? 'App is local/private. To share URL, please log in and make it public'
          : ''
      }
      placement="top"
    >
      <span>
        <MenuItem
          data-cy="copy-url"
          onClick={handleCopyUrl}
          disabled={!isRemote || currentGraph.access === 'private'}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy URL</ListItemText>
        </MenuItem>
      </span>
    </Tooltip>,
    <MenuItem
      data-cy="download-plain-text"
      onClick={() => PPStorage.getInstance().downloadCurrentGraph(false)}
    >
      <ListItemIcon>
        <DownloadIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Download (Plain Text)</ListItemText>
    </MenuItem>,
    <MenuItem
      data-cy="download-compressed"
      onClick={() => PPStorage.getInstance().downloadCurrentGraph(true)}
    >
      <ListItemIcon>
        <DownloadIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Download (Compressed)</ListItemText>
    </MenuItem>,
    <MenuItem
      data-cy="share-tailrmade-link"
      onClick={PPStorage.getInstance().copyCurrentGraphURLToClipboard}
    >
      <ListItemIcon>
        <ShareIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Share app embedded in link</ListItemText>
      <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
        {`${controlOrMetaKey()}+K`}
      </Typography>
    </MenuItem>,
  ];
}

interface ShareContextMenuProps {
  anchorPosition: { top: number; left: number };
  // Which corner of the menu the anchor point is. The rail opens it downwards
  // from a button on the left edge; the bottom bar has to open it upwards, or
  // the menu would be drawn off the bottom of the screen.
  anchorCorner?: 'top-left' | 'bottom-left';
  onClose: () => void;
}

const ShareContextMenu: React.FC<ShareContextMenuProps> = (props) => {
  const opensUpwards = props.anchorCorner === 'bottom-left';
  return (
    <Paper
      sx={{
        position: 'fixed',
        top: props.anchorPosition.top,
        left: props.anchorPosition.left,
        // measured from its own height rather than a guess at the menu's
        // length, which changes with whether the app is saved to the cloud
        transform: opensUpwards ? 'translateY(-100%)' : undefined,
        zIndex: 1400,
      }}
    >
      <MenuList dense>{shareOptions()}</MenuList>
    </Paper>
  );
};

export default ShareContextMenu;
