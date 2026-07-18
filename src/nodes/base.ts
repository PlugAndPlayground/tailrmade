/* eslint-disable */

import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import PPSocket from '../classes/SocketClass';
import UpdateBehaviourClass from '../classes/UpdateBehaviourClass';
import { TRgba } from '../utils/color';
import {
  COLOR,
  COMPARISON_OPTIONS,
  CONDITION_OPTIONS,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
} from '../utils/constants';
import { CustomArgs, TNodeSource } from '../utils/interfaces';
import {
  compare,
  getCurrentButtons,
  getCurrentCursorPosition,
  getPropertyNames,
  isVariable,
} from '../utils/utils';
import { NumberType } from './datatypes/numberType';
import { AnyType } from './datatypes/anyType';
import { ArrayType } from './datatypes/arrayType';
import { ColorType } from './datatypes/colorType';
import { StringType } from './datatypes/stringType';
import { EnumType } from './datatypes/enumType';
import { BOOLEAN_COLOR, BooleanType } from './datatypes/booleanType';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

// Initialize TimeAgo with English locale
TimeAgo.addLocale(en);

export class Placeholder extends PPNode {
  public getName(): string {
    return 'Placeholder';
  }

  public getDescription(): string {
    return 'Adds a placeholder node';
  }

  public getTags(): string[] {
    return ['Misc'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.MISSING);
  }

  getCanAddInput(): boolean {
    return true;
  }
}

export class Mouse extends PPNode {
  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getName(): string {
    return 'Mouse';
  }

  public getDescription(): string {
    return 'Gets mouse coordinates';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, 'screen-x', new NumberType()),
      new PPSocket(SOCKET_TYPE.OUT, 'screen-y', new NumberType()),
      new PPSocket(SOCKET_TYPE.OUT, 'world-x', new NumberType()),
      new PPSocket(SOCKET_TYPE.OUT, 'world-y', new NumberType()),
      new PPSocket(SOCKET_TYPE.OUT, 'scale', new NumberType()),
      new PPSocket(SOCKET_TYPE.OUT, 'buttons', new NumberType()),
    ].concat(super.getDefaultIO());
  }

  public onExecute = async function () {
    this.setOutputData('scale', PPGraph.currentGraph.viewportScaleX);
    const worldPosition = getCurrentCursorPosition();
    const screenPosition = PPGraph.currentGraph.viewport.toScreen(
      worldPosition.x,
      worldPosition.y,
    );
    this.setOutputData('screen-x', Math.round(screenPosition.x));
    this.setOutputData('screen-y', Math.round(screenPosition.y));
    this.setOutputData('world-x', worldPosition.x);
    this.setOutputData('world-y', worldPosition.y);
    this.setOutputData('buttons', getCurrentButtons());
  };
}

export class Keyboard extends PPNode {
  onKeyDownHandler: (event?: KeyboardEvent) => void = () => {};
  onKeyUpHandler: (event?: KeyboardEvent) => void = () => {};
  onKeyDown = (event: KeyboardEvent): void => {
    this.setOutputData('key', event.key);
    this.setOutputData('code', event.code);
    this.setOutputData('shiftKey', event.shiftKey);
    this.setOutputData('ctrlKey', event.ctrlKey);
    this.setOutputData('altKey', event.altKey);
    this.setOutputData('metaKey', event.metaKey);
    this.setOutputData('repeat', event.repeat);
    this.executeChildren();
  };
  onKeyUp = (): void => {
    if (!this.getInputData('keep last')) {
      this.setOutputData('key', '');
      this.setOutputData('code', '');
      this.setOutputData('shiftKey', false);
      this.setOutputData('ctrlKey', false);
      this.setOutputData('altKey', false);
      this.setOutputData('metaKey', false);
      this.setOutputData('repeat', false);
      this.executeChildren();
    }
  };

  public getName(): string {
    return 'Keyboard';
  }

