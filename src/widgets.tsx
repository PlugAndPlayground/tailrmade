import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  ClickAwayListener,
  FormControlLabel,
  FormControl,
  FormGroup,
  IconButton,
  InputLabel,
  ListItemText,
  ListItemSecondaryAction,
  MenuItem,
  Popper,
  Select,
  Slider,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Sketch } from '@uiw/react-color';
import prettyBytes from 'pretty-bytes';
import InterfaceController from './InterfaceController';
import PPStorage from './PPStorage';
import Socket from './classes/SocketClass';
import {
  COLOR_DARK,
  COLOR_WHITE_TEXT,
  DISABLED_OPACITY,
  MAX_STRING_LENGTH,
  PRESET_COLORS,
  TRIGGER_TYPE_OPTIONS,
} from './utils/constants';
import {
  convertToViewableString,
  getFileExtension,
  getLoadedValue,
  parseJSON,
  validateHtml,
  roundNumber,
} from './utils/utils';
import * as styles from './utils/style.module.css';
import { NumberInput } from './components/NumberInput';
import { TRgba } from './utils/color';
import { DataTypeProps } from './nodes/datatypes/abstractType';
import { ArrayTypeProps } from './nodes/datatypes/arrayType';
import { BooleanTypeProps } from './nodes/datatypes/booleanType';
import { CodeTypeProps } from './nodes/datatypes/codeType';
import { ColorTypeProps } from './nodes/datatypes/colorType';
import { EnumTypeProps } from './nodes/datatypes/enumType';
import { JSONTypeProps } from './nodes/datatypes/jsonType';
import { HtmlTypeProps } from './nodes/datatypes/htmlType';
import { NumberType, NumberTypeProps } from './nodes/datatypes/numberType';
import { FileTypeProps } from './nodes/datatypes/fileType';
import { StringTypeProps } from './nodes/datatypes/stringType';
import { TriggerTypeProps } from './nodes/datatypes/triggerType';
import useInterval from 'use-interval';
import {
  TwoDVectorTypeInterface,
  TwoDVectorTypeProps,
} from './nodes/datatypes/twoDVectorType';
import {
  ThreeDVectorTypeInterface,
  ThreeDVectorTypeProps,
} from './nodes/datatypes/threeDVectorType';
import {
  PNPAction,
  SetSocketValueActionArgs,
  ACTIONS,
  getSocketChecksum,
} from './classes/Action';
import CodeEditor from './components/Editor';

export async function potentiallyUpdateSocketData(property: Socket, newValue) {
  const nodeID = property.getNode().id;
  const name = property.name;
  const type = property.socketType;
  if (JSON.stringify(property.data) !== JSON.stringify(newValue)) {
    const clonedNewValue = structuredClone(newValue);
    const clonedOldValue = structuredClone(property.data);
    const setSocketArgs: SetSocketValueActionArgs = {
      nodeID: nodeID,
      socketName: name,
      socketType: type,
      newValue: clonedNewValue,
    };
    const undoSetSocketArgs: SetSocketValueActionArgs = {
      nodeID: nodeID,
      socketName: name,
      socketType: type,
      newValue: clonedOldValue,
    };
    await PNPAction(
      ACTIONS.SET_SOCKET_VALUE,
      setSocketArgs,
      undoSetSocketArgs,
      getSocketChecksum(property),
    );
  }
}

// Updates the same socket (by name and type) on multiple nodes
export async function potentiallyUpdateMultipleSocketsData(
  sockets: Socket[],
  newValue,
) {
  for (const socket of sockets) {
    await potentiallyUpdateSocketData(socket, newValue);
  }
}

function SliderValueLabelComponent(props) {
  const { children, value } = props;

  return (
    <Tooltip enterTouchDelay={0} placement="top" title={value}>
      {children}
    </Tooltip>
  );
}
const handleUpdate = async (
  newValue: number,
  updateInProgress,
  lastValue,
  props,
) => {
  if (updateInProgress.current) {
    lastValue.current = newValue;
    return;
  }

  updateInProgress.current = true;
  try {
    await potentiallyUpdateMultipleSocketsData(props.socketsToUpdate, newValue);
    // Check if value changed while we were updating
    if (lastValue.current !== newValue) {
      await handleUpdate(lastValue.current, updateInProgress, lastValue, props);
    }
  } finally {
    updateInProgress.current = false;
  }
};

interface ConfigFormProps {
  round: boolean;
  onRoundChange: (value: boolean) => void;
  minValue: number;
  maxValue: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  stepSizeValue: number;
  propertyName: string;
}

