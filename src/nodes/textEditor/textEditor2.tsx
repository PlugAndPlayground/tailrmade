import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Box, ThemeProvider } from '@mui/material';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin';
import {
  HistoryPlugin,
  HistoryState,
} from '@lexical/react/LexicalHistoryPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { $createLinkNode, AutoLinkNode, LinkNode } from '@lexical/link';
import {
  TRANSFORMERS as DEFAULT_TRANSFORMERS,
  $convertToMarkdownString,
  $convertFromMarkdownString,
} from '@lexical/markdown';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import {
  $getRoot,
  $isElementNode,
  $isDecoratorNode,
  $isTextNode,
  $nodesOfType,
  createEditor,
  BLUR_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  FOCUS_COMMAND,
} from 'lexical';
import {
  BeautifulMentionNode,
  BeautifulMentionsPlugin,
} from 'lexical-beautiful-mentions';

import OnChangePlugin from './plugins/OnChangePlugin';
import ToolbarPlugin from './plugins/ToolbarPlugin';
import ListMaxIndentLevelPlugin from './plugins/ListMaxIndentLevelPlugin';
import CodeHighlightPlugin from './plugins/CodeHighlightPlugin';
import AutoLinkPlugin from './plugins/AutoLinkPlugin';
import EventPlugin from './plugins/EventPlugin';
import FloatingLinkEditorPlugin from './plugins/FloatingLinkEditorPlugin';

import ExampleTheme from './ExampleTheme';
import ErrorFallback from '../../components/ErrorFallback';
import PPSocket from '../../classes/SocketClass';
import HybridNode2, {
  HybridWidgetContentProps,
} from '../../classes/HybridNode2';
import { BooleanType } from '../datatypes/booleanType';
import { CodeType } from '../datatypes/codeType';
import { ColorType } from '../datatypes/colorType';
import { StringType } from '../datatypes/stringType';
import { TRgba } from '../../utils/color';
import {
  getCanvasWidgetPointerEvents,
  shouldAutoFocusWidgetContent,
} from '../../utils/nodeInteractivity';
import { convertToViewableString } from '../../utils/utils';
import {
  PIXI_TRANSPARENT_ALPHA,
  COLOR_WHITE,
  NODE_TYPE_COLOR,
  SOCKETNAME_BACKGROUNDCOLOR,
  SOCKET_TYPE,
  customTheme,
} from '../../utils/constants';
import { DynamicInputNodeFunctions } from '../abstract/DynamicInputNode';
import {
  beautifulMentionsTheme,
  CustomBeautifulMentionNodes,
  InputParameterMenu,
  InputParameterMenuItem,
  MENTION_TRANSFORMERS,
} from './plugins/CustomBeautifulMentionNodes';
import Socket from '../../classes/SocketClass';
import PPGraph from '../../classes/GraphClass';
import { BackPropagation } from '../../interfaces';

// Combine default and custom transformers
const TRANSFORMERS = [...MENTION_TRANSFORMERS, ...DEFAULT_TRANSFORMERS];

export const textEditorMarkdownName = 'Markdown';
export const textEditorAutoHeightName = 'Auto height';
const plainOutputSocketName = 'Plain';
const markdownOutputSocketName = 'Markdown';
const htmlOutputSocketName = 'HTML';
const inputPrefix = 'Input';
const backgroundColor = TRgba.fromString(COLOR_WHITE);

type PendingFocus = boolean;

const Placeholder: React.FC = () => {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: '16px',
        left: '26px',
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    >
      Start writing...
    </Box>
  );
};

interface InputParameters {
  [key: string]: { id: number; socketname: string; value: any }[];
}

export class TextEditor2 extends HybridNode2 {
  historyState: HistoryState;
  textToImport: { html: string } | { plain: string };
  eventTarget: EventTarget = new EventTarget();
  private inputParameters: InputParameters = { '@': [] };

  // The single piece of focus state. `undefined` means "no focus pending".
  // The widget reads this once its editor becomes editable, performs the
  // focus, then clears it. Exposed so the widget can coordinate.
  public pendingFocus = false;

  public getName(): string {
    return 'Text editor';
  }

  public getDescription(): string {
    return 'Adds a markdown rich text editor which allows to embed input data';
  }

