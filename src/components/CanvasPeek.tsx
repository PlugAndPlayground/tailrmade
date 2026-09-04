import React, { useEffect, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { BOTTOM_BAR_HEIGHT } from './BottomBar';
import { getDrawerBackground } from '../utils/constants';

// Reading a node on the phone canvas.
//
// Exploring the graph is in scope there and editing is not, but READING a
// node's current values sits between the two - and it is the difference
// between a canvas you can navigate and one you can understand. So a tap
// selects a node and shows what it is and what it currently holds, with
// nothing editable anywhere in it.
//
// It is deliberately not the inspector. The inspector is a place you go to
// change things, and everything in it assumes you can.

const MAX_ROWS = 8;

type PeekRow = { name: string; value: string };

const summarise = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'string') {
    return value.length > 60 ? `${value.slice(0, 60)}…` : value || '""';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 60 ? `${json.slice(0, 60)}…` : json;
  } catch {
    return typeof value;
  }
};

const readRows = (node: PPNode): PeekRow[] => {
  const sockets = [...node.inputSocketArray, ...node.outputSocketArray].filter(
    (socket) => socket.visible,
  );
  return sockets.slice(0, MAX_ROWS).map((socket) => ({
    name: socket.name,
    value: summarise(socket.data),
  }));
};

export const CanvasPeek: React.FC = () => {
  const [node, setNode] = useState<PPNode | undefined>(undefined);
  // the values behind a socket change as the graph runs, and a panel that
  // showed the numbers from the moment you tapped would be quietly wrong
  const [, setTick] = useState(0);

  useEffect(() => {
    const selectionId = InterfaceController.addListener(
      ListenEvent.SelectionChanged,
      (selected: PPNode[]) =>
        setNode(selected.length === 1 ? selected[0] : undefined),
    );
    return () => InterfaceController.removeListener(selectionId);
  }, []);

  useEffect(() => {
    if (!node) {
      return;
    }
    const interval = setInterval(() => setTick((count) => count + 1), 500);
    return () => clearInterval(interval);
  }, [node]);

  if (!node || node.destroyed) {
    return null;
  }

  const rows = readRows(node);

  return (
    <Box
      data-cy="canvas-peek"
      sx={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: `calc(${BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`,
        zIndex: 30,
        maxHeight: '42dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '12px',
        background: getDrawerBackground().toString(),
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5)',
        pointerEvents: 'auto',
        color: 'rgba(255,255,255,0.9)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          flexShrink: 0,
        }}
      >
        <Typography
          data-cy="canvas-peek-name"
          sx={{
            fontSize: '14px',
            fontWeight: 600,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.nodeName}
        </Typography>
        <IconButton
          data-cy="canvas-peek-close"
          aria-label="Close"
          onClick={() => PPGraph.currentGraph.selection.selectNodes([], false)}
          sx={{ color: 'inherit', width: 44, height: 44 }}
        >
          <CloseIcon sx={{ fontSize: '20px' }} />
        </IconButton>
      </Box>

      <Box sx={{ overflowY: 'auto', px: 1.5, pb: 1, minHeight: 0 }}>
        {rows.length === 0 ? (
          <Typography sx={{ fontSize: '13px', opacity: 0.7, pb: 1 }}>
            This node has no visible values.
          </Typography>
        ) : (
          rows.map((row) => (
            <Box
              key={row.name}
              data-cy="canvas-peek-row"
              sx={{
                display: 'flex',
                gap: 1.5,
                py: 0.6,
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Typography
                sx={{ fontSize: '12px', opacity: 0.65, flex: '0 0 40%' }}
              >
                {row.name}
              </Typography>
              <Typography
                sx={{
                  fontSize: '12px',
                  fontFamily: 'Roboto Mono, monospace',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.value}
              </Typography>
            </Box>
          ))
        )}
      </Box>

      {/* the reference the phone owes the reader: this is where it stops, and
          where it carries on */}
      <Box
        data-cy="canvas-peek-desktop-hint"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          py: 1,
          flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.12)',
          fontSize: '12px',
          opacity: 0.7,
        }}
      >
        <OpenInNewIcon sx={{ fontSize: '14px' }} />
        <Typography sx={{ fontSize: '12px' }}>
          Open on a desktop to edit — or ask the AI assistant
        </Typography>
      </Box>
    </Box>
  );
};

export default CanvasPeek;
