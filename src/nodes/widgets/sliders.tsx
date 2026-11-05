import React from 'react';
import { Slider, Typography, Box } from '@mui/material';
import {
  WidgetPaper,
  getMuiSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  getWidgetDragControlProps,
  commitModeName,
  draggingCommitOptions,
  getCommitModeSocket,
  useCommitMode,
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
import { TOUCH_TARGET_PX } from '../../utils/theme';
import { WidgetContentProps } from '../../utils/interfaces';

const valueToken = '{{value}}';

const withValueToken = (label: string): string =>
  label === '' ? valueToken : `${label}: ${valueToken}`;

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

  public getDocs(): string {
    return `"Label" is the text above the slider. Write ${valueToken} where the
current value should appear, for example "Volume: ${valueToken}" or
"${valueToken} px". Leave it empty to show no text at all.`;
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, initialValueName, new NumberType(), 0, false),
      new Socket(SOCKET_TYPE.IN, minValueName, new NumberType(), 0, false),
      new Socket(SOCKET_TYPE.IN, maxValueName, new NumberType(), 100, false),
      getDecimalsSocket(),
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        withValueToken('Slider'),
        false,
      ),
      getCommitModeSocket(draggingCommitOptions),
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
    return 3;
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
    const labelSocket = this.getInputSocketByName(labelName);
    if (
      previousVersion < 3 &&
      labelSocket.links.length === 0 &&
      !labelSocket.data.includes(valueToken)
    ) {
      this.setInputData(labelName, withValueToken(labelSocket.data));
    }
  }

  public async populateDefaults(socket: Socket): Promise<void> {
    await super.populateDefaults(socket);
    this.setInputData(labelName, withValueToken(socket.name));
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
    const commit = useCommitMode<number>(
      props[initialValueName],
      (next) => void node.handleValueChange(next),
      { mode: props[commitModeName] },
    );
    const value = commit.value;
    const decimals = getDecimals(props[decimalsName]);
    const size = useWidgetSize(props[sizeName]);
    const color = props[colorName];
    const tokens = useSizeTokens(size);
    // the slider has no fixed control height to hit - it just scales the height
    // it already had, so M keeps its current look
    const sliderHeight = props.inDashboard
      ? 32 * tokens.scale
      : (node.nodeHeight / 3) * tokens.scale;
    const coarseTouchPadding = Math.max(
      0,
      (TOUCH_TARGET_PX - sliderHeight) / 2,
    );

    const label = props[labelName].replaceAll(
      valueToken,
      String(roundToDecimals(value, decimals)),
    );

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <Box
          sx={{
            width: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {label !== '' && (
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
              {label}
            </Typography>
          )}
          <Slider
            {...getWidgetDragControlProps(props.disabled)}
            color={color}
            disabled={props.disabled}
            size={getMuiSize(size)}
            aria-label={label === '' ? node.getName() : undefined}
            aria-labelledby={
              label === '' ? undefined : `slider-label-${node.id}`
            }
            value={value}
            min={min}
            max={max}
            step={10 ** -decimals}
            onChange={(_event, newValue) => commit.edit(newValue as number)}
            onChangeCommitted={commit.endEditing}
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