const ConfigForm = React.memo(
  ({
    round,
    onRoundChange,
    minValue,
    maxValue,
    onMinChange,
    onMaxChange,
    stepSizeValue,
    propertyName,
  }: ConfigFormProps) => (
    <FormGroup
      row={true}
      sx={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '2px',
        marginTop: '8px',
      }}
    >
      <ToggleButton
        value="check"
        size="small"
        selected={round}
        color="secondary"
        data-cy={`${propertyName}-type-toggle`}
        onChange={() => onRoundChange(!round)}
        sx={{
          fontSize: '12px',
          width: '100px',
        }}
      >
        {round ? 'Int' : 'Float'}
      </ToggleButton>
      <NumberInput
        label="Min"
        dataCy={`${propertyName}-min`}
        sx={{ width: '100%' }}
        step={round ? 1 : stepSizeValue}
        onChange={(value) => onMinChange(value ?? 0)}
        value={minValue}
      />
      <NumberInput
        label="Max"
        dataCy={`${propertyName}-max`}
        sx={{ width: '100%' }}
        step={round ? 1 : stepSizeValue}
        onChange={(value) => onMaxChange(value ?? 0)}
        value={maxValue}
      />
    </FormGroup>
  ),
);

ConfigForm.displayName = 'SliderConfigForm';

export const SliderWidget: React.FunctionComponent<
  NumberTypeProps & { disabled?: boolean }
