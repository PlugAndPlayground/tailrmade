import React from 'react';
import { inspect } from 'util';
import Socket from '../../classes/SocketClass';
import { TRgba } from '../../utils/color';
import type { TParseType } from '../../utils/interfaces';
import {
  STATUS_SEVERITY,
  SOCKET_COLOR_HEX,
  SOCKET_CORNERRADIUS,
  SOCKET_WIDTH,
} from '../../utils/constants';
import * as PIXI from 'pixi.js';
import { PNPStatus, SocketParsingWarning } from '../../classes/ErrorClass';
import PPNode from '../../classes/NodeClass';
import { BackPropagationPayload } from '../../interfaces';

export interface DataTypeProps {
  key?: string;
  index: number;
  randomMainColor: any;
  dataType: AbstractType;
  language?: string;
  inDashboard?: boolean;
  // All sockets to update when editing. For single node selection, this contains one socket.
  // For multi-node selection, this contains the matching socket from each selected node.
  // Use socketsToUpdate[0] to get the reference socket for reading current values.
  socketsToUpdate: Socket[];
}

type DataTypeWidgetProps = {
  background: Record<'r' | 'g' | 'b' | 'a', number>;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
};

export const dataTypeWidgetDefaultProps: DataTypeWidgetProps = {
  background: { r: 9, g: 13, b: 26, a: 1 },
  width: '100%',
  height: 'auto',
  minWidth: '48px',
  minHeight: '48px',
};

const CodeWidget = React.lazy(async () => ({
  default: (await import('../../widgets')).CodeWidget,
}));

const DefaultOutputWidget = React.lazy(async () => ({
  default: (await import('../../widgets')).DefaultOutputWidget,
}));

export function isDirectlyCompatible(type: CompatibilityType) {
  return (
    type == CompatibilityType.Exact || type == CompatibilityType.Compatible
  );
}

export function IsCompatible(type: CompatibilityType) {
  return (
    type == CompatibilityType.Exact ||
    CompatibilityType.Preferred ||
    type == CompatibilityType.Compatible ||
    type == CompatibilityType.NeedDirectConversion
  );
}

export enum CompatibilityType {
  Exact = 0,
  Preferred = 0,
  Compatible = 1,
  NeedDirectConversion = 2,
  Incompatible = 3,
}

export class Compatibility {
  type: CompatibilityType;
  conversionNode: undefined | string;

  constructor(
    inType: CompatibilityType,
    inConversionNode: string | undefined = undefined,
  ) {
    this.type = inType;
    this.conversionNode = inConversionNode;
  }
}

export class AbstractType {
  // cursed
  onNodeAdded(node: PPNode) {}
  drawValueSpecificGraphics(graphics: PIXI.Graphics, data: any) {}
  async onDataSet(data: any, socket: Socket): Promise<void> {
    return;
  }

  // override any and all of these in child classes
  getName(): string {
    return this.constructor.name;
  }

  // Returns a signature string used for comparing types in the UI
  // Override in child classes that have configuration (e.g., EnumType with options)
  getUISignature(): string {
    return this.constructor.name;
  }

  toString(data: any): string {
    return this.getComment(data);
  }

  // optional, used to give extra information that should be written at all times next to the sockets, keep it short
  getMetaText(data: any): string {
    return '';
  }

  getBackPropagationPayload(data: any): BackPropagationPayload {
    return {};
  }

  getComment(data: any): string {
    if (data !== undefined) {
      return inspect(data, null, 1);
    }
    return 'null';
  }

  getInputWidget = (props: DataTypeProps): any => {
    props.dataType = this;
    return (
      <React.Suspense fallback={null}>
        <CodeWidget {...props} />
      </React.Suspense>
    );
  };

  getOutputWidget = (props: DataTypeProps): any => {
    props.dataType = this;
    return (
      <React.Suspense fallback={null}>
        <DefaultOutputWidget {...props} />
      </React.Suspense>
    );
  };

  getDefaultWidgetProps() {
    return dataTypeWidgetDefaultProps;
  }

  getInputWidgetProps(): any {
    return this.getDefaultWidgetProps();
  }

