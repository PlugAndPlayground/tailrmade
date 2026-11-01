import Socket from '../../classes/SocketClass';
import {
  fallbackValueName,
  labelName,
  optionsName,
  outName,
  selectedOptionName,
  stringifyIfNeeded,
  WidgetHybridBase,
} from './abstract';
import { BackPropagation } from '../../interfaces';
import type { TemplateInstanceHandle } from '../../components/dashboard/templateInstance';
import { SOCKET_TYPE } from '../../utils/constants';
import { ArrayType } from '../datatypes/arrayType';
import { StringType } from '../datatypes/stringType';

// Shared abstract base for Dropdown and Autocomplete widgets
export abstract class WidgetSelectableBase extends WidgetHybridBase {
  protected abstract isSingle(): boolean;

  /**
   * Returns the output + fallback sockets based on single/multi mode.
   * Single: fallback input + string output. Multi: array output.
   * Static so it can be called safely during construction (before `this` is fully initialized).
   */
  protected static getSelectTypeSockets(isSingle: boolean): Socket[] {
    if (isSingle) {
      return [
        new Socket(
          SOCKET_TYPE.IN,
          fallbackValueName,
          new StringType(),
          '',
          false,
        ),
        new Socket(SOCKET_TYPE.OUT, outName, new StringType()),
      ];
    }
    return [new Socket(SOCKET_TYPE.OUT, outName, new ArrayType())];
  }

  protected validateAndFormatSelected(
    selected: unknown,
    options: any[],
    instance?: TemplateInstanceHandle,
  ): unknown {
    if (this.isSingle()) {
      const formatted = this.formatSelected(selected) as string;
      return options.includes(formatted)
        ? formatted
        : this.readWidgetValue(fallbackValueName, instance);
    }
    const formatted = this.formatSelected(selected) as string[];
    // Return options in their original order, only keeping those that were selected
    return options.filter((option) => formatted.includes(option));
  }

  protected formatSelected(selected: unknown): unknown {
    const parsed = this.parseSelected(selected);
    if (this.isSingle()) {
      return Array.isArray(parsed) ? parsed.join(',') : String(parsed ?? '');
    }
    return Array.isArray(parsed)
      ? parsed.map(stringifyIfNeeded)
      : String(parsed ?? '').split(',');
  }

  // Default multi-select implementation.
  // Single-select subclasses should override.
  protected getDefaultSelectedSocket(): Socket {
    return new Socket(
      SOCKET_TYPE.IN,
      selectedOptionName,
      new ArrayType(),
      [],
      false,
    );
  }

  public getDefaultNodeWidth(): number {
    return 250;
  }

  public getDefaultNodeHeight(): number {
    return 104;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(selectedOptionName),
      SocketToGetOptions: this.getInputSocketByName(optionsName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected stringifyOptions(options: any[]): string[] {
    return options.map(stringifyIfNeeded);
  }

  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    await super.onExecute(inputObject, outputObject);
    const options = inputObject[optionsName];
    const stringified = this.stringifyOptions(options);
    const formattedValue = this.validateAndFormatSelected(
      inputObject[selectedOptionName],
      stringified,
    );
    outputObject[outName] = formattedValue;
    outputObject[selectedOptionName] = formattedValue;
  }

  protected async performValueChange(
    newValue: unknown,
    instance?: TemplateInstanceHandle,
  ): Promise<void> {
    const options = this.stringifyOptions(
      this.readWidgetValue(optionsName, instance) as any[],
    );
    await this.commitWidgetEdit(
      selectedOptionName,
      this.validateAndFormatSelected(newValue, options, instance),
      instance,
      `${this.getName()} Apply Value`,
    );
  }

  protected parseSelected(selected: unknown): unknown {
    if (typeof selected === 'string') {
      try {
        return JSON.parse(selected);
      } catch (e) {
        return selected;
      }
    }
    return selected;
  }
}
