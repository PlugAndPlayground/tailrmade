import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { CopyResult, manualCopyStore } from '../utils/share';

export const ManualCopyDialog: React.FC = () => {
  const request = manualCopyStore.useStore();
  const [copyFailed, setCopyFailed] = useState(false);
  if (!request) return null;

  const close = (result: CopyResult) => {
    setCopyFailed(false);
    manualCopyStore.set(null);
    request.resolve(result);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request.value);
      close('copied');
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Dialog
      open={true}
      onClose={() => close('cancelled')}
      fullWidth
      maxWidth="sm"
      data-cy="manual-copy-dialog"
      sx={{ '& .MuiDialog-paper': { bgcolor: 'background.default' } }}
    >
      <DialogTitle>{request.title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          maxRows={6}
          variant="standard"
          value={request.value}
          onFocus={(event) => event.target.select()}
          slotProps={{ htmlInput: { readOnly: true } }}
          helperText={
            copyFailed
              ? 'This browser blocked copying. Select the text and copy it yourself.'
              : undefined
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close('cancelled')}>Close</Button>
        <Button
          variant="contained"
          data-cy="manual-copy-button"
          onClick={() => void copy()}
        >
          Copy
        </Button>
      </DialogActions>
    </Dialog>
  );
};
