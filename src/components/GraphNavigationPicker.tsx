import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Divider, Paper, ThemeProvider } from '@mui/material';
import PPGraph from '../classes/GraphClass';
import type PPNode from '../classes/NodeClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { customTheme } from '../utils/constants';
import type Socket from '../classes/SocketClass';
import {
  getSocketTargets,
  jumpToNode,
  type NavigationPickerRequest,
  type NavigationTarget,
} from '../utils/graphNavigation';

const PICKER_WIDTH = 280;
const MARGIN = 8;
const MODIFIER_KEYS = ['Alt', 'Shift', 'Control', 'Meta'];

const highlightNode = (node: PPNode | undefined) => {
  const selection = PPGraph.currentGraph.selection;
  if (node) {
    selection.drawSingleFocus(node);
  } else {
    selection.clearFocus();
  }
};

type NavigationTargetListProps = {
  targets: NavigationTarget[];
  onPick: (node: PPNode) => void;
  activeIndex?: number;
  showNumbers?: boolean;
};

export const NavigationTargetList: React.FunctionComponent<
  NavigationTargetListProps
> = (props) => (
  <Box role="listbox">
    {props.targets.map((target, index) => (
      <Box
        key={target.node.id}
        role="option"
        aria-selected={index === props.activeIndex}
        data-cy={`navigation-target-${target.node.id}`}
        onClick={() => {
          highlightNode(undefined);
          props.onPick(target.node);
        }}
        onMouseEnter={() => highlightNode(target.node)}
        onMouseLeave={() => highlightNode(undefined)}
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          px: 0.5,
          py: 0.25,
          fontSize: '12px',
          cursor: 'pointer',
          bgcolor: index === props.activeIndex ? 'action.selected' : undefined,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {props.showNumbers && index < 9 && (
          <Box sx={{ color: 'text.secondary', minWidth: '1ch' }}>
            {index + 1}
          </Box>
        )}
        <Box
          sx={{
            flexShrink: 0,
            maxWidth: '55%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {target.node.nodeName}
        </Box>
        <Box
          sx={{
            color: 'text.secondary',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {target.detail}
        </Box>
      </Box>
    ))}
  </Box>
);

// the socket inspector's links to the other end of each wire
export const SocketConnections: React.FunctionComponent<{
  socket: Socket;
}> = ({ socket }) => {
  const targets = getSocketTargets(socket);
  if (!targets.length) {
    return null;
  }
  return (
    <Box data-cy="socket-connections" sx={{ mt: 1 }}>
      <Box sx={{ px: 0.5, fontSize: '11px', color: 'text.secondary' }}>
        {socket.isInput() ? 'From' : 'To'}
      </Box>
      <NavigationTargetList
        targets={targets}
        onPick={(node) => {
          InterfaceController.notifyListeners(
            ListenEvent.ToggleTooltipInspector,
            { open: false },
          );
          jumpToNode(node);
        }}
      />
    </Box>
  );
};

export const GraphNavigationPicker: React.FC = () => {
  const [request, setRequest] = useState<NavigationPickerRequest>();
  const [activeIndex, setActiveIndex] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    highlightNode(undefined);
    setRequest(undefined);
  }, []);

  useEffect(() => {
    const ids = [
      InterfaceController.addListener(
        ListenEvent.GraphNavigationPickerRequested,
        (data: NavigationPickerRequest) => {
          setActiveIndex(0);
          setRequest(data);
          highlightNode(data.targets[0].node);
        },
      ),
      InterfaceController.addListener(ListenEvent.GraphChanged, close),
    ];
    return () => InterfaceController.removeListeners(ids);
  }, [close]);

  useEffect(() => {
    if (!request) {
      return;
    }
    const pick = (index: number) => {
      close();
      request.onPick(request.targets[index].node);
    };
    const move = (step: number) => {
      const next =
        (activeIndex + step + request.targets.length) % request.targets.length;
      setActiveIndex(next);
      highlightNode(request.targets[next].node);
    };
    // runs before the graph's own shortcuts, which would act on the selection
    const onKeyDown = (event: KeyboardEvent) => {
      const number = Number(event.key);
      if (number >= 1 && number <= Math.min(9, request.targets.length)) {
        pick(number - 1);
      } else if (event.key === 'Enter') {
        pick(activeIndex);
      } else if (event.key === 'Escape') {
        close();
      } else if (MODIFIER_KEYS.includes(event.key)) {
        return;
      } else if (event.key === 'ArrowUp') {
        move(-1);
      } else if (
        event.key === 'ArrowDown' ||
        (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.code))
      ) {
        move(1);
      } else {
        // any other key closes the picker and keeps its usual meaning
        close();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    // the canvas cancels mouse events, so a click-away listener misses it
    const onPointerDown = (event: PointerEvent) => {
      if (!paperRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [request, activeIndex, close]);

  if (!request) {
    return null;
  }

  return (
    <ThemeProvider theme={customTheme}>
      <Paper
        ref={paperRef}
        data-cy="graph-navigation-picker"
        elevation={8}
        sx={{
          position: 'absolute',
          // above the docked panels, like the context menus
          zIndex: 1230,
          width: PICKER_WIDTH,
          maxHeight: '50vh',
          overflowY: 'auto',
          p: 0.5,
          borderRadius: 1,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
          left: Math.max(
            MARGIN,
            Math.min(
              window.innerWidth - PICKER_WIDTH - MARGIN,
              request.opensTo === 'left'
                ? request.x - PICKER_WIDTH - MARGIN
                : request.x + MARGIN,
            ),
          ),
          top: Math.max(MARGIN, Math.min(window.innerHeight - 120, request.y)),
        }}
      >
        <Box sx={{ px: 0.5, fontSize: '12px', fontWeight: 600 }}>
          {request.title}
        </Box>
        <Divider sx={{ my: 0.5 }} />
        <NavigationTargetList
          targets={request.targets}
          activeIndex={activeIndex}
          showNumbers
          onPick={(node) => {
            close();
            request.onPick(node);
          }}
        />
      </Paper>
    </ThemeProvider>
  );
};
