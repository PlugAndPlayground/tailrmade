import { useEffect } from 'react';

import { PrismTokenizer, registerCodeHighlighting } from '@lexical/code';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

// a code block without a language keeps none, so a bare ``` in the markdown
// is not rewritten to ```javascript when the editor writes it back
const tokenizer = { ...PrismTokenizer, defaultLanguage: null };

export default function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return registerCodeHighlighting(editor, tokenizer);
  }, [editor]);
  return null;
}
