import React, { useEffect, useId, useState } from 'react';
import {
  Box,
  FilledInput,
  FormControl,
  FormHelperText,
  IconButton,
  Input,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  TextField,
} from '@mui/material';
import { NumberField } from '@base-ui/react/number-field';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
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
  labelName,
  outName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
  useSizeSx,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { EnumType, EnumStructure } from '../datatypes/enumType';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE } from '../../utils/constants';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import { WidgetContentProps } from '../../utils/interfaces';
import { useResolvedInputVariant } from '../../utils/theme';
import { useNumberFieldValue } from '../../components/NumberInput';
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

export class WidgetTextField extends WidgetHybridBase {
  public getName(): string {
    return 'Text Field';
  }

  public getDescription(): string {
    return 'Adds a text input field';
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
      new Socket(SOCKET_TYPE.IN, requiredName, new BooleanType(), false, false),
      getColorSocket(),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new StringType()),
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

  handleOnChange = async (event) => {
    const value = event.target.value;
    const id = this.id;
    const prev = this.getInputData(initialValueName);

    const applyFunction = async (newValue) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(initialValueName, newValue);
      safeNode.setOutputData(outName, newValue);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          applyFunction,
          applyFunction,
          'Update Text Field',
        ),
        value,
        prev,
      ),
    );
  };

  // Handle blur to finalize changes
  handleOnBlur = async () => {
    // This could be used to trigger additional actions when field loses focus
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetTextField;
    const [internalValue, setInternalValue] = useState<string>(
      props[initialValueName],
    );
    const [isFocused, setIsFocused] = useState(false);

    // Keep local value in sync only when not focused
    useEffect(() => {
      if (!isFocused && internalValue !== props[initialValueName]) {
        setInternalValue(props[initialValueName]);
      }
    }, [props[initialValueName], isFocused]);

    const multiline = props[multilineName];
    const rows = props[rowsName] || 3;
    const maxLength = props[maxLengthName];
    const required = props[requiredName];
    const type = props[typeName];
    const placeholder = props[placeholderName];
    const helperText = props[helperTextName];
    const isInteractive = !(props.inDashboard && props.disabled);

    const size = useWidgetSize(props[sizeName]);
    const inputVariant = useResolvedInputVariant();
    const color = props[colorName];
    const sizeSx = useSizeSx(size);
    const fontSize = `${useSizeTokens(size).fontSize}px`;
    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <Box sx={{ width: '100%' }}>
          <FormControl fullWidth>
            <TextField
              {...getWidgetControlProps(props.disabled)}
              value={internalValue}
              label={props[labelName]}
              placeholder={placeholder}
              helperText={helperText}
              variant={inputVariant}
              color={color}
              size={getMuiSize(size)}
              type={type}
              multiline={multiline}
              rows={multiline ? rows : undefined}
              inputProps={{
                maxLength: maxLength > 0 ? maxLength : undefined,
                sx: { fontSize },
                readOnly: !isInteractive,
              }}
              required={required}
              disabled={props.disabled}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => {
                setInternalValue(e.target.value);
                // still update graph so outputs react immediately
                void node.handleOnChange(e);
              }}
              onBlur={() => {
                setIsFocused(false);
                void node.handleOnBlur();
              }}
              sx={{
                pointerEvents: props.disabled ? 'none' : undefined,
                ...sizeSx,
              }}
            />
          </FormControl>
        </Box>
      </WidgetPaper>
    );
  }
}

const limitRangeName = 'Limit Range';
const stepName = 'Step';
const steppersName = 'Show Steppers';

const numberFieldDefaultValue = 0;
const numberFieldDefaultLabel = 'Number Field';

const inputComponents = {
  filled: FilledInput,
  outlined: OutlinedInput,
  standard: Input,
};

// FormControl reads the value off an 'Input' child on its first render, so the
// label starts shrunk instead of animating in on mount
function InitialFilledMarker(_: { value: number | null }) {
  return null;
}
InitialFilledMarker.muiName = 'Input';

export class WidgetNumberField extends WidgetNumberBase {
  public getName(): string {
    return 'Number Field';
  }

