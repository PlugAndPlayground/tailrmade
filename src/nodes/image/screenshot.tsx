import React from 'react';
import PPGraph from '../../classes/GraphClass';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import InterfaceController from '../../InterfaceController';
import { NodeExecutionError, PNPSuccess } from '../../classes/ErrorClass';
import { TRgba } from '../../utils/color';
import {
  MAIN_COLOR,
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import { DashboardWidgetProps } from '../../utils/interfaces';
import { EnumType } from '../datatypes/enumType';
import { ImageType } from '../datatypes/imageType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { TriggerType } from '../datatypes/triggerType';
import {
  DeferredReactType,
  DeferredReactTypeInterface,
} from '../datatypes/deferredHtmlType';
import {
  CAPTURE_SOURCES,
  CaptureSource,
  capture,
  stopScreenCapture,
} from '../../services/CaptureService';

const captureName = 'Capture';
const stopSharingName = 'Stop screen sharing';
const sourceName = 'Source';
const scaleName = 'Scale';
const reactUIName = 'ReactUI';
const widgetWidthName = 'Widget width';
const widgetHeightName = 'Widget height';
const imageOutputName = 'Image';
const detailsOutputName = 'Details';

const SOURCE_OPTIONS = CAPTURE_SOURCES.map((source) => ({ text: source }));

export class Screenshot extends PPNode {
  public getName(): string {
    return 'Screenshot';
  }

  public getDescription(): string {
    return 'Capture the dashboard, the graph, the current selection, a connected ReactUI widget or the whole screen as an image.';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.TRIGGER,
        captureName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'capture'),
        undefined,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        sourceName,
        new EnumType(SOURCE_OPTIONS),
        CAPTURE_SOURCES[0],
      ),
      new Socket(SOCKET_TYPE.IN, scaleName, new NumberType(false, 0.1, 8), 1),
      new Socket(SOCKET_TYPE.IN, reactUIName, new DeferredReactType()),
      new Socket(
        SOCKET_TYPE.IN,
        widgetWidthName,
        new NumberType(true, 1, 4096),
        800,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        widgetHeightName,
        new NumberType(true, 1, 4096),
        600,
        false,
      ),
      new Socket(
        SOCKET_TYPE.TRIGGER,
        stopSharingName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'stopSharing'),
        undefined,
        false,
      ),
      new Socket(SOCKET_TYPE.OUT, imageOutputName, new ImageType()),
      new Socket(SOCKET_TYPE.OUT, detailsOutputName, new JSONType()),
    ];
  }

  /**
   * A hybrid node only produces its ReactUI output while something is linked to
   * it, so a freshly connected widget has not written one yet and the socket
   * still holds the default. Running the source once fills it in.
   */
  private async refreshReactUIInput(): Promise<void> {
    const sourceNode = this.getInputSocketByName(reactUIName)
      ?.links?.[0]?.getSource()
      ?.getNode();
    await sourceNode?.executeOptimizedChain();
  }

  private getReactUIRenderer(): (() => React.ReactNode) | undefined {
    const deferred = this.getInputData(
      reactUIName,
    ) as DeferredReactTypeInterface;
    if (typeof deferred?.renderFunction !== 'function') {
      return undefined;
    }
    return () =>
      deferred.renderFunction({
        index: 0,
        randomMainColor: MAIN_COLOR,
        disabled: false,
        width: '100%',
        height: '100%',
      } as DashboardWidgetProps);
  }

  capture = async (): Promise<void> => {
    const source = this.getInputData(sourceName) as CaptureSource;
    try {
      if (source === 'ReactUI') {
        await this.refreshReactUIInput();
      }
      const result = await capture(source, {
        scale: this.getInputData(scaleName),
        render: this.getReactUIRenderer(),
        renderWidth: this.getInputData(widgetWidthName),
        renderHeight: this.getInputData(widgetHeightName),
      });
      this.setStatus(new PNPSuccess());
      this.setOutputData(imageOutputName, result.dataURL);
      this.setOutputData(detailsOutputName, {
        width: result.width,
        height: result.height,
        source: result.source,
        timestamp: result.timestamp,
      });
      await this.executeChildren();
    } catch (error) {
      const message = `${source} capture failed. ${(error as Error).message}`;
      // a snackbar is gone in three seconds, and a capture that quietly does
      // nothing is the hardest kind of failure to chase down, so leave the
      // reason on the node too
      this.setStatus(new NodeExecutionError(message));
      InterfaceController.showSnackBar(message, { variant: 'error' });
    }
  };

  // capturing is what the trigger is for, executing the node should not open a
  // screen share prompt or re-render the whole canvas as a side effect
  protected async onExecute(
    _input: unknown,
    _output: Record<string, unknown>,
  ): Promise<void> {}

  stopSharing = (): void => {
    stopScreenCapture();
  };

  public getMinNodeWidth(): number {
    return 200;
  }
}
