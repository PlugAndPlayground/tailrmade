import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import Handlebars from 'handlebars/dist/handlebars';
import { TRgba } from '../../utils/color';
import { ErrorBoundary } from 'react-error-boundary';
import Frame from 'react-frame-component';
import DOMPurify from 'dompurify';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { Box, Typography } from '@mui/material';
import ErrorFallback from '../../components/ErrorFallback';
import Socket from '../../classes/SocketClass';
import PPGraph from '../../classes/GraphClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { CodeType } from '../datatypes/codeType';
import { ColorType } from '../datatypes/colorType';
import { HtmlType } from '../datatypes/htmlType';
import { JSONType } from '../datatypes/jsonType';
import {
  getDimensionValue,
  getOverflowForSize,
  SOCKET_NAME_DASHBOARD_CONTENT,
  isNodeInDashboard,
} from '../../utils/layoutableHelpers';
import {
  TNodeSource,
  WidgetContentProps,
  WidgetProps,
} from '../../utils/interfaces';
import {
  NODE_TYPE_COLOR,
  SANITIZE_NAME,
  SOCKETNAME_BACKGROUNDCOLOR,
  SOCKET_TYPE,
  STATUS_SEVERITY,
} from '../../utils/constants';
import HybridNode2, { defaultHybridProps } from '../../classes/HybridNode2';
import { NodeExecutionError, PNPSuccess } from '../../classes/ErrorClass';
import { BooleanType } from '../datatypes/booleanType';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { SurfaceCanvasPreviewContext } from '../../components/dashboard/SurfaceRenderer';
import { DeferredReactTypeInterface } from '../datatypes/deferredHtmlType';
import { AnyType } from '../datatypes/anyType';

// Register common Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
Handlebars.registerHelper('subtract', (a, b) => Number(a) - Number(b));
Handlebars.registerHelper('multiply', (a, b) => Number(a) * Number(b));
Handlebars.registerHelper('divide', (a, b) => Number(a) / Number(b));
Handlebars.registerHelper('macro', (macroName: string, ...args: any[]) => {
  // Remove the Handlebars options object from args
  args = args.slice(0, -1);
  return PPGraph.currentGraph.invokeMacro(macroName, args);
});

// Global macro function for runtime JS calls in HTML/IFrame nodes
(window as any).macro = (macroName: string, ...args: any[]) => {
  const macro = PPGraph.currentGraph.getMacroWithName(macroName);
  if (!macro) {
    return Promise.reject(new Error(`Macro "${macroName}" not found`));
  }
  return PPGraph.currentGraph.invokeMacro(macroName, args);
};

// Placeholder component for elements in dashboard
const DashboardPlaceholder: React.FC = () => (
  <Box
    sx={{
      padding: 3,
      textAlign: 'center',
      color: 'text.secondary',
      bgcolor: 'background.paper',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    }}
  >
    <DashboardIcon sx={{ fontSize: 48, opacity: 0.5 }} />
    <Typography variant="body1" sx={{ mt: 2 }}>
      Element rendered in User Interface
    </Typography>
  </Box>
);

const inputSocketNameHeader = 'Header';
export const htmlInputSocketName = 'Html';
const reloadSocketName = 'Reload';
const backgroundColor = TRgba.white();
const dataInputSocketName = 'Data';
const passthroughHandlebarsName = 'Template Passthrough';
const partialsInputSocketName = 'Templates';

const handlebarDescription =
  ' Connect data to the Data input to inject values. Use Handlebars syntax: {{this}}, {{#each array}}...{{/each}}, {{#if (eq status "active")}}...{{/if}}. Use JSONPath syntax for nested properties, for example {{object.property}} or {{array[0].field}}. Call macros with {{macro "name" arg1 arg2}} or in JavaScript: macro("name", arg1, arg2)';

const parsedHtmlOutputName = 'Parsed Html';

/**
 * Base class for HTML-rendering nodes with shared Handlebars functionality.
 */
abstract class HtmlNodeBase extends HybridNode2 {
  protected lastTemplateError: Error | null = null;

  public getAIDocs(): string {
    return `Has a "Data" input. Use Handlebars syntax in the HTML where the Data
input is the ROOT context ("this"):
- {{property}} for properties of the Data input
- {{json this}} to dump the entire Data input for debugging
- {{#each this}}...{{/each}} to iterate when Data is an array
- {{#if property}}...{{/if}} for conditionals

Do NOT use the socket name in the template, e.g. do not write {{data}} —
the Data input's value is already the template's root context.

Use HTML/IFrame only for custom markup, embeds, or behavior not covered by
widgets and UI surfaces.

"Background color" defaults to white, so use dark text. To inherit the surface
background, set its alpha to 0 and choose text that contrasts with the surface.
When the surface color is unknown, keep an explicit contrasting background.`;
  }