> = ({ ...props }) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [data, setData] = useState(Number(property.data));
  const [visible, setVisible] = useState(props.dataType.showDetails);
  const updateInProgress = useRef(false);
  const lastValue = useRef(data);

  const disabled = property.hasLink();

  useInterval(() => {
    if (data !== property.data) {
      setData(Number(property.data));
    }
  }, 100);

  const [minValue, setMinValue] = useState(
    Math.min(props.dataType.minValue ?? 0, data),
  );
  const [maxValue, setMaxValue] = useState(
    Math.max(props.dataType.maxValue ?? 100, data),
  );
  const [round, setRound] = useState(props.dataType.round ?? false);
  const [stepSizeValue] = useState(props.dataType.stepSize ?? 0.01);

  // Handle preset value selection
  const handlePresetValueClick = async (presetValue: number) => {
    if (disabled) return;
    setData(presetValue);
    await handleUpdate(presetValue, updateInProgress, lastValue, props);

    // Adjust min/max if preset value is outside current range
    if (presetValue < minValue) {
      setMinValue(presetValue);
      props.dataType.minValue = presetValue;
    }
    if (presetValue > maxValue) {
      setMaxValue(presetValue);
      props.dataType.maxValue = presetValue;
    }
  };

  return (
    <div
      style={{
        opacity: disabled ? DISABLED_OPACITY : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {/* Preset Value Buttons */}
      {props.dataType.presetValues.length > 0 && (
        <ToggleButtonGroup
          color="primary"
          value={
            props.dataType.presetValues.find(
              (item) => Math.abs(item.value - data) < 0.0001,
            )?.value
          }
          exclusive
          onChange={async (event, value) => {
            await handlePresetValueClick(value);
          }}
          size="small"
          fullWidth
          sx={{
            mb: 1,
            '& .MuiToggleButtonGroup-grouped': {
              padding: '4px 8px',
              fontSize: '0.7rem',
              lineHeight: 1,
              height: '24px',
              '&:hover': {
                backgroundColor: 'secondary.dark',
              },
              '&.Mui-selected': {
                backgroundColor: 'secondary.main',
                color: 'secondary.contrastText',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'secondary.light',
              },
            },
          }}
        >
          {props.dataType.presetValues.map((item, index) => (
            <ToggleButton
              key={index}
              value={item.value}
              title={`${item.text} (${item.value})`}
            >
              {item.text}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      <FormGroup
        row={true}
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: '2px',
        }}
      >
        <NumberInput
          disabled={disabled}
          size="small"
          hideSteppers
          dataCy={`${property.name}-value`}
          sx={{ width: '100px', flexGrow: 1 }}
          inputSx={{
            textAlign: 'right',
            paddingLeft: '4px',
            paddingRight: '4px',
          }}
          step={round ? undefined : stepSizeValue}
          onChange={async (value) => {
            if (disabled) return;
            const newValue = value ?? 0;
            setData(newValue);
            await handleUpdate(newValue, updateInProgress, lastValue, props);
          }}
          value={data || 0}
        />
        <Slider
          disabled={disabled}
          size="small"
          color="secondary"
          valueLabelDisplay="auto"
          data-cy={`${property.name}-slider`}
          key={`${property.name}-${props.index}`}
          min={minValue}
          max={maxValue}
          step={round ? 1 : stepSizeValue}
          marks={[{ value: minValue }, { value: maxValue }]}
          slots={{
            valueLabel: SliderValueLabelComponent,
          }}
          onChange={async (event, value) => {
            if (disabled || Array.isArray(value)) return;
            setData(roundNumber(value, 4));
            await handleUpdate(value, updateInProgress, lastValue, props);
          }}
          value={data}
          sx={{
            ml: 1,
            py: '15px',
            width: 'calc(100% - 16px)',
          }}
        />
        <ToggleButton
          disabled={disabled}
          data-cy="slider-details-visible-button"
          value="check"
          selected={visible}
          onChange={() => {
            if (disabled) return;
            setVisible((value) => {
              const newValue = !value;
              props.dataType.showDetails = newValue;
              return newValue;
            });
          }}
          sx={{
            ml: 1,
            px: 0.5,
            py: 0,
            fontSize: '12px',
            border: 0,
          }}
        >
          {visible ? (
            <ExpandLessIcon sx={{ fontSize: '16px' }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: '16px' }} />
          )}
        </ToggleButton>
      </FormGroup>
      {visible && !disabled && (
        <ConfigForm
          round={round}
          onRoundChange={(newValue) => {
            setRound(newValue);
            for (const socket of props.socketsToUpdate) {
              (socket.dataType as NumberType).round = newValue;
            }
          }}
          minValue={minValue}
          maxValue={maxValue}
          onMinChange={(newValue) => {
            setMinValue(newValue);
            for (const socket of props.socketsToUpdate) {
              (socket.dataType as NumberType).minValue = newValue;
            }
          }}
          onMaxChange={(newValue) => {
            setMaxValue(newValue);
            for (const socket of props.socketsToUpdate) {
              (socket.dataType as NumberType).maxValue = newValue;
            }
          }}
          stepSizeValue={stepSizeValue}
          propertyName={property.name}
        />
      )}
    </div>
  );
};

// why can options be undefined? I got a crash not good
const optionsHasOption = (options, data) => {
  return (
    options !== undefined && options.some((option) => option.text === data)
  );
};

export const SelectWidget: React.FunctionComponent<EnumTypeProps> = (props) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [options, setOptions] = useState(props.getOptions());
  const getEnabledValue = (nextOptions) =>
    nextOptions?.find((option) => !option.disabled)?.text ?? '';
  const [data, setData] = useState(
    optionsHasOption(options, property.data) &&
      !options.find((option) => option.text === property.data)?.disabled
      ? property.data
      : getEnabledValue(options),
  );

  useEffect(() => {
    const selectedOption = options?.find((option) => option.text === data);
    if (selectedOption?.disabled) {
      const localValue = getEnabledValue(options);
      setData(localValue);
      void potentiallyUpdateMultipleSocketsData(
        props.socketsToUpdate,
        localValue,
      );
      props.onChange?.(localValue);
    }
  }, [data, options]);

  useInterval(() => {
    if (data !== property.data) {
      setData(property.data);
    }
  }, 100);

  useInterval(() => {
    const nextOptions = props.getOptions();
    const optionsChanged =
      options.length !== nextOptions.length ||
      options.some(
        (option, index) =>
          option.text !== nextOptions[index]?.text ||
          option.disabled !== nextOptions[index]?.disabled,
      );
    if (optionsChanged) {
      setOptions(nextOptions);
    }
  }, 100);

  const onOpen = () => {
    if (props.setOptions) {
      setOptions(props.setOptions());
    }
  };

  const onChange = async (event, newValue?) => {
    // For ToggleButtonGroup, value comes as second argument (string)
    // For Select, value comes from event.target.value (second arg is a React element)
    // Check if newValue is a primitive (string/number) to distinguish the two cases
    const value =
      typeof newValue === 'string' || typeof newValue === 'number'
        ? newValue
        : event.target.value;
    setData(value);
    await potentiallyUpdateMultipleSocketsData(props.socketsToUpdate, value);
    props.onChange?.(value);
  };

  return (
    <FormControl sx={{ width: '100%' }} size="small">
      {props.dataType.showAsButtons ? (
        <ToggleButtonGroup
          color="primary"
          value={data}
          exclusive
          onChange={onChange}
          size="small"
          fullWidth
          sx={{
            mt: 1,
            '& .MuiToggleButtonGroup-grouped': {
              padding: '4px 8px',
              fontSize: '0.7rem',
              lineHeight: 1,
              height: '24px',
              '&:hover': {
                backgroundColor: 'secondary.dark',
              },
              '&.Mui-selected': {
                backgroundColor: 'secondary.main',
                color: 'secondary.contrastText',
              },
              '&.Mui-selected:hover': {
                backgroundColor: 'secondary.light',
              },
            },
          }}
        >
          {options?.map(({ text, disabled }, index) => {
            return (
              <ToggleButton
                key={index}
                value={text}
                title={text}
                disabled={disabled}
              >
                {text}
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
      ) : (
        <Select
          fullWidth
          variant="filled"
          value={data}
          onOpen={onOpen}
          onChange={onChange}
          MenuProps={{
            style: { zIndex: 1500 },
          }}
          sx={{
            height: '32px',
            fontSize: '16px',
            lineHeight: '8px',
          }}
          displayEmpty
        >
          {options?.map(({ text, disabled }, index) => {
            return (
              <MenuItem
                key={index}
                value={text}
                disabled={disabled}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'secondary.main',
                  },
                }}
              >
                {text}
              </MenuItem>
            );
          })}
        </Select>
      )}
    </FormControl>
  );
};

export const FileBrowserWidget: React.FunctionComponent<FileTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [filename, setFilename] = useState(property.data);
  const [options, setOptions] = useState([]);
  const [filterExtensions, setFilterExtensions] = useState(
    props.dataType.filterExtensions,
  );
  const [hoveredItem, setHoveredItem] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const onOpen = useCallback(async () => {
    const listOfResources = await PPStorage.getInstance().getResources();
    const filtered = listOfResources.filter(({ name }) => {
      if (filterExtensions.length === 0) {
        return true;
      }
      const extension = getFileExtension(name);
      return filterExtensions.includes(extension);
    });
    setOptions(filtered);
  }, [filterExtensions]);

  const setData = async (localResourceId) => {
    await potentiallyUpdateMultipleSocketsData(
      props.socketsToUpdate,
      localResourceId,
    );
    setFilename(localResourceId);
    // Refresh options list to include the newly added file
    await onOpen();
  };

  const openFileBrowser = useCallback(() => {
    if (property) {
      const fileHandler = async (data) => {
        await setData(data);
      };

      InterfaceController.onOpenFileBrowser(fileHandler);
    }
  }, [property]);

  const onChange = async (event) => {
    const value = event.target.value;
    await setData(value);
  };

  const handleDelete = async (id) => {
    await PPStorage.getInstance().deleteResource(id);
    setOptions(options.filter((option) => option.id !== id));
    if (filename === id) {
      setFilename('');
      await potentiallyUpdateMultipleSocketsData(props.socketsToUpdate, '');
    }
  };

  useInterval(() => {
    if (filename !== property.data) {
      setFilterExtensions(props.dataType.filterExtensions);
      setFilename(property.getStringifiedData());
      void onOpen();
    }
  }, 100);

  useEffect(() => {
    void onOpen();
  }, [onOpen]);

  const renderMenuItem = ({ id, name, size }) => (
    <MenuItem
      key={id}
      value={id}
      onMouseEnter={() => setHoveredItem(id)}
      onMouseLeave={() => setHoveredItem(null)}
      sx={{
        '&.Mui-selected': {
          backgroundColor: `${TRgba.fromString(props.randomMainColor).negate()}`,
        },
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <ListItemText>{name}</ListItemText>
      <ListItemSecondaryAction sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
          {prettyBytes(size)}
        </Typography>
        {hoveredItem === id && menuOpen && (
          <IconButton
            edge="end"
            aria-label="delete"
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete(id);
            }}
            size="small"
          >
            <DeleteIcon />
          </IconButton>
        )}
      </ListItemSecondaryAction>
    </MenuItem>
  );

  // the selected value is rendered outside of the menu list, so it must not
  // use MenuItem (it requires MenuListContext and would throw)
  const renderSelectedValue = ({ name }) => (
    <Box
      sx={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </Box>
  );

  return (
    <FormGroup sx={{ position: 'relative' }}>
      <FormControl variant="filled" fullWidth>
        <InputLabel>Select file (browser cache)</InputLabel>
        <Select
          variant="filled"
          value={filename}
          onOpen={() => {
            void onOpen();
            setMenuOpen(true);
          }}
          onClose={() => setMenuOpen(false)}
          onChange={onChange}
          sx={{ width: '100%' }}
          MenuProps={{
            style: { zIndex: 1500 },
          }}
          renderValue={(selected) => {
            const selectedOption = options.find(
              (option) => option.id === selected,
            );
            return selectedOption ? (
              renderSelectedValue(selectedOption)
            ) : (
              <em>None</em>
            );
          }}
        >
          {options.map((option) => renderMenuItem(option))}
        </Select>
        <Button
          color="secondary"
          variant="contained"
          onClick={openFileBrowser}
          sx={{
            mt: 1,
          }}
        >
          OR Load new file
        </Button>
      </FormControl>
    </FormGroup>
  );
};

export const BooleanWidget: React.FunctionComponent<BooleanTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [data, setData] = useState(Boolean(property.data));

  useInterval(() => {
    if (data !== property.data) {
      setData(Boolean(property.data));
    }
  }, 100);

  const onChange = async (event) => {
    const value = event.target.checked;
    setData(value);
    await potentiallyUpdateMultipleSocketsData(props.socketsToUpdate, value);
  };

  return (
    <FormGroup sx={{ pl: 1, userSelect: 'none' }}>
      <FormControlLabel
        control={
          <Switch
            checked={data}
            onChange={onChange}
            disabled={!property.isInput() || property.hasLink()}
            inputProps={{ 'aria-label': 'controlled' }}
            size="small"
          />
        }
        label={data.toString()}
      />
    </FormGroup>
  );
};

export const TextWidget: React.FunctionComponent<StringTypeProps> = (props) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const dataLength = property.getStringifiedData()?.length;
  const [loadAll, setLoadAll] = useState(dataLength < MAX_STRING_LENGTH);
  const disabled = property.hasLink();

  const [loadedData, setLoadedData] = useState(
    getLoadedValue(property.getStringifiedData(), loadAll),
  );

  const onLoadAll = () => {
    setLoadedData(property.getStringifiedData());
    setLoadAll(true);
  };

  useInterval(() => {
    if (loadedData !== property.data) {
      setLoadedData(getLoadedValue(property.getStringifiedData(), loadAll));
    }
  }, 100);

  const handleChange = async (event) => {
    const value = event.target.value;
    setLoadedData(value);
    await potentiallyUpdateMultipleSocketsData(props.socketsToUpdate, value);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
    }
  };

  return (
    <Box
      sx={{
        position: 'relative',
        opacity: disabled ? DISABLED_OPACITY : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {!loadAll && (
        <Button
          sx={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10 }}
          color="secondary"
          variant="contained"
          size="small"
          onClick={onLoadAll}
        >
          Load all (to edit)
        </Button>
      )}
      <TextField
        data-cy="textinput"
        sx={{
          width: '100%',
          maxHeight: '58vh',
          overflow: 'auto',
        }}
        hiddenLabel
        variant="filled"
        multiline
        disabled={!loadAll}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        value={loadedData}
      />
    </Box>
  );
};

export interface DataEditorWidgetProps {
  parseData: (value: string) => any;
  language: string;
  errorMessage: string;
  inDashboard?: boolean;
  socketsToUpdate: Socket[];
}

export const DataEditorWidget: React.FunctionComponent<
  DataEditorWidgetProps
> = ({
  parseData,
  language,
  errorMessage,
  inDashboard = false,
  socketsToUpdate,
}) => {
  // Reference socket for reading state
  const property = socketsToUpdate[0];

  const [displayedString, setDisplayedString] = useState(
    property.getStringifiedData(),
  );
  const [isValid, setIsValid] = useState(true);
  const disabled = property.hasLink();
  const lastSetValueRef = useRef(displayedString);

  useInterval(() => {
    try {
      if (lastSetValueRef.current !== property.getStringifiedData()) {
        setDisplayedString(property.getStringifiedData());
      }
    } catch (error) {}
  }, 100);

  const onChange = async (value: string) => {
    try {
      setDisplayedString(value);
      const parsedData = parseData(value);
      lastSetValueRef.current = convertToViewableString(parsedData);
      await potentiallyUpdateMultipleSocketsData(socketsToUpdate, parsedData);
      setIsValid(true);
    } catch (error) {
      console.warn(error);
      setIsValid(false);
    }
  };

  return (
    <Box sx={{ height: '100%' }}>
      <CodeEditor
        language={language}
        value={displayedString}
        editable={!disabled}
        onChange={onChange}
        inDashboard={inDashboard}
      />
      {!isValid && <Alert severity="error">{errorMessage}</Alert>}
    </Box>
  );
};

// Simple data editor for non-Socket data (like component props)
export interface SimpleDataEditorProps {
  value: any;
  onChange: (value: any) => void;
  language: string;
  errorMessage: string;
  inDashboard?: boolean;
}

export const SimpleDataEditor: React.FunctionComponent<
  SimpleDataEditorProps
> = ({ value, onChange, language, errorMessage, inDashboard = false }) => {
  const [displayedString, setDisplayedString] = useState(
    JSON.stringify(value, null, 2),
  );
  const [isValid, setIsValid] = useState(true);

  // Sync with external changes to value
  React.useEffect(() => {
    const stringified = JSON.stringify(value, null, 2);
    // Only update if the value changed from outside and is different from current valid parsed value
    try {
      const currentParsed = JSON.parse(displayedString);
      if (JSON.stringify(currentParsed) !== stringified) {
        setDisplayedString(stringified);
        setIsValid(true);
      }
    } catch {
      // If current string is invalid, update it with the valid external value
      setDisplayedString(stringified);
      setIsValid(true);
    }
  }, [value]);

  const handleChange = (newValue: string) => {
    setDisplayedString(newValue);
    try {
      const parsed = JSON.parse(newValue);
      onChange(parsed);
      setIsValid(true);
    } catch (error) {
      setIsValid(false);
    }
  };

  return (
    <Box sx={{ height: '100%' }}>
      <CodeEditor
        language={language}
        value={displayedString}
        editable={true}
        onChange={handleChange}
        inDashboard={inDashboard}
      />
      {!isValid && <Alert severity="error">{errorMessage}</Alert>}
    </Box>
  );
};

export const ArrayWidget: React.FunctionComponent<ArrayTypeProps> = (props) => (
  <DataEditorWidget
    language="json"
    inDashboard={props.inDashboard}
    socketsToUpdate={props.socketsToUpdate}
    parseData={(value) => {
      if (Array.isArray(value)) {
        return value;
      } else if (typeof value === 'string') {
        const parsedData = JSON.parse(value);
        if (!Array.isArray(parsedData)) {
          return [];
        }
        return parsedData;
      }
    }}
    errorMessage="Invalid Array!"
  />
);

export const CodeWidget: React.FunctionComponent<CodeTypeProps> = (props) => (
  <DataEditorWidget
    inDashboard={props.inDashboard}
    language={props.language}
    socketsToUpdate={props.socketsToUpdate}
    parseData={(value) => {
      if (typeof value !== 'string') {
        return convertToViewableString(value);
      }
      return value;
    }}
    errorMessage="Invalid Code!"
  />
);

export const JSONWidget: React.FunctionComponent<JSONTypeProps> = (props) => (
  <DataEditorWidget
    language="json"
    inDashboard={props.inDashboard}
    socketsToUpdate={props.socketsToUpdate}
    parseData={(value) => parseJSON(value).value}
    errorMessage="Invalid JSON!"
  />
);

export const HtmlWidget: React.FunctionComponent<HtmlTypeProps> = (props) => (
  <DataEditorWidget
    language="html"
    inDashboard={props.inDashboard}
    socketsToUpdate={props.socketsToUpdate}
    parseData={(value) => validateHtml(value).value}
    errorMessage="Invalid Html!"
  />
);

export const TriggerWidget: React.FunctionComponent<TriggerTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [triggerType, setChangeFunctionString] = useState(
    props.dataType.triggerType,
  );
  const [customFunctionString, setCustomFunctionString] = useState(
    props.dataType.customFunctionString,
  );
  const [visible, setVisible] = useState(props.dataType.showDetails);

  const getFunctionName = () => customFunctionString || 'executeOptimizedChain';

  useInterval(() => {
    if (props.dataType.customFunctionString !== customFunctionString) {
      setCustomFunctionString(props.dataType.customFunctionString);
    }
  }, 100);

  const onChangeTriggerType = (event) => {
    const value = event.target.value;
    props.dataType.triggerType = value;
    setChangeFunctionString(value);
  };

  const onChangeFunction = (event) => {
    const value = event.target.value;
    props.dataType.customFunctionString = value;
    setCustomFunctionString(value);
  };

  return (
    <>
      <FormControl sx={{ width: '100%' }} size="small">
        <FormGroup
          row={true}
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: '2px',
          }}
        >
          <Button
            endIcon={<PlayArrowIcon />}
            onClick={() => {
              // nodes with trigger input need a trigger function
              (property.getNode() as any)[getFunctionName()]();
            }}
            variant="contained"
            fullWidth
            sx={{
              height: 'auto',
              padding: '3px 16px',
              lineHeight: 1.5,
              '& .MuiButton-endIcon': {
                marginLeft: 1,
                marginRight: -0.5,
              },
              '& .MuiButton-label': {
                display: 'block',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              },
            }}
          >
            <span
              style={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={customFunctionString}
            >
              {getFunctionName()}
            </span>
          </Button>
          <ToggleButton
            data-cy="slider-details-visible-button"
            value="check"
            selected={visible}
            onChange={() => {
              setVisible((value) => {
                const newValue = !value;
                props.dataType.showDetails = newValue;
                return newValue;
              });
            }}
            sx={{
              ml: 1,
              px: 0.5,
              py: 0,
              fontSize: '12px',
              border: 0,
            }}
          >
            {visible ? (
              <ExpandLessIcon sx={{ fontSize: '16px' }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: '16px' }} />
            )}
          </ToggleButton>
        </FormGroup>
        {visible && (
          <FormGroup
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: '2px',
              marginTop: '8px',
            }}
          >
            <TextField
              variant="filled"
              placeholder="Name of function to trigger"
              label={
                customFunctionString === ''
                  ? 'executeOptimizedChain'
                  : 'Name of function to trigger'
              }
              onChange={onChangeFunction}
              value={customFunctionString}
            />
            <FormControl variant="filled" fullWidth>
              <Typography
                variant="subtitle2"
                gutterBottom
                sx={{
                  marginBottom: '0px',
                  marginTop: '4px',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  color: 'text.secondary',
                }}
              >
                Trigger on incoming value change
              </Typography>
              <ToggleButtonGroup
                color="primary"
                value={triggerType}
                exclusive
                onChange={onChangeTriggerType}
                size="small"
                fullWidth
                sx={{
                  mt: 1,
                  '& .MuiToggleButtonGroup-grouped': {
                    padding: '4px 6px',
                    fontSize: '0.65rem',
                    lineHeight: 1.5,
                    height: '32px',
                    '&:hover': {
                      backgroundColor: 'secondary.dark',
                    },
                    '&.Mui-selected': {
                      backgroundColor: 'secondary.main',
                      color: 'secondary.contrastText',
                    },
                    '&.Mui-selected:hover': {
                      backgroundColor: 'secondary.light',
                    },
                  },
                }}
              >
                {TRIGGER_TYPE_OPTIONS?.map(({ text }, index) => {
                  return (
                    <ToggleButton key={index} value={text}>
                      {text}
                    </ToggleButton>
                  );
                })}
              </ToggleButtonGroup>
            </FormControl>
          </FormGroup>
        )}
      </FormControl>
    </>
  );
};

