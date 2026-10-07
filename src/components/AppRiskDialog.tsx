import React, { useEffect, useMemo, useState } from 'react';
import { Point } from 'pixi.js';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import CodeIcon from '@mui/icons-material/Code';
import KeyIcon from '@mui/icons-material/Key';
import PublicIcon from '@mui/icons-material/Public';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ComputerIcon from '@mui/icons-material/Computer';
import StorageIcon from '@mui/icons-material/Storage';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { AppRisk, NodeRisk } from '../classes/NodeRisk';
import PPGraph from '../classes/GraphClass';
import { createStore } from './createStore';
import { pendingAppRun } from '../services/appExecution';
import InterfaceController from '../InterfaceController';
import { getNodesBounds, smoothMoveViewport } from '../pixi/utils-pixi';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import { setStackView, useIsStackLayout } from '../utils/layoutModel';

type Review = {
  paste?: boolean;
  name: string;
  risks: AppRisk[];
  resolve: (approved: boolean) => void;
};
const reviewStore = createStore<Review | null>(null);
export const APP_RISK_PANEL_WIDTH = 380;

const capabilityStyles: Record<
  string,
  { Icon: typeof CodeIcon; color: string; background: string }
> = {
  'unrestricted-code': {
    Icon: CodeIcon,
    color: '#ffb4ab',
    background: '#4b2025',
  },
  'api-key': { Icon: KeyIcon, color: '#ffd48a', background: '#443316' },
  network: { Icon: PublicIcon, color: '#a9dfff', background: '#173b50' },
  navigation: { Icon: OpenInNewIcon, color: '#a9dfff', background: '#173b50' },
  companion: { Icon: ComputerIcon, color: '#ffd48a', background: '#443316' },
  storage: { Icon: StorageIcon, color: '#a4e4dc', background: '#193b39' },
  'ai-usage': {
    Icon: AutoAwesomeIcon,
    color: '#e3c2ff',
    background: '#392747',
  },
};