  public shouldRenderWhenOffScreen(): boolean {
    return true;
  }

  public isCallingMacro(macroName: string): boolean {
    const htmlContent = this.getInputData(htmlInputSocketName);
    if (typeof htmlContent !== 'string') return false;
    return htmlContent.replaceAll("'", '"').includes('acro("' + macroName);
  }

  protected replaceHandlebarsInHtml(htmlContent: string, data: any): string {
    this.lastTemplateError = null;
    if (typeof htmlContent !== 'string') return htmlContent;

    try {
      const template = Handlebars.compile(htmlContent, { noEscape: true });
      return template(data);
    } catch (error) {
      this.lastTemplateError = error as Error;
      console.error('Error compiling Handlebars template:', error);
      return htmlContent;
    }
  }

  protected updateStatusFromTemplateError(): void {
    if (this.lastTemplateError) {
      this.setStatus(new NodeExecutionError(this.lastTemplateError.message));
    } else if (this.status.node.getSeverity() >= STATUS_SEVERITY.WARNING) {
      this.setStatus(new PNPSuccess());
    }
  }

  public safeInsertFragment(
    container: HTMLElement,
    htmlContent: string,
    doc: Document,
    errorWindow: Window | null = window,
  ): void {
    const errors: string[] = [];
    const onError = (e: ErrorEvent) => {
      errors.push(e.message);
      e.preventDefault();
    };
    errorWindow?.addEventListener('error', onError);
    try {
      // Wrap inline script contents in a block scope so that let/const
      // declarations don't clash when the fragment is re-injected.
      const wrappedHtml = htmlContent.replace(
        /<script(\b[^>]*)>([\s\S]*?)<\/script>/gi,
        (_match, attrs: string, content: string) => {
          if (/\bsrc\s*=/i.test(attrs) || !content.trim()) return _match;
          return `<script${attrs}>{${content}}</script>`;
        },
      );
      const fragment = doc.createRange().createContextualFragment(wrappedHtml);
      container.appendChild(fragment);
    } catch (error) {
      const msg = (error as Error).message;
      const match = msg.match(/^Failed to execute .* on 'Node': (.+)/s);
      errors.push(match ? match[1] : msg);
    }
    errorWindow?.removeEventListener('error', onError);
    if (errors.length > 0) {
      this.setStatus(new NodeExecutionError(errors.join('\n')));
    }
  }

  abstract getDefaultHTMLCode(): string;
}

