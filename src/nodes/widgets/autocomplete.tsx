import React from 'react';
import {
  Autocomplete,
  Checkbox,
  Chip,
  FormControl,
  TextField,
} from '@mui/material';
import Socket from '../../classes/SocketClass';
import {
  defaultOptions,
  fallbackValueName,
  getMuiSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  getSizeSx,
  labelName,
  optionsName,
  outName,
  selectedOptionName,
  sizeName,
  useWidgetSize,
  useSizeSx,
  useFontScalar,
  stringifyIfNeeded,
  WidgetPaper,
} from './abstract';
import { WidgetSelectableBase } from './selectable-base';
import { SOCKET_TYPE } from '../../utils/constants';
import { ArrayType } from '../datatypes/arrayType';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { WidgetContentProps } from '../../utils/interfaces';
import { useResolvedInputVariant } from '../../utils/theme';

enum AutocompleteType {
  SINGLE = '(single select)',
  MULTI = '(multi select)',
}

// Socket names
const placeholderName = 'Placeholder';
const freeSoloName = 'Allow custom values';
const noOptionsTextName = 'No options text';
const disabledName = 'Disabled';

// Defaults
const autocompleteDefaultLabel = 'Autocomplete';

// Shared slot props to ensure dropdown width matches input. The option list
// renders in a portal, so it also has to carry the size styling itself
const getAutocompleteSlotProps = (size: unknown, fontScalar: number) => ({
  paper: {
    sx: getSizeSx(size, fontScalar),
  },
  popper: {
    placement: 'bottom-start' as const,
    style: { width: 'auto' },
    modifiers: [
      {
        name: 'sameWidth',
        enabled: true,
        phase: 'beforeWrite' as const,
        requires: ['computeStyles'],
        fn: ({ state }) => {
          state.styles.popper.minWidth = `${state.rects.reference.width}px`;
        },
        effect: ({ state }) => {
          state.elements.popper.style.minWidth = `${(state.elements.reference as HTMLElement).offsetWidth}px`;
        },
      },
    ],
  },
});

// Base abstract class for shared autocomplete functionality
abstract class WidgetAutocompleteBase extends WidgetSelectableBase {
  public getName(): string {
    return `Autocomplete ${this.getAutocompleteType()}`;
  }

  public getDescription(): string {
    return `Adds a searchable ${this.getAutocompleteType().toLowerCase()} dropdown to select values`;
  }

  public getTags(): string[] {
    return ['Search', 'Filter'].concat(super.getTags());
  }

  protected getAutocompleteType(): AutocompleteType {
    return this.isSingle() ? AutocompleteType.SINGLE : AutocompleteType.MULTI;
  }

  protected stringifyOptions(options: any[]): string[] {
    return [...new Set(options.map(stringifyIfNeeded))];
  }

