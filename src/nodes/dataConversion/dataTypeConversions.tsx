import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import { CustomArgs } from '../../utils/interfaces';
import { parseValueAndAttachWarnings } from '../../utils/utils';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { NumberType } from '../datatypes/numberType';
import { TwoDVectorType } from '../datatypes/twoDVectorType';
import { ThreeDVectorType } from '../datatypes/threeDVectorType';
import { TypeConversionNode } from './conversionBase';

const xName = 'x';
const yName = 'y';
const zName = 'z';
const xyDefault = 0;
const xyzDefault = 0;
const outValueName2D = '2D vector';
const outValueName3D = '3D vector';

export class NumberToTwoDVector extends TypeConversionNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });
  }

  public getName(): string {
    return 'Number to 2D vector';
  }

  public getDescription(): string {
    return 'Converts 2 numbers to a 2D vector';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        xName,
        new NumberType(false, -1000, 1000),
        xyDefault,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        yName,
        new NumberType(false, -1000, 1000),
        xyDefault,
      ),
      new Socket(SOCKET_TYPE.OUT, outValueName2D, new TwoDVectorType()),
    ];
  }

  public async populateDefaults(socket: Socket): Promise<void> {
    const target = socket;
    if (
      xyDefault === this.getInputData(xName) &&
      xyDefault === this.getInputData(yName)
    ) {
      const data = parseValueAndAttachWarnings(
        this,
        new TwoDVectorType(),
        target.defaultData,
      );
      this.setInputData(xName, data.x);
      this.setInputData(yName, data.y);
      await this.executeOptimizedChain();
    }
    await super.populateDefaults(socket);
  }

  protected async onExecute(
    inputObject: Record<string, unknown>,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject[outValueName2D] = {
      x: inputObject[xName] as number,
      y: inputObject[yName] as number,
    };
  }
}

export class NumberToThreeDVector extends TypeConversionNode {
  constructor(name: string, customArgs: CustomArgs) {
    super(name, {
      ...customArgs,
    });
  }

  public getName(): string {
    return 'Number to 3D vector';
  }

  public getDescription(): string {
    return 'Converts 3 numbers to a 3D vector';
  }

  public getTags(): string[] {
    return ['JSON'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.TRANSFORM);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        xName,
        new NumberType(false, -1000, 1000),
        xyzDefault,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        yName,
        new NumberType(false, -1000, 1000),
        xyzDefault,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        zName,
        new NumberType(false, -1000, 1000),
        xyzDefault,
      ),
      new Socket(SOCKET_TYPE.OUT, outValueName3D, new ThreeDVectorType()),
    ];
  }

  public async populateDefaults(socket: Socket): Promise<void> {
    const target = socket;
    if (
      xyzDefault === this.getInputData(xName) &&
      xyzDefault === this.getInputData(yName) &&
      xyzDefault === this.getInputData(zName)
    ) {
      const data = parseValueAndAttachWarnings(
        this,
        new ThreeDVectorType(),
        target.defaultData,
      );
      this.setInputData(xName, data.x);
      this.setInputData(yName, data.y);
      this.setInputData(zName, data.z);
      await this.executeOptimizedChain();
    }
    await super.populateDefaults(socket);
  }

  protected async onExecute(
    inputObject: Record<string, unknown>,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    outputObject[outValueName3D] = {
      x: inputObject[xName] as number,
      y: inputObject[yName] as number,
      z: inputObject[zName] as number,
    };
  }
}
