import React, { useEffect, useReducer } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import PPNode from '../classes/NodeClass';
import HybridNode2, { HybridWidgetContentProps } from '../classes/HybridNode2';
import { JSONType } from './datatypes/jsonType';
import { DynamicInputNodeFunctions } from './abstract/DynamicInputNode';
import { InlineTextEditor } from '../text/lexical/InlineTextEditor';
import { DYNAMIC_TEXT_PROFILE } from '../text/lexical/editorConfig';
import { markdownToTextContent } from '../text/lexical/markdown';
import {
  resolveTextElementStyle,
  TEXT_ALIGNMENTS,
  TEXT_TONES,
  TEXT_VARIANTS,
  textContentToPlain,
  textDefaultProps,
} from '../text/model';
import { renderTokenSource } from '../text/tokens';
import {
  createTokenInput,
  getTokenInputs,
  getTokenPickerProps,
} from '../text/nodeInputs';
import {
  TEXT_NODE_SOCKETS,
  textPropsFromSocketValues,
} from '../text/nodeSockets';
import {
  convertDynamicTextToStatic,
  getStaticConversionGuard,
} from '../text/conversion';
import { TextView } from '../text/TextView';
import { shouldAutoFocusWidgetContent } from '../utils/nodeInteractivity';
import PPSocket from '../classes/SocketClass';
import { TRgba } from '../utils/color';
import { TNodeSource } from '../utils/interfaces';
import * as PIXI from 'pixi.js';
import PPGraph from '../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  DATA_DASHBOARD_EDITABLE,
  NODE_SOURCE,
  NODE_TYPE_COLOR,
  NOTE_LINEHEIGHT_FACTOR,
  SOCKET_TYPE,
  SOCKETNAME_BACKGROUNDCOLOR,
} from '../utils/constants';
import { DEFAULT_DASHBOARD_ICON } from '../components/dashboard/dashboardIcons';
import { AppThemeProvider } from '../components/dashboard/AppThemeProvider';
import { INHERIT_COLOR } from '../utils/themeColors';
import { getEnumValue } from '../utils/utils';
import { NumberType } from './datatypes/numberType';
import { StringType } from './datatypes/stringType';
import { ColorType } from './datatypes/colorType';
import { EnumType } from './datatypes/enumType';
import { DynamicWidgetContainerNode } from './layout/dynamicLayout';
import {
  ACTIONS,
  getSocketChecksum,
  PNPAction,
  SetSocketValueActionArgs,
} from '../classes/Action';
import {
  DashboardIconProps,
  Layoutable,
  WidgetProps,
  DashboardWidgetProps,
  WidgetContentProps,
} from '../utils/interfaces';
const LABEL_MAX_STRING_LENGTH = 10000;

const inputSocketName = 'Input';
const outputSocketName = 'Output';
const fontSizeSocketName = 'Font size';
const widthSocketName = 'Width';
const textColorSocketName = 'Text color';
const textAlignmentSocketName = 'Text alignment';
const fontWeightSocketName = 'Font weight';
const labelDefaultText = 'Label';
const defaultNodeWidth = 128;
const defaultFontSize = 32;

// Font size presets for text
const FONT_SIZE_PRESETS = [
  { text: 'Small', value: 12 },
  { text: 'Normal', value: 16 },
  { text: 'H5', value: 20 },
  { text: 'H4', value: 24 },
  { text: 'H3', value: 28 },
  { text: 'H2', value: 32 },
  { text: 'H1', value: 40 },
];

// Text alignment presets
const TEXT_ALIGNMENT_PRESETS = [
  { text: 'Left', value: 'left' },
  { text: 'Center', value: 'center' },
  { text: 'Right', value: 'right' },
];

// Font weight presets
const FONT_WEIGHT_PRESETS = [
  { text: 'Regular', value: '400' },
  { text: 'Bold', value: '700' },
];

export class Label extends PPNode implements Layoutable {
  PIXIText: PIXI.Text;
  PIXITextStyle: PIXI.TextStyle;
  HTMLTextComponent: HTMLDivElement;
  selectionListenerId: string | undefined; // Track listener for cleanup
  private _isEditing = false;
  private _editListenIds: string[] = [];

  // Implement Layoutable interface
  public isLayoutable(): boolean {
    return true;
  }

  isContainer(): boolean {
    return false;
  }

  getWidgetProps(): WidgetProps {
    return {
      background: { r: 0, g: 0, b: 0, a: 0 }, // Transparent by default
      width: '100%',
      height: 'auto',
      minWidth: '48px',
      minHeight: '48px',
    };
  }