export class HtmlRenderer extends HtmlNodeBase {
  /**
   * Updates all listener references in the HTML content when a listener is renamed.
   * This is called by HTMLEventListener.nameChanged() to keep HTML event attributes in sync.
   */
  public updateListenerReferences(oldName: string, newName: string): void {
    const htmlSocket = this.getInputSocketByName(htmlInputSocketName);
    const htmlContent = this.getInputData(htmlInputSocketName);

    // Replace "listener": "oldName" with "listener": "newName" in all event attributes
    // Handle both with and without spaces after the colon
    const regex = new RegExp(
      `"listener"\\s*:\\s*"${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
      'g',
    );
    const updatedHtml = htmlContent.replace(regex, `"listener": "${newName}"`);

    if (updatedHtml !== htmlContent) {
      htmlSocket.defaultData = updatedHtml;
      this.setInputData(htmlInputSocketName, updatedHtml);
    }
  }

  public getName(): string {
    return 'HTML Renderer';
  }

  public getDescription(): string {
    return (
      'Renders HTML code. Write your own HTML markup with Tailwind CSS styling.' +
      handlebarDescription +
      ' To compose modular layouts enable Template Passthrough to create templates, then combine them to a JSON object and feed it into the Templates input of another HTML node.'
    );
  }

  public getTags(): string[] {
    return ['HTML', 'Widget'].concat(super.getTags());
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return 0.001;
  }

  public getWidgetProps(): WidgetProps {
    return { ...defaultHybridProps, height: 'auto' };
  }

  getPreferredInputSocketName(): string {
    return htmlInputSocketName;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  getDefaultHTMLCode(): string {
    return `<div class="p-4 text-black">
  <p class="mb-2">Write your own HTML content.<br />Use JSON or Array data on the "Data" socket and use Handlebars: <code>&#123;&#123;property&#125;&#125;</code></p>
  <a href="https://en.wikipedia.org/wiki/Special:Random" target="_blank" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-block">Button {{label}}</a>
</div>`;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        htmlInputSocketName,
        new HtmlType(),
        this.getDefaultHTMLCode(),
        false,
      ),
      new Socket(SOCKET_TYPE.IN, dataInputSocketName, new AnyType(), {}, true),
      new Socket(SOCKET_TYPE.IN, SANITIZE_NAME, new BooleanType(), true, false),
      new Socket(
        SOCKET_TYPE.IN,
        passthroughHandlebarsName,
        new BooleanType(),
        false,
        false,
      ),
      Socket.getOptionalVisibilitySocket(
        SOCKET_TYPE.IN,
        partialsInputSocketName,
        new JSONType(),
        {},
        () => this.getInputData(passthroughHandlebarsName) === false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        backgroundColor,
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        parsedHtmlOutputName,
        new HtmlType(),
        '',
        true,
      ),
    ];
  }

  public getMinNodeHeight(): number {
    return Math.max(30, this.calculateSocketsBasedHeight());
  }

  public getDefaultNodeWidth(): number {
    return 320;
  }

  public getDefaultNodeHeight(): number {
    return 180;
  }

  // Decode HTML entities (e.g., &gt; to >, &lt; to <)
  private decodeHtmlEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  // Decode HTML entities within Handlebars syntax that may have been escaped by sanitization
  // This specifically targets patterns like {{&gt; partial}} → {{> partial}}
  private decodeHandlebarsInSanitized(html: string): string {
    // Find all Handlebars patterns and decode HTML entities within them
    // Use non-greedy match to properly capture content between {{ and }}
    return html.replace(/\{\{.*?\}\}/gs, (match) => {
      return this.decodeHtmlEntities(match);
    });
  }

  protected replaceHandlebarsInHtml(
    htmlContent: string,
    data: any,
    passthrough: boolean = false,
    partials: Record<string, string> = {},
  ): string {
    this.lastTemplateError = null;
    if (typeof htmlContent !== 'string') return htmlContent;

    if (passthrough) {
      return htmlContent;
    }

    try {
      if (partials && typeof partials === 'object') {
        Object.entries(partials).forEach(([name, template]) => {
          if (typeof template === 'string') {
            const decodedTemplate = this.decodeHtmlEntities(template);
            Handlebars.registerPartial(name, decodedTemplate);
          }
        });
      }

      const template = Handlebars.compile(htmlContent, { noEscape: true });
      const result = template(data);
      return result;
    } catch (error) {
      this.lastTemplateError = error as Error;
      console.error('Error compiling Handlebars template:', error);
      return htmlContent;
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const htmlContent = inputObject[htmlInputSocketName];
    const data = inputObject[dataInputSocketName];
    const passthrough = inputObject[passthroughHandlebarsName];
    const partials = inputObject[partialsInputSocketName];
    const sanitize = inputObject[SANITIZE_NAME];

    if (typeof htmlContent === 'string') {
      let processedHtml = this.replaceHandlebarsInHtml(
        htmlContent,
        data,
        passthrough,
        partials,
      );
      if (sanitize) {
        processedHtml = DOMPurify.sanitize(processedHtml);
        processedHtml = this.decodeHandlebarsInSanitized(processedHtml);
      }
      outputObject[parsedHtmlOutputName] = processedHtml;
    }
    this.updateStatusFromTemplateError();
    await super.onExecute(inputObject, outputObject);
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <HtmlComponent {...props} />;
  }
}

const HtmlComponent = (props): React.ReactElement => {
  const node = props.node;
  const nodeComponentId = `${node.id}-${props.inDashboard ? 'dashboard' : 'canvas'}`;
  const idWithDiv = `${node.id}-div`;
  const contentRef = useRef<HTMLDivElement>(null);

  const width = getDimensionValue(props.width, true);
  const height = getDimensionValue(props.height, true);

  // Process HTML content - use the Data input for Handlebars templating
  const data = props[dataInputSocketName];
  const passthrough = props[passthroughHandlebarsName];
  const partials = props[partialsInputSocketName];
  let htmlContent = node.replaceHandlebarsInHtml(
    props[htmlInputSocketName],
    data,
    passthrough,
    partials,
  );

  // Sanitize HTML if enabled to protect against XSS attacks
  // Note: DOMPurify removes <style> tags and onclick attributes, so disable
  // sanitization on intermediate template nodes and only enable on final output
  if (props[SANITIZE_NAME]) {
    // Add hook to automatically add rel="noopener noreferrer" to links with target="_blank"
    DOMPurify.addHook('afterSanitizeAttributes', function (node) {
      if (node.tagName === 'A' && node.hasAttribute('target')) {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });

    htmlContent = DOMPurify.sanitize(htmlContent, {
      ADD_ATTR: ['target'], // Allow target attribute on links
    });

    // Remove the hook after sanitization to avoid memory leaks
    DOMPurify.removeHook('afterSanitizeAttributes');

    // Decode any Handlebars syntax that got entity-encoded during sanitization
    htmlContent = node.decodeHandlebarsInSanitized(htmlContent);
  }

  useLayoutEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    node.safeInsertFragment(container, htmlContent, document);

    const allElements = container.querySelectorAll('*');
    const elementsWithEvents: Element[] = [];

    allElements.forEach((element) => {
      const hasEventAttr = Array.from(element.attributes).some((attr) =>
        attr.name.startsWith('data-tm-event-'),
      );
      if (hasEventAttr) {
        elementsWithEvents.push(element);
      }
    });

    const eventListeners: Array<{
      element: Element;
      eventType: string;
      handler: EventListener;
    }> = [];

    elementsWithEvents.forEach((element) => {
      // Check all data-tm-event-* attributes on this element
      Array.from(element.attributes).forEach((attr) => {
        const match = attr.name.match(/^data-tm-event-(.+)$/);
        if (match) {
          const eventType = match[1].toLowerCase();

          // Parse the attribute value to get listener name and custom data
          // Expected format: {"listener": "listenerName", "data": {...}}
          let targetListenerName = '';
          let customData: Record<string, unknown> = {};
          let stopPropagation = false;
          let preventDefault = false;
          try {
            if (attr.value) {
              const parsed = JSON.parse(attr.value);
              targetListenerName = parsed.listener || '';
              customData = parsed.data || {};
              stopPropagation = parsed.stopPropagation === true;
              preventDefault = parsed.preventDefault === true;
            }
          } catch (e) {
            console.warn(
              'Failed to parse data-tm-event attribute value:',
              attr.value,
              'Expected format: {"listener": "listenerName", "data": {...}}',
            );
          }

          // Skip if no listener specified
          if (!targetListenerName) {
            console.warn(
              'data-tm-event attribute missing "listener" field:',
              attr.value,
            );
            return;
          }

          // Create event handler
          const handler = (event: Event) => {
            if (stopPropagation) event.stopPropagation();
            if (preventDefault) event.preventDefault();
            // Serialize relevant event properties based on event type
            const eventDetails: Record<string, any> = {
              type: event.type,
              timeStamp: event.timeStamp,
            };

            // MouseEvent (click, dblclick, mouseenter, mouseleave, etc.)
            if (event instanceof MouseEvent) {
              eventDetails.clientX = event.clientX;
              eventDetails.clientY = event.clientY;
              eventDetails.screenX = event.screenX;
              eventDetails.screenY = event.screenY;
              eventDetails.offsetX = event.offsetX;
              eventDetails.offsetY = event.offsetY;
              eventDetails.button = event.button;
              eventDetails.buttons = event.buttons;
              eventDetails.ctrlKey = event.ctrlKey;
              eventDetails.shiftKey = event.shiftKey;
              eventDetails.altKey = event.altKey;
              eventDetails.metaKey = event.metaKey;
            }

            // KeyboardEvent (keydown, keyup, keypress)
            if (event instanceof KeyboardEvent) {
              eventDetails.key = event.key;
              eventDetails.code = event.code;
              eventDetails.repeat = event.repeat;
              eventDetails.ctrlKey = event.ctrlKey;
              eventDetails.shiftKey = event.shiftKey;
              eventDetails.altKey = event.altKey;
              eventDetails.metaKey = event.metaKey;
            }

            // WheelEvent (wheel)
            if (event instanceof WheelEvent) {
              eventDetails.deltaX = event.deltaX;
              eventDetails.deltaY = event.deltaY;
              eventDetails.deltaZ = event.deltaZ;
              eventDetails.deltaMode = event.deltaMode;
            }

            // FocusEvent (focus, blur, focusin, focusout)
            if (event instanceof FocusEvent) {
              eventDetails.relatedTarget = event.relatedTarget
                ? {
                    tagName: (event.relatedTarget as HTMLElement).tagName,
                    id: (event.relatedTarget as HTMLElement).id,
                  }
                : null;
            }

            // TouchEvent (touchstart, touchend, touchmove, touchcancel)
            if (
              typeof TouchEvent !== 'undefined' &&
              event instanceof TouchEvent
            ) {
              eventDetails.touches = Array.from(event.touches).map((t) => ({
                clientX: t.clientX,
                clientY: t.clientY,
                screenX: t.screenX,
                screenY: t.screenY,
                identifier: t.identifier,
              }));
              eventDetails.changedTouches = Array.from(
                event.changedTouches,
              ).map((t) => ({
                clientX: t.clientX,
                clientY: t.clientY,
                screenX: t.screenX,
                screenY: t.screenY,
                identifier: t.identifier,
              }));
            }

            // Target element info
            if (event.target instanceof HTMLElement) {
              eventDetails.target = {
                tagName: event.target.tagName,
                id: event.target.id,
                className: event.target.className,
              };

              // Input elements
              if (event.target instanceof HTMLInputElement) {
                eventDetails.target.value = event.target.value;
                eventDetails.target.checked = event.target.checked;
                eventDetails.target.type = event.target.type;
              }

              // Textarea
              if (event.target instanceof HTMLTextAreaElement) {
                eventDetails.target.value = event.target.value;
              }

              // Select
              if (event.target instanceof HTMLSelectElement) {
                eventDetails.target.value = event.target.value;
                eventDetails.target.selectedIndex = event.target.selectedIndex;
              }

              // Scroll position (for scroll events)
              if (event.type === 'scroll') {
                eventDetails.target.scrollTop = event.target.scrollTop;
                eventDetails.target.scrollLeft = event.target.scrollLeft;
                eventDetails.target.scrollHeight = event.target.scrollHeight;
                eventDetails.target.scrollWidth = event.target.scrollWidth;
              }
            }

            // Dispatch event to all listeners with matching name
            Object.values(PPGraph.currentGraph.nodes).forEach((node) => {
              node.dispatchHTMLEvent(
                targetListenerName,
                eventType,
                customData,
                eventDetails,
              );
            });
          };

          // Attach listener
          element.addEventListener(eventType, handler);
          eventListeners.push({ element, eventType, handler });
        }
      });
    });

    // Cleanup function to remove event listeners
    return () => {
      eventListeners.forEach(({ element, eventType, handler }) => {
        element.removeEventListener(eventType, handler);
      });
    };
  }, [htmlContent, node]);

  // Give authored HTML a legible default text color that contrasts with the
  // node background, so content that doesn't set its own color stays visible
  // instead of inheriting the app theme (which can be light-on-light). Any
  // explicit color the markup sets - Tailwind text-* classes, inline styles -
  // still wins, since this only lands on the wrapper. When the background is
  // (near-)transparent the surface shows through, so leave the color to
  // inherit the theme that matches that surface rather than guess from the
  // node's own (invisible) background color.
  const backgroundTRgba = Object.assign(
    new TRgba(),
    props[SOCKETNAME_BACKGROUNDCOLOR],
  );
  const defaultTextColor =
    backgroundTRgba.a >= 0.5
      ? backgroundTRgba.getContrastTextColor().toString()
      : undefined;

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        id={nodeComponentId}
        style={{
          width: width,
          height: props.inDashboard ? height : '100%',
          background: props[SOCKETNAME_BACKGROUNDCOLOR].toString(),
          color: defaultTextColor,
        }}
      >
        <div
          ref={contentRef}
          id={idWithDiv}
          style={{
            position: 'relative',
            width: width,
            height: height,
            overflow: getOverflowForSize(props.width, props.height),
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export class IFrameRenderer extends HtmlNodeBase {
  eventTarget: EventTarget;

  public onNodeAdded = async (source: TNodeSource): Promise<void> => {
    this.eventTarget = new EventTarget();
    await super.onNodeAdded(source);
  };

  public getName(): string {
    return 'IFrame renderer';
  }

  public getDescription(): string {
    return 'Renders an iframe with HTML content.' + handlebarDescription;
  }

  public getTags(): string[] {
    return ['HTML'].concat(super.getTags());
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return 0.001;
  }

  getPreferredInputSocketName(): string {
    return htmlInputSocketName;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  getDefaultHeader(): string {
    return '<script src="https://cdn.tailwindcss.com"></script>';
  }

  getDefaultHTMLCode(): string {
    return `<div class="p-4">
<h2>IFrame Node</h2>
<p class="mb-2 text-sky-500 dark:text-sky-400">Embed an iframe or write your own HTML</p>
<a href="https://en.wikipedia.org/wiki/Special:Random" target="_blank" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-block">Click me!</a>
</div>
`;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputSocketNameHeader,
        new CodeType(),
        this.getDefaultHeader(),
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        htmlInputSocketName,
        new HtmlType(),
        this.getDefaultHTMLCode(),
        false,
      ),
      new Socket(SOCKET_TYPE.IN, dataInputSocketName, new AnyType(), {}, true),
      new Socket(
        SOCKET_TYPE.IN,
        SANITIZE_NAME,
        new BooleanType(),
        false,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        backgroundColor,
        false,
      ),
    ];
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const htmlContent = inputObject[htmlInputSocketName];
    const data = inputObject[dataInputSocketName];

    if (typeof htmlContent === 'string') {
      this.replaceHandlebarsInHtml(htmlContent, data);
    }
    this.updateStatusFromTemplateError();
    await super.onExecute(inputObject, outputObject);
  }

  public getMinNodeHeight(): number {
    return Math.max(30, this.calculateSocketsBasedHeight());
  }

  public getDefaultNodeWidth(): number {
    return 200;
  }

  public getDefaultNodeHeight(): number {
    return 150;
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <IFrameComponent {...props} />;
  }
}

const IFrameComponent = (props): React.ReactElement => {
  const node = props.node;
  const nodeComponentId = `${node.id}-${props.inDashboard ? 'dashboard' : 'canvas'}`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const idWithDiv = `${node.id}-div`;
  const [contentHeight, setContentHeight] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);

  const updateHeight = useCallback(() => {
    if (props.inDashboard) {
      const iframe = iframeRef.current as HTMLIFrameElement;
      const contentDiv = iframe?.contentWindow?.document?.querySelector(
        `#${idWithDiv}`,
      );
      if (contentDiv) {
        const height = contentDiv.scrollHeight;

        // If height is set to 'auto' (hug mode), resize the node
        if (props.height === 'auto') {
          requestAnimationFrame(() => {
            setContentHeight(height);
          });
        }
      }
    }
  }, [node, props.height]);

  // Process HTML content - use the Data input for Handlebars templating
  const data = props[dataInputSocketName];
  let htmlContent = node.replaceHandlebarsInHtml(
    props[htmlInputSocketName],
    data,
  );
  let headerContent = props[inputSocketNameHeader];

  if (props[SANITIZE_NAME]) {
    htmlContent = DOMPurify.sanitize(htmlContent);
    headerContent = DOMPurify.sanitize(headerContent);
  }

  // Check if this is a full HTML document
  const trimmedHtml = htmlContent.trim();
  const isFullDocument =
    /^<!DOCTYPE/i.test(trimmedHtml) || /^<html/i.test(trimmedHtml);

  // Reset iframe ready state when HTML content changes (for full documents)
  useEffect(() => {
    if (isFullDocument) {
      setIframeReady(false);
    }
  }, [htmlContent, isFullDocument]);

  // Inject content with createContextualFragment after iframe is ready
  // For fragments only - full documents are handled via initialContent
  const injectContent = useCallback(() => {
    if (!iframeRef.current?.contentDocument || !iframeReady || isFullDocument)
      return;

    // For HTML fragments, inject into the container div
    const container = contentRef.current;
    if (!container) return;

    const iframeDoc = iframeRef.current.contentDocument;
    container.innerHTML = '';
    node.safeInsertFragment(
      container,
      htmlContent,
      iframeDoc,
      iframeRef.current.contentWindow,
    );

    updateHeight();
  }, [htmlContent, iframeReady, isFullDocument]);

  useLayoutEffect(() => {
    injectContent();
  }, [injectContent]);

  // Listen for height changes
  useEffect(() => {
    const iframe = iframeRef.current as HTMLIFrameElement;
    if (iframe) {
      iframe.addEventListener('load', updateHeight);

      // Create a MutationObserver to watch for height changes
      const observer = new MutationObserver(updateHeight);

      iframe.addEventListener('load', () => {
        if (iframe.contentWindow?.document?.body) {
          observer.observe(iframe.contentWindow.document.body, {
            attributes: true,
            childList: true,
            subtree: true,
          });
        }
      });

      return () => {
        iframe.removeEventListener('load', updateHeight);
        observer.disconnect();
      };
    }
  }, [updateHeight]);

  // For full documents, use a hash of htmlContent as key to force iframe remount on change
  // This prevents "identifier already declared" errors
  const frameKey = isFullDocument
    ? `${props[reloadSocketName]}-${htmlContent.length}-${htmlContent.charCodeAt(0)}-${htmlContent.charCodeAt(htmlContent.length - 1)}`
    : props[reloadSocketName];

  // Default the fragment's text color to contrast with the node background
  // (which shows through the transparent iframe body), so content that doesn't
  // set its own color stays legible instead of falling back to the iframe's
  // black-on-anything default. Authored colors still win. A (near-)transparent
  // background lets the surface show through, so we skip it and keep the
  // default there rather than guess.
  const iframeBackground = Object.assign(
    new TRgba(),
    props[SOCKETNAME_BACKGROUNDCOLOR],
  );
  const bodyColorStyle =
    iframeBackground.a >= 0.5
      ? ` color: ${iframeBackground.getContrastTextColor().toString()};`
      : '';

  // Prepare initial content for the iframe
  // For full HTML documents, use the htmlContent directly as initialContent
  // For fragments, use the header-based structure
  const initialContent = isFullDocument
    ? htmlContent
    : `<!DOCTYPE html><html><head><style>* {border: none;}</style>${headerContent}</head><body style='overflow:auto; border-width: 0px; background: transparent;${bodyColorStyle}'><div></div></body></html>`;

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Frame
        key={frameKey}
        id={nodeComponentId}
        ref={iframeRef}
        style={{
          width: '100%',
          height: props.height === 'auto' ? contentHeight : '100%',
          borderWidth: 0,
          background: props[SOCKETNAME_BACKGROUNDCOLOR].toString(),
          display: 'block',
        }}
        initialContent={initialContent}
        contentDidMount={() => {
          // Inject macro function into iframe
          if (iframeRef.current?.contentWindow) {
            (iframeRef.current.contentWindow as any).macro = (
              window as any
            ).macro;
          }
          setIframeReady(true);
          updateHeight();
        }}
        contentDidUpdate={() => {
          updateHeight();
        }}
      >
        <div
          ref={contentRef}
          id={idWithDiv}
          style={{
            position: 'relative',
            height: 'calc(100vh - 16px)',
          }}
        />
      </Frame>
    </ErrorBoundary>
  );
};

