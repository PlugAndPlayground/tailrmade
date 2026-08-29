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
  SizeTokens,
  WidgetHybridBase,
  WidgetPaper,
  getMuiSize,
  getWidgetFontSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  getLabelSocket,
  labelName,
  outName,
  defaultOptions,
  fallbackValueName,
  selectedOptionName,
  sizeName,
  stringifyIfNeeded,
  useWidgetSize,
  useSizeTokens,
} from './abstract';
import HybridNode2 from '../../classes/HybridNode2';
import Socket from '../../classes/SocketClass';
import { ArrayType } from '../datatypes/arrayType';
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

// radio and checkbox differ only in the control they put in each row, so the
// group's sizing, its frame and the row layout all live here
const useOptionGroupStyle = (props: WidgetContentProps) => {
  const size = useWidgetSize(props[sizeName]);
  const tokens = useSizeTokens(size);
  return {
    size,
    tokens,
    color: props[colorName],
    fontSize: getWidgetFontSize(
      tokens,
      props.inDashboard,
      props.node.nodeHeight,
    ),
  };
};

const getOptionLabelSx = (rowLayout: boolean) => ({
  mx: rowLayout ? 0.5 : 0,
  width: rowLayout ? 'auto' : '100%',
  boxSizing: 'border-box' as const,
});

const OptionGroupFrame: React.FC<{
  props: WidgetContentProps;
  tokens: SizeTokens;
  children: React.ReactNode;
}> = ({ props, tokens, children }) => {
  const node = props.node;
  return (
    <WidgetPaper node={node as HybridNode2} inDashboard={props.inDashboard}>
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
          {children}
        </Box>
      </FormControl>
    </WidgetPaper>
  );
};

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
      getLabelSocket(radioDefaultLabel),
      getColorSocket(),
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

    const { size, tokens, color, fontSize } = useOptionGroupStyle(props);

    return (
      <OptionGroupFrame props={props} tokens={tokens}>
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
                  color={color}
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
                  {stringifyIfNeeded(option)}
                </Typography>
              }
              sx={getOptionLabelSx(props[rowLayoutName])}
            />
          ))}
        </RadioGroup>
      </OptionGroupFrame>
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
      getLabelSocket(checkboxDefaultLabel),
      getColorSocket(),
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

    const { size, tokens, color, fontSize } = useOptionGroupStyle(props);

    return (
      <OptionGroupFrame props={props} tokens={tokens}>
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
                  color={color}
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
                <Typography sx={{ fontSize: fontSize }}>{option}</Typography>
              }
              sx={getOptionLabelSx(props[rowLayoutName])}
            />
          ))}
        </Box>
      </OptionGroupFrame>
    );
  }
}
