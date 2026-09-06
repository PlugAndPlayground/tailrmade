import React from 'react';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Authentication from '../firebase/Authentication';
import { CLOUD_MODE } from '../services/shared-types';
import { createStore } from './createStore';

// Lifted out of the Rail so the bottom bar can raise it too. Under the stack
// layout there is no rail at all, and signing in is asked for from the bottom
// bar's overflow menu, which unmounts the moment the item is clicked - so the
// dialog cannot be owned by whatever asked for it.
//
// It is a store rather than a prop for that reason: every caller says "open
// the sign-in dialog" and exactly one host, mounted for the life of the app,
// renders it.
export const AuthDialog: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
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
      onClick={onClose}
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
          onClick={onClose}
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

const authDialogStore = createStore<boolean>(false);

export const openAuthDialog = (): void => authDialogStore.set(true);
export const closeAuthDialog = (): void => authDialogStore.set(false);

/** Mounted once, at the top of the app. Everything else just calls open. */
export const AuthDialogHost: React.FC = () => (
  <AuthDialog open={authDialogStore.useStore()} onClose={closeAuthDialog} />
);

export default AuthDialog;
