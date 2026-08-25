import React from 'react';
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import {
  WidgetHybridBase,
  WidgetPaper,
  getMuiSize,
  getSizeSocket,
  getSizeTokens,
  labelName,
  outName,
  defaultOptions,
  fallbackValueName,
  selectedOptionName,
  sizeName,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import Socket from '../../classes/SocketClass';
import { ArrayType } from '../datatypes/arrayType';
import { NumberType } from '../datatypes/numberType';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE } from '../../utils/constants';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import { WidgetContentProps } from '../../utils/interfaces';

const optionsName = 'Options';

const radioDefaultLabel = 'Radio Group';
const rowLayoutName = 'Row Layout';

export class WidgetRadio extends WidgetHybridBase {
  public getName(): string {
    return 'Radio Button';
  }

  public getDescription(): string {
    return 'Adds a group of options allowing you to select one';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        optionsName,
        new ArrayType(),
        defaultOptions,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        selectedOptionName,
        new StringType(),
        '',
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        fallbackValueName,
        new StringType(),
        '',
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        rowLayoutName,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        radioDefaultLabel,
        false,
      ),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new StringType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 240;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(selectedOptionName),
      SocketToGetOptions: this.getInputSocketByName(optionsName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);

    const options = inputObject[optionsName];
    const selectedValue = inputObject[selectedOptionName];
    const fallbackValue = inputObject[fallbackValueName];

    if (!options.includes(selectedValue)) {
      this.setOutputData(outName, fallbackValue);
      return;
    }

