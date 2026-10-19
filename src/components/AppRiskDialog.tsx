import React, { useEffect, useMemo, useState } from 'react';
import { Point } from 'pixi.js';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  Paper,
  ThemeProvider,
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import {
  AppRisk,
  NodeRisk,
  RiskSeverity,
  collectAppRisks,
  requiresAppRiskReview,
} from '../classes/NodeRisk';
import PPGraph from '../classes/GraphClass';
import { createStore } from './createStore';
import { pendingAppRun } from '../services/appExecution';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { getNodesBounds, smoothMoveViewport } from '../pixi/utils-pixi';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import {
  customTheme,
  getDrawerBackground,
  RightDrawerView,
} from '../utils/constants';
import { setStackView, useIsStackLayout } from '../utils/layoutModel';

type Review = {
  paste?: boolean;
  inspectionOnly?: boolean;
  name: string;
  risks: AppRisk[];
  resolve: (approved: boolean) => void;
};
const reviewStore = createStore<Review | null>(null);
export const APP_RISK_PANEL_WIDTH = 380;

const capabilityIcons: Record<string, typeof InfoOutlinedIcon> = {
  'unrestricted-code': CodeIcon,
  'api-key': KeyIcon,
  network: PublicIcon,
  'external-image': ImageOutlinedIcon,
  'dynamic-image': ImageOutlinedIcon,
  navigation: OpenInNewIcon,
  companion: ComputerIcon,
  storage: StorageIcon,
  'ai-usage': AutoAwesomeIcon,
};

type AccessStyle = {
  color: string;
  background: string;
  score: number;
  label: string;
  description: string;
};

const severityStyles: Record<RiskSeverity, AccessStyle> = {
  critical: {
    color: '#e4c28c',
    background: '#3d3426',
    score: 3,
    label: 'Broad access',
    description: 'Can do anything you can do in this tab',
  },
  warning: {
    color: '#d5cfbd',
    background: '#34332f',
    score: 2,
    label: 'Specific access',
    description: 'Uses the services, keys or data listed below',
  },
  info: {
    color: '#a9dfff',
    background: '#173b50',
    score: 1,
    label: 'Basic access',
    description: 'Shows content from other sites',
  },
};

// Three bars instead of "n/3", which read like a test score where 3/3 is best.
function AccessLevel({
  level,
  variant = 'caption',
}: {
  level: AccessStyle;
  variant?: 'caption' | 'subtitle2';
}): React.ReactElement {
  return (
    <Box
      component="span"
      data-access-level={level.score}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
    >
      <Box component="span" aria-hidden sx={{ display: 'flex', gap: '2px' }}>
        {[1, 2, 3].map((bar) => (
          <Box
            key={bar}
            component="span"
            sx={{
              width: 4,
              height: 10,
              borderRadius: '1px',
              bgcolor: bar <= level.score ? level.color : 'action.disabled',
            }}
          />
        ))}
      </Box>
      <Typography variant={variant} sx={{ color: level.color }}>
        {level.label}
      </Typography>
    </Box>
  );
}

function RequiredAccess({ level }: { level: AccessStyle }): React.ReactElement {
  return (
    <Box data-cy="required-access-score">
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        Required access
      </Typography>
      <AccessLevel level={level} variant="subtitle2" />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block' }}
      >
        {level.description}
      </Typography>
    </Box>
  );
}