export class IFrameRendererDiv extends IFrameRenderer {
  public getName(): string {
    return 'IFrame renderer (Div)';
  }

  public getDescription(): string {
    return 'Renders a div element inside an iframe';
  }

  public getDefaultNodeWidth(): number {
    return 800;
  }

  public getDefaultNodeHeight(): number {
    return 400;
  }

  public getDefaultHeader(): string {
    return '';
  }

  public getDefaultHTMLCode(): string {
    return '<div id="myDiv"></div>';
  }
}

export class IFrameRendererCanvas extends IFrameRendererDiv {
  public getName(): string {
    return 'IFrame renderer (Canvas)';
  }

  public getDescription(): string {
    return 'Renders a canvas element inside an iframe';
  }

  public getDefaultHTMLCode(): string {
    return '<canvas style="width:100%;" id="myCanvas"></canvas>';
  }
}

export class EmbedWebsite extends IFrameRendererDiv {
  public getName(): string {
    return 'Embed website';
  }

  public getDescription(): string {
    return 'Embed a website using an iframe. You can also just paste a URL into the canvas';
  }

  public getDefaultHTMLCode(): string {
    return '<iframe src="https://en.wikipedia.org/wiki/Special:Random" style="width: 100%; height: 100%;"></iframe>';
  }
}