  public getDescription(): string {
    return 'Adds a number input field';
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
      new Socket(SOCKET_TYPE.IN, placeholderName, new StringType(), '', false),
      new Socket(SOCKET_TYPE.IN, helperTextName, new StringType(), '', false),
      new Socket(SOCKET_TYPE.IN, stepName, new NumberType(), 1, false),
      new Socket(SOCKET_TYPE.IN, steppersName, new BooleanType(), true, false),
      new Socket(SOCKET_TYPE.IN, requiredName, new BooleanType(), false, false),
      getColorSocket(),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new NumberType()),
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
    const numberValue = useNumberFieldValue(
      props[initialValueName],
      (value) => void node.handleValueChange(value),
    );
    const id = useId();
    const size = useWidgetSize(props[sizeName]);
    const muiSize = getMuiSize(size);
    const tokens = useSizeTokens(size);
    const sizeSx = useSizeSx(size);
    const inputVariant = useResolvedInputVariant();
    const InputComponent = inputComponents[
      inputVariant
    ] as typeof OutlinedInput;
    const label = props[labelName];
    const helperText = props[helperTextName];
    const limitRange = props[limitRangeName];
    const decimals = getDecimals(props[decimalsName]);
    const isInteractive = !(props.inDashboard && props.disabled);

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <NumberField.Root
          {...numberValue}
          min={limitRange ? props[minValueName] : undefined}
          max={limitRange ? props[maxValueName] : undefined}
          step={Math.max(props[stepName], 10 ** -decimals)}
          format={{ maximumFractionDigits: decimals }}
          required={props[requiredName]}
          disabled={props.disabled}
          readOnly={!isInteractive}
          render={(rootProps, state) => (
            <FormControl
              {...getWidgetControlProps(props.disabled)}
              ref={rootProps.ref}
              fullWidth
              margin="none"
              variant={inputVariant}
              color={props[colorName]}
              size={muiSize}
              disabled={state.disabled}
              required={state.required}
              sx={{
                pointerEvents: props.disabled ? 'none' : undefined,
                ...sizeSx,
              }}
            >
              {rootProps.children}
            </FormControl>
          )}
        >
          <InitialFilledMarker value={numberValue.value} />
          <InputLabel htmlFor={id}>{label}</InputLabel>
          <NumberField.Input
            id={id}
            placeholder={props[placeholderName]}
            aria-describedby={helperText ? `${id}-helper-text` : undefined}
            render={(inputProps, state) => (
              <InputComponent
                {...(inputVariant === 'outlined' && { label })}
                inputRef={inputProps.ref}
                value={state.inputValue}
                onChange={inputProps.onChange}
                onKeyUp={inputProps.onKeyUp}
                onKeyDown={inputProps.onKeyDown}
                onFocus={inputProps.onFocus}
                onBlur={inputProps.onBlur}
                slotProps={{ input: inputProps }}
                endAdornment={
                  props[steppersName] && isInteractive ? (
                    <InputAdornment
                      position="end"
                      sx={{
                        flexDirection: 'column',
                        alignSelf: 'stretch',
                        height: 'auto',
                        maxHeight: 'unset',
                        ml: 0,
                        '& .MuiIconButton-root': {
                          p: 0,
                          flex: 1,
                          borderRadius: 0.5,
                        },
                        '& .MuiSvgIcon-root': {
                          fontSize: `${Math.round(tokens.iconSize * 0.75)}px`,
                        },
                      }}
                    >
                      <NumberField.Increment
                        render={
                          <IconButton
                            size={muiSize}
                            sx={{ alignItems: 'flex-end' }}
                          />
                        }
                        aria-label="Increase"
                      >
                        <KeyboardArrowUpIcon />
                      </NumberField.Increment>
                      <NumberField.Decrement
                        render={
                          <IconButton
                            size={muiSize}
                            sx={{ alignItems: 'flex-start' }}
                          />
                        }
                        aria-label="Decrease"
                      >
                        <KeyboardArrowDownIcon />
                      </NumberField.Decrement>
                    </InputAdornment>
                  ) : undefined
                }
                sx={{ pr: 0.5 }}
              />
            )}
          />
          {helperText && (
            <FormHelperText id={`${id}-helper-text`}>
              {helperText}
            </FormHelperText>
          )}
        </NumberField.Root>
      </WidgetPaper>
    );
  }
}
