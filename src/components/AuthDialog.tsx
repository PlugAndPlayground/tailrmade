import React from 'react';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Authentication from '../firebase/Authentication';
import { CLOUD_MODE } from '../services/shared-types';
import { createStore } from './createStore';

const authDialogStore = createStore<boolean>(false);

export const openAuthDialog = (): void => authDialogStore.set(true);

export const AuthDialogHost: React.FC = () => {
  const open = authDialogStore.useStore();
  const close = () => authDialogStore.set(false);

  if (!CLOUD_MODE || !open) {
    return null;
  }

  return (
    <Box
      data-cy="auth-dialog"
      sx={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
      onClick={close}
    >
      <Box
        onClick={(event) => event.stopPropagation()}
        sx={{
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90dvh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <IconButton
          aria-label="close"
          onClick={close}
          sx={{
            position: 'absolute',
            top: 48,
            right: 32,
            padding: 1,
            bgcolor: 'transparent',
            zIndex: 1,
            '& svg': { fontSize: '18px' },
          }}
          data-cy="close-auth-modal-button"
        >
          <CloseIcon />
        </IconButton>
        <Authentication />
      </Box>
    </Box>
  );
};
