import React from 'react';
import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  ThemeProvider,
} from '@mui/material';
import Socket from '../../classes/SocketClass';
import {
  defaultOptions,
  fallbackValueName,
  labelName,
  optionsName,
  outName,
  selectedOptionName,
  stringifyIfNeeded,
  WidgetPaper,
} from './abstract';
import { WidgetSelectableBase } from './selectable-base';
import { SOCKET_TYPE, customTheme } from '../../utils/constants';
import { ArrayType } from '../datatypes/arrayType';
import { StringType } from '../datatypes/stringType';
import { WidgetContentProps } from '../../utils/interfaces';

enum DropdownType {
  SINGLE = 'Dropdown (single select)',
  MULTI = 'Dropdown (multi select)',
}

const dropDownDefaultName = 'Dropdown';

// Base abstract class for shared functionality
abstract class WidgetDropdownBase extends WidgetSelectableBase {
  public getName(): string {
    return this.getDropdownType();
  }

  public getDescription(): string {
    return `Adds a ${this.getDropdownType().toLowerCase()} dropdown to select values`;
  }

  public getTags(): string[] {
    return ['Filter'].concat(super.getTags());
  }

  protected getDropdownType(): DropdownType {
    return this.isSingle() ? DropdownType.SINGLE : DropdownType.MULTI;
  }

  handleOnChange = async (event) => {
    const {
      target: { value },
    } = event;
    await this.performValueChange(value);
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
        dropDownDefaultName,
        false,
      ),
    ];
  }

  public getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as WidgetDropdownBase;

    const renderMenuItems = () => {
      if (!Array.isArray(props[optionsName])) return null;
      const stringArray = props[optionsName].map(stringifyIfNeeded);

      return stringArray.map((name) => (
        <MenuItem key={name} value={name}>
          {!node.isSingle() && (
            <Checkbox
              checked={
                (
                  node.formatSelected(props[selectedOptionName]) as string[]
                ).indexOf(name) > -1
              }
            />
          )}
          <ListItemText primary={name} />
        </MenuItem>
      ));
    };

    return (
      <ThemeProvider theme={customTheme}>
        <WidgetPaper node={node} inDashboard={props.inDashboard}>
          <FormControl
            variant="filled"
            sx={{
              pointerEvents: props.disabled ? 'none' : undefined,
            }}
          >
            <InputLabel>{props[labelName]}</InputLabel>
            <Select
              variant="filled"
              disabled={props.disabled}
              multiple={!node.isSingle()}
              value={node.formatSelected(props[selectedOptionName])}
              onChange={(event) => {
                void node.handleOnChange(event);
              }}
              renderValue={(selected) =>
                Array.isArray(selected) ? selected.join(', ') : selected
              }
              MenuProps={getMenuProps()}
            >
              {renderMenuItems()}
            </Select>
          </FormControl>
        </WidgetPaper>
      </ThemeProvider>
    );
  }
}

// Single Select Dropdown
export class WidgetDropdown extends WidgetDropdownBase {
  protected getDefaultIO(): Socket[] {
    return WidgetDropdownBase.getSelectTypeSockets(true).concat(
      super.getDefaultIO(),
    );
  }

  protected isSingle(): boolean {
    return true;
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

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 2) {
      this.removeSocket(this.getInputSocketByName('Select multiple'));
    }
  }
}

// Multi Select Dropdown
export class WidgetMultiDropdown extends WidgetDropdownBase {
  protected getDefaultIO(): Socket[] {
    return WidgetDropdownBase.getSelectTypeSockets(false).concat(
      super.getDefaultIO(),
    );
  }

  protected isSingle(): boolean {
    return false;
  }

  protected formatSelected(selected: unknown): string[] {
    const parsed = this.parseSelected(selected);
    return Array.isArray(parsed) ? parsed : String(parsed).split(',');
  }

  protected getDefaultSelectedSocket(): Socket {
    return new Socket(
      SOCKET_TYPE.IN,
      selectedOptionName,
      new ArrayType(),
      undefined,
      false,
    );
  }
}

// Utility function for menu props
const getMenuProps = () => {
  const ITEM_HEIGHT = 48;
  const ITEM_PADDING_TOP = 8;
  return {
    PaperProps: {
      style: {
        maxHeight: ITEM_HEIGHT * 9.5 + ITEM_PADDING_TOP,
      },
    },
  };
};