  getDashboardId(): string {
    return `NODE_${this.id}`;
  }

  getDashboardName(): string {
    return this.nodeName;
  }

  getDashboardIcon(_props: DashboardIconProps): React.ReactNode {
    return DEFAULT_DASHBOARD_ICON;
  }

  getRelatedNode(): PPNode {
    return this;
  }

  getDashboardWrapper(props: DashboardWidgetProps): React.ReactNode {
    return <DynamicWidgetContainerNode property={this} {...props} />;
  }

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const text = props[inputSocketName];
    const fontSize = props[fontSizeSocketName] || defaultFontSize;
    const backgroundColor = TRgba.fromObject(props[SOCKETNAME_BACKGROUNDCOLOR]);
    const textColor = props[textColorSocketName];
    const textAlign = getEnumValue(
      TEXT_ALIGNMENT_PRESETS,
      props[textAlignmentSocketName],
    );
    const fontWeight = getEnumValue(
      FONT_WEIGHT_PRESETS,
      props[fontWeightSocketName],
    );

    // the text is edited on the canvas (see startEditing below), never here -
    // in the dashboard the widget only displays what the node outputs
    return (
      <div
        style={{
          display: 'inline-block',
          fontSize: `${fontSize}px`,
          fontWeight: fontWeight,
          lineHeight: `${fontSize * NOTE_LINEHEIGHT_FACTOR}px`,
          padding: backgroundColor.getAlpha()
            ? `${fontSize / 2}px ${fontSize / 1.5}px`
            : 0,
          color: textColor.hex(),
          backgroundColor: backgroundColor.hexa(),
          width: props.width,
          height: props.height,
          minWidth: props.minWidth,
          minHeight: props.minHeight,
          maxWidth: props.maxWidth,
          maxHeight: props.maxHeight,
          boxSizing: 'border-box',
          overflowWrap: 'anywhere',
          userSelect: props.disabled ? 'none' : 'text',
          whiteSpace: 'pre-wrap',
          textAlign: textAlign,
          outline: 'none',
          cursor: 'default',
        }}
      >
        {text}
      </div>
    );
  }

  // Existing methods
  public getName(): string {
    return 'Label';
  }

  public getDescription(): string {
    return 'Adds a text label';
  }

  public getTags(): string[] {
    return ['Text', 'Widget'].concat(super.getTags());
  }

  public getDefaultNodeWidth(): number {
    return defaultNodeWidth;
  }

  public getMinNodeWidth(): number {
    return 40;
  }

  getShowLabels(): boolean {
    return false;
  }

  getRoundedCorners(): boolean {
    return false;
  }

  getPreferredInputSocketName(): string {
    return inputSocketName;
  }

  protected getDefaultIO(): PPSocket[] {
    const fillColor = NODE_TYPE_COLOR.OUTPUT;

    return [
      new PPSocket(
        SOCKET_TYPE.OUT,
        outputSocketName,
        new StringType(),
        false,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        widthSocketName,
        new NumberType(true, 0, defaultNodeWidth * 10),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        inputSocketName,
        new StringType(),
        labelDefaultText,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        fontSizeSocketName,
        new NumberType(true, 1, 100, 1, false, FONT_SIZE_PRESETS),
        defaultFontSize,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        textAlignmentSocketName,
        new EnumType(TEXT_ALIGNMENT_PRESETS, undefined, true),
        TEXT_ALIGNMENT_PRESETS[0].text,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        fontWeightSocketName,
        new EnumType(FONT_WEIGHT_PRESETS, undefined, true),
        FONT_WEIGHT_PRESETS[0].text,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        textColorSocketName,
        new ColorType(),
        TRgba.black(),
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        TRgba.fromString(fillColor),
        false,
      ),
    ].concat(super.getDefaultIO());
  }

  getColor(): TRgba {
    return (
      this.getInputData(SOCKETNAME_BACKGROUNDCOLOR) ||
      TRgba.fromString(NODE_TYPE_COLOR.DEFAULT)
    );
  }

  getOpacity(): number {
    return this.getInputData(SOCKETNAME_BACKGROUNDCOLOR).getAlpha(true);
  }

  private getFontSize(): number {
    return Math.max(1, this.getInputData(fontSizeSocketName));
  }

  public async onNodeAdded(source: TNodeSource) {
    this.PIXITextStyle = new PIXI.TextStyle();
    this.PIXITextStyle.breakWords = true;
    this.PIXIText = new PIXI.Text({
      text: labelDefaultText,
      style: this.PIXITextStyle,
    });

    await super.onNodeAdded(source);
    this._ForegroundRef.addChild(this.PIXIText);

    if (source === NODE_SOURCE.NEW) {
      this.HTMLVisible();
    } else {
      this.PIXIVisible();
    }

    // Exit edit mode when the label is no longer the only selected node
    this.selectionListenerId = InterfaceController.addListener(
      ListenEvent.SelectionChanged,
      (selectedNodes: PPNode[]) => {
        const isOnlySelected =
          PPGraph.currentGraph.selection.isOnlySelectedNode(this);

        if (!isOnlySelected && this._isEditing) {
          this.exitEditMode();
        }
      },
    );
  }

  // Duck-typing interface for focusSelectedHybridNodeAction (Enter key)
  public isInteractionEnabled(): boolean {
    return this._isEditing;
  }

  public enableInteraction(): void {
    this.enterEditMode();
  }

  public onEnterKeyPressed(): boolean {
    if (!this.isInteractionEnabled()) {
      this.enterEditMode();
    }

    return true;
  }

  private enterEditMode(): void {
    if (this._isEditing) return;
    this._isEditing = true;
    this.HTMLVisible();
    this._editListenIds.push(
      InterfaceController.addListener(ListenEvent.EscapeKeyUsed, () =>
        this.exitEditMode(),
      ),
    );
  }

  private exitEditMode(): void {
    if (!this._isEditing) return;
    this._isEditing = false;
    this.PIXIVisible();
    InterfaceController.removeListeners(this._editListenIds);
    this._editListenIds = [];
  }

  public HTMLVisible() {
    this.PIXIText.visible = false;
    this.createInputElement();
    this.HTMLTextComponent.focus();

    // select all content
    window.getSelection().selectAllChildren(this.HTMLTextComponent);
  }

  public PIXIVisible() {
    this.PIXIText.visible = true;
    if (this.HTMLTextComponent) {
      this.HTMLTextComponent.hidden = true;
    }
  }

  public onViewportPointerUp(): void {
    super.onViewportPointerUp();
    this.exitEditMode();
  }

  private getTextParameters(): {
    textColor: TRgba;
    textAlign: string;
    fontWeight: string;
  } {
    const textColor = this.getInputData(textColorSocketName);
    const textAlign = getEnumValue(
      TEXT_ALIGNMENT_PRESETS,
      this.getInputData(textAlignmentSocketName),
    );
    const fontWeight = getEnumValue(
      FONT_WEIGHT_PRESETS,
      this.getInputData(fontWeightSocketName),
    );

    return { textColor, textAlign, fontWeight };
  }

  public drawNodeShape(): void {
    super.drawNodeShape();
    const fontSize = this.getFontSize();
    const { textColor, textAlign, fontWeight } = this.getTextParameters();

    this.PIXITextStyle.fontSize = fontSize;
    this.PIXITextStyle.lineHeight = fontSize * NOTE_LINEHEIGHT_FACTOR;
    this.PIXITextStyle.fill = textColor.hex();
    this.PIXITextStyle.fontWeight = fontWeight;
    this.PIXITextStyle.align = textAlign;

    const text = this.getInputData(inputSocketName);
    this.PIXIText.text = text;
    this.PIXIText.x = this.getMarginLeftRight();
    this.PIXIText.y = this.getMarginTopBottom();
  }

  protected async onExecute(input, output): Promise<void> {
    let text = String(input[inputSocketName]);
    text =
      text.length > LABEL_MAX_STRING_LENGTH
        ? text.substring(0, LABEL_MAX_STRING_LENGTH) + '...'
        : text;
    output[outputSocketName] = text;

    const width = input[widthSocketName];

    this.configureWordWrap(width);
    if (width > 0) {
      this.resizeAndDrawLabel(width, undefined);
    } else {
      this.measureThenResizeAndDrawLabel(text);
    }
  }

  private getMarginTopBottom(): number {
    const fontSize = this.getFontSize();
    return fontSize / 2;
  }

  private getMarginLeftRight(): number {
    const fontSize = this.getFontSize();
    return fontSize / 1.5;
  }

  private getHTMLComponentLeft(): number {
    return this.x + this.getMarginLeftRight();
  }
  private getHTMLComponentTop(): number {
    return this.y + this.getMarginTopBottom() + 1; // magic number 💀
  }

  private configureWordWrap(width: number): void {
    if (width > 0) {
      this.PIXITextStyle.wordWrap = true;
      this.PIXITextStyle.wordWrapWidth = width;
    } else {
      this.PIXITextStyle.wordWrap = false;
    }
  }

  private setPixiTextStyleWidth(): void {
    const width = this.getInputData(widthSocketName);
    this.configureWordWrap(width);
  }

  private resizeAndDrawLabel(width, height): void {
    // If height is undefined, calculate it based on the text metrics
    if (height === undefined && width) {
      const textMetrics = PIXI.CanvasTextMetrics.measureText(
        this.PIXIText.text,
        this.PIXITextStyle,
      );
      height = textMetrics.height;
    }

    super.resizeAndDraw(
      Math.max(this.getMinNodeWidth(), width + this.getMarginLeftRight() * 2),
      height + this.getMarginTopBottom() * 2,
    );
  }

  private measureThenResizeAndDrawLabel = (text) => {
    this.setPixiTextStyleWidth();
    const textMetrics = PIXI.CanvasTextMetrics.measureText(
      text,
      this.PIXITextStyle,
    );
    this.resizeAndDrawLabel(textMetrics.width, textMetrics.height);
    return textMetrics;
  };

  public onBeingScaled = () => {
    this.measureThenResizeAndDrawLabel(this.getInputData(inputSocketName));
  };

  public resetSize(): void {
    this.measureThenResizeAndDrawLabel(this.getInputData(inputSocketName));
  }

  public createInputElement = () => {
    // create html input element
    const htmlComponentId = `Label-${inputSocketName}`;
    const text = this.getInputData(inputSocketName);
    const fontSize = this.getFontSize();
    const { textColor, textAlign, fontWeight } = this.getTextParameters();
    const screenPoint = PPGraph.currentGraph.viewport.toScreen(
      this.getHTMLComponentLeft(),
      this.getHTMLComponentTop(),
    );

    const existingElement = document.getElementById(
      htmlComponentId,
    ) as HTMLDivElement;

    this.HTMLTextComponent = document.createElement('div');
    this.HTMLTextComponent.id = htmlComponentId;
    this.HTMLTextComponent.contentEditable = 'true';
    this.HTMLTextComponent.setAttribute(DATA_DASHBOARD_EDITABLE, 'true');
    this.HTMLTextComponent.innerText = text;

    const style = {
      fontFamily: 'Arial',
      fontSize: `${fontSize}px`,
      fontWeight: fontWeight,
      lineHeight: `${fontSize * NOTE_LINEHEIGHT_FACTOR}px`,
      letterSpacing: '0px',
      textAlign: textAlign,
      color: textColor.hexa(),
      position: 'absolute',
      background: 'transparent',
      border: '0 none',
      transformOrigin: 'top left',
      transform: `scale(${PPGraph.currentGraph.viewportScaleX}`,
      outline: '0px dashed black',
      left: `${screenPoint.x}px`,
      top: `${screenPoint.y}px`,
      width: `${this.nodeWidth}px`,
      height: `${this.nodeHeight}px`,
      overflowWrap: 'anywhere',
    };
    Object.assign(this.HTMLTextComponent.style, style);

    // add event handlers
    this.HTMLTextComponent.addEventListener('blur', (e) => {
      this.PIXIVisible();
    });

    this.HTMLTextComponent.addEventListener('input', (e) => {
      const text = (e as any).target.innerText;
      this.PIXIText.text = text;

      const textMetrics = this.measureThenResizeAndDrawLabel(text);

      this.HTMLTextComponent.style.width = `${Math.max(
        20, // a small minimum width so the blinking cursor is visible
        textMetrics.width,
      )}px`;
      this.HTMLTextComponent.style.height = `${textMetrics.height}px`;

      const id = this.id;
      const setValueArgs: SetSocketValueActionArgs = {
        nodeID: id,
        socketName: inputSocketName,
        socketType: SOCKET_TYPE.IN,
        newValue: text,
      };
      // undo restores the text from before this edit (consecutive edits
      // merge in the action handler, which keeps the first undoArgs)
      const undoSetValueArgs: SetSocketValueActionArgs = {
        nodeID: id,
        socketName: inputSocketName,
        socketType: SOCKET_TYPE.IN,
        newValue: this.getInputData(inputSocketName),
      };
      void PNPAction(
        ACTIONS.SET_SOCKET_VALUE,
        setValueArgs,
        undoSetValueArgs,
        getSocketChecksum(this.getInputSocketByName(inputSocketName)),
      );
    });

    if (existingElement) {
      existingElement.replaceWith(this.HTMLTextComponent);
    } else {
      document.body.appendChild(this.HTMLTextComponent);
    }
  };

  protected onViewportMove(): void {
    if (this.HTMLTextComponent != null) {
      const screenPoint = PPGraph.currentGraph.viewport.toScreen(
        this.getHTMLComponentLeft(),
        this.getHTMLComponentTop(),
      );
      this.HTMLTextComponent.style.transform = `scale(${PPGraph.currentGraph.viewportScaleX}`;
      this.HTMLTextComponent.style.left = `${screenPoint.x}px`;
      this.HTMLTextComponent.style.top = `${screenPoint.y}px`;
    }
  }

  public getShrinkOnSocketRemove(): boolean {
    return false;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return { SocketToGetValue: this.getInputSocketByName(inputSocketName) };
  }

  onRemoved(): void {
    // Clean up edit mode listeners
    InterfaceController.removeListeners(this._editListenIds);
    this._editListenIds = [];

    // Clean up selection listener
    if (this.selectionListenerId) {
      InterfaceController.removeListener(this.selectionListenerId);
      this.selectionListenerId = undefined;
    }

    // Clean up HTML component
    if (this.HTMLTextComponent) {
      this.HTMLTextComponent.remove();
    }

    super.onRemoved();
  }
}