  getOutputWidgetProps(): any {
    return this.getDefaultWidgetProps();
  }

  // Whether this socket's value widget can be collapsed in the inspector
  // (useful for verbose widgets like layout that are rarely edited inline).
  isInspectorCollapsible(): boolean {
    return false;
  }

  // Whether a collapsible socket starts collapsed in the inspector.
  isInspectorCollapsedByDefault(): boolean {
    return false;
  }

  // Alpha used to draw connections of this type on the canvas.
  // Use to draw fainter so they don't visually dominate over regular connections.
  getConnectionAlpha(): number {
    return 1;
  }

  getDefaultValue(): any {
    return {};
  }

  getColor(): TRgba {
    return TRgba.fromString(SOCKET_COLOR_HEX);
  }

  parse(data: any): TParseType {
    return { value: data, warnings: [] };
  }

  recommendedInputNodeWidgets(): string[] {
    return ['constant_string', 'widgetradio'];
  }

  recommendedOutputNodeWidgets(): string[] {
    return [];
  }

  allowedAsInput(): boolean {
    return true;
  }

  allowedAsOutput(): boolean {
    return true;
  }

  allowedToAutomaticallyAdapt(): boolean {
    return true;
  }

  roundedCorners(): boolean {
    return true;
  }

  // load the saved dataType on configure
  configureOnLoad(): boolean {
    return true;
  }

  prepareDataForSaving(data: any) {
    return data;
  }

  public serialize(): string {
    return JSON.stringify(this);
  }

  // call this from outside!!!!
  public getCompatability(
    data: any,
    convertFrom?: AbstractType,
  ): Compatibility {
    if (data == undefined || data == null) {
      return new Compatibility(CompatibilityType.Incompatible); // dont bring such filth
    } else if (convertFrom && convertFrom.getName() == this.getName()) {
      return new Compatibility(CompatibilityType.Exact);
    } else {
      return this.dataIsCompatible(data, convertFrom);
    }
  }

  // override this in children!!!
  protected dataIsCompatible(
    data: any,
    convertFrom?: AbstractType,
  ): Compatibility {
    return new Compatibility(CompatibilityType.Compatible);
  }

  public static warningsToCompatibility(warnings: SocketParsingWarning[]) {
    if (warnings.length == 0) {
      return new Compatibility(CompatibilityType.Compatible);
    } else {
      return new Compatibility(CompatibilityType.NeedDirectConversion);
    }
  }

  prefersToChangeAwayFromThisType(): boolean {
    return false;
  }

  /**
   * Returns whether data should be stringified when copied to clipboard.
   * Override this to return false for text-based types where raw text should be copied.
   */
  shouldStringifyForClipboard(): boolean {
    return true;
  }

  protected drawSocket(graphics: PIXI.Graphics) {
    graphics.roundRect(
      0,
      0,
      SOCKET_WIDTH,
      SOCKET_WIDTH,
      !this.roundedCorners() ? 0 : SOCKET_CORNERRADIUS,
    );
  }

  public drawBox(
    errorBox: PIXI.Graphics,
    socketRef: PIXI.Graphics,
    location: PIXI.Point,
    isInput: boolean,
    status: PNPStatus,
  ) {
    errorBox.clear();
    if (status.getSeverity() >= STATUS_SEVERITY.WARNING) {
      const errorBoxWidth = SOCKET_WIDTH * 2 - SOCKET_WIDTH / 2;
      errorBox
        .roundRect(
          location.x +
            (isInput ? -errorBoxWidth - SOCKET_WIDTH / 4 : SOCKET_WIDTH / 4),
          -SOCKET_WIDTH / 4,
          errorBoxWidth,
          SOCKET_WIDTH + SOCKET_WIDTH / 2,
          0,
        )
        .fill({ color: status.getColor().hex() });
    }
    socketRef.x = location.x;
    socketRef.y = location.y;
    socketRef.pivot = new PIXI.Point(SOCKET_WIDTH / 2, SOCKET_WIDTH / 2);
    this.drawSocket(socketRef);
    const color = this.getColor();
    socketRef.fill({ color: color.hex(), alpha: color.a });
  }
}