  handleOnChange = async (newValue: unknown) => {
    await this.performValueChange(newValue);
  };

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        optionsName,
        new ArrayType(),
        defaultOptions,
        false,
      ),
      this.getDefaultSelectedSocket(),
      new Socket(
        SOCKET_TYPE.IN,
        labelName,
        new StringType(),
        autocompleteDefaultLabel,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        placeholderName,
        new StringType(),
        'Search...',
        false,
      ),
      new Socket(SOCKET_TYPE.IN, freeSoloName, new BooleanType(), false, false),
      new Socket(
        SOCKET_TYPE.IN,
        noOptionsTextName,
        new StringType(),
        'No options',
        false,
      ),
      new Socket(SOCKET_TYPE.IN, disabledName, new BooleanType(), false, false),
      getColorSocket(),
      getSizeSocket(),
    ];
  }

  public getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetAutocompleteBase;

    const options: string[] = [
      ...new Set(props[optionsName].map(stringifyIfNeeded)),
    ];
    const freeSolo = props[freeSoloName];
    const noOptionsText = props[noOptionsTextName];
    const isDisabled = props[disabledName] || props.disabled;
    const placeholder = props[placeholderName];
    const size = useWidgetSize(props[sizeName]);
    const fontScalar = useFontScalar();
    const sizeSx = useSizeSx(size);
    const inputVariant = useResolvedInputVariant();
    const color = props[colorName];

    const currentValue = node.formatSelected(props[selectedOptionName]);

    if (node.isSingle()) {
      return (
        <WidgetPaper node={node} inDashboard={props.inDashboard}>
          <FormControl variant={inputVariant} sx={{ width: '100%', ...sizeSx }}>
            <Autocomplete
              autoHighlight
              size={getMuiSize(size)}
              freeSolo={freeSolo}
              options={options}
              value={
                typeof currentValue === 'string' && currentValue !== ''
                  ? currentValue
                  : null
              }
              disabled={isDisabled}
              noOptionsText={noOptionsText}
              onChange={(_event, newValue) => {
                void node.handleOnChange(newValue ?? '');
              }}
              onInputChange={(_event, newInputValue, reason) => {
                if (freeSolo && reason === 'input') {
                  void node.handleOnChange(newInputValue);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  color={color}
                  variant={inputVariant}
                  label={props[labelName]}
                  placeholder={placeholder}
                />
              )}
              slotProps={getAutocompleteSlotProps(size, fontScalar)}
            />
          </FormControl>
        </WidgetPaper>
      );
    }

    // Multi select
    const multiValue: string[] = Array.isArray(currentValue)
      ? currentValue
      : [];

    return (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <FormControl variant={inputVariant} sx={{ width: '100%', ...sizeSx }}>
          <Autocomplete
            multiple
            autoHighlight
            size={getMuiSize(size)}
            freeSolo={freeSolo}
            options={options}
            value={multiValue}
            disabled={isDisabled}
            disableCloseOnSelect
            noOptionsText={noOptionsText}
            onChange={(_event, newValue) => {
              void node.handleOnChange(newValue);
            }}
            renderOption={(optionProps, option, { selected }) => (
              <li {...optionProps}>
                <Checkbox color={color} checked={selected} sx={{ mr: 1 }} />
                {option}
              </li>
            )}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...itemProps } = getItemProps({ index });
                return (
                  <Chip label={option} size="small" {...itemProps} key={key} />
                );
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                color={color}
                variant={inputVariant}
                label={props[labelName]}
                placeholder={multiValue.length === 0 ? placeholder : undefined}
              />
            )}
            slotProps={getAutocompleteSlotProps(size, fontScalar)}
          />
        </FormControl>
      </WidgetPaper>
    );
  }
}

// Single Select Autocomplete
export class WidgetAutocomplete extends WidgetAutocompleteBase {
  protected getDefaultIO(): Socket[] {
    return WidgetAutocompleteBase.getSelectTypeSockets(true).concat(
      super.getDefaultIO(),
    );
  }

  protected isSingle(): boolean {
    return true;
  }

  protected validateAndFormatSelected(
    selected: unknown,
    options: any[],
  ): unknown {
    const freeSolo = this.getInputData(freeSoloName);
    if (freeSolo) {
      return this.formatSelected(selected);
    }
    return super.validateAndFormatSelected(selected, options);
  }

  protected getDefaultSelectedSocket(): Socket {
    return new Socket(
      SOCKET_TYPE.IN,
      selectedOptionName,
      new StringType(),
      undefined,
      false,
    );
  }
}

// Multi Select Autocomplete
export class WidgetMultiAutocomplete extends WidgetAutocompleteBase {
  protected getDefaultIO(): Socket[] {
    return WidgetAutocompleteBase.getSelectTypeSockets(false).concat(
      super.getDefaultIO(),
    );
  }

  protected isSingle(): boolean {
    return false;
  }

  protected validateAndFormatSelected(
    selected: unknown,
    options: any[],
  ): unknown {
    const formatted = this.formatSelected(selected);
    const freeSolo = this.getInputData(freeSoloName);
    if (freeSolo) {
      return formatted;
    }
    return super.validateAndFormatSelected(selected, options);
  }

  protected getDefaultSelectedSocket(): Socket {
    return new Socket(
      SOCKET_TYPE.IN,
      selectedOptionName,
      new ArrayType(),
      [],
      false,
    );
  }

  public getDefaultNodeHeight(): number {
    return 120;
  }
}