const TextNodeSettings: React.FC<{ nodeId: string }> = ({ nodeId }) => {
  // socket values - and the node itself, which conversions and their undo
  // recreate - change outside React; re-read after executions and layout edits
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const node = PPGraph.currentGraph.nodes[nodeId] as Text | undefined;
  useEffect(() => {
    const listenerId = InterfaceController.addListener(
      ListenEvent.SurfaceLayoutChanged,
      rerender,
    );
    node?.addExecutionListener(rerender);
    return () => {
      InterfaceController.removeListener(listenerId);
      node?.removeExecutionListener(rerender);
    };
  }, [node]);

  // converting it away leaves the inspector mounted for a moment
  if (!node) {
    return null;
  }
  const guard = getStaticConversionGuard(node);
  // styling stays on the node's sockets; the dashboard only offers conversion
  return (
    <Stack spacing={0.5} sx={{ bgcolor: 'background.default', p: 0.5 }}>
      <Button
        variant="outlined"
        color="secondary"
        size="small"
        disabled={!guard.allowed}
        onClick={() => void convertDynamicTextToStatic(nodeId)}
        data-cy="convert-to-static-text"
      >
        Convert to static text
      </Button>
      {!guard.allowed && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 0.5 }}
          data-cy="text-conversion-guard"
        >
          {guard.reason}
        </Typography>
      )}
    </Stack>
  );
};

