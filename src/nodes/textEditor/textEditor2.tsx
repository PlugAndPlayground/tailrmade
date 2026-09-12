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
import { $createLinkNode, AutoLinkNode } from '@lexical/link';
import { $generateHtmlFromNodes } from '@lexical/html';
import {
  $nodesOfType,
  BLUR_COMMAND,
  COMMAND_PRIORITY_NORMAL,
  FOCUS_COMMAND,
  LexicalEditor,
} from 'lexical';

import OnChangePlugin from '../../text/lexical/plugins/OnChangePlugin';
import ToolbarPlugin from '../../text/lexical/plugins/ToolbarPlugin';
import ListMaxIndentLevelPlugin from '../../text/lexical/plugins/ListMaxIndentLevelPlugin';
import CodeHighlightPlugin from '../../text/lexical/plugins/CodeHighlightPlugin';
import AutoLinkPlugin from '../../text/lexical/plugins/AutoLinkPlugin';
import EventPlugin from '../../text/lexical/plugins/EventPlugin';
import FloatingLinkEditorPlugin from '../../text/lexical/plugins/FloatingLinkEditorPlugin';
import TokenPickerPlugin from '../../text/lexical/TokenPickerPlugin';
import {
  $getRenderedTextContent,
  registerTokenInputs,
  TokenBehaviourPlugin,
  TokenInputs,
  TokenInputsContext,
} from '../../text/lexical/TokenNode';
import {
  createTextEditorConfig,
  TEXT_EDITOR2_PROFILE,
} from '../../text/lexical/editorConfig';
import {
  $exportMarkdown,
  htmlToMarkdown,
  MARKDOWN_TRANSFORMERS,
  markdownToLexicalState,
} from '../../text/lexical/markdown';
import {
  createTokenInput,
  getTokenInputs,
  getTokenPickerProps,
} from '../../text/nodeInputs';
import '../../text/lexical/styles.css';

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
import {
  PIXI_TRANSPARENT_ALPHA,
  COLOR_WHITE,
  NODE_TYPE_COLOR,
  SOCKETNAME_BACKGROUNDCOLOR,
  SOCKET_TYPE,
  customTheme,
} from '../../utils/constants';
import { DynamicInputNodeFunctions } from '../abstract/DynamicInputNode';
import { BackPropagation } from '../../interfaces';

export const textEditorMarkdownName = 'Markdown';
export const textEditorAutoHeightName = 'Auto height';
const plainOutputSocketName = 'Plain';
const markdownOutputSocketName = 'Markdown';
const htmlOutputSocketName = 'HTML';
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

export class TextEditor2 extends HybridNode2 {
  historyState: HistoryState;

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

  public inputPlugged(socket: PPSocket) {
    super.inputPlugged(socket);
    this.drawSockets();
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

  updateOutputs(editor: LexicalEditor, inputs: TokenInputs): void {
    registerTokenInputs(editor, inputs);
    editor.getEditorState().read(
      () => {
        this.setOutputData(
          plainOutputSocketName,
          $getRenderedTextContent(inputs),
        );
        this.setOutputData(
          markdownOutputSocketName,
          this.getInputData(textEditorMarkdownName),
        );
        this.setOutputData(
          htmlOutputSocketName,
          $generateHtmlFromNodes(editor, null),
        );
      },
      { editor },
    );
  }

  // small presentational component
  getWidgetContent(props: HybridWidgetContentProps<TextEditor2>): any {
    const node = props.node as TextEditor2;
    const editorRef = useRef<LexicalEditor>(null);
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
    const tokenInputs = getTokenInputs(node);

    const editorConfig = useMemo(
      () => createTextEditorConfig(TEXT_EDITOR2_PROFILE, 'TextEditor2'),
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
      setContrastColor(backgroundColor.getContrastTextColor());
    }, [
      backgroundColor.r,
      backgroundColor.g,
      backgroundColor.b,
      backgroundColor.a,
    ]);

    const updateOutputsAndEditorHeight = () => {
      node.updateOutputs(editorRef.current!, tokenInputs);
      const target = document.querySelector(`[data-cy='${props.dataCyId}']`);
      if (target?.scrollHeight) {
        setContentHeight(target.scrollHeight);
      }
    };

    // the markdown is the source of truth: whenever the editor is not being
    // typed in, it shows exactly what the markdown holds (which also drops
    // empty paragraphs left behind while typing)
    useEffect(() => {
      const editor = editorRef.current;
      const markdown = props[textEditorMarkdownName];
      if (pauseUpdate || !markdown || !editor) return;
      editor.setEditorState(
        editor.parseEditorState(markdownToLexicalState(markdown)),
      );
    }, [props[textEditorMarkdownName], pauseUpdate]);

    // token values arrive with every execution, so outputs follow each render
    useEffect(() => {
      if (editorRef.current) {
        updateOutputsAndEditorHeight();
      }
    });

    const onChangeByInternal = () => {
      // EditorRefPlugin is a child, so its effect has set the ref by now
      const editor = editorRef.current!;
      const hasAutoLinks = editor.getEditorState().read(
        () => {
          node.setInputData(textEditorMarkdownName, $exportMarkdown());
          return $nodesOfType(AutoLinkNode).length > 0;
        },
        { editor },
      );

      // store auto-detected links as ordinary links
      if (hasAutoLinks) {
        editor.update(() => {
          $nodesOfType(AutoLinkNode).forEach((autoLinkNode) => {
            autoLinkNode.replace(
              $createLinkNode(autoLinkNode.getURL(), {
                rel: autoLinkNode.__rel,
                target: autoLinkNode.__target,
                title: autoLinkNode.__title,
              }),
              true,
            );
          });
        });
      }

      updateOutputsAndEditorHeight();
    };

    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <ThemeProvider theme={customTheme}>
          <TokenInputsContext.Provider value={tokenInputs}>
            <LexicalComposer initialConfig={editorConfig}>
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
                    profile={TEXT_EDITOR2_PROFILE}
                    onHistoryChange={() => void node.executeOptimizedChain()}
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
                  <MarkdownShortcutPlugin
                    transformers={MARKDOWN_TRANSFORMERS}
                  />
                  <TokenBehaviourPlugin />
                  <TokenPickerPlugin
                    {...getTokenPickerProps(node)}
                    onCreateInput={(name) =>
                      createTokenInput(node, name)
                    }
                  />
                  {floatingAnchorElem && (
                    <FloatingLinkEditorPlugin
                      anchorElem={floatingAnchorElem}
                      isLinkEditMode={isLinkEditMode}
                      setIsLinkEditMode={setIsLinkEditMode}
                    />
                  )}
                </Box>
              </Box>
            </LexicalComposer>
          </TokenInputsContext.Provider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }
}

export function createMarkdownFromText(data: {
  plain?: string;
  html?: string;
}): Promise<string> {
  if (data.plain) {
    return Promise.resolve(data.plain); // plain text is valid markdown
  }
  return Promise.resolve(data.html ? htmlToMarkdown(data.html) : '');
}