  public getTags(): string[] {
    return ['Text', 'Widget'].concat(super.getTags());
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return PIXI_TRANSPARENT_ALPHA;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.OUT,
        plainOutputSocketName,
        new StringType(),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        textEditorMarkdownName,
        new StringType(),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        htmlOutputSocketName,
        new CodeType(),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        textEditorMarkdownName,
        new StringType(),
        '', // Empty string as default instead of JSON
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        SOCKETNAME_BACKGROUNDCOLOR,
        new ColorType(),
        backgroundColor,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        textEditorAutoHeightName,
        new BooleanType(),
        false,
        false,
      ),
    ];
  }

  public getMinNodeHeight(): number {
    return 160;
  }

  public getDefaultNodeWidth(): number {
    return 400;
  }

  public getDefaultNodeHeight(): number {
    return 400;
  }

  public shouldFocusWhenNew(): boolean {
    return true;
  }

  public getNewSocketName() {
    return super.getNewSocketName('Input');
  }

  public getSocketForNewConnection = (socket: PPSocket): PPSocket => {
    if (!socket.isInput()) {
      return DynamicInputNodeFunctions.getSocketForNewConnection(
        socket,
        this,
        true,
      );
    }
    return this.getOutputSocketByName(plainOutputSocketName);
  };

  public inputPlugged(socket: Socket) {
    super.inputPlugged(socket);
    this.updateInputParameters();
    this.drawSockets();
  }

  public inputUnplugged(socket: Socket) {
    super.inputUnplugged(socket);
    this.updateInputParameters();
  }

  public async enableInteraction(): Promise<void> {
    if (!this.isInteractionEnabled()) {
      this.requestFocus();
    }
    await super.enableInteraction();
    this.forceRerender(false);
  }

  public async disableInteraction(): Promise<void> {
    this.pendingFocus = false;
    await super.disableInteraction();
    this.forceRerender(false);
  }

  /** Record an intent to focus and place the caret at the end. */
  private requestFocus(): void {
    this.pendingFocus = true;
  }

  /**
   * Consume any pending focus request. Called by the widget once its editor
   * is editable. Returns the request (and clears it) or undefined.
   */
  public consumePendingFocus(): PendingFocus {
    const request = this.pendingFocus;
    this.pendingFocus = false;
    return request;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(textEditorMarkdownName),
    };
  }

  updateOutputs = (editorRef: React.MutableRefObject<any>) => {
    if (editorRef.current) {
      const editor = editorRef.current;
      editor.getEditorState().read(
        () => {
          const plainString = $getRoot().getTextContent();
          const markdownString = this.getInputData(textEditorMarkdownName);
          const htmlString = $generateHtmlFromNodes(editor, null);
          this.setOutputData(plainOutputSocketName, plainString);
          this.setOutputData(markdownOutputSocketName, markdownString);
          this.setOutputData(htmlOutputSocketName, htmlString);
        },
        { editor },
      );
    }
  };

  // Call this when input parameters change
  protected updateInputParameters(): void {
    if (PPGraph.currentGraph.interactionEnabledHybridNode?.id === this.id) {
      return;
    }
    const parameters = this.inputSocketArray
      .filter((input: PPSocket) => input.name.startsWith(inputPrefix))
      .map((parameter, index) => ({
        id: index,
        socketname: parameter.name,
        value:
          parameter.links.length > 0
            ? String(parameter.links[0].source.data)
            : parameter.data,
      }));

    this.inputParameters = { '@': parameters };

    // If the node has focus, trigger an update to refresh mentions
    if (PPGraph.currentGraph.interactionEnabledHybridNode?.id === this.id) {
      this.eventTarget.dispatchEvent(new Event('inputParametersChanged'));
    }
  }

  // Override onExecute to update parameters when node executes
  protected async onExecute(
    inputObject: any,
    outputObject: any,
  ): Promise<void> {
    this.updateInputParameters();
    await super.onExecute(inputObject, outputObject);
  }

  // small presentational component
  getWidgetContent(props: HybridWidgetContentProps<TextEditor2>): any {
    const node = props.node as TextEditor2;
    const editorRef = useRef(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [contrastColor, setContrastColor] = useState();
    const [pauseUpdate, setPauseUpdate] = useState(false);
    const [isDashboardFocused, setIsDashboardFocused] = useState(false);
    const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false);
    const [floatingAnchorElem, setFloatingAnchorElem] =
      useState<HTMLDivElement | null>(null);
    const onRef = useCallback((_floatingAnchorElem: HTMLDivElement) => {
      if (_floatingAnchorElem !== null) {
        setFloatingAnchorElem(_floatingAnchorElem);
      }
    }, []);
    const backgroundColor = TRgba.fromObject(props[SOCKETNAME_BACKGROUNDCOLOR]);

    const editorConfig = useMemo(
      () => ({
        namespace: 'MyEditor',
        theme: {
          ...ExampleTheme,
          beautifulMentions: beautifulMentionsTheme,
        },
        editorState: undefined,
        onError(error) {
          throw error;
        },
        nodes: [
          HeadingNode,
          ListNode,
          ListItemNode,
          QuoteNode,
          CodeNode,
          CodeHighlightNode,
          TableNode,
          TableCellNode,
          TableRowNode,
          AutoLinkNode,
          LinkNode,
          BeautifulMentionNode,
          ...CustomBeautifulMentionNodes,
        ],
      }),
      [],
    );

    const makeEditorEditable = useCallback(
      (state) => {
        editorRef.current.update(() => {
          editorRef.current.setEditable(state);
        });
      },
      [editorRef],
    );

    // Lexical can report editable slightly before the DOM host reflects
    // `contenteditable=true`, so wait for the DOM host before focusing.
    const MAX_FOCUS_FRAMES = 8;

    const applyPendingFocus = useCallback(() => {
      const request = node.consumePendingFocus();
      if (!request) {
        return;
      }

      // Trust Lexical's own state for the initial gate; the per-frame loop
      // below waits for the DOM attribute to actually reconcile.
      if (!editorRef.current?.isEditable?.()) {
        node.pendingFocus = request;
        return;
      }

      const selector = `[data-cy='${props.dataCyId}']`;

      const attemptFocus = (frame: number) => {
        const editorElement = document.querySelector(
          selector,
        ) as HTMLElement | null;

        const notReady =
          !editorElement?.isConnected ||
          editorElement.getAttribute('contenteditable') !== 'true';

        if (notReady) {
          if (frame < MAX_FOCUS_FRAMES) {
            requestAnimationFrame(() => attemptFocus(frame + 1));
          } else {
            // Couldn't reach an editable element; re-queue so a later
            // editable signal gets another chance rather than dropping it.
            node.pendingFocus = request;
          }
          return;
        }

        editorElement.focus({ preventScroll: true });

        const selection = window.getSelection();
        const hasSelectionInEditor =
          selection !== null &&
          selection.rangeCount > 0 &&
          editorElement.contains(selection.anchorNode) &&
          editorElement.contains(selection.focusNode);

        // Lexical often restores a selection on focus; if so, leave it.
        if (hasSelectionInEditor) return;

        const range = document.createRange();
        range.selectNodeContents(editorElement);
        range.collapse(false);

        selection?.removeAllRanges();
        selection?.addRange(range);
      };

      requestAnimationFrame(() => attemptFocus(0));
    }, [node, props.dataCyId]);

    useEffect(() => {
      if (!editorRef.current) return;

      const unregisterFocus = editorRef.current.registerCommand(
        FOCUS_COMMAND,
        () => {
          setPauseUpdate(true);
          if (props.inDashboard && !props.disabled) {
            setIsDashboardFocused(true);
          }
          return false;
        },
        COMMAND_PRIORITY_NORMAL,
      );

      const unregisterBlur = editorRef.current.registerCommand(
        BLUR_COMMAND,
        () => {
          setPauseUpdate(false);
          if (props.inDashboard) {
            setIsDashboardFocused(false);
            void node.execute();
          }
          return false;
        },
        COMMAND_PRIORITY_NORMAL,
      );

      // Readiness signal: when the editor's editable state flips to true,
      // satisfy any pending focus request.
      const unregisterEditable = editorRef.current.registerEditableListener(
        (editable: boolean) => {
          if (editable && shouldAutoFocusWidgetContent(props)) {
            applyPendingFocus();
          }
        },
      );

      return () => {
        unregisterFocus();
        unregisterBlur();
        unregisterEditable();
      };
    }, [props.disabled, props.inDashboard, applyPendingFocus]);

    useEffect(() => {
      if (props.disabled) {
        setIsDashboardFocused(false);
      }
    }, [props.disabled]);

    useEffect(() => {
      if (contentHeight && props[textEditorAutoHeightName]) {
        node.resizeAndDraw(node.nodeWidth, contentHeight + 32); // add container padding
      }
    }, [contentHeight, props[textEditorAutoHeightName]]);

    const shouldShowToolbar = props.inDashboard
      ? isDashboardFocused && !(props.disabled ?? false)
      : props.isInteractionEnabled;

    useEffect(() => {
      if (props.inDashboard) {
        makeEditorEditable(!props.disabled);
      } else {
        makeEditorEditable(props.isInteractionEnabled);
      }

      if (!shouldAutoFocusWidgetContent(props)) {
        return;
      }

      // If the editor was already editable, the editable listener won't fire a
      // fresh `true`, so satisfy any pending focus directly here. (Whichever of
      // the two paths consumes the request first wins; the other no-ops.)
      if (editorRef.current?.isEditable()) {
        applyPendingFocus();
      }
    }, [
      props.isInteractionEnabled,
      props.inDashboard,
      props.disabled,
      applyPendingFocus,
    ]);

    useEffect(() => {
      void onChangeByExternal();
    }, [props[textEditorMarkdownName], node.inputParameters]);

    useEffect(() => {
      setContrastColor(backgroundColor.getContrastTextColor());
    }, [
      backgroundColor.r,
      backgroundColor.g,
      backgroundColor.b,
      backgroundColor.a,
    ]);

    const updateOutputsAndEditorHeight = () => {
      node.updateOutputs(editorRef);
      const target = document.querySelector(`[data-cy='${props.dataCyId}']`);
      if (target?.scrollHeight) {
        setContentHeight(target.scrollHeight);
      }
    };

    const onChangeByInternal = (editorState) => {
      editorRef.current.getEditorState().read(() => {
        // Convert directly to Markdown with our custom transformers that handle mentions
        const markdownString = $convertToMarkdownString(TRANSFORMERS);
        node.setInputData(textEditorMarkdownName, markdownString);

        // Force update to ensure auto-links are properly converted
        if ($nodesOfType(AutoLinkNode).length > 0) {
          editorRef.current.update(() => {
            const autoLinkNodes = $nodesOfType(AutoLinkNode);
            autoLinkNodes.forEach((autoLinkNode) => {
              // Convert AutoLinkNode to LinkNode to ensure consistent handling
              const linkNode = $createLinkNode(autoLinkNode.getURL(), {
                rel: autoLinkNode.__rel,
                target: autoLinkNode.__target,
                title: autoLinkNode.__title,
              });
              autoLinkNode.replace(linkNode, true);
            });
          });
        }

        updateOutputsAndEditorHeight();
      });
    };

    const onChangeByExternal = useCallback(async () => {
      // don't update if the node is being edited
      if (pauseUpdate) return;

      const markdown = node.getInputData(textEditorMarkdownName);
      if (!markdown) return;

      // First, set the editor state from markdown
      const lexicalState = await markdownToLexicalState(markdown);
      await editorRef.current.update(() => {
        const editorState = editorRef.current.parseEditorState(lexicalState);
        editorRef.current.setEditorState(editorState);
      });
      // Then update all mentions
      await editorRef.current.update(() => {
        node.inputParameters['@'].forEach((input) => {
          const socketname = input.socketname;
          const newValue = convertToViewableString(
            node.getInputData(input.socketname),
          );

          const mentionNodes = $nodesOfType(
            CustomBeautifulMentionNodes[0] as any,
          );
          for (const node of mentionNodes) {
            const data = (node as any).getData();
            if (data.socketname === socketname) {
              (node as any).setValue(newValue);
              (node as any).setData({
                ...data,
                id: input.id,
                inDashboard: props.inDashboard,
              });
            }
          }
        });

        updateOutputsAndEditorHeight();
      });
    }, [node, editorRef, updateOutputsAndEditorHeight]);

    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <ThemeProvider theme={customTheme}>
          <LexicalComposer initialConfig={editorConfig as any}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                pointerEvents: getCanvasWidgetPointerEvents(props),
              }}
            >
              <EditorRefPlugin editorRef={editorRef} />
              {shouldShowToolbar && !props.disabled && (
                <ToolbarPlugin
                  setIsLinkEditMode={setIsLinkEditMode}
                  node={node}
                />
              )}
              <Box
                sx={{
                  background: `${backgroundColor}`,
                  color: `${contrastColor}`,
                  px: 2,
                  position: 'relative',
                  lineHeight: '20px',
                  fontWeight: 400,
                  textAlign: 'left',
                  boxSizing: 'border-box',
                  flex: 1,
                  overflow: 'hidden',
                }}
                ref={onRef}
              >
                <EventPlugin />
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      data-cy={props.dataCyId}
                      className="editor-input"
                    />
                  }
                  placeholder={<Placeholder />}
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <OnChangePlugin
                  editorRef={editorRef}
                  onChange={onChangeByInternal}
                  ignoreSelectionChange={true}
                />
                <HistoryPlugin externalHistoryState={node.historyState} />
                <CodeHighlightPlugin />
                <ListPlugin />
                <LinkPlugin />
                <AutoLinkPlugin />
                <TabIndentationPlugin />
                <ListMaxIndentLevelPlugin maxDepth={7} />
                <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                <BeautifulMentionsPlugin
                  items={node.inputParameters}
                  menuComponent={InputParameterMenu}
                  menuItemComponent={InputParameterMenuItem}
                  menuItemLimit={1000}
                />
                {floatingAnchorElem && (
                  <>
                    {/* <DraggableBlockPlugin anchorElem={floatingAnchorElem} /> */}
                    <FloatingLinkEditorPlugin
                      anchorElem={floatingAnchorElem}
                      isLinkEditMode={isLinkEditMode}
                      setIsLinkEditMode={setIsLinkEditMode}
                    />
                  </>
                )}
              </Box>
            </Box>
          </LexicalComposer>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }
}