const TextNodeWidget: React.FC<HybridWidgetContentProps<Text>> = (props) => {
  const node = props.node;
  const textProps = textPropsFromSocketValues(props);
  const inputs = getTokenInputs(node);
  // editable on the canvas and while its surface is being edited; the
  // running app and every preview only read it
  if (props.inDashboard && (!props.isEditMode || props.isSurfacePreview)) {
    return <TextView {...textProps} inputs={inputs} />;
  }
  const editor = (
    <InlineTextEditor
      profile={DYNAMIC_TEXT_PROFILE}
      content={textProps.content}
      editable={props.inDashboard || props.isInteractionEnabled}
      autoFocus={shouldAutoFocusWidgetContent(props)}
      // on the canvas the text fills its node, so the toolbar goes above it
      toolbarPlacement={props.inDashboard ? 'bottom-start' : 'top-start'}
      onChange={(content) => node.setContent(content)}
      tokens={{
        inputs,
        picker: {
          ...getTokenPickerProps(node),
          onCreateInput: (name) => createTokenInput(node, name),
        },
      }}
      dataCy={props.dataCyId}
      sx={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        ...resolveTextElementStyle(textProps),
      }}
    />
  );
  // the canvas shows the text on the app's own ground, as the app will
  return props.inDashboard ? (
    editor
  ) : (
    <AppThemeProvider>
      <Box
        data-cy="text-canvas-card"
        sx={{
          bgcolor: 'background.default',
          color: 'text.primary',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          minHeight: '100%',
          boxSizing: 'border-box',
        }}
      >
        {editor}
      </Box>
    </AppThemeProvider>
  );
};

