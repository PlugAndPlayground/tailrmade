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
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { AppRisk } from '../classes/NodeRisk';
import PPGraph from '../classes/GraphClass';
import { createStore } from './createStore';
import { pendingAppRun } from '../services/appExecution';
import InterfaceController from '../InterfaceController';
import { ensureVisible } from '../pixi/utils-pixi';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { setStackView } from '../utils/layoutModel';

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
          startIcon={<FactCheckOutlinedIcon />}
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
          Review app
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
            <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {nodes.map((node) => (
                <Button
                  key={node.id}
                  size="small"
                  variant="outlined"
                  color="inherit"
                  startIcon={<MyLocationIcon />}
                  aria-label={`Go to node ${node.name}`}
                  data-cy="go-to-risk-node"
                  data-node-id={node.id}
                  sx={{
                    maxWidth: '100%',
                    minHeight: 36,
                    px: 1.5,
                    textAlign: 'left',
                    textTransform: 'none',
                    overflowWrap: 'anywhere',
                    color: 'text.primary',
                    bgcolor: 'action.hover',
                    borderColor: 'text.secondary',
                    '&:hover': {
                      bgcolor: 'action.selected',
                      borderColor: 'text.primary',
                    },
                    '&.Mui-focusVisible': {
                      outline: '2px solid',
                      outlineColor: 'text.primary',
                      outlineOffset: 2,
                    },
                  }}
                  onClick={() => {
                    const target = PPGraph.currentGraph.nodes[node.id];
                    if (!target) return;
                    finish(false);
                    InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
                    InterfaceController.toggleShowDashboard(
                      VISIBILITY_ACTION.CLOSE,
                    );
                    setStackView('graph');
                    PPGraph.currentGraph.selection.selectNodes([target], false);
                    void ensureVisible([target]);
                  }}
                >
                  {node.name}
                </Button>
              ))}
            </Box>
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
