import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';
import throttle from 'lodash/throttle';
import HybridNode2 from '../../../classes/HybridNode2';
import PPSocket from '../../../classes/SocketClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../../utils/constants';
import { TRgba } from '../../../utils/color';
import { WidgetContentProps } from '../../../utils/interfaces';
import { NumberType } from '../../datatypes/numberType';
import { StringType } from '../../datatypes/stringType';
import { BooleanType } from '../../datatypes/booleanType';
import { ColorType } from '../../datatypes/colorType';
import ErrorFallback from '../../../components/ErrorFallback';
import { GraphInputXYZType } from '../../datatypes/graphInputType';
import { inputDataName } from './scatterGraph';
import { ThreeDVectorType } from '../../datatypes/threeDVectorType';
import { EnumType } from '../../datatypes/enumType';

const loadPlotly = async () => {
  const plotlyModule = await import(
    /* webpackChunkName: "plotly" */ 'plotly.js-dist'
  );
  return plotlyModule.default ?? plotlyModule;
};

const titleName = 'Title';
const showGridName = 'Show Grid';
const xAxisName = 'X Axis Name';
const yAxisName = 'Y Axis Name';
const zAxisName = 'Z Axis Name';
const cameraLocationName = 'Camera Location';
const uniformAxesName = 'Uniform Axes';
const markerSizeName = 'Marker Size';
const useUniformColorName = 'Use Uniform Color';
const uniformColorName = 'Uniform Color';
const markerSymbolName = 'Marker Symbol';
const xAxisColorName = 'X Axis Color';
const yAxisColorName = 'Y Axis Color';
const zAxisColorName = 'Z Axis Color';
const cameraProjectionName = 'Camera Projection';

// NOT A DEFERRED PIXI TYPE LIKE THE OTHER DRAW NODES!!
export class DRAW_3D_GRAPH_PLOTLY extends HybridNode2 {
  processedData: any;
  plotContainer: HTMLDivElement | null = null;

  // Throttled execute
  private throttledExecute = throttle(() => {
    void this.execute();
  }, 100);

  public onNodeAdded = async (source: any): Promise<void> => {
    await super.onNodeAdded(source);
  };

  public getName(): string {
    return '3D Graph (Plotly)';
  }

  public getDescription(): string {
    return '3D graph using Plotly with interactive visualization';
  }

  public getTags(): string[] {
    return ['3D', 'Draw', 'Interactive'].concat(super.getTags());
  }