const enumOptions = (values: readonly string[]) =>
  values.map((value) => ({ text: value, value }));

export class Text extends HybridNode2 {
  public getName(): string {
    return 'Text';
  }

  public getDescription(): string {
    return 'Rich text that shows live values from its inputs';
  }

  public getAIDocs(): string {
    return `Shows rich text on a UI surface, with live values from its own inputs.

Tokens are Handlebars paths into this node's inputs: {{temp}}, or {{d.temp}}
for a field of an object input. Format with
{{format d.temp decimals=1 suffix=" °C" dateFormat="YYYY-MM-DD" fallback="—"}}.
Only paths and format work - no blocks or other helpers. A token whose input
is missing or null shows its fallback, or nothing.

"Content" is inline Markdown with tokens: **bold**, *italic*, \`code\`,
[link](https://…), and [words]{.accent .nowrap} for a run's tone or no-wrap;
each line is a paragraph.
Styling: Variant (display|h1|h2|body|caption|label|stat) sets size, weight and
line height; Tone (default|muted|accent|positive|negative) a theme color;
Alignment. "Custom styles" takes CSS for anything else.

Connecting an output to this node adds an input named after that output.
"Output" is the rendered plain text.`;
  }

  public getTags(): string[] {
    return ['Text', 'Widget'].concat(super.getTags());
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return 0.01;
  }

