import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import PPNode from '../../classes/NodeClass';
import {
  AbstractType,
  Compatibility,
  CompatibilityType,
  dataTypeWidgetDefaultProps,
} from './abstractType';
import { AnyType } from './anyType';
import type { DRAW_Base } from '../draw/abstract';
import { TRgba } from '../../utils/color';
import {
  SOCKETNAME_BACKGROUNDCOLOR,
  parentBgHeightName,
  parentBgWidthName,
} from '../../utils/constants';

export const DeferredPixiName = 'Deferred Pixi';

// its a composite type, a function that will draw onto a container, and a hash (so that the caller knows if it needs to be redrawn)
export interface DeferredPixiTypeInterface {
  drawFunction: (
    container: PIXI.Container,
    position: PIXI.Point,
    passedInOverrideSettings: any,
  ) => Promise<void>;
}

export class DeferredPixiType extends AbstractType {
  getInputWidget = (props: any): any => {
    return <></>;
  };

  getOutputWidget = (props: any): any => {
    props.dataType = this;
    return <PixiOutputWidget {...props} />;
  };

  getName(): string {
    return DeferredPixiName;
  }

  // TODO replace this with something more interesting (maybe drawing something like an image?)
  getDefaultValue(): DeferredPixiTypeInterface {
    return { drawFunction: async () => {} };
  }

  getComment(commentData: any): string {
    return commentData ? 'Graphics' : 'null';
  }

  getDefaultWidgetProps() {
    return {
      ...dataTypeWidgetDefaultProps,
      height: '320px',
      heightMode: 'fixed' as const,
    };
  }

  recommendedOutputNodeWidgets(): string[] {
    return [
      'draw_combine_array',
      'draw_combine',
      'draw_passthrough',
      'extract_image_from_graphics',
      'extract_pixelarray_from_graphics',
    ];
  }

  recommendedInputNodeWidgets(): string[] {
    return [
      'draw_shape',
      'draw_text',
      'draw_line',
      'draw_image',
      'draw_polygon',
    ];
  }
  // cannot save this
  prepareDataForSaving(data: any) {
    return undefined;
  }

  protected dataIsCompatible(
    data: any,
    convertFrom: AbstractType = new AnyType(),
  ): Compatibility {
    return data != undefined && typeof data.drawFunction == 'function'
      ? new Compatibility(CompatibilityType.Compatible)
      : new Compatibility(CompatibilityType.Incompatible);
  }

  static stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
}

const PixiOutputWidget: React.FunctionComponent<any> = (props) => {
  if (!props.inDashboard) {
    return <></>;
  }

  // Reference socket for reading state
  const property = props.socketsToUpdate[0];

  return (
    <DynamicWidgetPixiBody
      property={property.getNode()}
      disabled={props.disabled}
      width={props.width}
      height={props.height}
    />
  );
};

export type DynamicWidgetContainerNodeProps = {
  property: DRAW_Base;
  disabled: boolean;
  width: string;
  height: string;
  backgroundColor?: string;
};

export const DynamicWidgetPixiBody: React.FunctionComponent<
  DynamicWidgetContainerNodeProps
