import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';

export type MonacoEditorProps = {
  value: string;
  language: string;
  theme?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  onChange?: (value: string) => void;
  editorDidMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoApi: typeof monaco,
  ) => void;
};

// Thin replacement for react-monaco-editor: owns one editor and its model,
// keeps them in sync with the props and disposes both on unmount
const MonacoEditor: React.FunctionComponent<MonacoEditorProps> = ({
  value,
  language,
  theme,
  options,
  onChange,
  editorDidMount,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // set while the value prop is written into the model, so that update is
  // not reported back through onChange
  const isApplyingValueRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const model = monaco.editor.createModel(value, language);
    const editor = monaco.editor.create(containerRef.current!, {
      ...options,
      model,
      ...(theme ? { theme } : {}),
    });
    editorRef.current = editor;
    editorDidMount?.(editor, monaco);
    const subscription = editor.onDidChangeModelContent(() => {
      if (!isApplyingValueRef.current) {
        onChangeRef.current?.(editor.getValue());
      }
    });
    return () => {
      subscription.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // the editor is created once; later prop changes are applied below
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || value === model.getValue()) {
      return;
    }
    // an edit operation instead of setValue keeps the undo stack
    isApplyingValueRef.current = true;
    editor.pushUndoStop();
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: value }],
      () => null,
    );
    editor.pushUndoStop();
    isApplyingValueRef.current = false;
  }, [value]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [language]);

  useEffect(() => {
    if (options) {
      editorRef.current?.updateOptions(options);
    }
  }, [options]);

  useEffect(() => {
    if (theme) {
      monaco.editor.setTheme(theme);
    }
  }, [theme]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default MonacoEditor;
