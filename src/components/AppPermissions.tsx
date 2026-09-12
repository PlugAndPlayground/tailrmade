import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import PauseIcon from '@mui/icons-material/Pause';
import PPGraph from '../classes/GraphClass';
import PPStorage from '../PPStorage';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { ensureVisible } from '../pixi/utils-pixi';
import { isPhone } from '../utils/utils';
import { VISIBILITY_ACTION } from '../utils/constants_shared';
import {
  AppPermissionsContext,
  PermissionBand,
  PermissionItem,
  countOff,
  describeSource,
  getDefaultTicked,
  getGrantsFromTicked,
  getPromptKind,
  getTickedFromGrants,
} from '../utils/appPermissions';

const BANDS: { band: PermissionBand; label: string }[] = [
  { band: 'needsOk', label: 'Needs your OK' },
  { band: 'connects', label: 'Connects to' },
  { band: 'blocked', label: 'Already blocked' },
];

const showNodes = (nodeIds: string[]) => {
  const nodes = nodeIds
    .map((id) => PPGraph.currentGraph.nodes[id])
    .filter(Boolean);
  InterfaceController.toggleAppView(VISIBILITY_ACTION.CLOSE);
  PPGraph.currentGraph.selection.selectNodes(nodes);
  void ensureVisible(nodes);
};

const PermissionRow = ({
  item,
  ticked,
  onToggle,
  onShowNodes,
}: {
  item: PermissionItem;
  ticked: boolean;
  onToggle: () => void;
  onShowNodes: () => void;
}) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', py: 0.5 }}>
    {item.band === 'blocked' ? (
      <BlockIcon fontSize="small" sx={{ m: '9px', color: 'text.secondary' }} />
    ) : (
      <Checkbox
        size="small"
        checked={ticked}
        onChange={onToggle}
        data-cy={`appPermission-${item.id}`}
        slotProps={{ input: { 'aria-label': item.title } }}
      />
    )}
    <Box sx={{ flex: 1, pt: 1, minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.title}
      </Typography>
      {item.details.map((detail) => (
        <Typography
          key={detail}
          variant="body2"
          color="text.secondary"
          sx={{ overflowWrap: 'anywhere' }}
        >
          {detail}
        </Typography>
      ))}
    </Box>
    <Button
      size="small"
      color="secondary"
      onClick={onShowNodes}
      sx={{ flex: 'none', mt: 0.5 }}
    >
      {item.nodeIds.length === 1 ? 'Show node' : 'Show nodes'}
    </Button>
  </Stack>
);