function NodeCapability({ risk }: { risk: NodeRisk }): React.ReactElement {
  const Icon = capabilityIcons[risk.kind] ?? InfoOutlinedIcon;
  const level = severityStyles[risk.severity];
  const { color, background } = level;
  return (
    <Box
      data-cy="node-capability"
      data-risk-kind={risk.kind}
      data-risk-severity={risk.severity}
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
        <AccessLevel level={level} />
        <Typography
          variant="body2"
          sx={risk.severity === 'critical' ? { fontWeight: 600 } : {}}
        >
          {risk.title}
        </Typography>
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
  if (!requiresAppRiskReview(risks)) return Promise.resolve(true);
  reviewStore.get()?.resolve(false);
  return new Promise((resolve) => reviewStore.set({ name, risks, resolve }));
}

export function showCurrentAppRisks(): void {
  const pending = pendingAppRun.get();
  if (pending) {
    void pending.run().catch((error) => {
      InterfaceController.showSnackBar(`Reviewing app failed: ${error}`, {
        variant: 'error',
      });
    });
    return;
  }
  cancelAppRiskReview();
  const graph = PPGraph.currentGraph;
  reviewStore.set({
    name: graph.name,
    risks: collectAppRisks(Object.values(graph.nodes)),
    inspectionOnly: true,
    resolve: () => {},
  });
}

function requiredAccess(risks: AppRisk[]) {
  return risks.reduce(
    (highest, { risk }) =>
      severityStyles[risk.severity].score > highest.score
        ? severityStyles[risk.severity]
        : highest,
    severityStyles.info,
  );
}

function AppSource(): React.ReactElement {
  const source = PPGraph.currentGraph.source;
  if (!source) {
    return (
      <Typography variant="body2" color="text.secondary">
        Unknown source
      </Typography>
    );
  }
  return (
    <>
      {source.ownerId === 'publicUser' ? (
        <Chip
          icon={<VerifiedIcon />}
          label="Tailrmade"
          aria-label="Verified Tailrmade"
          color="primary"
          size="small"
        />
      ) : (
        <Typography variant="body2">
          {source.owner.name || source.ownerId}
        </Typography>
      )}
      {source.owner.email && (
        <Typography variant="caption" color="text.secondary">
          {source.owner.email}
        </Typography>
      )}
    </>
  );
}

const readCurrentRisks = (): AppRisk[] =>
  collectAppRisks(Object.values(PPGraph.currentGraph.nodes));

// Summary for the App inspector. The full review opens in the left panel so
// its list stays put while the right inspector shows the selected node.
export function AppRiskSummary(): React.ReactElement {
  const [risks, setRisks] = useState(readCurrentRisks);
  useEffect(() => {
    const listener = InterfaceController.addListeners(
      [
        ListenEvent.GraphChanged,
        ListenEvent.GraphConfigured,
        ListenEvent.UnsavedChanges,
      ],
      () => setRisks(readCurrentRisks()),
    );
    return () => InterfaceController.removeListener(listener);
  }, []);
  const access = requiredAccess(risks);
  const nodeCount = new Set(
    risks.flatMap(({ nodes }) => nodes.map((node) => node.id)),
  ).size;
  return (
    <Box data-cy="app-risk-summary" sx={{ bgcolor: 'background.paper' }}>
      <Box sx={{ px: 2, py: 1, color: 'text.primary' }}>Risks</Box>
      <Box sx={{ p: 2, bgcolor: 'background.default' }}>
        <RequiredAccess level={access} />
        <Box data-cy="app-risk-source" sx={{ mt: 1 }}>
          <AppSource />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {nodeCount
            ? `${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} to review`
            : 'No risks found'}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FactCheckOutlinedIcon />}
          data-cy="open-risk-review"
          onClick={showCurrentAppRisks}
          sx={{ mt: 1.5 }}
        >
          Review risks
        </Button>
      </Box>
    </Box>
  );
}

