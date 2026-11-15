import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { FirebaseAppHandler, type ApiKeySummary } from './FirebaseAppHandler';

const EMPTY_FORM = { name: '', domain: '', key: '' };
const keyReference = (name: string) => `$TM_KEY{${name}}`;

interface ApiKeyListItemProps {
  apiKey: ApiKeySummary;
  disabled: boolean;
  onReplace: (apiKey: ApiKeySummary) => void;
  onRemove: (name: string) => void;
}

const ApiKeyListItem = ({
  apiKey,
  disabled,
  onReplace,
  onRemove,
}: ApiKeyListItemProps) => (
  <ListItem
    sx={{
      bgcolor: 'background.paper',
      borderRadius: 1,
      border: '1px solid',
      borderColor: 'divider',
      mb: 1,
      pr: 22,
    }}
    secondaryAction={
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={() => onReplace(apiKey)}
          disabled={disabled}
          data-cy="replace-api-key-button"
          data-key-name={apiKey.name}
          aria-label={`Replace API key ${apiKey.name}`}
        >
          Replace
        </Button>
        <IconButton
          edge="end"
          onClick={() => onRemove(apiKey.name)}
          disabled={disabled}
          color="error"
          data-cy="remove-api-key-button"
          data-key-name={apiKey.name}
          aria-label={`Delete API key ${apiKey.name}`}
        >
          <DeleteIcon />
        </IconButton>
      </Box>
    }
  >
    <ListItemText
      primary={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', fontWeight: 600 }}
          >
            {apiKey.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            • {apiKey.domain}
          </Typography>
        </Box>
      }
      secondary={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', color: 'secondary.main' }}
          >
            Use as: {keyReference(apiKey.name)}
          </Typography>
          <IconButton
            size="small"
            onClick={() => {
              void navigator.clipboard.writeText(keyReference(apiKey.name));
            }}
            sx={{ ml: 0.5, p: 0.5 }}
            aria-label="Copy key usage syntax"
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      }
      slotProps={{ secondary: { component: 'div' } }}
    />
  </ListItem>
);

const ApiKeysDialog = ({ onClose }: { onClose: () => void }) => {
  const auth = FirebaseAppHandler.getInstance();
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [replacing, setReplacing] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyToRemove, setKeyToRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void auth.getApiKeys().then(
      (keys) => {
        if (active) setApiKeys(keys);
      },
      () => {
        if (active) setError('Failed to fetch API keys. Please try again.');
      },
    );
    return () => {
      active = false;
    };
  }, [auth]);

  const editKey = (apiKey?: ApiKeySummary) => {
    setForm(apiKey ? { ...apiKey, key: '' } : EMPTY_FORM);
    setReplacing(!!apiKey);
    setShowKey(false);
    setError(null);
  };

  const selectKeyToRemove = (name: string | null) => {
    if (busy) return;
    setKeyToRemove(name);
    setError(null);
  };

  const closeDialog = () => {
    if (!busy) onClose();
  };
  const closeDeleteDialog = () => selectKeyToRemove(null);
  const duplicateName =
    !replacing && apiKeys.some(({ name }) => name === form.name.trim());
  const canSave =
    !busy &&
    !duplicateName &&
    Object.values(form).every((value) => value.trim());

  const runMutation = async (
    action: 'save' | 'delete',
    request: () => Promise<boolean>,
    onSuccess: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await request())) throw new Error();
      onSuccess();
    } catch {
      setError(`Failed to ${action} API key. Please try again.`);
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async () => {
    if (!canSave) return;
    const name = replacing ? form.name : form.name.trim();
    const domain = form.domain.trim();
    await runMutation(
      'save',
      () => auth.upsertApiKey({ name, domain, key: form.key.trim() }),
      () => {
        setApiKeys((keys) => [
          ...keys.filter((key) => key.name !== name),
          { name, domain },
        ]);
        editKey();
      },
    );
  };

  const removeKey = async () => {
    if (keyToRemove === null) return;
    await runMutation(
      'delete',
      () => auth.deleteApiKey(keyToRemove),
      () => {
        setApiKeys((keys) => keys.filter((key) => key.name !== keyToRemove));
        if (replacing && form.name === keyToRemove) editKey();
        setKeyToRemove(null);
      },
    );
  };

  const fieldProps = (field: keyof typeof EMPTY_FORM) => ({
    value: form[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setForm((previous) => ({ ...previous, [field]: value }));
    },
    disabled: busy,
    fullWidth: true,
    size: 'small' as const,
  });

  return (
    <>
      <Dialog
        open
        onClose={closeDialog}
        maxWidth="md"
        fullWidth
        sx={{ zIndex: 9999 }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: 'background.default',
              backgroundImage:
                'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))',
            },
          },
        }}
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
              Manage API Keys
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Store API keys securely for use in HTTP nodes with{' '}
                {keyReference('key_name')} syntax
              </Typography>
            </Box>
            <IconButton
              aria-label="close"
              onClick={closeDialog}
              disabled={busy}
              sx={{ ml: 1 }}
              data-cy="close-api-keys-button"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {error && keyToRemove === null && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {apiKeys.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No API keys stored yet. Add one below.
            </Alert>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                Your API Keys
              </Typography>
              <List sx={{ mb: 2 }}>
                {apiKeys.map((apiKey) => (
                  <ApiKeyListItem
                    key={apiKey.name}
                    apiKey={apiKey}
                    disabled={busy}
                    onReplace={editKey}
                    onRemove={selectKeyToRemove}
                  />
                ))}
              </List>
            </>
          )}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            {replacing ? 'Replace API Key' : 'Add New API Key'}
          </Typography>
          {replacing && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Enter a new value for <strong>{form.name}</strong>. Existing{' '}
              {keyReference(form.name)} references will use the new key after
              you save. The stored value is never displayed.
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                {...fieldProps('name')}
                label="Key Name"
                disabled={busy || replacing}
                error={duplicateName}
                placeholder="openai"
                helperText={
                  duplicateName
                    ? 'This name already exists. Use Replace on the key above.'
                    : 'A name to reference this key in your apps'
                }
                slotProps={{ htmlInput: { 'data-cy': 'api-key-name-input' } }}
              />
              <TextField
                {...fieldProps('domain')}
                label="API Domain"
                placeholder="api.openai.com"
                helperText="The domain of the API service"
                slotProps={{ htmlInput: { 'data-cy': 'api-key-domain-input' } }}
              />
            </Box>
            <TextField
              {...fieldProps('key')}
              label="API Key Value"
              type={showKey ? 'text' : 'password'}
              placeholder="Enter your API key"
              helperText="Your actual API key or token"
              slotProps={{
                htmlInput: { 'data-cy': 'api-key-value-input' },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle API key visibility"
                        disabled={busy}
                        onClick={() => setShowKey(!showKey)}
                        edge="end"
                        size="small"
                      >
                        {showKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={replacing ? <EditIcon /> : <AddIcon />}
                onClick={() => void saveKey()}
                disabled={!canSave}
                data-cy={
                  replacing ? 'save-api-key-button' : 'add-api-key-button'
                }
              >
                {busy
                  ? 'Saving…'
                  : replacing
                    ? 'Save Replacement'
                    : 'Add API Key'}
              </Button>
              {replacing && (
                <Button
                  onClick={() => editKey()}
                  disabled={busy}
                  data-cy="cancel-replace-api-key-button"
                >
                  Cancel
                </Button>
              )}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
      <Dialog
        open={keyToRemove !== null}
        onClose={closeDeleteDialog}
        maxWidth="sm"
        fullWidth
        sx={{ zIndex: 10000 }}
        aria-labelledby="delete-api-key-title"
        aria-describedby="delete-api-key-description"
      >
        <DialogTitle id="delete-api-key-title">Delete API key?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-api-key-description">
            Delete <strong>{keyToRemove}</strong>? Apps using{' '}
            {keyReference(keyToRemove ?? '')} will stop working until you add
            this key again. This cannot be undone.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            autoFocus
            color="secondary"
            onClick={closeDeleteDialog}
            disabled={busy}
            data-cy="cancel-delete-api-key-button"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void removeKey()}
            disabled={busy}
            data-cy="confirm-delete-api-key-button"
          >
            {busy ? 'Deleting…' : 'Delete API Key'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ApiKeysDialog;
