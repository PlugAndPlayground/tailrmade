import React from 'react';
import { Box, FormControl, TextField } from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  getMuiSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  initialValueName,
  getLabelSocket,
  getWidgetControlProps,
  commitDelayName,
  commitModeName,
  getCommitDelaySocket,
  getCommitModeSocket,
  useCommitMode,
  labelName,
  outName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
  useSizeSx,
  getHiddenLabelSx,
  getLabelPosition,
  getLabelPositionSocket,
  useWidgetLabelIds,
  WidgetLabelFrame,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { EnumType, EnumStructure } from '../datatypes/enumType';
import { AbstractType } from '../datatypes/abstractType';
import { BackPropagation } from '../../interfaces';
import type { TemplateInstanceHandle } from '../../components/dashboard/templateInstance';
import { SOCKET_TYPE } from '../../utils/constants';
import { WidgetContentProps } from '../../utils/interfaces';
import { useResolvedInputVariant } from '../../utils/theme';
import { NumberInput } from '../../components/NumberInput';
import {
  WidgetNumberBase,
  decimalsName,
  getDecimals,
  getDecimalsSocket,
  maxValueName,
  minValueName,
} from './number-base';

// Socket names
const placeholderName = 'Placeholder';
const helperTextName = 'Helper Text';
const multilineName = 'Multiline';
const rowsName = 'Rows';
const maxLengthName = 'Max Length';
const requiredName = 'Required';
const typeName = 'Type';

// Default values
const textFieldDefaultValue = '';
const textFieldDefaultLabel = 'Text Field';

// Options
const typeOptions: EnumStructure = [{ text: 'text' }, { text: 'password' }];
const keyboardName = 'Keyboard';
// the on-screen keyboard a phone shows (HTML inputmode). The value stays text,
// so PINs, ZIP codes and phone numbers keep their leading zeros and spaces
const keyboardOptions: EnumStructure = [
  { text: 'text' },
  { text: 'numeric' },
  { text: 'decimal' },
  { text: 'tel' },
  { text: 'email' },
];

const getFieldEndSockets = (
  node: WidgetHybridBase,
  outType: AbstractType,
): Socket[] => [
  new Socket(SOCKET_TYPE.IN, requiredName, new BooleanType(), false, false),
  getCommitModeSocket(),
  getCommitDelaySocket(node),
  getColorSocket(),
  getSizeSocket(),
  new Socket(SOCKET_TYPE.OUT, outName, outType),
];

export class WidgetTextField extends WidgetHybridBase {
  public getName(): string {
    return 'Text Field';
  }

  public getDescription(): string {
    return 'Adds a text input field';
  }

  public getDocs(): string {
    return `"Keyboard" picks the on-screen keyboard phones show: "numeric" for PINs,
ZIP codes and IDs, "tel" for phone numbers. The output stays text, so leading
zeros survive. For a value you calculate with, use a Number Field instead.`;
  }

  public getTags(): string[] {
    return ['Text'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        initialValueName,
        new StringType(),
        textFieldDefaultValue,
        false,
      ),
      getLabelSocket(textFieldDefaultLabel),
      getLabelPositionSocket(),
      new Socket(
        SOCKET_TYPE.IN,
        placeholderName,
        new StringType(),
        'Enter text...',
        false,
      ),
      new Socket(SOCKET_TYPE.IN, helperTextName, new StringType(), '', false),
      new Socket(
        SOCKET_TYPE.IN,
        typeName,
        new EnumType(typeOptions, undefined, true),
        typeOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        keyboardName,
        new EnumType(keyboardOptions, undefined, true),
        keyboardOptions[0].text,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        multilineName,
        new BooleanType(),
        false,
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        rowsName,
        new NumberType(true, 1, 10),
        3,
        () => this.getInputData(multilineName),
      ),
      new Socket(
        SOCKET_TYPE.IN,
        maxLengthName,
        new NumberType(true, 0, 1000),
        0,
        false,
      ),
      ...getFieldEndSockets(this, new StringType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 220;
  }

  public getDefaultNodeHeight(): number {
    return 120;
  }

  public getMinNodeHeight(): number {
    return 80;
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
    this.setOutputData(outName, inputObject[initialValueName]);
  }

  handleOnChange = async (value: string, instance?: TemplateInstanceHandle) => {
    await this.commitWidgetEdit(
      initialValueName,
      value,
      instance,
      'Update Text Field',
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetTextField;
    const multiline = props[multilineName];
    const commit = useCommitMode<string>(
      props[initialValueName],
      (value) => void node.handleOnChange(value, props.templateInstance),
      {
        mode: props[commitModeName],
        delay: props[commitDelayName],
        // a bare Enter writes a new line in a multiline field, so there it
        // takes Cmd/Ctrl+Enter to commit
        commitOnEnter: !multiline,
      },
    );
    const rows = props[rowsName] || 3;
    const maxLength = props[maxLengthName];
    const required = props[requiredName];
    const type = props[typeName];
    const keyboard = props[keyboardName];
    const placeholder = props[placeholderName];
    const helperText = props[helperTextName];
    const isInteractive = !(props.inDashboard && props.disabled);

    const size = useWidgetSize(props[sizeName]);
    const inputVariant = useResolvedInputVariant();
    const color = props[colorName];
    const sizeSx = useSizeSx(size);
    const tokens = useSizeTokens(size);
    const fontSize = `${tokens.fontSize}px`;
    const position = getLabelPosition(props);
    const framed = position !== 'Default';
    const { labelId, controlId } = useWidgetLabelIds();
    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <WidgetLabelFrame
          position={position}
          label={props[labelName]}
          labelId={labelId}
          htmlFor={controlId}
          tokens={tokens}
          rowHeight={tokens.controlHeight}
        >
          <Box sx={{ width: '100%' }}>
            <FormControl fullWidth margin="none">
              <TextField
                {...getWidgetControlProps(props.disabled)}
                margin="none"
                value={commit.value}
                {...(framed
                  ? { id: controlId, hiddenLabel: true }
                  : { label: props[labelName] })}
                placeholder={placeholder}
                helperText={helperText}
                variant={inputVariant}
                color={color}
                size={getMuiSize(size)}
                type={type}
                multiline={multiline}
                rows={multiline ? rows : undefined}
                slotProps={{
                  htmlInput: {
                    maxLength: maxLength > 0 ? maxLength : undefined,
                    inputMode:
                      keyboard && keyboard !== 'text' ? keyboard : undefined,
                  },
                  input: { sx: { fontSize }, readOnly: !isInteractive },
                }}
                required={required}
                disabled={props.disabled}
                onFocus={commit.beginEditing}
                onChange={(e) => commit.edit(e.target.value)}
                onBlur={commit.endEditing}
                onKeyDown={commit.handleKeyDown}
                sx={{
                  pointerEvents: props.disabled ? 'none' : undefined,
                  ...sizeSx,
                  ...(framed && getHiddenLabelSx(tokens)),
                }}
              />
            </FormControl>
          </Box>
        </WidgetLabelFrame>
      </WidgetPaper>
    );
  }
}

const limitRangeName = 'Limit Range';
const stepName = 'Step';
const steppersName = 'Show Steppers';
const groupingName = 'Digit Grouping';

const numberFieldDefaultValue = 0;
const numberFieldDefaultLabel = 'Number Field';

export class WidgetNumberField extends WidgetNumberBase {
  public getName(): string {
    return 'Number Field';
  }