  public getDefaultNodeWidth(): number {
    return 240;
  }

  public getDefaultNodeHeight(): number {
    return 80;
  }

  public getMinNodeHeight(): number {
    return 40;
  }

  public shouldFocusWhenNew(): boolean {
    return true;
  }

  public getWidgetProps(): WidgetProps {
    return {
      // both defer to the app theme, like static text
      background: { r: 0, g: 0, b: 0, a: 0 },
      color: INHERIT_COLOR,
      width: '100%',
      height: 'auto',
      minWidth: '48px',
      minHeight: '24px',
    };
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.OUT,
        TEXT_NODE_SOCKETS.output,
        new StringType(),
        '',
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        TEXT_NODE_SOCKETS.content,
        new StringType(),
        textDefaultProps.content,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        TEXT_NODE_SOCKETS.variant,
        new EnumType(enumOptions(TEXT_VARIANTS)),
        textDefaultProps.variant,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        TEXT_NODE_SOCKETS.tone,
        new EnumType(enumOptions(TEXT_TONES)),
        textDefaultProps.tone,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        TEXT_NODE_SOCKETS.alignment,
        new EnumType(enumOptions(TEXT_ALIGNMENTS)),
        textDefaultProps.alignment,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        TEXT_NODE_SOCKETS.customStyles,
        new JSONType(),
        {},
        false,
      ),
    ];
  }

  // a new link into the node becomes a token input named after its source
  public getSocketForNewConnection = (socket: PPSocket): PPSocket =>
    socket.isInput()
      ? this.getOutputSocketByName(TEXT_NODE_SOCKETS.output)
      : DynamicInputNodeFunctions.getSocketForNewConnection(socket, this, true);

  private setSocketValue(socketName: string, value: unknown): void {
    const socket = this.getInputSocketByName(socketName);
    const args = (newValue: unknown): SetSocketValueActionArgs => ({
      nodeID: this.id,
      socketName,
      socketType: SOCKET_TYPE.IN,
      newValue,
    });
    void PNPAction(
      ACTIONS.SET_SOCKET_VALUE,
      args(value),
      args(socket.data),
      getSocketChecksum(socket),
    );
  }

  public setContent(content: string): void {
    this.setSocketValue(TEXT_NODE_SOCKETS.content, content);
  }

  // unlike other widgets it is edited in place while its surface is edited
  isEditableInSurfaceEditMode(): boolean {
    return true;
  }

  getDashboardSettings(): React.ReactNode {
    return <TextNodeSettings nodeId={this.id} />;
  }

  getWidgetContent(props: HybridWidgetContentProps<Text>): React.ReactElement {
    return <TextNodeWidget {...props} />;
  }

  protected async onExecute(input: any, output: any): Promise<void> {
    const inputs = getTokenInputs(this);
    output[TEXT_NODE_SOCKETS.output] = textContentToPlain(
      markdownToTextContent(textPropsFromSocketValues(input).content, true),
      (source) => renderTokenSource(source, inputs),
    );
    await super.onExecute(input, output);
  }
}
