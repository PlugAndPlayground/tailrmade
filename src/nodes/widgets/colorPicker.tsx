import React, { useRef, useState } from 'react';
import {
  Button,
  ClickAwayListener,
  Fade,
  Paper,
  Popper,
  ThemeProvider,
} from '@mui/material';
import ColorizeIcon from '@mui/icons-material/Colorize';
import { Sketch } from '@uiw/react-color';
import throttle from 'lodash/throttle';
import Socket from '../../classes/SocketClass';
import {
  WidgetHybridBase,
  WidgetPaper,
  initialValueName,
  labelName,
  outName,
} from './abstract';
import { TRgba } from '../../utils/color';
import { WidgetContentProps } from '../../utils/interfaces';
import {
  PRESET_COLORS,
  MAIN_COLOR,
  SOCKET_TYPE,
  customTheme,
} from '../../utils/constants';
import { StringType } from '../datatypes/stringType';
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
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        pickerDefaultName,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, outName, new ColorType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 104;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

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

    return (
      <ThemeProvider theme={customTheme}>
        <WidgetPaper ref={ref} node={node} inDashboard={props.inDashboard}>
          <Button
            disabled={props.disabled}
            variant="contained"
            onClick={() => {
              showColorPicker(!colorPicker);
            }}
            sx={{
              margin: 'auto',
              fontSize: props.inDashboard ? '16px' : `${node.nodeHeight / 6}px`,
              lineHeight: props.inDashboard
                ? '24px'
                : `${node.nodeHeight / 5}px`,
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
            {props[labelName]}
            <ColorizeIcon
              sx={{
                pl: 0.5,
                fontSize: props.inDashboard
                  ? '24px'
                  : `${node.nodeHeight / 6}px`,
              }}
            />
          </Button>
          <Popper
            id="toolbar-popper"
            open={colorPicker}
            anchorEl={ref.current}
            placement="top"
            transition
            sx={{ zIndex: 10 }}
          >
            {({ TransitionProps }) => (
              <Fade {...TransitionProps} timeout={350}>
                <Paper
                  sx={{
                    margin: '4px',
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
      </ThemeProvider>
    );
  }
}
