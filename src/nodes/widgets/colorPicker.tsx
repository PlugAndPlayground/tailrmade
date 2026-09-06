import React, { useRef, useState } from 'react';
import {
  Button,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  Typography,
} from '@mui/material';
import ColorizeIcon from '@mui/icons-material/Colorize';
import { Sketch } from '@uiw/react-color';
import throttle from 'lodash/throttle';
import Socket from '../../classes/SocketClass';
import {
  WidgetHybridBase,
  WidgetPaper,
  getMuiSize,
  getSizeSocket,
  initialValueName,
  getLabelSocket,
  getWidgetControlProps,
  labelName,
  outName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import { TRgba } from '../../utils/color';
import { WidgetContentProps } from '../../utils/interfaces';
import { PRESET_COLORS, MAIN_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { ColorType } from '../datatypes/colorType';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import { BackPropagation } from '../../interfaces';

const pickerDefaultName = 'Pick a color';

export class WidgetColorPicker extends WidgetHybridBase {
  public getName(): string {
    return 'Color picker';
  }

  public getDescription(): string {
    return 'Adds a color picker';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        initialValueName,
        new ColorType(),
        MAIN_COLOR,
        false,
      ),
      getLabelSocket(pickerDefaultName),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new ColorType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 104;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(initialValueName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    const newValue = inputObject[initialValueName];
    this.setInputData(initialValueName, newValue);
    this.setOutputData(outName, newValue);
  }

  handleOnChange = throttle(async (color) => {
    const id = this.id;
    const prev = this.getInputData(initialValueName);
    const pickedrgb = color.rgba;
    const newColor = new TRgba(
      pickedrgb.r,
      pickedrgb.g,
      pickedrgb.b,
      pickedrgb.a,
    );
    const applyFunction = async (newValue) => {
      const safeNode = SerializableActionHandler.getSafeNode(
        id,
      ) as WidgetColorPicker;
      safeNode.setInputData(initialValueName, newValue);
      safeNode.setOutputData(outName, newValue);
      await safeNode.executeOptimizedChain();
    };
    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(applyFunction, applyFunction, 'Change color'),
        newColor,
        prev,
      ),
    );
  }, 100);

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetColorPicker;
    const ref = useRef<HTMLDivElement | null>(null);
    const [colorPicker, showColorPicker] = useState(false);
    const initialColor = TRgba.fromObject(props[initialValueName]);
    const size = useWidgetSize(props[sizeName]);
    const tokens = useSizeTokens(size);

    return (
      <WidgetPaper ref={ref} node={node} inDashboard={props.inDashboard}>
        <Button
          {...getWidgetControlProps(props.disabled)}
          disabled={props.disabled}
          variant="contained"
          size={getMuiSize(size)}
          onClick={() => {
            showColorPicker(!colorPicker);
          }}
          sx={{
            margin: 'auto',
            // keep the same dashboard height as the other button-like widgets
            // (see WidgetButton) so the picker fills its widget box instead of
            // sitting at MUI's natural button height
            minHeight: props.inDashboard
              ? `${tokens.controlHeight}px`
              : undefined,
            lineHeight: props.inDashboard
              ? `${36 * tokens.scale}px`
              : `${(node.nodeHeight / 5) * tokens.scale}px`,
            py: props.inDashboard ? 0 : undefined,
            border: 0,
            bgcolor: initialColor.hexa(),
            color: initialColor.getContrastTextColor().hex(),
            width: '100%',
            height: '100%',
            borderRadius: props.inDashboard
              ? '48px'
              : `${node.nodeWidth / 4}px`,
            '&:hover': {
              bgcolor: initialColor.darken(0.1).hex(),
            },
            '&:active': {
              boxShadow: 4,
            },
            pointerEvents: props.disabled ? 'none' : undefined,
          }}
        >
          <Typography
            sx={{
              fontSize: props.inDashboard
                ? `${tokens.fontSize}px`
                : `${(node.nodeHeight / 6) * tokens.scale}px`,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              textTransform: 'none',
            }}
          >
            {props[labelName]}
          </Typography>
          <ColorizeIcon
            sx={{
              pl: 0.5,
              flexShrink: 0,
              fontSize: props.inDashboard
                ? `${tokens.iconSize}px`
                : `${(node.nodeHeight / 6) * tokens.scale}px`,
            }}
          />
        </Button>
        <Popper
          id="toolbar-popper"
          open={colorPicker}
          anchorEl={ref.current}
          placement="top"
          transition
          // the picker is ~240px of fixed-size swatches and is anchored to a
          // widget that can sit anywhere on the surface. Without these it is
          // simply drawn off the top or side of a phone screen, with no way to
          // scroll to it - flip finds a side that fits, preventOverflow slides
          // it back inside the viewport when no side fully does.
          modifiers={[
            { name: 'flip', enabled: true },
            {
              name: 'preventOverflow',
              enabled: true,
              options: { padding: 8, altAxis: true },
            },
          ]}
          sx={{ zIndex: 10 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={350}>
              <Paper
                sx={{
                  margin: '4px',
                  // the picker is dragged, not scrolled: without this a drag
                  // across the saturation square is taken by the browser as a
                  // scroll of whatever is behind the popper, and the colour
                  // never changes
                  touchAction: 'none',
                }}
              >
                <ClickAwayListener onClickAway={() => showColorPicker(false)}>
                  <span className="chrome-picker">
                    <Sketch
                      color={initialColor.hsva()}
                      onChange={node.handleOnChange}
                      presetColors={PRESET_COLORS}
                    />
                  </span>
                </ClickAwayListener>
              </Paper>
            </Fade>
          )}
        </Popper>
      </WidgetPaper>
    );
  }
}
