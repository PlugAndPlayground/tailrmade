import React from 'react';
import {
  Box,
  Paper,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import ComputerIcon from '@mui/icons-material/Computer';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import IosShareIcon from '@mui/icons-material/IosShare';
import LinkIcon from '@mui/icons-material/Link';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import ShareIcon from '@mui/icons-material/Share';
import PPStorage from '../../PPStorage';
import { controlOrMetaKey } from '../../utils/utils';
import { getLoadCloudGraphURL } from '../../utils/cloudGraphURL';
import { canWebShare, copyText, shareContent } from '../../utils/share';
import PPGraph from '../../classes/GraphClass';
import { ActionHandler } from '../../classes/Action';
import {
  collectAppRisks,
  highestRiskLevel,
  requiresAppRiskReview,
} from '../../classes/NodeRisk';
import { BackendGateway } from '../../services/BackendGateway';
import InterfaceController from '../../InterfaceController';
import { AccessLevel, showCurrentAppRisks } from '../AppRiskDialog';

function AppStatus({
  icon,
  title,
  detail,
}: {
  icon: React.ReactElement;
  title: string;
  detail: string;
}): React.ReactElement {
  return (
    <Box
      data-cy="share-app-status"
      role="presentation"
      sx={{ display: 'flex', gap: 1.5, px: 2, py: 1, maxWidth: 320 }}
    >
      <Box sx={{ color: 'text.secondary', display: 'flex', pt: 0.25 }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="body2">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      </Box>
    </Box>
  );
}

const secondaryWraps = { secondary: { sx: { whiteSpace: 'normal' } } };

// onClose runs before an action so a fallback copy dialog is not hidden
// behind the menu. Closing keeps the click's user activation.
export function shareOptions(onClose: () => void): React.ReactElement[] {
  const graph = PPGraph.currentGraph;
  const isOwner =
    !graph.isRemote ||
    graph.owner === BackendGateway.getInstance().getCurrentUserId();
  const hasLink = graph.isRemote && graph.access !== 'private';
  const url = hasLink ? getLoadCloudGraphURL(graph) : '';
  const unsaved = isOwner && ActionHandler.existsUnsavedChanges();
  const risks = collectAppRisks(Object.values(graph.nodes));

  const status = !graph.isRemote ? (
    <AppStatus
      key="status"
      icon={<ComputerIcon fontSize="small" />}
      title="Saved in this browser only"
      detail="Save it to your account as public to share a link, or put the whole app in a link."
    />
  ) : graph.access === 'public' ? (
    <AppStatus
      key="status"
      icon={<PublicIcon fontSize="small" />}
      title="Public"
      detail={
        unsaved
          ? 'Anyone with the link can open it. Save first: the link opens the last saved version.'
          : 'Anyone with the link can open it.'
      }
    />
  ) : graph.access === 'organization' ? (
    <AppStatus
      key="status"
      icon={<BusinessIcon fontSize="small" />}
      title="Organization"
      detail="People in your organization can open the link."
    />
  ) : (
    <AppStatus
      key="status"
      icon={<LockIcon fontSize="small" />}
      title="Private"
      detail="Only you can open it. Make it public to share a link."
    />
  );

  const shareLink = async () => {
    onClose();
    const result = await shareContent({ title: graph.name, url });
    if (result === 'copied') InterfaceController.showSnackBar('Link copied');
  };

  const copyLink = async () => {
    onClose();
    const result = await copyText(url, 'Copy link');
    if (result === 'copied') InterfaceController.showSnackBar('Link copied');
  };

  const options: React.ReactElement[] = [status];

  if (canWebShare()) {
    options.push(
      <MenuItem
        key="share-url"
        data-cy="share-url"
        onClick={() => void shareLink()}
        disabled={!hasLink}
      >
        <ListItemIcon>
          <IosShareIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Share link…</ListItemText>
      </MenuItem>,
    );
  }

  options.push(
    <MenuItem
      key="copy-url"
      data-cy="copy-url"
      onClick={() => void copyLink()}
      disabled={!hasLink}
    >
      <ListItemIcon>
        <LinkIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Copy link</ListItemText>
    </MenuItem>,
  );

  if (graph.isRemote && graph.access === 'private' && isOwner) {
    options.push(
      <MenuItem
        key="change-access"
        data-cy="share-change-access"
        onClick={() => {
          onClose();
          InterfaceController.toggleShowEdit(true);
        }}
      >
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Change access…</ListItemText>
      </MenuItem>,
    );
  }

  options.push(
    <MenuItem
      key="share-tailrmade-link"
      data-cy="share-tailrmade-link"
      onClick={() => {
        onClose();
        void PPStorage.getInstance().copyCurrentGraphURLToClipboard();
      }}
    >
      <ListItemIcon>
        <ShareIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        secondary="A snapshot that works without publishing. Includes everything typed into the app."
        slotProps={secondaryWraps}
      >
        Copy app in a link
      </ListItemText>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ ml: 1, alignSelf: 'flex-start' }}
      >
        {`${controlOrMetaKey()}+K`}
      </Typography>
    </MenuItem>,
    <MenuItem
      key="download-plain-text"
      data-cy="download-plain-text"
      onClick={() => PPStorage.getInstance().downloadCurrentGraph(false)}
    >
      <ListItemIcon>
        <DownloadIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Download (Plain Text)</ListItemText>
    </MenuItem>,
    <MenuItem
      key="download-compressed"
      data-cy="download-compressed"
      onClick={() => PPStorage.getInstance().downloadCurrentGraph(true)}
    >
      <ListItemIcon>
        <DownloadIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Download (Compressed)</ListItemText>
    </MenuItem>,
  );

  if (requiresAppRiskReview(risks)) {
    options.push(
      <MenuItem
        key="share-risks"
        data-cy="share-risks"
        onClick={() => {
          onClose();
          showCurrentAppRisks();
        }}
      >
        <ListItemIcon>
          <FactCheckOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          secondary={
            <AccessLevel
              level={highestRiskLevel(risks.map(({ risk }) => risk))}
            />
          }
        >
          Others review its access first
        </ListItemText>
      </MenuItem>,
    );
  }

  return options;
}

interface ShareContextMenuProps {
  anchorPosition: { top: number; left: number };
  onClose: () => void;
}

const ShareContextMenu: React.FC<ShareContextMenuProps> = (props) => {
  return (
    <Paper
      sx={{
        position: 'fixed',
        top: props.anchorPosition.top,
        left: props.anchorPosition.left,
        zIndex: 1400,
      }}
    >
      <MenuList dense>{shareOptions(props.onClose)}</MenuList>
    </Paper>
  );
};

export default ShareContextMenu;