const PermissionsSheet = ({
  context,
  ticked,
  paused,
  onToggle,
  onClose,
  onRun,
}: {
  context: AppPermissionsContext;
  ticked: ReadonlySet<string>;
  paused: boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
  onRun: () => void;
}) => {
  const offCount = countOff(context.items, ticked);
  return (
    <Box
      data-cy="appPermissionsSheet"
      sx={{ p: 3, maxHeight: '85vh', overflowY: 'auto' }}
    >
      <Typography variant="h6">{context.appName}</Typography>
      <Typography variant="body2" color="text.secondary">
        {describeSource(context.source)}
      </Typography>
      <Typography sx={{ mt: 2 }}>
        {paused
          ? "This app is paused. Here's what it does when it runs."
          : "Here's what this app can do."}
      </Typography>
      {BANDS.map(({ band, label }) => {
        const bandItems = context.items.filter((item) => item.band === band);
        if (bandItems.length === 0) return null;
        return (
          <Box key={band} sx={{ mt: 2 }}>
            <Typography
              variant="overline"
              sx={{
                color: band === 'needsOk' ? 'error.main' : 'text.secondary',
              }}
            >
              {band === 'needsOk' ? `${label} · ${bandItems.length}` : label}
            </Typography>
            {bandItems.map((item) => (
              <PermissionRow
                key={item.id}
                item={item}
                ticked={ticked.has(item.id)}
                onToggle={() => onToggle(item.id)}
                onShowNodes={() => {
                  onClose();
                  showNodes(item.nodeIds);
                }}
              />
            ))}
          </Box>
        );
      })}
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: 'flex-end', alignItems: 'flex-start', mt: 3 }}
      >
        <Button color="secondary" onClick={onClose}>
          {paused ? 'Stay paused' : 'Close'}
        </Button>
        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="contained"
            onClick={onRun}
            data-cy="appPermissionsRunButton"
          >
            Run
          </Button>
          {offCount > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              {offCount === 1
                ? '1 thing stays off'
                : `${offCount} things stay off`}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

// The sheet, slim bar and badge are drawn by the app itself, above every
// dashboard and HTML surface, so nothing inside an app can fake or cover them
const AppPermissions = () => {
  const [context, setContext] = useState<AppPermissionsContext>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.AppPermissionsChanged,
      (next?: AppPermissionsContext) => {
        const { paused, grants } = PPGraph.currentGraph;
        setContext(next);
        setTicked(
          next === undefined
            ? new Set()
            : paused
              ? getDefaultTicked(next.items)
              : getTickedFromGrants(next.items, grants),
        );
        setSheetOpen(
          next !== undefined && paused && getPromptKind(next.items) === 'sheet',
        );
      },
    );
    return () => InterfaceController.removeListener(listenerId);
  }, []);

  if (context === undefined) return null;

  const { paused, grants } = PPGraph.currentGraph;
  const offCount = countOff(context.items, ticked);
  const connects = context.items.filter((item) => item.band === 'connects');

  const run = () =>
    void PPStorage.getInstance().runImportedApp(
      context,
      getGrantsFromTicked(context.manifest, ticked),
    );
  const closeSheet = () => {
    setSheetOpen(false);
    if (!paused) setTicked(getTickedFromGrants(context.items, grants));
  };
  const toggle = (id: string) =>
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  let chrome: React.ReactNode = null;
  if (paused && getPromptKind(context.items) === 'bar') {
    chrome = (
      <>
        <PauseIcon fontSize="small" />
        <Typography variant="body2" noWrap>
          {[
            'Paused',
            ...connects.map((item) =>
              item.id === 'hosts'
                ? `Connects to ${item.details[0]}`
                : item.title,
            ),
          ].join(' · ')}
        </Typography>
        <Button
          size="small"
          color="secondary"
          onClick={() => setSheetOpen(true)}
        >
          Details
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={run}
          data-cy="appPermissionsRunButton"
        >
          Run
        </Button>
      </>
    );
  } else if (
    paused ||
    offCount > 0 ||
    context.items.some((item) => item.band === 'blocked')
  ) {
    chrome = (
      <Button
        size="small"
        color="secondary"
        onClick={() => setSheetOpen(true)}
        data-cy="appPermissionsBadge"
      >
        {paused
          ? 'Paused ▾'
          : `Running with limits${offCount > 0 ? ` (${offCount} off)` : ''} ▾`}
      </Button>
    );
  }

  const sheet = (
    <PermissionsSheet
      context={context}
      ticked={ticked}
      paused={paused}
      onToggle={toggle}
      onClose={closeSheet}
      onRun={run}
    />
  );

  return (
    <>
      {chrome && !sheetOpen && (
        <Stack
          direction="row"
          spacing={1}
          data-cy="appPermissionsChrome"
          sx={{
            alignItems: 'center',
            position: 'fixed',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: (theme) => theme.zIndex.modal - 1,
            maxWidth: 'calc(100vw - 32px)',
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            bgcolor: 'background.paper',
            boxShadow: 3,
          }}
        >
          {chrome}
        </Stack>
      )}
      {isPhone() ? (
        <Drawer anchor="bottom" open={sheetOpen} onClose={closeSheet}>
          {sheet}
        </Drawer>
      ) : (
        <Dialog open={sheetOpen} onClose={closeSheet} fullWidth maxWidth="sm">
          {sheet}
        </Dialog>
      )}
    </>
  );
};

export default AppPermissions;