> = (props) => {
  const [pixiBackgroundColor, setPixiBackgroundColor] = useState(
    props.backgroundColor || 'transparent', // Use transparent background by default
  );

  const [containerStyle, setContainerStyle] = useState({
    width: '100%',
    height: '100%',
  });

  const pixiContainerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<PIXI.Application | null>(null);
  const contentContainerRef = useRef<PIXI.Container | null>(null);
  const drawContentRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const calculateDisplayDimensions = useCallback(() => {
    if (!pixiContainerRef.current) return;
    const baseDimensions = props.property.getForegroundDimensions();

    if (props.width === 'auto' && props.height === 'auto') {
      setContainerStyle({
        width: `${baseDimensions.width}px`,
        height: `${baseDimensions.height}px`,
      });
    } else if (props.width === 'auto' && props.height !== 'auto') {
      const containerHeight = pixiContainerRef.current.clientHeight;
      const aspectRatio =
        baseDimensions.height > 0
          ? baseDimensions.width / baseDimensions.height
          : 1;
      setContainerStyle({
        width: `${containerHeight * aspectRatio}px`,
        height: '100%',
      });
    } else if (props.width !== 'auto' && props.height === 'auto') {
      const containerWidth = pixiContainerRef.current.clientWidth;
      const aspectRatio =
        baseDimensions.width > 0
          ? baseDimensions.height / baseDimensions.width
          : 1;
      setContainerStyle({
        width: '100%',
        height: `${containerWidth * aspectRatio}px`,
      });
    } else {
      setContainerStyle({
        width: '100%',
        height: '100%',
      });
    }
  }, [props.property, props.width, props.height]);

  const drawContent = useCallback(async () => {
    if (
      !pixiAppRef.current ||
      !contentContainerRef.current ||
      !pixiContainerRef.current
    )
      return;
    contentContainerRef.current.removeChildren();
    const inputObject = PPNode.remapInput(props.property.inputSocketArray);
    const backgroundColor = inputObject[SOCKETNAME_BACKGROUNDCOLOR] as TRgba;
    if (backgroundColor) {
      setPixiBackgroundColor(backgroundColor.hexa());
    }
    await props.property.drawOnContainer(
      inputObject,
      contentContainerRef.current,
      {
        [parentBgWidthName]: pixiContainerRef.current.clientWidth,
        [parentBgHeightName]: pixiContainerRef.current.clientHeight,
      },
      true,
    );
    fitContentToCanvas();
    requestAnimationFrame(() => {
      calculateDisplayDimensions();
    });
  }, [props.property, calculateDisplayDimensions]);

  useEffect(() => {
    drawContentRef.current = drawContent;
  }, [drawContent]);

  const resizeCanvas = useCallback(() => {
    if (!pixiAppRef.current || !pixiContainerRef.current) return;
    pixiAppRef.current.renderer.resize(
      pixiContainerRef.current.clientWidth,
      pixiContainerRef.current.clientHeight,
    );
    void drawContentRef.current?.();
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width > 0 && pixiAppRef.current) {
        calculateDisplayDimensions();
        resizeCanvas();
      }
    });

    if (pixiContainerRef.current) {
      resizeObserver.observe(pixiContainerRef.current);
      calculateDisplayDimensions();
    }

    return () => resizeObserver.disconnect();
  }, [calculateDisplayDimensions, resizeCanvas]);

  useEffect(() => {
    if (pixiAppRef.current) {
      resizeCanvas();
    }
  }, [props.width, props.height, resizeCanvas]);

  useEffect(() => {
    // init() is async - if the effect is cleaned up (e.g. unmounted via a
    // page switch) before it resolves, pixiAppRef.current must stay null
    // until the app is actually ready, otherwise the cleanup below sees a
    // truthy ref whose ticker/stage aren't set up yet and crashes
    let cancelled = false;

    const createPixiApp = async () => {
      if (pixiContainerRef.current && !pixiAppRef.current) {
        const app = new PIXI.Application();

        await app.init({
          backgroundAlpha: 0,
          width: pixiContainerRef.current.clientWidth,
          height: pixiContainerRef.current.clientHeight,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });

        if (cancelled) {
          app.destroy(false, { children: false });
          return;
        }

        pixiAppRef.current = app;
        pixiAppRef.current.stage.eventMode = 'static';
        pixiAppRef.current.stage.cursor = 'pointer';

        pixiContainerRef.current.appendChild(pixiAppRef.current.view as any);

        contentContainerRef.current = new PIXI.Container();
        pixiAppRef.current.stage.addChild(contentContainerRef.current);

        void drawContentRef.current?.();
      }
    };

    void createPixiApp();

    const executionListener = () => {
      void drawContentRef.current?.();
    };
    props.property.addExecutionListener(executionListener);

    return () => {
      cancelled = true;
      props.property.removeExecutionListener(executionListener);

      if (pixiAppRef.current) {
        pixiAppRef.current.ticker.stop();

        if (contentContainerRef.current) {
          contentContainerRef.current.removeChildren();
          contentContainerRef.current = null;
        }

        pixiAppRef.current.stage.removeChildren();
        pixiAppRef.current.destroy(false, { children: false });
        pixiAppRef.current = null;
      }
    };
  }, [props.property]);

  const fitContentToCanvas = () => {
    if (pixiAppRef.current && contentContainerRef.current) {
      const canvasBounds = pixiAppRef.current.screen;
      const contentBounds = contentContainerRef.current.getLocalBounds();

      const scaleX = canvasBounds.width / contentBounds.width;
      const scaleY = canvasBounds.height / contentBounds.height;
      const scale = Math.min(scaleX, scaleY);

      contentContainerRef.current.scale.set(scale);
      contentContainerRef.current.position.set(
        (canvasBounds.width - contentBounds.width * scale) / 2 -
          contentBounds.x * scale,
        (canvasBounds.height - contentBounds.height * scale) / 2 -
          contentBounds.y * scale,
      );
    }
  };

  return (
    <div
      ref={pixiContainerRef}
      style={{
        width: containerStyle.width,
        height: containerStyle.height,
        backgroundColor: pixiBackgroundColor,
        pointerEvents: props.disabled ? 'none' : 'auto',
        overflow: 'hidden',
        scrollbarGutter: 'stable',
      }}
    />
  );
};