  public getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.DRAW);
  }

  public getOpacity(): number {
    return 0.001;
  }

  public getDefaultNodeWidth(): number {
    return 600;
  }

  public getDefaultNodeHeight(): number {
    return 400;
  }

  onNodeResize = (newWidth, newHeight) => {
    void this.updatePlotlyDrawing();
  };

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.IN, inputDataName, new GraphInputXYZType()),
      new PPSocket(
        SOCKET_TYPE.IN,
        titleName,
        new StringType(),
        '3D Scatter Plot',
      ),
      new PPSocket(SOCKET_TYPE.IN, xAxisName, new StringType(), 'X Axis'),
      new PPSocket(SOCKET_TYPE.IN, yAxisName, new StringType(), 'Y Axis'),
      new PPSocket(SOCKET_TYPE.IN, zAxisName, new StringType(), 'Z Axis'),
      new PPSocket(
        SOCKET_TYPE.IN,
        showGridName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        uniformAxesName,
        new BooleanType(),
        false,
        false,
      ),
      new PPSocket(SOCKET_TYPE.IN, cameraLocationName, new ThreeDVectorType(), {
        x: 1.5,
        y: 1.5,
        z: 1.5,
      }),
      new PPSocket(SOCKET_TYPE.IN, markerSizeName, new NumberType(), 8, false),
      new PPSocket(
        SOCKET_TYPE.IN,
        useUniformColorName,
        new BooleanType(),
        false,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        uniformColorName,
        new ColorType(),
        { r: 44, g: 103, b: 222, a: 255 },
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        markerSymbolName,
        new EnumType([
          { text: 'circle' },
          { text: 'square' },
          { text: 'diamond' },
          { text: 'cross' },
          { text: 'x' },
        ]),
        'circle',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        xAxisColorName,
        new ColorType(),
        { r: 128, g: 128, b: 128, a: 255 },
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        yAxisColorName,
        new ColorType(),
        { r: 128, g: 128, b: 128, a: 255 },
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        zAxisColorName,
        new ColorType(),
        { r: 128, g: 128, b: 128, a: 255 },
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        cameraProjectionName,
        new EnumType([{ text: 'perspective' }, { text: 'orthographic' }]),
        'perspective',
        false,
      ),
    ];
  }

  protected redraw() {
    super.redraw();
    void this.updatePlotlyDrawing(this.prevInputObject);
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <Plotly3DComponent {...props} />;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    await super.onExecute(input, output);

    void this.updatePlotlyDrawing(input);
  }

  protected async updatePlotlyDrawing(
    input: any = this.prevInputObject,
  ): Promise<void> {
    const getInputValue = (name: string) =>
      input?.[name] ?? this.getInputData(name);

    // Data processing happens here during node execution
    const data = getInputValue(inputDataName);
    const title = getInputValue(titleName);
    const showGrid = getInputValue(showGridName);
    const xAxis = getInputValue(xAxisName);
    const yAxis = getInputValue(yAxisName);
    const zAxis = getInputValue(zAxisName);
    const uniformAxes = getInputValue(uniformAxesName);
    const cameraLocation = getInputValue(cameraLocationName) ?? {
      x: 1.5,
      y: 1.5,
      z: 1.5,
    };
    const markerSize = getInputValue(markerSizeName);
    const useUniformColor = getInputValue(useUniformColorName);
    const uniformColor = getInputValue(uniformColorName);
    const markerSymbol = getInputValue(markerSymbolName);
    const xAxisColor = getInputValue(xAxisColorName);
    const yAxisColor = getInputValue(yAxisColorName);
    const zAxisColor = getInputValue(zAxisColorName);
    const cameraProjection = getInputValue(cameraProjectionName);
    const points = Array.isArray(data) ? data : [];

    // Convert GraphInputXYZType data to Plotly format
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    const colors: string[] = [];
    const names: string[] = [];

    // Helper function to convert color to hex
    const colorToHex = (color: any, defaultHex: string = '#2c67de') => {
      if (!color) return defaultHex;
      const r = Math.round(color.r);
      const g = Math.round(color.g);
      const b = Math.round(color.b);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    // Convert colors to hex format
    let uniformColorHex = '#2c67de'; // default color
    if (useUniformColor && uniformColor) {
      uniformColorHex = colorToHex(uniformColor);
    }

    const xAxisColorHex = colorToHex(xAxisColor, '#808080');
    const yAxisColorHex = colorToHex(yAxisColor, '#808080');
    const zAxisColorHex = colorToHex(zAxisColor, '#808080');

    points.forEach((point: any) => {
      x.push(point.Value1);
      y.push(point.Value2);
      z.push(point.Value3);

      if (useUniformColor) {
        colors.push(uniformColorHex);
      } else {
        colors.push(colorToHex(point.Color));
      }
      names.push(point.Name || '');
    });

    const plotData = {
      x,
      y,
      z,
      mode: 'markers',
      type: 'scatter3d',
      marker: {
        size: markerSize,
        color: colors,
        opacity: 0.8,
        symbol: markerSymbol,
      },
      text: names,
      hovertemplate:
        '<b>%{text}</b><br>' +
        'X: %{x}<br>' +
        'Y: %{y}<br>' +
        'Z: %{z}<br>' +
        '<extra></extra>',
    };

    // Calculate uniform axis range if enabled
    let axisConfig: any = {
      xaxis: {
        title: xAxis,
        showgrid: showGrid,
        color: xAxisColorHex,
        gridcolor: xAxisColorHex,
      },
      yaxis: {
        title: yAxis,
        showgrid: showGrid,
        color: yAxisColorHex,
        gridcolor: yAxisColorHex,
      },
      zaxis: {
        title: zAxis,
        showgrid: showGrid,
        color: zAxisColorHex,
        gridcolor: zAxisColorHex,
      },
    };

    if (uniformAxes && x.length > 0) {
      // Find the min and max for each axis independently
      const xMin = Math.min(...x);
      const xMax = Math.max(...x);
      const yMin = Math.min(...y);
      const yMax = Math.max(...y);
      const zMin = Math.min(...z);
      const zMax = Math.max(...z);

      // Calculate the range for each axis
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      const zRange = zMax - zMin;

      // Find the longest distance/range
      const longestRange = Math.max(xRange, yRange, zRange);

      // Add padding
      const padding = longestRange * 0.05;
      const uniformRange = longestRange + 2 * padding;
      const halfRange = uniformRange / 2;

      // Center each axis on its own data
      const xCenter = (xMin + xMax) / 2;
      const yCenter = (yMin + yMax) / 2;
      const zCenter = (zMin + zMax) / 2;

      axisConfig = {
        xaxis: {
          title: xAxis,
          showgrid: showGrid,
          range: [xCenter - halfRange, xCenter + halfRange],
          color: xAxisColorHex,
          gridcolor: xAxisColorHex,
        },
        yaxis: {
          title: yAxis,
          showgrid: showGrid,
          range: [yCenter - halfRange, yCenter + halfRange],
          color: yAxisColorHex,
          gridcolor: yAxisColorHex,
        },
        zaxis: {
          title: zAxis,
          showgrid: showGrid,
          range: [zCenter - halfRange, zCenter + halfRange],
          color: zAxisColorHex,
          gridcolor: zAxisColorHex,
        },
      };
    }

    const layout = {
      title: title,
      width: this.nodeWidth - 20,
      height: this.nodeHeight - 20,
      scene: {
        ...axisConfig,
        camera: {
          eye: {
            x: cameraLocation.x,
            y: cameraLocation.y,
            z: cameraLocation.z,
          },
          projection: {
            type: cameraProjection,
          },
        },
      },
    };

    // hack...
    let count = 0;
    while (!this.plotContainer && count < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      count++;
    }

    if (this.plotContainer) {
      const plotly = await loadPlotly();

      const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
      };

      await plotly.react(this.plotContainer, [plotData], layout, config);

      // Also listen for relayouting events (while camera is being moved)
      const plotContainer = this.plotContainer as any;
      plotContainer.removeAllListeners?.('plotly_relayouting');
      plotContainer.on('plotly_relayouting', (eventData: any) => {
        if (eventData['scene.camera'] && eventData['scene.camera'].eye) {
          const newCamera = {
            x: eventData['scene.camera'].eye.x,
            y: eventData['scene.camera'].eye.y,
            z: eventData['scene.camera'].eye.z,
          };

          // Update the camera input socket
          this.setInputData(cameraLocationName, newCamera);
        }
      });
    }
  }
}

// Main component with Suspense
const Plotly3DComponent = (props: any) => {
  return <Plotly3DRenderer {...props} />;
};

// Actual renderer component
const Plotly3DRenderer = ({
  node,
  inDashboard = false,
  disabled = false,
  isInteractionEnabled = false,
}: any) => {
  const plotContainerRef = useRef<HTMLDivElement>(null);
  const isInteractive = inDashboard ? !disabled : isInteractionEnabled;

  // Set the container reference on the node so onExecute can use it
  useEffect(() => {
    if (plotContainerRef.current) {
      node.plotContainer = plotContainerRef.current;
      void node.updatePlotlyDrawing();
    }
    return () => {
      if (node.plotContainer === plotContainerRef.current) {
        node.plotContainer = null;
      }
    };
  }, [node]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        console.error('Error in Plotly 3D Graph:', error, info);
      }}
    >
      <Box
        ref={plotContainerRef}
        sx={{
          width: '100%',
          height: '100%',
          minHeight: '200px',
          pointerEvents: isInteractive ? 'auto' : 'none',
        }}
      />
    </ErrorBoundary>
  );
};