  public getDescription(): string {
    return 'Get keyboard input';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, 'key', new StringType()),
      new PPSocket(SOCKET_TYPE.OUT, 'code', new StringType()),
      new PPSocket(SOCKET_TYPE.OUT, 'shiftKey', new BooleanType()),
      new PPSocket(SOCKET_TYPE.OUT, 'ctrlKey', new BooleanType()),
      new PPSocket(SOCKET_TYPE.OUT, 'altKey', new BooleanType()),
      new PPSocket(SOCKET_TYPE.OUT, 'metaKey', new BooleanType()),
      new PPSocket(SOCKET_TYPE.OUT, 'repeat', new BooleanType()),
      new PPSocket(
        SOCKET_TYPE.IN,
        'keep last',
        new BooleanType(),
        false,
        false,
      ),
    ].concat(super.getDefaultIO());
  }
  public async onNodeAdded(source: TNodeSource): Promise<void> {
    await super.onNodeAdded(source);
    // add event listener
    this.onKeyDownHandler = this.onKeyDown.bind(this);
    window.addEventListener('keydown', (this as any).onKeyDownHandler);
    this.onKeyUpHandler = this.onKeyUp.bind(this);
    window.addEventListener('keyup', (this as any).onKeyUpHandler);
  }

  onNodeRemoved = (): void => {
    window.removeEventListener('keydown', this.onKeyDownHandler);
    window.removeEventListener('keyup', this.onKeyUpHandler);
  };
}

export class GridCoordinates extends PPNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });

    this.onExecute = async function (input, output) {
      const x = input['x'];
      const y = input['y'];
      const count = input['count'];
      const column = Math.abs(input['column']);
      const distanceWidth = Math.abs(input['distanceWidth']);
      const distanceHeight = Math.abs(input['distanceHeight']);
      const xArray: number[] = [];
      const yArray: number[] = [];
      for (let indexCount = 0; indexCount < count; indexCount++) {
        xArray.push(x + distanceWidth * (indexCount % column));
        yArray.push(y + distanceHeight * Math.floor(indexCount / column));
      }
      output['x-array'] = xArray;
      output['y-array'] = yArray;
    };
  }

  public getName(): string {
    return 'Grid coordinates';
  }

  public getDescription(): string {
    return 'Create grid coordinates';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, 'x-array', new ArrayType()),
      new PPSocket(SOCKET_TYPE.OUT, 'y-array', new ArrayType()),
      new PPSocket(SOCKET_TYPE.IN, 'x', new NumberType(), 0, false),
      new PPSocket(SOCKET_TYPE.IN, 'y', new NumberType(), 0, false),
      new PPSocket(SOCKET_TYPE.IN, 'count', new NumberType(true), 9, false),
      new PPSocket(SOCKET_TYPE.IN, 'column', new NumberType(true), 3, false),
      new PPSocket(
        SOCKET_TYPE.IN,
        'distanceWidth',
        new NumberType(),
        110.0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        'distanceHeight',
        new NumberType(),
        110.0,
        false,
      ),
    ].concat(super.getDefaultIO());
  }
}

export class ColorArray extends PPNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });

    this.onExecute = async function (input, output) {
      const count = input['count'];
      const colorA: TRgba = input['colorA'];
      const colorB: TRgba = input['colorB'];
      const colorArray: TRgba[] = [];
      for (let indexCount = 0; indexCount < count; indexCount++) {
        const blendFactor = count <= 1 ? 0 : indexCount / (count - 1);
        colorArray.push(colorA.mix(colorB, blendFactor));
      }
      output['color-array'] = colorArray;
    };
  }

  public getName(): string {
    return 'Color array';
  }

  public getDescription(): string {
    return 'Create color array';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    const colorA: TRgba = TRgba.fromString(COLOR[5]);
    const colorB: TRgba = TRgba.fromString(COLOR[15]);
    return [
      new PPSocket(SOCKET_TYPE.OUT, 'color-array', new ArrayType()),
      new PPSocket(SOCKET_TYPE.IN, 'count', new NumberType(true), 9, false),
      new PPSocket(SOCKET_TYPE.IN, 'colorA', new ColorType(), colorA, false),
      new PPSocket(SOCKET_TYPE.IN, 'colorB', new ColorType(), colorB, false),
    ].concat(super.getDefaultIO());
  }
}

const startName = 'Start';
const stopName = 'Stop';
const stepName = 'Step';
const totalName = 'Total';
const useTotalName = 'Use total';
const roundNumbersName = 'Round numbers';
const outputArrayName = 'Output';
export class RangeArray extends PPNode {
  public getName(): string {
    return 'Range array';
  }

