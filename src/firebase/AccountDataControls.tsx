import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DownloadIcon from '@mui/icons-material/Download';
import PrivacyTipIcon from '@mui/icons-material/PrivacyTip';
import { FirebaseAppHandler } from './FirebaseAppHandler';
import { downloadFile } from '../utils/utils';

const DELETE_CONFIRMATION = 'DELETE';

interface AccountDataControlsProps {
  onAccountDeleted?: () => void;
}

const AccountDataControls: React.FC<AccountDataControlsProps> = ({
  onAccountDeleted,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = FirebaseAppHandler.getInstance();

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const accountData = await auth.exportAccountData();
      downloadFile(
        JSON.stringify(accountData, null, 2),
        `tailrmade-data-export-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to export account data';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.deleteAccountData(confirmation);
      setConfirmDialogOpen(false);
      setDialogOpen(false);
      onAccountDeleted?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete account';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1.5,
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
        onClick={() => setDialogOpen(true)}
        data-cy="account-data-controls-button"
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <PrivacyTipIcon
            sx={{ fontSize: 20, mr: 1.5, color: 'primary.main' }}
          />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Privacy and data
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Export your data or delete your account
            </Typography>
          </Box>
        </Box>
      </Box>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{ zIndex: 9999 }}
      >
        <DialogTitle>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <Box>
              Privacy and data
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Download your account data or permanently remove your account.
              </Typography>
            </Box>
            <IconButton
              aria-label="close"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Export data
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                Creates a JSON file with account metadata, preferences, API keys
                and cloud files.
              </Typography>
              <Button
                variant="contained"
                startIcon={
                  busy ? <CircularProgress size={18} /> : <DownloadIcon />
                }
                onClick={() => void handleExport()}
                disabled={busy}
                data-cy="export-user-data-button"
              >
                Download my data
              </Button>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Delete account
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                Permanently deletes your account, cloud data, API keys,
                preferences and cloud files.
              </Typography>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteForeverIcon />}
                onClick={() => {
                  setConfirmation('');
                  setConfirmDialogOpen(true);
                }}
                disabled={busy}
                data-cy="open-delete-account-confirmation-button"
              >
                Delete my account
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{ zIndex: 10000 }}
      >
        <DialogTitle>Confirm account deletion</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This permanently deletes your account and all data associated with
            it. This cannot be undone.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{DELETE_CONFIRMATION}</strong> to continue.
          </Typography>
          <TextField
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            fullWidth
            autoFocus
            disabled={busy}
            placeholder={DELETE_CONFIRMATION}
            slotProps={{
              htmlInput: { 'data-cy': 'delete-account-confirmation-input' },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDialogOpen(false)}
            disabled={busy}
            color="secondary"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void handleDeleteAccount()}
            disabled={busy || confirmation !== DELETE_CONFIRMATION}
            startIcon={
              busy ? <CircularProgress size={18} /> : <DeleteForeverIcon />
            }
            data-cy="confirm-delete-account-button"
          >
            Permanently delete account
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AccountDataControls;
