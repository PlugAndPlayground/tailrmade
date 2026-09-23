import React, { useEffect, useRef, useState } from 'react';
import HybridNode2 from '../../../classes/HybridNode2';
import Socket from '../../../classes/SocketClass';
import { NodeExecutionError, PNPSuccess } from '../../../classes/ErrorClass';
import { SOCKET_TYPE } from '../../../utils/constants';
import { WidgetContentProps } from '../../../utils/interfaces';
import { ArrayType } from '../../datatypes/arrayType';
import { JSONType } from '../../datatypes/jsonType';
import { loadPlotly } from './loadPlotly';

function cancelPlotlyDrag(element: HTMLDivElement | null): void {
  const graph = element as (HTMLDivElement & { _dragging?: boolean }) | null;
  if (!graph?._dragging) return;
  // Plotly 4 leaves document drag listeners behind on purge. Its mouseup
  // handler removes them; clearing this flag first prevents clicks/zoom commits.
  graph._dragging = false;
  const document = graph.ownerDocument;
  const MouseEvent = document.defaultView?.MouseEvent;
  if (MouseEvent) {
    document.dispatchEvent(new MouseEvent('mouseup', { cancelable: true }));
  }
}

export class PlotlyChart extends HybridNode2 {
  public getName(): string {
    return 'Chart (Plotly)';
  }
  public getDescription(): string {
    return 'Interactive charts backed by lazy-loaded Plotly: line, bar, scatter, pie, heatmap, and more.';
  }
  public getTags(): string[] {
    return ['Chart', 'Analytics', 'Widget'].concat(super.getTags());
  }
  public getDefaultNodeWidth(): number {
    return 600;
  }
  public getDefaultNodeHeight(): number {
    return 400;
  }
  public getAIDocs(): string {
    return `Preferred chart node. Connect "ReactUI" to a UI surface.
"Traces" accepts an array of Plotly trace objects. Examples:
Line: [{"type":"scatter","mode":"lines+markers","x":["Jan","Feb"],"y":[10,15]}]
Bar: [{"type":"bar","x":["A","B"],"y":[10,15]}]
Pie: [{"type":"pie","labels":["A","B"],"values":[10,15]}]
"Layout" accepts Plotly layout options, e.g. {"title":{"text":"Revenue"}}.
"Config" accepts Plotly configuration options. Size follows the widget container.
The node loads Plotly on demand and manages updates, resizing, and cleanup.
Use Statistics for numerical analysis and worker-mode CustomFunction only for
small data transformations. Pass plain data/configuration, never library functions.
Rendering runs on the UI thread; aggregate large datasets upstream in workers.`;
  }
  protected getDefaultIO(): Socket[] {
    return [
      new Socket(SOCKET_TYPE.IN, 'Traces', new ArrayType(), []),
      new Socket(SOCKET_TYPE.IN, 'Layout', new JSONType(), {}),
      new Socket(SOCKET_TYPE.IN, 'Config', new JSONType(), {}),
    ];
  }
  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <PlotlyChartView {...props} />;
  }
}

function PlotlyChartView(props: WidgetContentProps) {
  const container = useRef<HTMLDivElement>(null);
  const queue = useRef(Promise.resolve());
  const plotly = useRef<Awaited<ReturnType<typeof loadPlotly>>>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState('Loading chart...');
  const traces = props.Traces;
  const layout = props.Layout;
  const config = props.Config;
  const node = props.node;
  const interactive = props.inDashboard
    ? !props.disabled
    : props.isInteractionEnabled;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      // Wait for an in-flight render before destroying its DOM and listeners.
      queue.current = queue.current.then(() => {
        cancelPlotlyDrag(element);
        plotly.current?.purge(element);
      });
    };
  }, []);

  useEffect(() => {
    if (!size.width || !size.height) return;
    const element = container.current;
    let cancelled = false;
    queue.current = queue.current.then(async () => {
      if (cancelled) return;
      try {
        if (
          !Array.isArray(traces) ||
          traces.some(
            (trace) =>
              !trace || typeof trace !== 'object' || Array.isArray(trace),
          )
        ) {
          throw new Error('Traces must be an array of Plotly trace objects.');
        }
        for (const [name, value] of [
          ['Layout', layout],
          ['Config', config],
        ]) {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error(`${name} must be an object.`);
        }
        if (!traces.length && !plotly.current) {
          setMessage('No data');
          node.setStatus(new PNPSuccess());
          return;
        }
        const library = await loadPlotly();
        if (cancelled) return;
        plotly.current = library;
        cancelPlotlyDrag(element);
        await library.react(
          element,
          structuredClone(traces),
          {
            margin: { l: 55, r: 25, t: 50, b: 50 },
            ...structuredClone(layout),
            width: size.width,
            height: size.height,
            autosize: false,
          },
          {
            displaylogo: false,
            ...structuredClone(config),
            responsive: false,
            staticPlot: !interactive || config.staticPlot === true,
          },
        );
        if (!cancelled) {
          setMessage(traces.length ? '' : 'No data');
          node.setStatus(new PNPSuccess());
        }
      } catch (error) {
        if (cancelled) return;
        cancelPlotlyDrag(element);
        plotly.current?.purge(element);
        const text = error instanceof Error ? error.message : String(error);
        setMessage(text);
        node.setStatus(new NodeExecutionError(text));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [traces, layout, config, size, interactive, node]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        ref={container}
        data-testid="plotly-chart"
        style={{
          width: '100%',
          height: '100%',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
      {message && (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            padding: 12,
            background: 'white',
            color: '#333',
            overflow: 'auto',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