  public getDescription(): string {
    return 'Creates an array of a number range with options for step/total elements and rounding';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, outputArrayName, new ArrayType()),
      new PPSocket(SOCKET_TYPE.IN, startName, new NumberType(true), 0),
      new PPSocket(SOCKET_TYPE.IN, stopName, new NumberType(true), 100),
      PPSocket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        stepName,
        new NumberType(true, 1),
        10,
        () => !this.getInputData(useTotalName),
      ),
      PPSocket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        totalName,
        new NumberType(true),
        10,
        () => this.getInputData(useTotalName),
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        useTotalName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        roundNumbersName,
        new BooleanType(),
        false,
        false,
      ),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const start = inputObject[startName] || 0;
    const stop = inputObject[stopName] || 100;
    const step = inputObject[stepName] || 2;
    const totalElements = inputObject[totalName] || 10;
    const useTotalElements = inputObject[useTotalName] || false;
    const roundNumbers = inputObject[roundNumbersName] || false;

    let array;

    if (useTotalElements) {
      // Calculate step based on total elements
      const calculatedStep = (stop - start) / (totalElements - 1);
      array = Array.from(
        { length: totalElements },
        (_, i) => start + i * calculatedStep,
      );
    } else {
      // Use the original step-based calculation
      array = Array.from(
        { length: Math.floor((stop - start) / step) + 1 },
        (_, i) => start + i * step,
      );
    }

    if (roundNumbers) {
      array = array.map((num) => Math.round(num));
    }

    outputObject[outputArrayName] = array;
  }
}

export class RandomArray extends PPNode {
  public getName(): string {
    return 'Random array';
  }

  public getDescription(): string {
    return 'Creates an array with random numbers';
  }

  public getTags(): string[] {
    return ['Array'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 10000, this);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, outputArrayName, new ArrayType()),
      new PPSocket(SOCKET_TYPE.IN, 'Length', new NumberType(true, 1), 20),
      new PPSocket(SOCKET_TYPE.IN, 'Min', new NumberType(true), 0),
      new PPSocket(SOCKET_TYPE.IN, 'Max', new NumberType(true), 100),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const length = inputObject['Length'];
    const min = inputObject['Min'];
    const max = inputObject['Max'];
    const randomArray = Array.from({ length: length }, () => {
      return Math.floor(Math.random() * (max - min) + min);
    });
    outputObject[outputArrayName] = randomArray;
  }
}

// TimeAgo style definitions
const timeAgoStyles = [
  { id: 'default', label: 'Relative time', style: 'round' },
  { id: 'minutes', label: 'Relative time (Minutes)', style: 'round-minute' },
  { id: 'short', label: 'Relative time (Short)', style: 'twitter-now' },
  {
    id: 'short-minutes',
    label: 'Relative time (Short Minutes)',
    style: 'twitter-minute-now',
  },
];

export class DateAndTime extends PPNode {
  public getName(): string {
    return 'Date and time';
  }

  public getDescription(): string {
    return 'Outputs time in different formats including relative time (e.g. 3 hours ago)';
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    const dateMethodsArray = getPropertyNames(new Date(), {
      includePrototype: true,
      onlyFunctions: true,
    });
    const dateMethodsArrayOptions = dateMethodsArray
      .filter((methodName) => {
        // do not expose constructor and setters
        const shouldExposeMethod = !(
          methodName === 'constructor' || methodName.startsWith('set')
        );
        return shouldExposeMethod;
      })
      .sort()
      .map((methodName) => {
        return {
          text: methodName,
        };
      });

    // Add TimeAgo options from the style array
    timeAgoStyles.forEach((style) => {
      dateMethodsArrayOptions.push({ text: style.label });
    });

    return [
      new PPSocket(SOCKET_TYPE.OUT, 'Date and time', new StringType()),
      new PPSocket(SOCKET_TYPE.IN, 'Date string', new StringType(), '', false),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Date method',
        new EnumType(dateMethodsArrayOptions),
        'toUTCString',
        false,
      ),
    ].concat(super.getDefaultIO());
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const dateString = inputObject['Date string'];
    const dateMethod = inputObject['Date method'];
    const dateObject = dateString === '' ? new Date() : new Date(dateString);

    // Check if the selected method is one of our TimeAgo styles
    const timeAgoStyle = timeAgoStyles.find(
      (style) => style.label === dateMethod,
    );

    if (timeAgoStyle) {
      // Use TimeAgo with the selected style
      const timeAgo = new TimeAgo('en-US');
      outputObject['Date and time'] = timeAgo.format(
        dateObject,
        timeAgoStyle.style,
      );
    } else {
      // Use native Date methods
      outputObject['Date and time'] = dateObject[dateMethod]();
    }
  }
}

export class If_Else extends PPNode {
  public getName(): string {
    return 'If/Then/Else';
  }

  public getDescription(): string {
    return 'Passes through input A or B based on a condition';
  }

  public getTags(): string[] {
    return ['Logic', 'Conditional'].concat(super.getTags());
  }