export function AppRiskDialog({
  canvasElement,
  dashboardVisible,
}: {
  canvasElement?: HTMLDivElement | null;
  dashboardVisible: boolean;
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
  }, [review, nodes]);
  useEffect(() => {
    if (review && !review.paste && !dashboardVisible) {
      InterfaceController.toggleLeftSideDrawer(VISIBILITY_ACTION.CLOSE);
    }
  }, [review, dashboardVisible]);
  useEffect(() => {
    if (!review || review.paste || dashboardVisible || !panelElement) return;
    const frameSelection = () => {
      const graph = PPGraph.currentGraph;
      const targets = inspection.map((id) => graph.nodes[id]);
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
  }, [
    review,
    inspection,
    stacked,
    panelElement,
    canvasElement,
    dashboardVisible,
  ]);
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
          {pending.name} - Risky nodes paused
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
          Review risks
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
    const targets = ids.map((id) => PPGraph.currentGraph.nodes[id]);
    if (!targets.length) return;
    InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.CLOSE);
    setStackView('graph');
    InterfaceController.setRightDrawerView(RightDrawerView.GRAPH);
    PPGraph.currentGraph.selection.selectNodes(targets, false);
    setInspection(ids);
  };
  const access = requiredAccess(review.risks);
  const content = (
    <>
      <DialogTitle component="div" sx={{ overflowWrap: 'anywhere' }}>
        {!review.paste && (
          <Box sx={{ mb: 1 }}>
            <RequiredAccess level={access} />
          </Box>
        )}
        <Typography id="app-risk-title" component="h2" variant="h6">
          {review.paste
            ? `Paste ${review.name}?`
            : review.inspectionOnly
              ? `Risks in ${review.name}`
              : `Before running ${review.name}`}
        </Typography>
        {!review.paste && (
          <Box data-cy="app-risk-source" sx={{ mt: 1 }}>
            <AppSource />
          </Box>
        )}
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
              {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} to review
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
          <Alert severity="info" role="note">
            Depending on their configuration, pasted nodes can run code, use
            saved Tailrmade data, and connect to services. They may run
            immediately if this app is running. Check that their source and
            behavior match what you expect before pasting.
          </Alert>
        )}
        {!review.paste && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 2, mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These capabilities are common in interactive apps. Review the
              access below and check that it matches what you expect from this
              app and its source.
              {' The required access is the broadest any node needs.'}
              {review.risks.some(
                ({ risk }) => risk.kind === 'unrestricted-code',
              ) &&
                ' Browser access includes the ability to use keys, access data, and contact services beyond those listed here.'}
            </Typography>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Nodes to review ({nodes.length})
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
                  {nodes.length ? 'No matching nodes' : 'No risks found'}
                </Typography>
              )}
            </List>
          </Box>
        )}
        {!!review.risks.length && (
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Capabilities
          </Typography>
        )}
        {review.risks.map(({ risk, nodes }) => (
          <Box
            key={risk.id}
            sx={{ mb: 2, '&:last-child': { mb: 0 }, overflowWrap: 'anywhere' }}
          >
            <Alert
              severity={
                risk.severity === 'critical' ? 'warning' : risk.severity
              }
              role="note"
              data-cy="risk-details"
              data-risk-kind={risk.kind}
              data-risk-severity={risk.severity}
              icon={React.createElement(
                capabilityIcons[risk.kind] ?? InfoOutlinedIcon,
                { fontSize: 'inherit' },
              )}
              sx={{
                bgcolor: 'action.hover',
                color: 'text.primary',
                borderLeft: risk.severity === 'critical' ? 3 : 0,
                borderColor: severityStyles[risk.severity].color,
                '& .MuiAlert-icon': {
                  color: severityStyles[risk.severity].color,
                },
              }}
            >
              <AccessLevel level={severityStyles[risk.severity]} />
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
        <Button
          color="inherit"
          onClick={() => {
            if (!review.paste && !review.inspectionOnly)
              inspectNodes(nodes.map((node) => node.id));
            finish(false);
          }}
          autoFocus
        >
          {review.paste
            ? 'Cancel'
            : review.inspectionOnly
              ? 'Close'
              : 'Keep inspecting'}
        </Button>
        {!review.inspectionOnly && (
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={() => finish(true)}
            data-cy={review.paste ? 'confirm-node-paste' : 'run-reviewed-app'}
          >
            {review.paste ? 'Paste nodes' : 'Run app'}
          </Button>
        )}
      </DialogActions>
    </>
  );
  if (!review.paste && !dashboardVisible) {
    return (
      <ThemeProvider theme={customTheme}>
        <Paper
          ref={setPanelElement}
          role="dialog"
          aria-modal={false}
          aria-labelledby="app-risk-title"
          data-cy="app-risk-dialog"
          elevation={0}
          sx={{
            bgcolor: getDrawerBackground().hex(),
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
            // a pending run gets the accent, browsing risks later does not
            ...(!review.inspectionOnly && {
              borderTop: 3,
              borderTopColor: access.color,
            }),
            '& .MuiDialogTitle-root': { px: 2, py: 1 },
            '& .MuiDialogContent-root': { px: 2 },
          }}
        >
          {content}
        </Paper>
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider theme={customTheme}>
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
            bgcolor: getDrawerBackground().hex(),
            backgroundImage: 'none',
            m: { xs: 2, sm: 4 },
            width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
          },
        }}
      >
        {content}
      </Dialog>
    </ThemeProvider>
  );
}
