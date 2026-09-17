import Socket from '../../classes/SocketClass';
import {
  ActionHandler,
  BakedAction,
  SerializableAction,
  SerializableActionHandler,
} from '../../classes/Action';
import { BackPropagation } from '../../interfaces';
import { SOCKET_TYPE } from '../../utils/constants';
import { limitRange } from '../../utils/utils';
import { NumberType } from '../datatypes/numberType';
import {
  WidgetHybridBase,
  initialValueName,
  labelName,
  outName,
} from './abstract';

export const minValueName = 'Min';
export const maxValueName = 'Max';
export const decimalsName = 'Decimals';

const defaultDecimals = 2;
const maxDecimals = 10;

export const getDecimalsSocket = (): Socket =>
  new Socket(
    SOCKET_TYPE.IN,
    decimalsName,
    new NumberType(true, 0, maxDecimals),
    defaultDecimals,
    false,
  );

// Decimals can be linked, and Intl throws on a negative fraction digit count
export const getDecimals = (value: number): number =>
  limitRange(Math.round(value), 0, maxDecimals);

// rounding through Intl gives exactly the value the widgets display - Math.round
// on the binary float turns 1.005 into 1 where Intl shows 1.01
const decimalFormatters = Array.from(
  { length: maxDecimals + 1 },
  (_, decimals) =>
    new Intl.NumberFormat('en-US', {
      maximumFractionDigits: decimals,
      useGrouping: false,
    }),
);

export const roundToDecimals = (value: number, decimals: number): number =>
  Number(decimalFormatters[decimals].format(value));

// the slider and the number field are interchangeable: same value sockets, same
// clamping and rounding, same undoable edits
export abstract class WidgetNumberBase extends WidgetHybridBase {
  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(initialValueName),
      SocketToTakeName: this.getInputSocketByName(labelName),
    };
  }

  protected getOutputValue(inputObject: any, applyRange: boolean): number {
    const value = inputObject[initialValueName];
    const limited = applyRange
      ? limitRange(value, inputObject[minValueName], inputObject[maxValueName])
      : value;
    return roundToDecimals(limited, getDecimals(inputObject[decimalsName]));
  }

  handleValueChange = async (value: number) => {
    const id = this.id;
    const prev = this.getInputData(initialValueName);
    const newValue = roundToDecimals(
      value,
      getDecimals(this.getInputData(decimalsName)),
    );

    const applyFunction = async (data: number) => {
      const safeNode = SerializableActionHandler.getSafeNode(id);
      safeNode.setInputData(initialValueName, data);
      safeNode.setOutputData(outName, data);
      await safeNode.executeOptimizedChain();
    };

    await ActionHandler.performRawAction(
      new BakedAction(
        new SerializableAction(
          applyFunction,
          applyFunction,
          `Set ${this.getName()} Value`,
        ),
        newValue,
        prev,
      ),
    );
  };

  public async populateDefaults(socket: Socket): Promise<void> {
    if (
      socket.dataType.constructor === NumberType &&
      this.getInputData(initialValueName) === 0
    ) {
      const { round, minValue, maxValue } = socket.dataType as NumberType;
      this.setInputData(minValueName, minValue);
      this.setInputData(maxValueName, maxValue);
      this.setInputData(decimalsName, round ? 0 : defaultDecimals);
      this.setInputData(initialValueName, socket.defaultData);
      this.setInputData(labelName, socket.name);
    }
    await super.populateDefaults(socket);
  }
}
