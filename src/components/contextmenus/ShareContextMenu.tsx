import React from 'react';
import {
  Box,
  Paper,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  MenuItem,
  MenuList,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InventoryIcon from '@mui/icons-material/Inventory2Outlined';
import IosShareIcon from '@mui/icons-material/IosShare';
import LinkIcon from '@mui/icons-material/Link';
import LoginIcon from '@mui/icons-material/Login';
import SaveIcon from '@mui/icons-material/Save';
import PPStorage from '../../PPStorage';
import { controlOrMetaKey } from '../../utils/utils';
import { getLoadCloudGraphURL } from '../../utils/cloudGraphURL';
import {
  canWebShare,
  contentLinkWarning,
  copyText,
  shareContent,
} from '../../utils/share';
import PPGraph from '../../classes/GraphClass';
import { ActionHandler } from '../../classes/Action';
import {
  collectAppRisks,
  highestRiskLevel,
  requiresAppRiskReview,
} from '../../classes/NodeRisk';
import { BackendGateway } from '../../services/BackendGateway';
import { CLOUD_MODE } from '../../services/shared-types';
import InterfaceController from '../../InterfaceController';
import { AccessLevel, showCurrentAppRisks } from '../AppRiskDialog';
import { openAuthDialog } from '../AuthDialog';

function Section({ title }: { title: string }): React.ReactElement {
  return (
    <ListSubheader
      disableSticky
      sx={{
        lineHeight: 'normal',
        pt: 1.5,
        pb: 0.5,
        background: 'transparent',
        fontSize: '0.7rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}
    >
      {title}
    </ListSubheader>
  );
}

// The app's link state in one line: what it is, then what it means.
function LinkStatus({
  title,
  detail,
}: {
  title: string;
  detail: string;
}): React.ReactElement {
  return (
    <Typography
      data-cy="share-app-status"
      variant="caption"
      color="text.secondary"
      component="p"
      sx={{ px: 2, pb: 0.5, maxWidth: 380, lineHeight: 1.4 }}
    >
      <Box component="strong" sx={{ color: 'text.primary' }}>
        {title}:
      </Box>{' '}
      {detail}
    </Typography>
  );
}

const wrapSecondary = {
  secondary: { sx: { whiteSpace: 'normal', lineHeight: 1.4 } },
};

// onClose runs before an action so a fallback copy dialog is not hidden
// behind the menu. Closing keeps the click's user activation.
export function shareOptions(onClose: () => void): React.ReactElement[] {
  const graph = PPGraph.currentGraph;
  const isOwner =
    !graph.isRemote ||
    graph.owner === BackendGateway.getInstance().getCurrentUserId();
  // A private app's link opens it for its owner only, after signing in.
  const hasLink = graph.isRemote && (graph.access !== 'private' || isOwner);
  const url = hasLink ? getLoadCloudGraphURL(graph) : '';
  const unsaved = isOwner && ActionHandler.existsUnsavedChanges();
  const risks = collectAppRisks(Object.values(graph.nodes));
  const contentLinkLength =
    PPStorage.getInstance().getCurrentGraphContentLink().length;
  const sizeWarning = contentLinkWarning(contentLinkLength);

  const options: React.ReactElement[] = [];

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
          App has risks others must review and approve
        </ListItemText>
      </MenuItem>,
    );
  }

  const shareLink = async () => {
    onClose();
    // Chat apps drop the title, so the text carries the invitation.
    const result = await shareContent({
      title: graph.name,
      text: 'Try this Tailrmade app:',
      url,
    });
    if (result === 'copied') InterfaceController.showSnackBar('Link copied');
  };

  const copyLink = async () => {
    onClose();
    const result = await copyText(url, 'Copy link');
    if (result === 'copied') InterfaceController.showSnackBar('Link copied');
  };

  // Without a cloud there are no app links at all, so the section goes.
  if (CLOUD_MODE || graph.isRemote) {
    const signedOut = !BackendGateway.getInstance().getIsLoggedIn();
    options.push(
      <Section key="link-section" title="Link to this app" />,
      !graph.isRemote ? (
        <LinkStatus
          key="status"
          title="App exists locally only"
          detail={`${signedOut ? 'Sign in and save' : 'Save'} it to your account as public to get a link.`}
        />
      ) : graph.access === 'public' ? (
        <LinkStatus
          key="status"
          title="App is public"
          detail="Anyone with the link can open the last saved version."
        />
      ) : graph.access === 'organization' ? (
        <LinkStatus
          key="status"
          title="App is shared with your organization"
          detail="People in your organization can open the last saved version."
        />
      ) : (
        <LinkStatus
          key="status"
          title="App is private"
          detail={
            isOwner
              ? 'Only you can open the link.'
              : 'Only its owner can open it or make it public.'
          }
        />
      ),
    );
    if (graph.isRemote && unsaved) {
      options.push(
        <Typography
          key="unsaved"
          data-cy="share-unsaved"
          variant="caption"
          component="p"
          sx={{ px: 2, pb: 0.5, maxWidth: 380, color: 'warning.main' }}
        >
          Unsaved changes aren't in the link yet.
        </Typography>,
        <MenuItem
          key="save"
          data-cy="share-save"
          onClick={() => {
            onClose();
            void PPStorage.getInstance().saveGraphAction(false);
          }}
        >
          <ListItemIcon>
            <SaveIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Save changes</ListItemText>
        </MenuItem>,
      );
    }
    // A local app has no link to offer yet, only the way to get one.
    if (graph.isRemote) {
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
    }
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
          <ListItemText>Make it public…</ListItemText>
        </MenuItem>,
      );
    } else if (!graph.isRemote && signedOut) {
      options.push(
        <MenuItem
          key="sign-in"
          data-cy="share-sign-in"
          onClick={() => {
            onClose();
            openAuthDialog();
          }}
        >
          <ListItemIcon>
            <LoginIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign in…</ListItemText>
        </MenuItem>,
      );
    }
  }

  options.push(
    <Section key="content-section" title="App in a link" />,
    <MenuItem
      key="share-tailrmade-link"
      data-cy="share-tailrmade-link"
      onClick={() => {
        onClose();
        void PPStorage.getInstance().copyCurrentGraphURLToClipboard();
      }}
      sx={{ maxWidth: 380 }}
    >
      <ListItemIcon sx={{ alignSelf: 'flex-start', pt: 0.5 }}>
        <InventoryIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        secondary={
          <>
            The whole app lives only in this link. Later changes don't reach it.
            {sizeWarning && (
              <Typography
                component="span"
                variant="caption"
                data-cy="share-link-size"
                sx={{ display: 'block', mt: 0.5, color: 'warning.main' }}
              >
                {sizeWarning}
              </Typography>
            )}
          </>
        }
        slotProps={wrapSecondary}
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
    <Section key="file-section" title="File" />,
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