interface ColorPickerProps {
  defaultColor?: TRgba;
  onChange?: (color: TRgba) => void;
  showAlphaSlider?: boolean;
  showPickerText?: boolean;
  disabled?: boolean;
}

export const ColorPickerComponent: React.FC<ColorPickerProps> = ({
  defaultColor = new TRgba(0, 0, 0, 1),
  onChange,
  showAlphaSlider = true,
  showPickerText = true,
  disabled = false,
}) => {
  const [colorPicker, showColorPicker] = useState(false);
  const [finalColor, setFinalColor] = useState(defaultColor);
  const anchorRef = useRef(null);
  const componentMounted = useRef(true);

  // had to comment this out, because it broke undo/redo for craft.js!
  // keeping it in for now as a reminder
  // useEffect(() => {
  //   setFinalColor(defaultColor);
  // }, [defaultColor]);

  useEffect(() => {
    if (componentMounted.current) {
      componentMounted.current = false;
    } else {
      onChange?.(finalColor);
    }
  }, [finalColor]);

  const handleClickAway = () => {
    showColorPicker(false);
  };

  const handleColorChange = (color: any) => {
    const pickedRgb = color.rgba;
    const newColor = new TRgba(
      pickedRgb.r,
      pickedRgb.g,
      pickedRgb.b,
      pickedRgb.a,
    );
    setFinalColor(newColor);
  };

  const handleAlphaChange = async (event: Event, value: number | number[]) => {
    if (!Array.isArray(value)) {
      const newColor = new TRgba(
        finalColor.r,
        finalColor.g,
        finalColor.b,
        value,
      );
      setFinalColor(newColor);
    }
  };

  return (
    <>
      <FormGroup
        row
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: '8px',
        }}
      >
        <Box
          ref={anchorRef}
          className={styles.colorPickerSwatch}
          sx={{
            backgroundColor: finalColor.hexa(),
            color: `${finalColor.isDark() ? COLOR_WHITE_TEXT : COLOR_DARK}`,
            userSelect: 'none',
            height: '100%',
            cursor: disabled ? 'default' : 'pointer',
          }}
          onClick={(event) => {
            if (!disabled) {
              event.stopPropagation();
              showColorPicker(!colorPicker);
            }
          }}
        >
          {showPickerText ? 'Pick a color' : ''}
        </Box>

        {showAlphaSlider && (
          <Slider
            size="small"
            disabled={disabled}
            valueLabelDisplay="auto"
            min={0}
            max={1}
            step={0.1}
            marks={[{ value: 0 }, { value: 1 }]}
            onChange={handleAlphaChange}
            value={finalColor.a}
            sx={{
              mx: 1,
              width: '50%',
            }}
          />
        )}
      </FormGroup>

      <ClickAwayListener onClickAway={handleClickAway}>
        <Popper
          open={!disabled && colorPicker}
          anchorEl={anchorRef.current}
          sx={{ zIndex: 110 }}
        >
          <Sketch
            color={finalColor.hsva()}
            onChange={handleColorChange}
            presetColors={PRESET_COLORS}
          />
        </Popper>
      </ClickAwayListener>
    </>
  );
};

