import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
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
  Paper,
  Tab,
  Tabs,
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
import EditNoteIcon from '@mui/icons-material/EditNote';
import VerifiedIcon from '@mui/icons-material/Verified';
import {
  AppRisk,
  NodeRisk,
  RiskSeverity,
  collectAppRisks,
  requiresAppRiskReview,
} from '../classes/NodeRisk';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import { TRgba } from '../utils/color';
import { createStore } from './createStore';
import { NodeRow } from './NodeRow';
import { TagChip } from './TagChip';
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
  'storage-read': StorageIcon,
  'storage-write': EditNoteIcon,
  'ai-usage': AutoAwesomeIcon,
};

type AccessStyle = {
  color: string;
  score: number;
  label: string;
  description: string;
};

const severityStyles: Record<RiskSeverity, AccessStyle> = {
  critical: {
    color: '#e4c28c',
    score: 3,
    label: 'Broad access',
    description: 'Can do anything you can do in this tab',
  },
  warning: {
    color: '#d5cfbd',
    score: 2,
    label: 'Limited access',
    description: 'Uses specific services, keys or data',
  },
  info: {
    color: '#a9dfff',
    score: 1,
    label: 'Minimal access',
    description: 'Loads content from other sites',
  },
};

const noAccess: AccessStyle = {
  color: '#9e9e9e',
  score: 0,
  label: 'No special access',
  description: "Doesn't use keys, saved data or other sites",
};

// Three bars instead of "n/3", which read like a test score where 3/3 is best.
function AccessBars({
  level,
  color = level.color,
  height = 10,
}: {
  level: AccessStyle;
  color?: string;
  height?: number;
}): React.ReactElement {
  return (
    <Box
      component="span"
      aria-hidden
      data-access-level={level.score}
      sx={{ display: 'inline-flex', gap: '2px', flexShrink: 0 }}
    >
      {[1, 2, 3].map((bar) => (
        <Box
          key={bar}
          component="span"
          sx={{
            width: height * 0.4,
            height,
            borderRadius: '1px',
            bgcolor: color,
            opacity: bar <= level.score ? 1 : 0.3,
          }}
        />
      ))}
    </Box>
  );
}

function AccessLevel({
  level,
  variant = 'caption',
}: {
  level: AccessStyle;
  variant?: 'caption' | 'subtitle2' | 'h6';
}): React.ReactElement {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
    >
      <AccessBars level={level} height={variant === 'h6' ? 16 : 10} />
      <Typography
        variant={variant}
        sx={{ color: level.color, lineHeight: 1.3 }}
      >
        {level.label}
      </Typography>
    </Box>
  );
}