// Convert Markdown to Lexical state
async function markdownToLexicalState(markdown: string): Promise<string> {
  const editorConfig = {
    namespace: 'MarkdownConverter',
    theme: { ...ExampleTheme },
    onError(error) {
      console.error(error);
    },
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
      BeautifulMentionNode,
      ...CustomBeautifulMentionNodes,
    ],
  };

  const editor = createEditor(editorConfig);
  let serializedState = null;

  await editor.update(() => {
    const root = $getRoot();
    // Use our custom transformers that include mention support
    $convertFromMarkdownString(markdown, TRANSFORMERS);
  });

  await editor.update(() => {
    serializedState = JSON.stringify(editor.getEditorState().toJSON());
  });

  return serializedState;
}

// We already have $convertToMarkdownString which converts from Lexical to Markdown

export async function createMarkdownFromText(data) {
  // For plain text, convert to basic markdown
  if (data['plain']) {
    return data['plain']; // Simple text is valid markdown
  }

  // If HTML is provided, we need to convert HTML to markdown
  if (data['html']) {
    // Create a temporary editor to convert HTML to markdown
    const tempEditor = createEditor({
      namespace: 'HtmlToMarkdown',
      onError(error) {
        console.error(error);
      },
      nodes: [
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        TableNode,
        TableCellNode,
        TableRowNode,
        AutoLinkNode,
        LinkNode,
        BeautifulMentionNode,
        ...CustomBeautifulMentionNodes,
      ],
    });

    let markdown = '';

    await tempEditor.update(() => {
      const parser = new DOMParser();
      const dom = parser.parseFromString(data['html'], 'text/html');
      const nodes = $generateNodesFromDOM(tempEditor, dom);
      const root = $getRoot();

      nodes.forEach((n) => {
        if ($isElementNode(n) || $isDecoratorNode(n) || $isTextNode(n)) {
          root.append(n);
        }
      });

      markdown = $convertToMarkdownString(TRANSFORMERS);
    });

    return markdown;
  }

  return ''; // Default fallback
}
