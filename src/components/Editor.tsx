import React, { useEffect, useRef, useState, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Box, Button, CircularProgress } from '@mui/material';
import ErrorFallback from './ErrorFallback';
import { MAX_STRING_LENGTH, UNSET_VALUE } from '../utils/constants';
import { convertToViewableString, getLoadedValue } from '../utils/utils';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

const MonacoEditor = React.lazy(() =>
  import('react-monaco-editor').then((module) => ({
    default: module.default,
    monaco: module.monaco,
  })),
);

const EditorLoading = () => (
  <Box display="flex" justifyContent="center" alignItems="center" height="100%">
    <CircularProgress />
  </Box>
);

type CodeEditorProps = {
  value: unknown;
  onChange?: (code: string) => void;
  editable?: boolean;
  language: string;
  inDashboard?: boolean;
};

export const CodeEditor: React.FunctionComponent<CodeEditorProps> = ({
  value,
  onChange,
  editable,
  language,
  inDashboard = false,
}) => {
  const minHeight = 48;
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor>();
  const monacoRef = useRef<typeof Monaco>();
  const boxRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  const shouldLoadAll = (newValue: unknown) => {
    if (editorRef.current?.hasTextFocus()) {
      return true;
    }
    return convertToViewableString(newValue)?.length < MAX_STRING_LENGTH;
  };

  const [loadAll, setLoadAll] = useState(shouldLoadAll(value));
  const [loadedValue, setLoadedValue] = useState(
    getLoadedValue(convertToViewableString(value), loadAll),
  );
  const [editorHeight, setEditorHeight] = useState(minHeight);

  const onLoadAll = () => {
    setLoadedValue(convertToViewableString(value));
    setLoadAll(true);
  };

  const changeEditorHeight = (max = Number.MAX_VALUE) => {
    if (editorRef.current) {
      const newContentHeight = editorRef.current.getContentHeight();
      if (editorHeight === minHeight) {
        setEditorHeight(Math.min(Math.max(minHeight, newContentHeight), max));
      }
    }
  };

  const editorDidMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addAction({
      id: 'Copy-lines-down',
      label: 'Copy lines down',
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD,
      ],
      run: function (copied) {
        editor.trigger(
          'Copy lines down',
          'editor.action.copyLinesDownAction',
          copied,
        );
      },
    });

    changeEditorHeight(Math.floor(window.innerHeight * 0.25));
  };

  const handleOnChange = (newValue: string) => {
    setLoadedValue(newValue);
    onChange?.(newValue);
  };

  useEffect(() => {
    const resizeHandle = resizeRef.current;
    const box = boxRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      if (box) {
        const newHeight = e.clientY - box.getBoundingClientRect().top;
        setEditorHeight(Math.max(minHeight, newHeight));
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', handleMouseDown);
    }

    return () => {
      if (resizeHandle) {
        resizeHandle.removeEventListener('mousedown', handleMouseDown);
        // Cleanup any potentially lingering listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
  }, []);

  // Cleanup Monaco editor on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const load = shouldLoadAll(value);
    setLoadAll(load);
    setLoadedValue(getLoadedValue(convertToViewableString(value), load));
  }, [value]);

  useEffect(() => {
    changeEditorHeight(Math.floor(window.innerHeight * 0.25));
  }, [loadedValue]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Box
        ref={boxRef}
        sx={{
          position: 'relative',
          height: inDashboard ? '100%' : `${editorHeight}px`,
          minHeight: `${minHeight}px`,
          maxHeight: inDashboard ? UNSET_VALUE : '80dvh',
          resize: inDashboard ? UNSET_VALUE : 'vertical',
          overflow: 'hidden',
          opacity: !editable ? 0.8 : 1,
        }}
      >
        {!loadAll && (
          <Button
            sx={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 10,
            }}
            color="secondary"
            variant="contained"
            size="small"
            onClick={onLoadAll}
          >
            Load all{editable && <span>(to edit)</span>}
          </Button>
        )}
        <Suspense fallback={<EditorLoading />}>
          <MonacoEditor
            width="100%"
            height="100%"
            language={language}
            theme="vs-dark"
            value={loadedValue}
            options={{
              automaticLayout: true,
              lineNumbersMinChars: 4,
              minimap: { enabled: !loadAll },
              readOnly: !loadAll || !editable,
              scrollbar: {
                alwaysConsumeMouseWheel: false,
              },
              scrollBeyondLastLine: false,
              selectOnLineNumbers: true,
              tabSize: 2,
              wordWrap: 'on',
            }}
            onChange={handleOnChange}
            editorDidMount={editorDidMount}
          />
        </Suspense>
        {!inDashboard && (
          <div
            ref={resizeRef}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '100%',
              height: '10px',
              cursor: 'ns-resize',
            }}
          />
        )}
      </Box>
    </ErrorBoundary>
  );
};

export default CodeEditor;