export const ColorWidget: React.FunctionComponent<ColorTypeProps> = (props) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const defaultColor: TRgba = Object.assign(new TRgba(), property.data);

  return (
    <ColorPickerComponent
      defaultColor={defaultColor}
      onChange={(color) => {
        void potentiallyUpdateMultipleSocketsData(
          props.socketsToUpdate,
          Object.assign(new TRgba(), color),
        );
      }}
      showAlphaSlider={true}
      showPickerText={property.isInput()}
      disabled={!property.isInput()}
    />
  );
};

function getVectorFieldWidget<T extends Record<string, number>>(
  prevFullVector: T,
  setVector: (vector: T) => void,
  field: keyof T,
  cypressName: string,
) {
  return (
    <NumberInput
      label={field as string}
      dataCy={cypressName}
      sx={{ flexGrow: 1 }}
      onChange={(value) => {
        const updatedVector = { ...prevFullVector, [field]: value ?? 0 };
        setVector(updatedVector);
      }}
      value={prevFullVector[field]}
    />
  );
}

export const TwoDNumberWidget: React.FunctionComponent<DataTypeProps> = (
  props: TwoDVectorTypeProps,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  let incoming = { x: property.data.x, y: property.data.y };
  const [current, setCurrent] = useState(incoming);

  useInterval(() => {
    incoming = { x: property.data.x, y: property.data.y };
    if (incoming.x !== current.x || incoming.y !== current.y) {
      setCurrent(incoming);
    }
  }, 100);

  const setVector = async (newVector: TwoDVectorTypeInterface) => {
    await potentiallyUpdateMultipleSocketsData(
      props.socketsToUpdate,
      newVector,
    );
  };
  const cypressName = `${property.name}-value`;

  return (
    <FormGroup
      row={true}
      sx={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '2px',
      }}
    >
      {getVectorFieldWidget(current, setVector, 'x', cypressName)}
      {getVectorFieldWidget(current, setVector, 'y', cypressName)}
    </FormGroup>
  );
};

