import React, { useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Paper, ThemeProvider, ClickAwayListener } from '@mui/material';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { getObjectAtPoint, useStateRef } from '../utils/utils';
import { TOOLTIP_WIDTH, customTheme } from '../utils/constants';

export abstract class Tooltipable {
  getTooltipContent(props): React.ReactElement {
    return <></>;
  }

  getTooltipPosition(): PIXI.Point {
    return new PIXI.Point(0, 0);
  }
}

function getClassWithTooltipContent(object): Tooltipable | undefined {
  if (object === undefined) {
    return;
  } else if (typeof object?.getTooltipContent === 'function') {
    return object;
  }
  // If not found, get parent object and check again
  const parent = object?.parent;
  if (!parent) {
    return;
  }
  return getClassWithTooltipContent(parent);
}

function Content(props): React.ReactElement {
  const object: Tooltipable = props.object;
  if (object) {
    return object.getTooltipContent({ selectedNode: object.node });
  }
  return <></>;
}

export const Tooltip = (props) => {
  const [tooltipObject, setTooltipObject, tooltipRef] = useStateRef();
  const [pos, setPos] = useState<PIXI.Point>(new PIXI.Point(0, 0));
  const [showTooltip, setShowTooltip] = useState(false);

  const getPosition = (object: Tooltipable, event): PIXI.Point => {
    if (object) {
      return object.getTooltipPosition();
    }
    return new PIXI.Point(event.clientX + 16, event.clientY - 8);
  };

  const tooltipInspectorToggled = ({ event, open }) => {
    const toggleInputValue = (open) => (prev) => open ?? !prev;

    if (open === false) {
      setShowTooltip(false);
    } else {
      const object = getClassWithTooltipContent(
        getObjectAtPoint(new PIXI.Point(event.clientX, event.clientY)),
      );
      if (object) {
        if (object === tooltipRef.current) {
          setShowTooltip(toggleInputValue(open));
        } else {
          setShowTooltip(true);
        }
        setPos(getPosition(object, event));
        setTooltipObject(object);
      }
    }
  };

  useEffect(() => {
    const id = InterfaceController.addListener(
      ListenEvent.ToggleTooltipInspector,
      tooltipInspectorToggled,
    );

    return () => InterfaceController.removeListener(id);
  }, []);

  return (
    <ThemeProvider theme={customTheme}>
      <div style={{ position: 'absolute', zIndex: 1120 }}>
        <ClickAwayListener
          onClickAway={() => {
            if (showTooltip && !props.isContextMenuOpen) {
              setShowTooltip(false);
            }
          }}
          mouseEvent="onMouseDown"
          touchEvent="onTouchStart"
        >
          <Paper
            id="tooltip-container"
            elevation={8}
            sx={{
              position: 'absolute',
              p: 1,
              width: TOOLTIP_WIDTH,
              left: Math.min(window.innerWidth - TOOLTIP_WIDTH, pos.x),
              top: pos.y,
              transition: 'opacity 0.1s ease-out',
              visibility:
                showTooltip && !props.isContextMenuOpen ? 'visible' : 'hidden',
              opacity: showTooltip && !props.isContextMenuOpen ? 1 : 0,
              // This ensures click events work only when tooltip is visible
              pointerEvents:
                showTooltip && !props.isContextMenuOpen ? 'auto' : 'none',
            }}
          >
            {tooltipObject && <Content object={tooltipObject} />}
          </Paper>
        </ClickAwayListener>
      </div>
    </ThemeProvider>
  );
};