    this.setOutputData(outName, selectedValue);
  }

  handleOnChange = async (event) => {
    const value = event.target.value;

    const id = this.id;
    const prev = this.getInputData(selectedOptionName);

    const applyFunction = async (newData) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(selectedOptionName, newData);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          applyFunction,
          applyFunction,
          'Select Radio Option',
        ),
        value,
        prev,
      ),
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node;
    const options = props[optionsName];
    const selectedValue = props[selectedOptionName];

    const size = useWidgetSize(props[sizeName]);
    const tokens = useSizeTokens(size);
    const fontSize = props.inDashboard
      ? `${tokens.fontSize}px`
      : `${Math.max(12, node.nodeHeight / 10) * tokens.scale}px`;

    return (
      <WidgetPaper node={node as WidgetRadio} inDashboard={props.inDashboard}>
        <FormControl
          component="fieldset"
          disabled={props.disabled}
          sx={{
            margin: 'auto',
            width: '100%',
            height: '100%',
            userSelect: 'none',
            padding: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {props[labelName] && (
            <Typography
              variant="subtitle1"
              sx={{
                fontSize: `${tokens.fontSize}px`,
                mb: 1,
                textAlign: 'center',
              }}
            >
              {props[labelName]}
            </Typography>
          )}

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: props.inDashboard
                ? 'calc(100vh - 100px)'
                : `${Math.max(100, node.nodeHeight - 80)}px`,
            }}
          >
            <RadioGroup
              value={selectedValue}
              onChange={(node as WidgetRadio).handleOnChange}
              row={props[rowLayoutName]}
              sx={{
                pointerEvents: props.disabled ? 'none' : undefined,
                flexWrap: props[rowLayoutName] ? 'wrap' : 'nowrap',
              }}
            >
              {options.map((option, index) => (
                <FormControlLabel
                  key={index}
                  value={option}
                  control={
                    <Radio
                      size={getMuiSize(size)}
                      sx={{
                        '& .MuiSvgIcon-root': {
                          fontSize: fontSize,
                        },
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: fontSize }}>
                      {typeof option === 'string'
                        ? option
                        : JSON.stringify(option)}
                    </Typography>
                  }
                  sx={{
                    mx: props[rowLayoutName] ? 0.5 : 0,
                    width: props[rowLayoutName] ? 'auto' : '100%',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </RadioGroup>
          </Box>
        </FormControl>
      </WidgetPaper>
    );
  }
}

const checkboxDefaultLabel = 'Checkbox Group';
const selectedOptionsName = 'Selected Options';

export class WidgetCheckbox extends WidgetHybridBase {
  public getName(): string {
    return 'Checkbox';
  }

  public getDescription(): string {
    return 'Adds a group of checkboxes allowing multiple selections';
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        optionsName,
        new ArrayType(),
        defaultOptions,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        selectedOptionsName,
        new ArrayType(),
        [],
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        rowLayoutName,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        checkboxDefaultLabel,
        false,
      ),
      getSizeSocket(),
      new Socket(SOCKET_TYPE.OUT, outName, new ArrayType()),
    ];
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 240;
  }

  onNodeResize = (newWidth, newHeight) => {
    this.forceRerender();
  };

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(selectedOptionsName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);

    const options = inputObject[optionsName];
    let selectedOptions = inputObject[selectedOptionsName];

    // Filter selected options and keep them in the original options order
    selectedOptions = options.filter((option) =>
      selectedOptions.includes(option),
    );

    this.setOutputData(outName, selectedOptions);
  }

  handleCheckboxChange = async (event, checked) => {
    const value = event.target.value;
    const options = this.getInputData(optionsName);

    if (!options.includes(value)) return;

    const id = this.id;
    const prevSelected = this.getInputData(selectedOptionsName);

    // Create new array based on checked state
    let newSelectedSet;
    if (checked) {
      // Add option if not already included
      newSelectedSet = new Set([...prevSelected, value]);
    } else {
      // Remove option if checked is false
      newSelectedSet = new Set(prevSelected.filter((item) => item !== value));
    }

    // Preserve original options order
    const newSelected = options.filter((option) => newSelectedSet.has(option));

    const applyFunction = async (selected) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(selectedOptionsName, selected);
      safeNode.setOutputData(outName, selected);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          applyFunction,
          applyFunction,
          'Update Checkbox Selection',
        ),
        newSelected,
        prevSelected,
      ),
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node;
    const options = props[optionsName];
    const selectedOptions = props[selectedOptionsName];

    // Calculate dynamic font size based on node dimensions
    const size = useWidgetSize(props[sizeName]);
    const tokens = useSizeTokens(size);
    const fontSize = props.inDashboard
      ? `${tokens.fontSize}px`
      : `${Math.max(12, node.nodeHeight / 10) * tokens.scale}px`;

    return (
      <WidgetPaper
        node={node as WidgetCheckbox}
        inDashboard={props.inDashboard}
      >
        <FormControl
          component="fieldset"
          disabled={props.disabled}
          sx={{
            margin: 'auto',
            width: '100%',
            height: '100%',
            userSelect: 'none',
            padding: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {props[labelName] && (
            <Typography
              variant="subtitle1"
              sx={{
                fontSize: `${tokens.fontSize}px`,
                mb: 1,
                textAlign: 'center',
              }}
            >
              {props[labelName]}
            </Typography>
          )}

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: props.inDashboard
                ? 'calc(100vh - 100px)'
                : `${Math.max(100, node.nodeHeight - 80)}px`,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: props[rowLayoutName] ? 'row' : 'column',
                flexWrap: 'wrap',
                pointerEvents: props.disabled ? 'none' : undefined,
              }}
            >
              {options.map((option, index) => (
                <FormControlLabel
                  key={index}
                  control={
                    <Checkbox
                      checked={selectedOptions.includes(option)}
                      onChange={(node as WidgetCheckbox).handleCheckboxChange}
                      value={option}
                      size={getMuiSize(size)}
                      sx={{
                        '& .MuiSvgIcon-root': {
                          fontSize: fontSize,
                        },
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: fontSize }}>
                      {option}
                    </Typography>
                  }
                  sx={{
                    mx: props[rowLayoutName] ? 0.5 : 0,
                    width: props[rowLayoutName] ? 'auto' : '100%',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </Box>
          </Box>
        </FormControl>
      </WidgetPaper>
    );
  }
}
