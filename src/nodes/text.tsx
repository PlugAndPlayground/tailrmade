import React, { useEffect, useReducer } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import HybridNode2, { HybridWidgetContentProps } from '../classes/HybridNode2';
import { JSONType } from './datatypes/jsonType';
import { DynamicInputNodeFunctions } from './abstract/DynamicInputNode';
import { InlineTextEditor } from '../text/lexical/InlineTextEditor';
import { DYNAMIC_TEXT_PROFILE } from '../text/lexical/editorConfig';
import { markdownToPlainText } from '../text/lexical/markdown';
import {
  resolveTextElementStyle,
  TEXT_ALIGNMENTS,
  TEXT_TONES,
  TEXT_VARIANTS,
  textDefaultProps,
} from '../text/model';
import {
  createTokenInput,
  getTokenInputs,
  getTokenPickerProps,
} from '../text/nodeInputs';
import { withInputToken } from '../text/tokens';
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
import { StaticValue } from '../classes/StaticValue';
import PPGraph from '../classes/GraphClass';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { SOCKET_TYPE } from '../utils/constants';
import { AppThemeProvider } from '../components/dashboard/AppThemeProvider';
import { appSurfaceSx } from '../utils/theme';
import { INHERIT_COLOR } from '../utils/themeColors';
import { StringType } from './datatypes/stringType';
import { EnumType } from './datatypes/enumType';
import {
  ACTIONS,
  getSocketChecksum,
  PNPAction,
  SetSocketValueActionArgs,
} from '../classes/Action';
import { WidgetProps } from '../utils/interfaces';

const TextNodeSettings: React.FC<{ nodeId: string }> = ({ nodeId }) => {
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

  if (!node) {
    return null;
  }
  const guard = getStaticConversionGuard(node);
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
  return props.inDashboard ? (
    editor
  ) : (
    <AppThemeProvider>
      <Box
        data-cy="text-canvas-card"
        sx={(theme) => ({
          ...appSurfaceSx(theme),
          bgcolor: 'background.default',
          color: 'text.primary',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          minHeight: '100%',
          boxSizing: 'border-box',
        })}
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

  public getDocs(): string {
    return `Shows rich text on a UI surface, with live values from its own inputs.

Tokens are Handlebars paths into this node's inputs: {{temp}}, or {{d.temp}}
for a field of an object input. Only paths work - no blocks or helpers, so
format a value with other nodes before it reaches an input. A token whose
input is missing or null shows nothing.

"Content" is Markdown with tokens: # headings, - lists, > quotes, code
blocks, **bold**, *italic*, \`code\`, [link](https://…), and
[words]{.primary .nowrap} for a run's tone or no-wrap; each line is a
paragraph, so a blank line is an empty one.
Styling: Variant (display|h1|h2|body|caption|label|stat) sets size, weight and
line height; Tone (default|muted|primary|secondary|success|warning|error) a
theme color; Alignment. "Custom styles" takes CSS for anything else.

Connecting an output to this node adds an input named after that output and
puts its token into "Content": it replaces the default text, otherwise it is
appended.
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

  // a new link into the node becomes a token input named after its source,
  // and its token goes into the content so the value shows straight away
  public getSocketForNewConnection = (
    socket: PPSocket,
  ): PPSocket | undefined => {
    if (socket.isInput()) {
      return this.getOutputSocketByName(TEXT_NODE_SOCKETS.output);
    }
    const input = DynamicInputNodeFunctions.getSocketForNewConnection(
      socket,
      this,
      true,
    );
    const content = this.getInputSocketByName(TEXT_NODE_SOCKETS.content);
    if (input && typeof content.data === 'string') {
      // set directly: this runs inside the Add Node action when a drop
      // creates the node, and that action's undo removes the node
      content.data = withInputToken(
        content.data,
        input.name,
        textDefaultProps.content,
      );
    }
    return input;
  };

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
    output[TEXT_NODE_SOCKETS.output] = markdownToPlainText(
      textPropsFromSocketValues(input).content,
      getTokenInputs(this),
    );
    await super.onExecute(input, output);
  }
}