const domElementInputSocketName = 'DOM Element';

export class ElementRenderer extends HybridNode2 {
  public getName(): string {
    return 'Element Renderer';
  }

  public getDescription(): string {
    return 'Display a DOM element created by a Custom function on a UI surface.';
  }

  public getAIDocs(): string {
    return `Have a Custom function return a DOM element (e.g. \`return canvas\`),
connect "OutData" to this node's "DOM Element", then place this node's
"ReactUI" output on the surface.

The "DOM Element" input must be a real HTMLElement/SVGElement — anything else
is ignored with a console warning.`;
  }

  public getTags(): string[] {
    return ['HTML', 'Widget'].concat(super.getTags());
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return 0.001;
  }

  getPreferredInputSocketName(): string {
    return domElementInputSocketName;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, true, false, 1000, this);
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        domElementInputSocketName,
        new JSONType(),
        null,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        backgroundColor,
        false,
      ),
    ];
  }

  public getMinNodeHeight(): number {
    return Math.max(30, this.calculateSocketsBasedHeight());
  }

  public getDefaultNodeWidth(): number {
    return 400;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  public getWidgetProps(): WidgetProps {
    return { ...defaultHybridProps, height: '300px' }; // Fixed height by default as elements may not initialize with relative height
  }

  public async outputPlugged(socket: Socket): Promise<void> {
    await super.outputPlugged(socket);
    if (socket.name === SOCKET_NAME_DASHBOARD_CONTENT) {
      await this.executeOptimizedChain();
    }
  }

  public async outputUnplugged(socket: Socket): Promise<void> {
    await super.outputUnplugged(socket);
    if (socket.name === SOCKET_NAME_DASHBOARD_CONTENT) {
      await this.executeOptimizedChain();
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    // Handle ReactUI output (what HybridNode2 does, but without structuredClone)
    if (this.getOutputSocketByName(SOCKET_NAME_DASHBOARD_CONTENT)?.hasLink()) {
      // Don't clone inputObject because it contains a DOM element that can't be cloned
      // Pass the original inputObject as reactUIProps
      const ReactUI: DeferredReactTypeInterface = {
        renderFunction: (props) =>
          this.getDashboardWrapper({
            ...props,
            reactUIProps: inputObject,
          }),
        nodeId: this.id,
      };
      outputObject[SOCKET_NAME_DASHBOARD_CONTENT] = ReactUI;
    }

    // Render the component with the full input (including DOM element)
    this.callRender(inputObject);
  }

  // small presentational component
  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    return <ElementRendererComponent {...props} />;
  }
}

