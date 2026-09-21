import React from 'react';
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

type Review = {
  name: string;
  risks: AppRisk[];
  resolve: (approved: boolean) => void;
};
const reviewStore = createStore<Review | null>(null);

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
  if (!review) return null;
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
      data-cy="app-risk-dialog"
      sx={{
        zIndex: 1500,
        '& .MuiDialog-paper': {
          m: { xs: 2, sm: 4 },
          width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
        },
      }}
    >
      <DialogTitle id="app-risk-title" sx={{ overflowWrap: 'anywhere' }}>
        Before running {review.name}
      </DialogTitle>
      <DialogContent dividers>
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
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={() => finish(true)}
          data-cy="run-reviewed-app"
        >
          Run app
        </Button>
      </DialogActions>
    </Dialog>
  );
}
