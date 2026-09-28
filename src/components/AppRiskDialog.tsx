import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { AppRisk } from '../classes/NodeRisk';
import { createStore } from './createStore';
import { pendingAppRun } from '../services/appExecution';
import InterfaceController from '../InterfaceController';

type Review = {
  paste?: boolean;
  name: string;
  risks: AppRisk[];
  resolve: (approved: boolean) => void;
};
const reviewStore = createStore<Review | null>(null);

export function reviewNodePaste(count: number): Promise<boolean> {
  cancelAppRiskReview();
  return new Promise((resolve) =>
    reviewStore.set({
      name: `${count} node${count === 1 ? '' : 's'}`,
      risks: [],
      paste: true,
      resolve,
    }),
  );
}

export function cancelAppRiskReview(): void {
  const review = reviewStore.get();
  reviewStore.set(null);
  review?.resolve(false);
}

export function reviewAppRisks(
  name: string,
  risks: AppRisk[],
): Promise<boolean> {
  if (!risks.length) return Promise.resolve(true);
  reviewStore.get()?.resolve(false);
  return new Promise((resolve) => reviewStore.set({ name, risks, resolve }));
}

export function AppRiskDialog(): React.ReactElement | null {
  const review = reviewStore.useStore();
  const pending = pendingAppRun.useStore();
  const [starting, setStarting] = useState(false);
  if (!review) {
    if (!pending) return null;
    return (
      <Box
        data-cy="app-not-running"
        sx={{
          position: 'fixed',
          bottom: 64,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1400,
          width: 'max-content',
          maxWidth: 'calc(100% - 32px)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          boxShadow: 2,
        }}
      >
        <Typography
          variant="body2"
          sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {pending.name} - Not running
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          data-cy="start-app"
          disabled={starting}
          sx={{ flexShrink: 0 }}
          onClick={async () => {
            setStarting(true);
            try {
              await pending.run();
            } catch (error) {
              InterfaceController.showSnackBar(
                `Starting app failed: ${error}`,
                { variant: 'error' },
              );
            } finally {
              setStarting(false);
            }
          }}
        >
          Run app
        </Button>
      </Box>
    );
  }
  const finish = (approved: boolean): void => {
    reviewStore.set(null);
    review.resolve(approved);
  };
  return (
    <Dialog
      open
      onClose={() => finish(false)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="app-risk-title"
      data-cy={review.paste ? 'node-paste-dialog' : 'app-risk-dialog'}
      sx={{
        zIndex: 1500,
        '& .MuiDialog-paper': {
          m: { xs: 2, sm: 4 },
          width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
        },
      }}
    >
      <DialogTitle id="app-risk-title" sx={{ overflowWrap: 'anywhere' }}>
        {review.paste
          ? `Paste ${review.name}?`
          : `Before running ${review.name}`}
      </DialogTitle>
      <DialogContent dividers>
        {review.paste && (
          <Alert severity="warning">
            Pasted nodes can run code, access saved Tailrmade data, and send
            network requests. They may run immediately if this app is running.
            Only paste nodes from a source you trust.
          </Alert>
        )}
        {review.risks.map(({ risk, nodes }) => (
          <Box
            key={risk.id}
            sx={{ mb: 2, '&:last-child': { mb: 0 }, overflowWrap: 'anywhere' }}
          >
            <Alert
              severity={risk.severity === 'critical' ? 'error' : 'warning'}
            >
              <Typography sx={{ fontWeight: 600 }}>{risk.title}</Typography>
              {risk.target && (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {risk.target}
                </Typography>
              )}
              <Typography variant="body2">{risk.description}</Typography>
            </Alert>
            <Typography
              variant="caption"
              component="p"
              sx={{ mt: 0.5, color: 'text.secondary' }}
            >
              {nodes.map((node) => node.name).join(', ')}
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={() => finish(false)} autoFocus>
          {review.paste ? 'Cancel' : 'Keep inspecting'}
        </Button>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={() => finish(true)}
          data-cy={review.paste ? 'confirm-node-paste' : 'run-reviewed-app'}
        >
          {review.paste ? 'Paste nodes' : 'Run app'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
