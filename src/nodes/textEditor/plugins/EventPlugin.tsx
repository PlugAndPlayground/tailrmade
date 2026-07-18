import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export default function EventPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    function handleRefUpdate(editorRootElement) {
      if (editorRootElement !== null) {
        const handleCutPaste = (event) => {
          event.stopPropagation(); // Prevent the event from bubbling up
        };
        editorRootElement.addEventListener('cut', handleCutPaste);
        editorRootElement.addEventListener('paste', handleCutPaste);
        return () => {
          editorRootElement.removeEventListener('cut', handleCutPaste);
          editorRootElement.removeEventListener('paste', handleCutPaste);
        };
      }
    }
    return editor.registerRootListener(handleRefUpdate);
  }, [editor]);

  return null;
}
