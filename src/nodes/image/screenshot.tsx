import React from 'react';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
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
    return 'Capture the user interface, the graph, the current node selection, a connected ReactUI widget or the whole screen as an image.';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, false, false, 1000, this);
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.TRIGGER,
        captureName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text),
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

  private static readonly reactUIProps = {
    index: 0,
    randomMainColor: MAIN_COLOR,
    disabled: false,
    width: '100%',
    height: '100%',
  } as DashboardWidgetProps;

  /**
   * A node only writes its ReactUI output once it has executed with something
   * linked to it, so a freshly connected widget still holds the socket's
   * default. The real payload carries the id of the node it came from, and
   * when it is missing the linked node can be asked to draw itself directly -
   * which beats executing it from in here, since that would re-enter this
   * node's own execution.
   */
  private getReactUIRenderer(): (() => React.ReactNode) | undefined {
    const deferred = this.getInputData(
      reactUIName,
    ) as DeferredReactTypeInterface;
    if (deferred?.nodeId !== undefined) {
      return () => deferred.renderFunction(Screenshot.reactUIProps);
    }

    const sourceNode = this.getInputSocketByName(reactUIName)
      ?.links?.[0]?.getSource()
      ?.getNode() as unknown as {
      getDashboardWrapper?: (props: DashboardWidgetProps) => React.ReactNode;
    };
    const drawSource = sourceNode?.getDashboardWrapper;
    if (typeof drawSource === 'function') {
      return () => drawSource.call(sourceNode, Screenshot.reactUIProps);
    }
    return undefined;
  }

  protected async onExecute(
    inputObject: Record<string, unknown>,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const source = inputObject[sourceName] as CaptureSource;
    try {
      const result = await capture(source, {
        scale: inputObject[scaleName] as number,
        render: this.getReactUIRenderer(),
        renderWidth: inputObject[widgetWidthName] as number,
        renderHeight: inputObject[widgetHeightName] as number,
      });
      this.setStatus(new PNPSuccess());
      outputObject[imageOutputName] = result.dataURL;
      outputObject[detailsOutputName] = {
        width: result.width,
        height: result.height,
        source: result.source,
        timestamp: result.timestamp,
      };
    } catch (error) {
      const message = `${source} capture failed. ${(error as Error).message}`;
      this.setStatus(new NodeExecutionError(message));
      InterfaceController.showSnackBar(message, { variant: 'error' });
    }
  }

  stopSharing = (): void => {
    stopScreenCapture();
  };

  public getMinNodeWidth(): number {
    return 200;
  }
}