  getColor(): TRgba {
    return BOOLEAN_COLOR.multiply(0.8);
    //return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.IN, 'Condition', new BooleanType(), false),
      new PPSocket(SOCKET_TYPE.IN, 'A', new AnyType(), 'A'),
      new PPSocket(SOCKET_TYPE.IN, 'B', new AnyType(), 'B'),
      new PPSocket(SOCKET_TYPE.OUT, 'Output', new AnyType()),
    ];
  }

  public shouldPropagateExecutionThrough(socket: PPSocket): boolean {
    const nonActiveSocket = this.getInputData('Condition') ? 'B' : 'A';
    return (
      socket.name !== nonActiveSocket ||
      !PPGraph.currentGraph.graphConfiguredAndReady
    );
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const condition = inputObject['Condition'];
    if (condition) {
      outputObject['Output'] = inputObject['A'];
    } else {
      outputObject['Output'] = inputObject['B'];
    }
  }
}

export class Comparison extends PPNode {
  public getName(): string {
    return 'Compare Values';
  }

  public getDescription(): string {
    return 'Compares two values (greater, less, equal, logical)';
  }

  public getTags(): string[] {
    return ['Logic', 'Comparison'].concat(super.getTags());
  }

  getColor(): TRgba {
    return BOOLEAN_COLOR.multiply(0.8);
  }

  protected getDefaultIO(): PPSocket[] {
    const onOptionChange = (value) => {
      this.setNodeName(value);
    };

    return [
      new PPSocket(SOCKET_TYPE.IN, 'A', new AnyType(), 0),
      new PPSocket(SOCKET_TYPE.IN, 'B', new AnyType(), 1),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Operator',
        new EnumType(COMPARISON_OPTIONS, onOptionChange),
        COMPARISON_OPTIONS[0].text,
        false,
      ),
      new PPSocket(SOCKET_TYPE.OUT, 'Output', new BooleanType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputA = inputObject['A'];
    const inputB = inputObject['B'];
    const option = COMPARISON_OPTIONS.find(
      (option) => option.text === inputObject['Operator'],
    );
    const operator = option ? option.value : '=='; // Default to equals if not found
    outputObject['Output'] = compare(inputA, operator, inputB);
  }
}

export class IsValid extends PPNode {
  public getName(): string {
    return 'Is Valid';
  }

  public getDescription(): string {
    return 'Check if an input is valid (undefined, null)';
  }

  public getTags(): string[] {
    return ['Logic', 'Validation'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): PPSocket[] {
    const onOptionChange = (value) => {
      this.setNodeName(value);
    };

    return [
      new PPSocket(SOCKET_TYPE.IN, 'A', new AnyType(), 0),
      new PPSocket(
        SOCKET_TYPE.IN,
        'Condition',
        new EnumType(CONDITION_OPTIONS, onOptionChange),
        CONDITION_OPTIONS[0].text,
        false,
      ),
      new PPSocket(SOCKET_TYPE.OUT, 'Output', new BooleanType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const inputA = inputObject['A'];
    const condition = inputObject['Condition'];
    outputObject['Output'] = isVariable(inputA, condition);
  }
}

const offValueName = 'Off value';
const onValueName = 'On value';
const durationName = 'Duration (ms)';
const outputName = 'Output';

export class Pulse extends PPNode {
  public getName(): string {
    return 'Pulse';
  }

  public getDescription(): string {
    return 'Sends a pulse or trigger of a certain duration';
  }

  public getTags(): string[] {
    return ['Trigger'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getVersion(): number {
    return 2;
  }

  public async migrate(previousVersion: number): Promise<void> {
    if (previousVersion < 2) {
      // 'On'/'Off' -> 'On value'/'Off value'
      await this.renameInputSocketPreservingData('On', onValueName);
      await this.renameInputSocketPreservingData('Off', offValueName);
    }
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        offValueName,
        new NumberType(true),
        0,
        false,
      ),
      new PPSocket(SOCKET_TYPE.IN, onValueName, new NumberType(true), 1, false),
      new PPSocket(
        SOCKET_TYPE.IN,
        durationName,
        new NumberType(true, 0, 10000),
        1000,
      ),
      new PPSocket(SOCKET_TYPE.OUT, outputName, new NumberType()),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject[outputName] = inputObject[onValueName];

    setTimeout(() => {
      this.setOutputData(outputName, inputObject[offValueName]);
      this.executeChildren();
    }, inputObject[durationName]);
  }
}
