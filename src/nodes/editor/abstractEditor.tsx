import React, { Suspense, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  ThemeProvider,
  CircularProgress,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from '../../components/ErrorFallback';
import PPSocket from '../../classes/SocketClass';
import { downloadFile, formatDate } from '../../utils/utils';
import { SOCKET_TYPE, customTheme } from '../../utils/constants';
import HybridNode2 from '../../classes/HybridNode2';
import { CustomFunction } from '../data/dataFunctions';
import { BackPropagation } from '../../interfaces';
import { AbstractType } from '../datatypes/abstractType';
import { WidgetContentProps } from '../../utils/interfaces';
import {
  commitDelayName,
  commitModeName,
  editorCommitOptions,
  getCommitDelaySocket,
  getCommitModeSocket,
  useCommitMode,
} from '../commitMode';

// Lazy load MonacoEditor
const MonacoEditor = React.lazy(() => import('../../components/MonacoEditor'));

// Loading component
const EditorLoading = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
    }}
  >
    <CircularProgress />
  </Box>
);

// Memoized EditorComponent to prevent unnecessary re-renders
interface EditorComponentProps {
  language: string;
  value: string;
  readOnly: boolean;
  isInteractionEnabled: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

const EditorComponent = React.memo(
  ({
    language,
    value,
    readOnly,
    isInteractionEnabled,
    onChange,
    onBlur,
  }: EditorComponentProps) => {
    const editorRef = useRef<{
      focus: () => void;
      getDomNode?: () => HTMLElement | null;
    } | null>(null);

    useEffect(() => {
      if (!editorRef.current) {
        return;
      }

      if (isInteractionEnabled) {
        requestAnimationFrame(() => {
          editorRef.current?.focus();
        });
        return;
      }

      const editorDomNode = editorRef.current.getDomNode?.();
      const activeElement = document.activeElement;
      if (
        editorDomNode &&
        activeElement instanceof HTMLElement &&
        editorDomNode.contains(activeElement)
      ) {
        activeElement.blur();
      }
    }, [isInteractionEnabled]);

    return (
      <Suspense fallback={<EditorLoading />}>
        <MonacoEditor
          language={language}
          theme="vs-dark"
          value={value}
          options={{
            automaticLayout: true,
            lineNumbersMinChars: 4,
            readOnly,
            scrollBeyondLastLine: false,
            selectOnLineNumbers: true,
            tabSize: 2,
            wordWrap: 'on' as const,
          }}
          onChange={onChange}
          editorDidMount={(editor) => {
            editorRef.current = editor;
            editor.onDidBlurEditorText(() => {
              onBlur?.();
            });
            if (isInteractionEnabled) {
              requestAnimationFrame(() => {
                editor.focus();
              });
            }
          }}
        />
      </Suspense>
    );
  },
);

const outputSocketName = 'output';
export const editorInputSocketName = 'input';

export abstract class CodeEditorAbstract extends HybridNode2 {
  public async onExecute(input, output): Promise<void> {
    output[outputSocketName] = input[editorInputSocketName];
    await super.onExecute(input, output);
  }
  getPreferredInputSocketName(): string {
    return editorInputSocketName;
  }

  public getTags(): string[] {
    return ['Widget'].concat(super.getTags());
  }

  public getRoundedCorners(): boolean {
    return false;
  }

  protected abstract getSocketType(): AbstractType;
  protected abstract getEditorLanguage(): string;

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(SOCKET_TYPE.OUT, outputSocketName, this.getSocketType()),
      new PPSocket(SOCKET_TYPE.IN, editorInputSocketName, this.getSocketType()),
      getCommitModeSocket(editorCommitOptions),
      getCommitDelaySocket(this),
    ];
  }

  public getMinNodeWidth(): number {
    return 200;
  }

  public getMinNodeHeight(): number {
    return 150;
  }

  public getDefaultNodeWidth(): number {
    return 400;
  }

  public getDefaultNodeHeight(): number {
    return 300;
  }

  protected getBackPropagationTargets(): BackPropagation {
    return {
      SocketToGetValue: this.getInputSocketByName(editorInputSocketName),
    };
  }

  public isCallingMacro(macroName: string): boolean {
    const input = this.getInputData(editorInputSocketName);
    if (typeof input !== 'string') {
      return false;
    }
    return input.replaceAll("'", '"').includes('acro("' + macroName);
  }

  public calledMacroChangedName(oldName: string, newName: string): void {
    if (!this.getInputSocketByName(editorInputSocketName).links.length) {
      this.setInputData(
        editorInputSocketName,
        CustomFunction.replaceMacroNameInCode(
          this.getInputData(editorInputSocketName),
          oldName,
          newName,
        ),
      );
    }
  }

  public loadData() {
    const parsed = this.getInputData(editorInputSocketName);
    this.setOutputData(outputSocketName, parsed);
  }

  onChange = async (value: string) => {
    this.setInputData(editorInputSocketName, value);
    this.setOutputData(outputSocketName, value);
    await this.executeChildren();
  };

  onDashboardBlur = () => {
    this.forceRerender(false);
  };

  onExport = (codeString) => {
    downloadFile(
      codeString,
      `${this.name} - ${formatDate()}.txt`,
      'text/plain',
    );
  };

  getWidgetContent(props: WidgetContentProps): React.ReactElement {
    const node = props.node as CodeEditorAbstract;
    const inputSocket = node.getInputSocketByName(editorInputSocketName);
    // Monaco owns the text; the draft only decides when it reaches the graph,
    // and showing it keeps an execution from resetting the editor mid-edit
    const commit = useCommitMode<string>(
      inputSocket.getStringifiedData(),
      (next) => void node.onChange(next),
      { mode: props[commitModeName], delay: props[commitDelayName] },
    );
    // EditorComponent is memoized on purpose, so it gets callbacks that keep
    // their identity across renders and read the current ones from here
    const latest = useRef({ commit, node, inDashboard: props.inDashboard });
    latest.current = { commit, node, inDashboard: props.inDashboard };
    const handleChange = useCallback(
      (next: string) => latest.current.commit.edit(next),
      [],
    );
    const handleBlur = useCallback(() => {
      const current = latest.current;
      current.commit.endEditing();
      if (current.inDashboard) {
        current.node.onDashboardBlur();
      }
    }, []);
    const isDashboardEditable = props.inDashboard && !(props.disabled ?? false);
    const isEditorInteractive = props.inDashboard
      ? isDashboardEditable
      : props.isInteractionEnabled;
    const readOnly =
      inputSocket.hasLink() ||
      (props.inDashboard
        ? (props.disabled ?? false)
        : !props.isInteractionEnabled);

    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <ThemeProvider theme={customTheme}>
          <Box
            data-cy={props.dataCyId}
            sx={{
              position: 'relative',
              height: '100%',
            }}
          >
            <EditorComponent
              language={node.getEditorLanguage()}
              value={commit.value}
              readOnly={readOnly}
              isInteractionEnabled={isEditorInteractive}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {isEditorInteractive && !readOnly && (
              <ButtonGroup
                variant="contained"
                size="small"
                sx={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  zIndex: 10,
                }}
              >
                <Button
                  onClick={() => node.onExport(props[editorInputSocketName])}
                >
                  <DownloadIcon sx={{ ml: 0.5, fontSize: '16px' }} />
                </Button>
              </ButtonGroup>
            )}
          </Box>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }
}
