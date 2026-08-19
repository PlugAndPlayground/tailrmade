import React from 'react';
import { Slider, ThemeProvider, Typography, Box } from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  getMuiSize,
  getSizeSocket,
  getSizeTokens,
  labelName,
  outName,
  sizeName,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE, customTheme } from '../../utils/constants';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import { limitRange } from '../../utils/utils';
import { WidgetContentProps } from '../../utils/interfaces';

// Socket names
const initialValueName = 'Initial Value';
const minValueName = 'Min';
const maxValueName = 'Max';
const roundName = 'Round';

export class WidgetSlider extends WidgetHybridBase {
  prevMinValue = -1;
  prevMaxValue = -1;
  prevValue = -1;
  hasSetPrevValues = false;

  public getName(): string {
    return 'Slider';
  }

  public getDescription(): string {
    return 'Number slider';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, initialValueName, new NumberType(), 0, false),
      new Socket(SOCKET_TYPE.IN, minValueName, new NumberType(), 0, false),
      new Socket(SOCKET_TYPE.IN, maxValueName, new NumberType(), 100, false),
      new Socket(SOCKET_TYPE.IN, roundName, new BooleanType(), false, false),
      new Socket(SOCKET_TYPE.IN, labelName, new StringType(), 'Slider', false),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new NumberType()),
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
    const value = inputObject[initialValueName];
    const minValue = inputObject[minValueName];
    const maxValue = inputObject[maxValueName];

    let valueToSet = limitRange(value, minValue, maxValue);
    // if we just changed our min or max value, we might want to also adjust the actual value (if it was previously at a limit)
    if (
      this.hasSetPrevValues &&
      (minValue !== this.prevMinValue || maxValue !== this.prevMaxValue) &&
      this.prevMinValue !== this.prevMaxValue &&
      this.getInputSocketByName(initialValueName).links.length === 0
    ) {
      let adjustedValue = false;
      if (this.prevValue === this.prevMinValue) {
        valueToSet = minValue;
        adjustedValue = true;
      } else if (this.prevValue === this.prevMaxValue) {
        valueToSet = maxValue;
        adjustedValue = true;
      }
      if (adjustedValue) {
        console.log('Adjusting input because of changed limits');
        this.setInputData(initialValueName, valueToSet);
        this.redraw();
      }
    }

    this.setOutputData(outName, valueToSet);
    this.prevMinValue = minValue;
    this.prevMaxValue = maxValue;
    this.prevValue = valueToSet;
    this.hasSetPrevValues = true;
  }

  handleOnChange = (event, newValue) => {
    const id = this.id;
    const prev = this.getInputData(initialValueName);
    const shouldRound = this.getInputData(roundName);

    // Round the value if needed
    const formattedValue = shouldRound ? Math.round(newValue) : newValue;

    const applyFunction = async (value) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(initialValueName, value);
      safeNode.setOutputData(outName, value);
      await safeNode.executeOptimizedChain();
    };

    void ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          applyFunction,
          applyFunction,
          'Set Slider Value',
        ),
        formattedValue,
        prev,
      ),
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetSlider;
    const min = props[minValueName];
    const max = props[maxValueName];
    const value = props[initialValueName];
    const shouldRound = props[roundName];
    const tokens = getSizeTokens(props[sizeName]);
    // the slider has no fixed control height to hit - it just scales the height
    // it already had, so M keeps its current look
    const sliderHeight = props.inDashboard
      ? 32 * tokens.scale
      : (node.nodeHeight / 3) * tokens.scale;

    // Format the value displayed based on rounding setting
    const displayValue = shouldRound
      ? Math.round(value)
      : Number(value.toFixed(2));

    return (
      <ThemeProvider theme={customTheme}>
        <WidgetPaper node={node} inDashboard={props.inDashboard}>
          <Box
            sx={{
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <Typography
              id={`slider-label-${node.id}`}
              gutterBottom
              sx={{
                fontSize: props.inDashboard
                  ? `${tokens.fontSize}px`
                  : `${(node.nodeHeight / 8) * tokens.scale}px`,
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              {props[labelName]}
              {`${props[labelName] !== '' ? ': ' : ''} `}
              {displayValue}
            </Typography>
            <Slider
              disabled={props.disabled}
              size={getMuiSize(props[sizeName])}
              aria-labelledby={`slider-label-${node.id}`}
              value={value}
              min={min}
              max={max}
              step={shouldRound ? 1 : 0.01}
              onChange={node.handleOnChange}
              valueLabelDisplay="off"
              sx={{
                width: '100%',
                padding: 0,
                pointerEvents: props.disabled ? 'none' : undefined,
                height: sliderHeight,
                '& .MuiSlider-track': {
                  border: 'none',
                },
                borderRadius: 2,
                '& .MuiSlider-thumb': {
                  height: sliderHeight,
                  width: 16 * tokens.scale,
                  backgroundColor: 'transparent',
                  borderRadius: 0,
                  '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
                    boxShadow: 'inherit',
                  },

                  '&::before': {
                    display: 'none',
                  },
                },
              }}
            />
          </Box>
        </WidgetPaper>
      </ThemeProvider>
    );
  }

  public async populateDefaults(socket: Socket): Promise<void> {
    const target = socket;
    if (
      target.dataType.constructor === new NumberType().constructor &&
      0 === this.getInputData(initialValueName)
    ) {
      const { round, minValue, maxValue } = target.dataType as NumberType;
      this.setInputData(minValueName, minValue);
      this.setInputData(maxValueName, maxValue);
      this.setInputData(roundName, round);
      this.setInputData(initialValueName, target.defaultData);
      this.setInputData(labelName, target.name);
    }
    await super.populateDefaults(socket);
  }
}