const ElementRendererComponent = (props): React.ReactElement => {
  const node = props.node as ElementRenderer;
  const elementContainerRef = useRef<HTMLDivElement | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const updateDashboardStatus = () => {
      requestAnimationFrame(() => {
        forceUpdate(Math.random());
      });
    };

    // Initial check
    updateDashboardStatus();

    const dashboardStatusListener = InterfaceController.addListeners(
      [ListenEvent.DashboardItemAdded, ListenEvent.RemoveFromDashboard],
      updateDashboardStatus,
    );

    return () => {
      InterfaceController.removeListener(dashboardStatusListener);
    };
  }, []);

  const nodeInDashboard = isNodeInDashboard(node);
  // A DOM element is a single instance - it can only live in one place at a
  // time, so exactly one rendering may append it and all others show a
  // placeholder. Show the actual element only when:
  // 1. Rendering in the live dashboard (props.inDashboard = true and not
  //    inside a surface's canvas preview), OR
  // 2. Rendering on canvas (props.inDashboard = false) AND node is NOT in dashboard
  const inCanvasSurfacePreview = useContext(SurfaceCanvasPreviewContext);
  const shouldShowElement = props.inDashboard
    ? !inCanvasSurfacePreview
    : !nodeInDashboard;

  const domElement = props[domElementInputSocketName];
  const isValidElement =
    domElement instanceof HTMLElement || domElement instanceof SVGElement;

  useLayoutEffect(() => {
    // the container div only mounts when there is a valid element to show,
    // and React never renders children into it - replaceChildren must only
    // ever touch manually appended elements, otherwise React crashes when
    // it later tries to remove a child that is no longer there
    const container = elementContainerRef.current;
    if (!container || !isValidElement) return;

    container.replaceChildren(domElement);

    // Apply dashboard dimensions
    if (props.inDashboard && domElement instanceof HTMLElement) {
      domElement.style.width = props.width;
      domElement.style.height = props.height;
    }
  }, [
    shouldShowElement,
    props.inDashboard,
    props.width,
    props.height,
    domElement,
  ]);

  useEffect(() => {
    if (domElement && !isValidElement) {
      console.warn(
        'DOM element is not a standard HTML/SVG element:',
        domElement,
      );
    }
  }, [domElement]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        style={{
          width: props.width,
          height: props.height,
          overflow: 'auto',
          background: props.inDashboard
            ? 'transparent'
            : props[SOCKETNAME_BACKGROUNDCOLOR].toString(),
        }}
      >
        {shouldShowElement && isValidElement ? (
          <div
            ref={elementContainerRef}
            style={{ width: '100%', height: '100%' }}
          />
        ) : shouldShowElement && !domElement ? (
          <div style={{ padding: '16px', color: '#666' }}>
            Connect a DOM element to display it here
          </div>
        ) : shouldShowElement ? null : (
          <DashboardPlaceholder />
        )}
      </div>
    </ErrorBoundary>
  );
};