export const ThreeDNumberWidget: React.FunctionComponent<DataTypeProps> = (
  props: ThreeDVectorTypeProps,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  let incoming = {
    x: property.data.x,
    y: property.data.y,
    z: property.data.z,
  };
  const [current, setCurrent] = useState(incoming);

  useInterval(() => {
    incoming = {
      x: property.data.x,
      y: property.data.y,
      z: property.data.z,
    };
    if (
      incoming.x !== current.x ||
      incoming.y !== current.y ||
      incoming.z !== current.z
    ) {
      setCurrent(incoming);
    }
  }, 100);

  const setVector = async (newVector: ThreeDVectorTypeInterface) => {
    await potentiallyUpdateMultipleSocketsData(
      props.socketsToUpdate,
      newVector,
    );
  };
  const cypressName = `${property.name}-value`;

  return (
    <FormGroup
      row={true}
      sx={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: '2px',
      }}
    >
      {getVectorFieldWidget(current, setVector, 'x', cypressName)}
      {getVectorFieldWidget(current, setVector, 'y', cypressName)}
      {getVectorFieldWidget(current, setVector, 'z', cypressName)}
    </FormGroup>
  );
};

export const NumberOutputWidget: React.FunctionComponent<DataTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [data, setData] = useState(Number(property.data));

  useInterval(() => {
    if (data !== property.data) {
      setData(Number(property.data));
    }
  }, 100);

  return (
    <>
      <FormGroup
        row={true}
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
        }}
      >
        <NumberInput
          sx={{ flexGrow: 1 }}
          disabled={true}
          readOnly
          value={data}
          size="small"
        />
      </FormGroup>
    </>
  );
};

export const DefaultOutputWidget: React.FunctionComponent<DataTypeProps> = (
  props,
) => {
  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  const [data, setData] = useState(property.getStringifiedData());

  useInterval(() => {
    const formattedData = property.getStringifiedData();
    if (formattedData !== data) {
      setData(formattedData);
    }
  }, 100);

  return (
    <Suspense>
      <CodeEditor
        language={props.language}
        value={data}
        editable={false}
        inDashboard={props.inDashboard}
      />
    </Suspense>
  );
};