function NodeCapability({ risk }: { risk: NodeRisk }): React.ReactElement {
  const { Icon, color, background } = capabilityStyles[risk.kind] ?? {
    Icon: WarningAmberIcon,
    color: '#ffd48a',
    background: '#443316',
  };
  return (
    <Box
      data-cy="node-capability"
      data-risk-kind={risk.kind}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 0.75 }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          flexShrink: 0,
          p: 0.25,
          borderRadius: 0.5,
          color,
          bgcolor: background,
        }}
      >
        <Icon sx={{ fontSize: 16 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{risk.title}</Typography>
        {risk.target && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {risk.target}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function useAppRiskReviewOpen(): boolean {
  const review = reviewStore.useStore();
  return !!review && !review.paste;
}

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

export function AppRiskDialog({
  canvasElement,
}: {
  canvasElement?: HTMLDivElement | null;
}): React.ReactElement | null {
  const review = reviewStore.useStore();
  const pending = pendingAppRun.useStore();
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState('');
  const [inspection, setInspection] = useState<string[]>([]);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const stacked = useIsStackLayout();
  const nodes = useMemo(() => {
    const nodesById = new Map<
      string,
      { id: string; name: string; risks: NodeRisk[] }
    >();
    for (const { risk, nodes } of review?.risks ?? []) {
      for (const node of nodes) {
        const entry = nodesById.get(node.id) ?? { ...node, risks: [] };
        entry.risks.push(risk);
        nodesById.set(node.id, entry);
      }
    }
    return [...nodesById.values()].map((node) => ({
      ...node,
      searchText: [
        node.name,
        node.id,
        ...node.risks.flatMap((risk) => [risk.title, risk.target ?? '']),
      ]
        .join(' ')
        .toLowerCase(),
    }));
  }, [review]);
  useEffect(() => {
    setSearch('');
    setInspection(nodes.map((node) => node.id));
    if (review && !review.paste) {
      InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
      InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.CLOSE);
      InterfaceController.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
      setStackView('graph');
    }
  }, [review, nodes]);
  useEffect(() => {
    if (!review || review.paste || !panelElement) return;
    const frameSelection = () => {
      const graph = PPGraph.currentGraph;
      const targets = inspection.map((id) => graph.nodes[id]).filter(Boolean);
      if (!targets.length) return;
      const panel = panelElement.getBoundingClientRect();
      const canvas = canvasElement?.getBoundingClientRect();
      const left = stacked ? 0 : Math.max(panel.right, canvas?.left ?? 0);
      const right = stacked
        ? window.innerWidth
        : Math.min(window.innerWidth, canvas?.right ?? window.innerWidth);
      const bottom = stacked ? panel.top : window.innerHeight;
      const bounds = getNodesBounds(targets);
      const scale = Math.min(
        1,
        Math.max(1, right - left - 48) / Math.max(1, bounds.width),
        Math.max(1, bottom - 48) / Math.max(1, bounds.height),
      );
      // Center the selection in the canvas area not covered by the review panel.
      smoothMoveViewport(
        new Point(
          bounds.x +
            bounds.width / 2 -
            ((left + right) / 2 - window.innerWidth / 2) / scale,
          bounds.y +
            bounds.height / 2 -
            (bottom / 2 - window.innerHeight / 2) / scale,
        ),
        scale,
      );
    };
    frameSelection();
    const observer = new ResizeObserver(frameSelection);
    observer.observe(panelElement);
    if (canvasElement) observer.observe(canvasElement);
    window.addEventListener('resize', frameSelection);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', frameSelection);
    };
  }, [review, inspection, stacked, panelElement, canvasElement]);
  if (!review) {
    if (!pending) return null;
    return (
      <Box
        data-cy="app-not-running"
        sx={{
          position: 'fixed',
          pointerEvents: 'auto',
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
  const query = search.trim().toLowerCase();
  const matchingNodes = nodes.filter((node) => node.searchText.includes(query));
  const inspectNodes = (ids: string[]): void => {
    const targets = ids
      .map((id) => PPGraph.currentGraph.nodes[id])
      .filter(Boolean);
    if (!targets.length) return;
    InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.CLOSE);
    setStackView('graph');
    PPGraph.currentGraph.selection.selectNodes(targets, false);
    setInspection(ids);
  };
  const content = (
    <>
      <DialogTitle component="div" sx={{ overflowWrap: 'anywhere' }}>
        <Typography id="app-risk-title" component="h2" variant="h6">
          {review.paste
            ? `Paste ${review.name}?`
            : `Before running ${review.name}`}
        </Typography>
        {!review.paste && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              flexWrap: 'wrap',
              mt: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {nodes.length} affected {nodes.length === 1 ? 'node' : 'nodes'}
            </Typography>
            <Button
              color="inherit"
              startIcon={<MyLocationIcon />}
              data-cy="inspect-all-risk-nodes"
              onClick={() => inspectNodes(nodes.map((node) => node.id))}
            >
              Inspect all
            </Button>
          </Box>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {review.paste && (
          <Alert severity="warning">
            Pasted nodes can run code, access saved Tailrmade data, and send
            network requests. They may run immediately if this app is running.
            Only paste nodes from a source you trust.
          </Alert>
        )}
        {!review.paste && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Affected nodes ({nodes.length})
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="Find a node or capability"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <List dense sx={{ maxHeight: 320, overflowY: 'auto', mt: 1 }}>
              {matchingNodes.map((node) => (
                <ListItemButton
                  key={node.id}
                  aria-label={`Go to node ${node.name}`}
                  aria-describedby={`risk-capabilities-${node.id}`}
                  data-cy="go-to-risk-node"
                  data-node-id={node.id}
                  onClick={() => inspectNodes([node.id])}
                  sx={{
                    minHeight: 44,
                    overflowWrap: 'anywhere',
                    alignItems: 'flex-start',
                    px: 1,
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 0 },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 28, mt: 0.25 }}>
                    <MyLocationIcon fontSize="small" />
                  </ListItemIcon>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {node.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {node.id}
                    </Typography>
                    <Box id={`risk-capabilities-${node.id}`}>
                      {node.risks.map((risk) => (
                        <NodeCapability key={risk.id} risk={risk} />
                      ))}
                    </Box>
                  </Box>
                </ListItemButton>
              ))}
              {!matchingNodes.length && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ p: 1 }}
                >
                  No matching nodes
                </Typography>
              )}
            </List>
          </Box>
        )}
        {!!review.risks.length && (
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Risk details
          </Typography>
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
            <Button
              size="small"
              color="inherit"
              startIcon={<MyLocationIcon />}
              data-cy="inspect-risk-group"
              onClick={() => inspectNodes(nodes.map((node) => node.id))}
              sx={{ mt: 0.5 }}
            >
              Inspect {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
            </Button>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ flexShrink: 0, flexWrap: 'wrap' }}>
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
    </>
  );
  if (!review.paste) {
    return (
      <Paper
        ref={setPanelElement}
        role="dialog"
        aria-modal={false}
        aria-labelledby="app-risk-title"
        data-cy="app-risk-dialog"
        elevation={8}
        sx={{
          position: stacked ? 'fixed' : 'relative',
          zIndex: stacked ? 20 : 'auto',
          pointerEvents: 'auto',
          flex: `0 0 ${APP_RISK_PANEL_WIDTH}px`,
          display: 'flex',
          flexDirection: 'column',
          ...(stacked
            ? { left: 8, bottom: 64, top: '52%' }
            : { height: '100dvh' }),
          width: stacked ? 'calc(100% - 16px)' : APP_RISK_PANEL_WIDTH,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          '& .MuiDialogTitle-root': { px: 2, py: 1 },
          '& .MuiDialogContent-root': { px: 2 },
        }}
      >
        {content}
      </Paper>
    );
  }
  return (
    <Dialog
      open
      onClose={() => finish(false)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="app-risk-title"
      data-cy="node-paste-dialog"
      sx={{
        zIndex: 1500,
        '& .MuiDialog-paper': {
          m: { xs: 2, sm: 4 },
          width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
        },
      }}
    >
      {content}
    </Dialog>
  );
}
