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
  getMuiSize,
  colorName,
  getColorSocket,
  getSizeSocket,
  getSizeSx,
  getLabelSocket,
  getWidgetControlProps,
  commitDelayName,
  commitModeName,
  getCommitDelaySocket,
  getCommitModeSocket,
  searchCommitOptions,
  useCommitMode,
  labelName,
  optionsName,
  selectedOptionName,
  sizeName,
  useWidgetSize,
  useSizeSx,
  useFontScalar,
  stringifyIfNeeded,
  WidgetPaper,
  getHiddenLabelSx,
  getLabelPosition,
  getLabelPositionSocket,
  useSizeTokens,
  useWidgetLabelIds,
  WidgetLabelFrame,
} from './abstract';
import { readWidgetValue } from './widgetEdits';
import { WidgetSelectableBase } from './selectable-base';
import { SOCKET_TYPE } from '../../utils/constants';
import { ArrayType } from '../datatypes/arrayType';
import { StringType } from '../datatypes/stringType';
import { BooleanType } from '../datatypes/booleanType';
import { WidgetContentProps } from '../../utils/interfaces';
import { useResolvedInputVariant } from '../../utils/theme';
import type { TemplateInstanceHandle } from '../../components/dashboard/templateInstance';

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

  handleOnChange = async (
    newValue: unknown,
    instance?: TemplateInstanceHandle,
  ) => {
    await this.performValueChange(newValue, instance);
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
      getLabelSocket(autocompleteDefaultLabel),
      getLabelPositionSocket(),
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
      ...new Set<string>(props[optionsName].map(stringifyIfNeeded)),
    ];
    const freeSolo = props[freeSoloName];
    const noOptionsText = props[noOptionsTextName];
    const isDisabled = props[disabledName] || props.disabled;
    const placeholder = props[placeholderName];
    const size = useWidgetSize(props[sizeName]);
    const fontScalar = useFontScalar();
    const sizeSx = useSizeSx(size);
    const tokens = useSizeTokens(size);
    const inputVariant = useResolvedInputVariant();
    const color = props[colorName];
    const position = getLabelPosition(props);
    const framed = position !== 'Default';
    const { labelId, controlId } = useWidgetLabelIds();
    const formSx = {
      width: '100%',
      ...sizeSx,
      ...(framed && getHiddenLabelSx(tokens)),
    };
    // the label sits outside the field, or floats inside it by default
    const labelProps = framed
      ? { hiddenLabel: true }
      : { label: props[labelName] };
    const frame = (control: React.ReactElement) => (
      <WidgetPaper node={node} inDashboard={props.inDashboard}>
        <WidgetLabelFrame
          position={position}
          label={props[labelName]}
          labelId={labelId}
          htmlFor={controlId}
          tokens={tokens}
          rowHeight={tokens.controlHeight}
        >
          {control}
        </WidgetLabelFrame>
      </WidgetPaper>
    );

    const currentValue = node.formatSelected(props[selectedOptionName]);
    // only the single-select free-text path defers
    const commit = useCommitMode<string>(
      typeof currentValue === 'string' ? currentValue : '',
      (text) => void node.handleOnChange(text, props.templateInstance),
      { mode: props[commitModeName], delay: props[commitDelayName] },
    );

    if (node.isSingle()) {
      return frame(
        <FormControl variant={inputVariant} margin="none" sx={formSx}>
          <Autocomplete
            {...getWidgetControlProps(isDisabled)}
            {...(framed && { id: controlId })}
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
              // a pick beats whatever was half-typed
              commit.revert();
              void node.handleOnChange(newValue ?? '', props.templateInstance);
            }}
            onInputChange={(_event, newInputValue, reason) => {
              if (freeSolo && reason === 'input') {
                commit.edit(newInputValue);
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                margin="none"
                color={color}
                variant={inputVariant}
                {...labelProps}
                placeholder={placeholder}
              />
            )}
            slotProps={getAutocompleteSlotProps(size, fontScalar)}
          />
        </FormControl>,
      );
    }

    // Multi select
    const multiValue: string[] = Array.isArray(currentValue)
      ? currentValue
      : [];

    return frame(
      <FormControl variant={inputVariant} margin="none" sx={formSx}>
        <Autocomplete
          {...getWidgetControlProps(isDisabled)}
          {...(framed && { id: controlId })}
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
            void node.handleOnChange(newValue, props.templateInstance);
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
              margin="none"
              color={color}
              variant={inputVariant}
              {...labelProps}
              placeholder={multiValue.length === 0 ? placeholder : undefined}
            />
          )}
          slotProps={getAutocompleteSlotProps(size, fontScalar)}
        />
      </FormControl>,
    );
  }
}

// Single Select Autocomplete
export class WidgetAutocomplete extends WidgetAutocompleteBase {
  protected getDefaultIO(): Socket[] {
    return WidgetAutocompleteBase.getSelectTypeSockets(true).concat(
      super.getDefaultIO(),
      [
        getCommitModeSocket(searchCommitOptions, () =>
          this.getInputData(freeSoloName),
        ),
        getCommitDelaySocket(this),
      ],
    );
  }

  protected isSingle(): boolean {
    return true;
  }

  protected validateAndFormatSelected(
    selected: unknown,
    options: any[],
    instance?: TemplateInstanceHandle,
  ): unknown {
    const freeSolo = readWidgetValue(this, freeSoloName, instance);
    if (freeSolo) {
      return this.formatSelected(selected);
    }
    return super.validateAndFormatSelected(selected, options, instance);
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
    instance?: TemplateInstanceHandle,
  ): unknown {
    const formatted = this.formatSelected(selected);
    const freeSolo = readWidgetValue(this, freeSoloName, instance);
    if (freeSolo) {
      return formatted;
    }
    return super.validateAndFormatSelected(selected, options, instance);
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
