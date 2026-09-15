import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export default function MyOnChangePlugin({
  editorRef,
  onChange,
  ignoreSelectionChange,
}) {
  // const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editorRef.current.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags }) => {
        if (
          (ignoreSelectionChange &&
            dirtyElements.size === 0 &&
            dirtyLeaves.size === 0) ||
          prevEditorState.isEmpty()
        ) {
          return;
        }
        onChange(editorState);
      },
    );
  }, [editorRef.current, onChange]);
  return null;
}