function AccessChip({ level }: { level: AccessStyle }): React.ReactElement {
  return (
    <TagChip
      label={level.label}
      color={level.color}
      data-cy="node-access-level"
      // Chip styles its icon through a class it clones in, so the bars need
      // an element that takes className
      icon={
        <Box component="span">
          <AccessBars
            level={level}
            color={TRgba.fromString(level.color).getContrastTextColor().hex()}
            height={8}
          />
        </Box>
      }
      sx={{
        '& .MuiChip-icon': { display: 'inline-flex', ml: '8px', mr: '-2px' },
      }}
    />
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

function highestAccess(risks: NodeRisk[]): AccessStyle {
  return risks.reduce(
    (highest, risk) =>
      severityStyles[risk.severity].score > highest.score
        ? severityStyles[risk.severity]
        : highest,
    noAccess,
  );
}

const requiredAccess = (risks: AppRisk[]): AccessStyle =>
  highestAccess(risks.map(({ risk }) => risk));

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
      <Box sx={{ px: 2, py: 1, color: 'text.primary' }}>Access</Box>
      <Box sx={{ p: 2, bgcolor: 'background.default' }}>
        <Box
          data-cy="required-access-score"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <AccessLevel level={access} variant="subtitle2" />
          {nodeCount > 0 && (
            <Typography variant="caption" color="text.secondary">
              {`${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} to review`}
            </Typography>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {access.description}
        </Typography>
        <Box data-cy="app-risk-source" sx={{ mt: 1 }}>
          <AppSource />
        </Box>
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

type ReviewNode = { id: string; name: string; risks: NodeRisk[] };

// The app-wide verdict at the top of the review: how much access the app
// needs and how its nodes spread over the levels.
function AccessOverview({
  nodes,
  onInspectAll,
}: {
  nodes: ReviewNode[];
  onInspectAll: () => void;
}): React.ReactElement {
  const levels = nodes.map((node) => highestAccess(node.risks));
  const access = highestAccess(nodes.flatMap((node) => node.risks));
  return (
    <Box
      data-cy="required-access-score"
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        borderLeft: 3,
        borderColor: access.color,
      }}
    >
      <Typography variant="overline" color="text.secondary">
        Required access
      </Typography>
      <Box>
        <AccessLevel level={access} variant="h6" />
      </Box>
      <Typography variant="body2" color="text.secondary">
        {access.description}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mt: 1,
          pt: 1,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {Object.values(severityStyles).map((level) => {
            const count = levels.filter((item) => item === level).length;
            return (
              count > 0 && (
                <Box
                  key={level.label}
                  title={`${count} ${count === 1 ? 'node needs' : 'nodes need'} ${level.label.toLowerCase()}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <AccessBars level={level} />
                  <Typography variant="caption">{count}</Typography>
                </Box>
              )
            );
          })}
        </Box>
        {nodes.length > 0 && (
          <Button
            size="small"
            color="inherit"
            startIcon={<MyLocationIcon />}
            data-cy="inspect-all-risk-nodes"
            onClick={onInspectAll}
          >
            Inspect all {nodes.length}
          </Button>
        )}
      </Box>
    </Box>
  );
}

type Capability = { risk: NodeRisk; destinations: AppRisk[] };

// One card per capability, so its description shows once even when many
// destinations need it.
function groupCapabilities(risks: AppRisk[]): Capability[] {
  const byKind = new Map<string, Capability>();
  for (const appRisk of risks) {
    const key = `${appRisk.risk.kind}|${appRisk.risk.severity}`;
    const entry = byKind.get(key) ?? { risk: appRisk.risk, destinations: [] };
    entry.destinations.push(appRisk);
    byKind.set(key, entry);
  }
  return [...byKind.values()];
}

// Nodes of one type share a row, so twenty HTML Renderers stay one line.
function NodeTypeRows({
  nodes,
  onInspect,
}: {
  nodes: AppRisk['nodes'];
  onInspect: (ids: string[]) => void;
}): React.ReactElement {
  const byType = new Map<string, PPNode[]>();
  for (const { id } of nodes) {
    const node = PPGraph.currentGraph.nodes[id];
    if (node) byType.set(node.type, [...(byType.get(node.type) ?? []), node]);
  }
  return (
    <List dense disablePadding>
      {[...byType.values()].map((typeNodes) => (
        <NodeRow
          key={typeNodes[0].type}
          node={typeNodes[0]}
          compact
          label={
            typeNodes.length === 1 ? typeNodes[0].name : typeNodes[0].getName()
          }
          title={typeNodes.map((node) => node.id).join('\n')}
          data-cy="risk-node-type"
          onClick={() => onInspect(typeNodes.map((node) => node.id))}
          tags={
            typeNodes.length > 1 && (
              <TagChip label={`${typeNodes.length} nodes`} />
            )
          }
        />
      ))}
    </List>
  );
}

function CapabilityGroup({
  risk,
  destinations,
  onInspect,
}: Capability & { onInspect: (ids: string[]) => void }): React.ReactElement {
  const level = severityStyles[risk.severity];
  const Icon = capabilityIcons[risk.kind] ?? InfoOutlinedIcon;
  const ids = [
    ...new Set(destinations.flatMap(({ nodes }) => nodes.map((n) => n.id))),
  ];
  return (
    <Box
      role="group"
      aria-label={risk.title}
      data-cy="risk-details"
      data-risk-kind={risk.kind}
      data-risk-severity={risk.severity}
      tabIndex={-1}
      sx={{
        outline: 'none',
        scrollMarginTop: 8,
        mb: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        borderLeft: 3,
        borderColor: level.color,
        overflowWrap: 'anywhere',
      }}
    >
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Icon sx={{ fontSize: 16, color: level.color }} />
            <AccessLevel level={level} />
          </Box>
          <Button
            size="small"
            color="inherit"
            startIcon={<MyLocationIcon />}
            data-cy="inspect-risk-group"
            onClick={() => onInspect(ids)}
          >
            Inspect {ids.length}
          </Button>
        </Box>
        <Typography sx={{ fontWeight: 600 }}>{risk.title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {risk.description}
        </Typography>
      </Box>
      <Box sx={{ px: 1, pb: 1 }}>
        {destinations.map(({ risk: destination, nodes }) => (
          <Box key={destination.id} data-cy="risk-destination">
            {destination.target && (
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, px: 0.5, pt: 1, pb: 0.5 }}
              >
                {destination.target}
              </Typography>
            )}
            <NodeTypeRows nodes={nodes} onInspect={onInspect} />
          </Box>
        ))}
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
  const [tab, setTab] = useState<'capabilities' | 'nodes'>('capabilities');
  const [inspection, setInspection] = useState<string[]>([]);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const stacked = useIsStackLayout();
  const nodes = useMemo(() => {
    const nodesById = new Map<string, ReviewNode>();
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
  const capabilities = useMemo(
    () =>
      groupCapabilities(review?.risks ?? []).map((group) => ({
        ...group,
        searchText: [
          group.risk.title,
          ...group.destinations.flatMap(({ risk, nodes }) => [
            risk.target ?? '',
            ...nodes.flatMap((node) => [
              node.name,
              node.id,
              PPGraph.currentGraph.nodes[node.id]?.getName() ?? '',
            ]),
          ]),
        ]
          .join(' ')
          .toLowerCase(),
      })),
    [review],
  );
  useEffect(() => {
    setSearch('');
    setTab('capabilities');
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
      // inspected nodes may have been deleted since
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
          {pending.name}: some nodes are paused until you review them
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
  const matchingCapabilities = capabilities.filter((group) =>
    group.searchText.includes(query),
  );
  const showCapability = (risk: NodeRisk): void => {
    // render the capabilities tab now so the card exists to scroll to
    flushSync(() => {
      setSearch('');
      setTab('capabilities');
    });
    const card = document.querySelector<HTMLElement>(
      `[data-cy="risk-details"][data-risk-kind="${risk.kind}"][data-risk-severity="${risk.severity}"]`,
    )!;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    card.focus({ preventScroll: true });
    card.animate(
      [
        { boxShadow: `0 0 0 2px ${severityStyles[risk.severity].color}` },
        { boxShadow: '0 0 0 2px transparent' },
      ],
      { duration: 1500, easing: 'ease-in' },
    );
  };
  const inspectNodes = (ids: string[]): void => {
    const targets = ids
      .map((id) => PPGraph.currentGraph.nodes[id])
      .filter(Boolean);
    if (!targets.length) return;
    InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
    InterfaceController.toggleShowDashboard(VISIBILITY_ACTION.CLOSE);
    setStackView('graph');
    InterfaceController.setRightDrawerView(RightDrawerView.GRAPH);
    PPGraph.currentGraph.selection.selectNodes(targets, false);
    setInspection(ids);
  };
  const content = (
    <>
      <DialogTitle component="div" sx={{ overflowWrap: 'anywhere' }}>
        {!review.paste && (
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: 'block', lineHeight: 1.5 }}
          >
            {review.inspectionOnly ? 'Risk review' : 'Review before running'}
          </Typography>
        )}
        <Typography id="app-risk-title" component="h2" variant="h6">
          {review.paste ? `Paste ${review.name}?` : review.name}
        </Typography>
        {!review.paste && (
          <Box data-cy="app-risk-source" sx={{ mt: 0.5 }}>
            <AppSource />
          </Box>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {review.paste ? (
          <Alert severity="info" role="note">
            Pasted nodes can run code, use your saved data and contact other
            sites. They may run right away if this app is running. Only paste
            from sources you trust.
          </Alert>
        ) : (
          <>
            <AccessOverview
              nodes={nodes}
              onInspectAll={() => inspectNodes(nodes.map((node) => node.id))}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              These capabilities are common in interactive apps. Check that they
              match what you expect from this app and its source.
              {review.risks.some(
                ({ risk }) => risk.kind === 'unrestricted-code',
              ) &&
                " Broad access can't be checked here, so only run this if you trust its source."}
            </Typography>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              variant="fullWidth"
              sx={{ mt: 1, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab
                value="capabilities"
                label={`Capabilities (${capabilities.length})`}
                data-cy="risk-capabilities-tab"
              />
              <Tab
                value="nodes"
                label={`Nodes (${nodes.length})`}
                data-cy="risk-nodes-tab"
              />
            </Tabs>
            <TextField
              fullWidth
              size="small"
              label="Find a node or capability"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ my: 1.5 }}
            />
            {tab === 'capabilities' ? (
              <>
                {matchingCapabilities.map((group) => (
                  <CapabilityGroup
                    key={group.risk.id}
                    risk={group.risk}
                    destinations={group.destinations}
                    onInspect={inspectNodes}
                  />
                ))}
                {!matchingCapabilities.length && (
                  <Typography variant="body2" color="text.secondary">
                    {capabilities.length
                      ? 'No matching capabilities'
                      : 'Nothing to review'}
                  </Typography>
                )}
              </>
            ) : (
              <List dense disablePadding>
                {matchingNodes.map((node) => {
                  const graphNode = PPGraph.currentGraph.nodes[node.id];
                  if (!graphNode) return null;
                  return (
                    <NodeRow
                      key={node.id}
                      node={graphNode}
                      aria-label={`Go to node ${node.name}`}
                      aria-describedby={`risk-capabilities-${node.id}`}
                      data-cy="go-to-risk-node"
                      data-node-id={node.id}
                      onClick={() => inspectNodes([node.id])}
                      tags={<AccessChip level={highestAccess(node.risks)} />}
                      subtitle={
                        <Box id={`risk-capabilities-${node.id}`}>
                          {node.risks.map((risk) => (
                            <Box
                              key={risk.id}
                              component="span"
                              role="link"
                              tabIndex={0}
                              title="Show this capability"
                              data-cy="node-capability"
                              data-risk-kind={risk.kind}
                              data-risk-severity={risk.severity}
                              // the row behind it inspects the node instead
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                showCapability(risk);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== 'Enter') return;
                                event.stopPropagation();
                                showCapability(risk);
                              }}
                              sx={{
                                display: 'block',
                                width: 'fit-content',
                                cursor: 'pointer',
                                textDecoration: 'underline dotted',
                                textUnderlineOffset: 3,
                                '&:hover, &:focus-visible': {
                                  opacity: 1,
                                  color: 'text.primary',
                                  textDecorationStyle: 'solid',
                                },
                              }}
                            >
                              {risk.title}
                              {risk.target && ` · ${risk.target}`}
                            </Box>
                          ))}
                        </Box>
                      }
                    />
                  );
                })}
                {!matchingNodes.length && (
                  <Typography variant="body2" color="text.secondary">
                    {nodes.length ? 'No matching nodes' : 'Nothing to review'}
                  </Typography>
                )}
              </List>
            )}
          </>
        )}
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
              borderTopColor: requiredAccess(review.risks).color,
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