  public getDescription(): string {
    return 'Adds a number input field';
  }

  public getDocs(): string {
    return `Turn "Digit Grouping" off for years, IDs and ports, so 2026 does not show
as "2,026". For codes with leading zeros, such as ZIP codes or PINs, use a Text
Field with "Keyboard" set to "numeric".`;
  }

  public getTags(): string[] {
    return ['Number'].concat(super.getTags());
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        initialValueName,
        new NumberType(),
        numberFieldDefaultValue,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        limitRangeName,
        new BooleanType(),
        false,
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        minValueName,
        new NumberType(),
        0,
        () => this.getInputData(limitRangeName),
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        maxValueName,
        new NumberType(),
        100,
        () => this.getInputData(limitRangeName),
      ),
      getDecimalsSocket(),
      getLabelSocket(numberFieldDefaultLabel),
      getLabelPositionSocket(),
      new Socket(SOCKET_TYPE.IN, placeholderName, new StringType(), '', false),
      new Socket(SOCKET_TYPE.IN, helperTextName, new StringType(), '', false),
      new Socket(SOCKET_TYPE.IN, stepName, new NumberType(), 1, false),
      new Socket(SOCKET_TYPE.IN, steppersName, new BooleanType(), true, false),
      new Socket(SOCKET_TYPE.IN, groupingName, new BooleanType(), true, false),
      ...getFieldEndSockets(this, new NumberType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 220;
  }

  public getDefaultNodeHeight(): number {
    return 120;
  }

  public getMinNodeHeight(): number {
    return 80;
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    this.setOutputData(
      outName,
      this.getOutputValue(inputObject, inputObject[limitRangeName]),
    );
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetNumberField;
    const commit = useCommitMode<number>(
      props[initialValueName],
      (value) => void node.handleValueChange(value, props.templateInstance),
      { mode: props[commitModeName], delay: props[commitDelayName] },
    );
    const size = useWidgetSize(props[sizeName]);
    const tokens = useSizeTokens(size);
    const sizeSx = useSizeSx(size);
    const inputVariant = useResolvedInputVariant();
    const limitRange = props[limitRangeName];
    const decimals = getDecimals(props[decimalsName]);

    const position = getLabelPosition(props);
    const framed = position !== 'Default';
    const { labelId, controlId } = useWidgetLabelIds();

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <WidgetLabelFrame
          position={position}
          label={props[labelName]}
          labelId={labelId}
          htmlFor={controlId}
          tokens={tokens}
          rowHeight={tokens.controlHeight}
        >
          <NumberInput
            {...getWidgetControlProps(props.disabled)}
            {...(framed ? { id: controlId } : { label: props[labelName] })}
            value={props[initialValueName]}
            onChange={commit.edit}
            onCommit={commit.endEditing}
            min={limitRange ? props[minValueName] : undefined}
            max={limitRange ? props[maxValueName] : undefined}
            step={Math.max(props[stepName], 10 ** -decimals)}
            decimals={decimals}
            // apps saved before the setting existed keep their separators
            grouping={props[groupingName] !== false}
            required={props[requiredName]}
            disabled={props.disabled}
            readOnly={props.inDashboard && props.disabled}
            size={getMuiSize(size)}
            variant={inputVariant}
            color={props[colorName]}
            placeholder={props[placeholderName]}
            helperText={props[helperTextName]}
            hideSteppers={!props[steppersName]}
            sx={{
              pointerEvents: props.disabled ? 'none' : undefined,
              ...sizeSx,
              ...(framed && getHiddenLabelSx(tokens)),
              '& .MuiInputAdornment-root .MuiSvgIcon-root': {
                fontSize: `${Math.round(tokens.iconSize * 0.75)}px`,
              },
            }}
          />
        </WidgetLabelFrame>
      </WidgetPaper>
    );
  }
}
