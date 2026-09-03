import React, { useCallback, useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import {
  Box,
  ClickAwayListener,
  Divider,
  IconButton,
  Paper,
  ThemeProvider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PPGraph from '../classes/GraphClass';
import PPNode, { STATUS_BADGE_CONTAINER_NAME } from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { customTheme } from '../utils/constants';
import { getObjectAtPoint } from '../utils/utils';
import { CopyStatusButton, StatusDetail } from './StatusDetail';

const POPOVER_WIDTH = 380;
const MARGIN = 8;

// where a click away landed, mouse, pen and touch alike
const eventPoint = (event: any): PIXI.Point | undefined => {
  const source =
    typeof event?.clientX === 'number'
      ? event
      : (event?.touches?.[0] ?? event?.changedTouches?.[0]);
  return typeof source?.clientX === 'number'
    ? new PIXI.Point(source.clientX, source.clientY)
    : undefined;
};

// A badge opens this popover from the canvas, and the same press reaches the
// click away listener straight after - closing what the badge just opened. That
// is what made moving from one badge to another take two clicks: the first one
// opened the second badge's message and immediately closed it again. Clicks on
// a badge are left to the badge, which toggles; everything else closes.
const isOnStatusBadge = (event: any): boolean => {
  const point = eventPoint(event);
  if (!point || !PPGraph.currentGraph) {
    return false;
  }
  let target: PIXI.Container | undefined = getObjectAtPoint(point);
  while (target) {
    if (target.name === STATUS_BADGE_CONTAINER_NAME) {
      return true;
    }
    target = target.parent;
  }
  return false;
};

type PopoverKind = 'status' | 'comment';

type PopoverState = {
  node: PPNode;
  kind: PopoverKind;
  x: number;
  y: number;
};

/**
 * A node's warnings and errors, or its comment, on the html layer.
 *
 * There is exactly one of these for the whole app, mounted once and hidden when
 * nothing is open - the cost does not grow with the number of nodes carrying
 * something to say, which is what a per node html overlay would have done. The
 * canvas only ever draws the bounded badge that opens this.
 *
 * It is pinned where it opened rather than tracking the node: text that moves
 * while the viewport pans cannot be selected, and selecting the text is the
 * entire point of moving it off the canvas. It is also the reason the comment
 * no longer draws as a pixi bubble - that text scaled away as you zoomed out,
 * sat under any hybrid node it overlapped, and could not be copied.
 */
export const NodeDetailPopover: React.FC = () => {
  const [state, setState] = useState<PopoverState | undefined>(undefined);

  const close = useCallback(() => setState(undefined), []);

  useEffect(() => {
    const ids: string[] = [];

    ids.push(
      InterfaceController.addListener(
        ListenEvent.NodeDetailPopoverRequested,
        (data) => {
          if (!data) {
            close();
            return;
          }
          const node = PPGraph.currentGraph?.nodes[data.nodeId];
          if (!node) {
            close();
            return;
          }
          // clicking the badge that is already open closes it again
          setState((current) =>
            current?.node === node && current.kind === data.kind
              ? undefined
              : { node, kind: data.kind, x: data.x, y: data.y },
          );
        },
      ),
    );

    // a status that clears while its message is on screen should not leave a
    // stale message behind
    ids.push(
      InterfaceController.addListener(ListenEvent.NodeStatusChanged, (data) => {
        setState((current) => {
          if (
            !current ||
            current.kind !== 'status' ||
            current.node.id !== data?.nodeId
          ) {
            return current;
          }
          return current.node.getWarningsAndErrors().length
            ? current
            : undefined;
        });
      }),
    );

    // the node itself can go away underneath the popover
    ids.push(
      InterfaceController.addListener(ListenEvent.GraphChanged, () => close()),
    );
    ids.push(
      InterfaceController.addListener(ListenEvent.EscapeKeyUsed, () => close()),
    );

    return () => InterfaceController.removeListeners(ids);
  }, [close]);

  if (!state || state.node.destroyed) {
    return null;
  }

  const statuses =
    state.kind === 'status' ? state.node.getWarningsAndErrors() : [];
  const comment = state.kind === 'comment' ? state.node.comment : undefined;
  if (state.kind === 'status' ? !statuses.length : !comment) {
    return null;
  }

  const copyText =
    state.kind === 'comment'
      ? comment
      : statuses
          .map((status) => `${status.getName()}: ${status.message}`)
          .join('\n\n');

  return (
    <ThemeProvider theme={customTheme}>
      <ClickAwayListener
        onClickAway={(event) => {
          if (!isOnStatusBadge(event)) {
            close();
          }
        }}
        mouseEvent="onMouseDown"
        touchEvent="onTouchStart"
      >
        <Paper
          id="node-detail-popover"
          data-cy="node-detail-popover"
          elevation={8}
          sx={{
            position: 'absolute',
            zIndex: 5,
            width: POPOVER_WIDTH,
            maxHeight: '50vh',
            overflowY: 'auto',
            p: 1,
            borderRadius: 1,
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
            // kept on screen whichever corner of the canvas the node sits in
            left: Math.max(
              MARGIN,
              Math.min(
                window.innerWidth - POPOVER_WIDTH - MARGIN,
                state.x + 12,
              ),
            ),
            top: Math.max(
              MARGIN,
              Math.min(window.innerHeight - 120, state.y + 12),
            ),
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              pl: 0.5,
            }}
          >
            <Box
              sx={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: '13px',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {state.kind === 'comment'
                ? `Comment on ${state.node.nodeName}`
                : state.node.nodeName}
            </Box>
            {(statuses.length > 1) && (
              <CopyStatusButton
                text={copyText}
                title={
                  state.kind === 'comment'
                    ? 'Copy comment'
                    : 'Copy all messages'
                }
              />
            )}
          </Box>
          <Divider sx={{ my: 0.5 }} />
          {state.kind === 'comment' ? (
            <Box
              data-cy="node-comment-body"
              sx={{
                px: 0.5,
                py: 0.5,
                fontSize: '13px',
                // the comment is the whole point of this popover - it has to be
                // selectable, and its newlines have to survive
                userSelect: 'text',
                cursor: 'text',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {comment}
            </Box>
          ) : (
            statuses.map((status, index) => (
              <StatusDetail key={`${status.id}-${index}`} status={status} />
            ))
          )}
        </Paper>
      </ClickAwayListener>
    </ThemeProvider>
  );
};
