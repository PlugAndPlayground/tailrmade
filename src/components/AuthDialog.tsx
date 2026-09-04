import React from 'react';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Authentication from '../firebase/Authentication';
import { CLOUD_MODE } from '../services/shared-types';

// Lifted out of the Rail so the bottom bar can raise it too. Under the stack
// layout there is no rail at all, and the AI destination is the one thing on a
// phone worth signing in for - it is how you build anything there - so it has
// to be able to ask.
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

export default AuthDialog;
