import React, { useCallback, useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import { ClickAwayListener, Paper, ThemeProvider } from '@mui/material';
import { Sketch } from '@uiw/react-color';
import PPGraph from '../classes/GraphClass';
import { GROUP_COLORS } from '../classes/groups/GroupClass';
import { updateGroup } from '../classes/groups/groupActions';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { customTheme } from '../utils/constants';

const PICKER_WIDTH = 240;
const MARGIN = 8;

type PickerState = {
  groupId: string;
  x: number;
  y: number;
};

// The icon toggles the picker itself, so pressing it must not also count as
// clicking away
const isOnColorIcon = (event: MouseEvent | TouchEvent): boolean => {
  const source = 'touches' in event ? event.changedTouches[0] : event;
  const point = PPGraph.currentGraph.viewport.toWorld(
    new PIXI.Point(source.clientX, source.clientY),
  );
  return PPGraph.currentGraph.groupLayer.groups.some((group) =>
    group.isOnColorIcon(point.x, point.y),
  );
};

export const GroupColorPicker: React.FC = () => {
  const [state, setState] = useState<PickerState | undefined>(undefined);

  const close = useCallback(() => setState(undefined), []);

  useEffect(() => {
    const ids = [
      InterfaceController.addListener(
        ListenEvent.GroupColorPickerRequested,
        (data: PickerState) =>
          setState((current) =>
            current?.groupId === data.groupId ? undefined : data,
          ),
      ),
      InterfaceController.addListener(ListenEvent.GraphChanged, close),
      InterfaceController.addListener(ListenEvent.EscapeKeyUsed, close),
    ];
    return () => InterfaceController.removeListeners(ids);
  }, [close]);

  const group =
    state && PPGraph.currentGraph.groupLayer.getGroup(state.groupId);
  if (!group) {
    return null;
  }

  return (
    <ThemeProvider theme={customTheme}>
      <ClickAwayListener
        onClickAway={(event) => {
          if (!isOnColorIcon(event)) {
            close();
          }
        }}
        mouseEvent="onMouseDown"
        touchEvent="onTouchStart"
      >
        <Paper
          id="group-color-picker"
          elevation={8}
          sx={{
            position: 'absolute',
            zIndex: 5,
            touchAction: 'none',
            // below the icon, right-aligned with it like the header's end
            left: Math.max(
              MARGIN,
              Math.min(
                window.innerWidth - PICKER_WIDTH - MARGIN,
                state.x - PICKER_WIDTH + 16,
              ),
            ),
            top: Math.max(
              MARGIN,
              Math.min(window.innerHeight - 320, state.y + 16),
            ),
          }}
        >
          <Sketch
            color={group.color}
            presetColors={GROUP_COLORS}
            disableAlpha
            onChange={(color) =>
              void updateGroup(group.id, { color: color.hex })
            }
          />
        </Paper>
      </ClickAwayListener>
    </ThemeProvider>
  );
};
