import React from 'react';
import { Slider, Typography, Box } from '@mui/material';
import {
  WidgetPaper,
  getMuiSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  getWidgetControlProps,
  initialValueName,
  labelName,
  outName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import {
  WidgetNumberBase,
  decimalsName,
  getDecimals,
  getDecimalsSocket,
  maxValueName,
  minValueName,
  roundToDecimals,
} from './number-base';
import Socket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { NumberType } from '../datatypes/numberType';
import { SOCKET_TYPE } from '../../utils/constants';
import { WidgetContentProps } from '../../utils/interfaces';

export class WidgetSlider extends WidgetNumberBase {
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
      getDecimalsSocket(),
      new Socket(SOCKET_TYPE.IN, labelName, new StringType(), 'Slider', false),
      getColorSocket(),
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

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    const roundSocket = this.getInputSocketByName('Round');
    if (previousVersion < 2 && roundSocket) {
      // with Round off the slider stepped by 0.01
      this.setInputData(decimalsName, roundSocket.data ? 0 : 2);
      await this.replaceSocketWithOtherSocket(
        roundSocket,
        this.getInputSocketByName(decimalsName),
      );
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    const minValue = inputObject[minValueName];
    const maxValue = inputObject[maxValueName];

    let valueToSet = this.getOutputValue(inputObject, true);
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

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetSlider;
    const min = props[minValueName];
    const max = props[maxValueName];
    const value = props[initialValueName];
    const decimals = getDecimals(props[decimalsName]);
    const size = useWidgetSize(props[sizeName]);
    const color = props[colorName];
    const tokens = useSizeTokens(size);
    // the slider has no fixed control height to hit - it just scales the height
    // it already had, so M keeps its current look
    const sliderHeight = props.inDashboard
      ? 32 * tokens.scale
      : (node.nodeHeight / 3) * tokens.scale;

    const displayValue = roundToDecimals(value, decimals);

    return (
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
            gutterBottom={!props.inDashboard}
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
            {...getWidgetControlProps(props.disabled)}
            color={color}
            disabled={props.disabled}
            size={getMuiSize(size)}
            aria-labelledby={`slider-label-${node.id}`}
            value={value}
            min={min}
            max={max}
            step={10 ** -decimals}
            onChange={(_event, newValue) =>
              void node.handleValueChange(newValue as number)
            }
            valueLabelDisplay="off"
            sx={{
              width: '100%',
              padding: 0,
              '@media (pointer: coarse)': { padding: 0 },
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
    );
  }
}
