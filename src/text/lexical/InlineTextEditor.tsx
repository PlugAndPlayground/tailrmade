import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Popper, ThemeProvider } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { customTheme, DATA_DASHBOARD_EDITABLE } from '../../utils/constants';
import { textContentToMarkdown } from '../inlineMarkdown';
import { toneCssVariables } from '../TextView';
import {
  $contentToLexical,
  $lexicalToContent,
  registerInlineTextSanitizer,
} from './content';
import { createTextEditorConfig, TextHostProfile } from './editorConfig';
import { markdownToTextContent } from './markdown';
import {
  TokenBehaviourPlugin,
  TokenInputs,
  TokenInputsContext,
} from './TokenNode';
import TokenPickerPlugin, { TokenPickerProps } from './TokenPickerPlugin';
import ToolbarPlugin from './plugins/ToolbarPlugin';
import FloatingLinkEditorPlugin from './plugins/FloatingLinkEditorPlugin';
import './styles.css';

export type InlineTextEditorProps = {
  profile: TextHostProfile;
  // inline Markdown
  content: string;
  onChange: (content: string) => void;
  editable: boolean;
  // take the caret (at the end) whenever editing starts
  autoFocus?: boolean;
  toolbarPlacement?: 'top-start' | 'bottom-start';
  // required exactly when the profile enables tokens
  tokens?: { inputs: TokenInputs; picker: TokenPickerProps };
  dataCy?: string;
  sx?: SxProps<Theme>;
};

const MAX_FOCUS_FRAMES = 10;

function ContentSyncPlugin({
  content,
  onChange,
  editable,
  autoFocus,
  profile,
}: Pick<
  InlineTextEditorProps,
  'content' | 'onChange' | 'editable' | 'autoFocus' | 'profile'
>): null {
  const [editor] = useLexicalComposerContext();
  const lastContent = useRef(content);
  // edits the host has not echoed back yet: hosts that store content
  // asynchronously can render an older one of them after a newer keystroke
  const pendingContents = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // content changed outside the editor (undo, a link, a conversion)
  useEffect(() => {
    const pendingIndex = pendingContents.current.indexOf(content);
    if (pendingIndex !== -1) {
      pendingContents.current.splice(0, pendingIndex + 1);
      return;
    }
    if (content !== lastContent.current) {
      lastContent.current = content;
      const parsed = markdownToTextContent(content, profile.tokens);
      editor.update(() => $contentToLexical(parsed));
    }
  }, [editor, content]);

  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ dirtyElements, dirtyLeaves, editorState }) => {
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
            return;
          }
          const next = editorState.read(() =>
            textContentToMarkdown($lexicalToContent()),
          );
          if (next !== lastContent.current) {
            lastContent.current = next;
            pendingContents.current.push(next);
            onChangeRef.current(next);
          }
        },
      ),
    [editor],
  );

  useEffect(() => {
    editor.setEditable(editable);
    if (!editable || !autoFocus) {
      return;
    }
    // the DOM host only turns contenteditable a frame or so after
    // setEditable, and a host that is not editable yet cannot take focus
    let framesLeft = MAX_FOCUS_FRAMES;
    let frame = requestAnimationFrame(function focusWhenEditable() {
      if (editor.getRootElement()?.isContentEditable) {
        editor.focus(undefined, { defaultSelection: 'rootEnd' });
      } else if (framesLeft-- > 0) {
        frame = requestAnimationFrame(focusWhenEditable);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, editable, autoFocus]);
  useEffect(() => registerInlineTextSanitizer(editor), [editor]);
  return null;
}

/** Inline rich text on the shared Lexical configuration. */
export function InlineTextEditor({
  profile,
  content,
  onChange,
  editable,
  autoFocus = false,
  toolbarPlacement = 'bottom-start',
  tokens,
  dataCy,
  sx,
}: InlineTextEditorProps): React.ReactElement {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const initialConfig = useMemo(() => {
    const parsed = markdownToTextContent(content, profile.tokens);
    return {
      ...createTextEditorConfig(profile, 'Text'),
      editorState: () => $contentToLexical(parsed),
    };
  }, []);

  return (
    <TokenInputsContext.Provider value={tokens?.inputs ?? {}}>
      <LexicalComposer initialConfig={initialConfig}>
        <Box
          ref={setWrapper}
          // focus-within, toolbar included: it is portalled out of this box,
          // but React still bubbles its focus events here
          onFocus={() => setIsFocused(true)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (
              !event.currentTarget.contains(next) &&
              !toolbarRef.current?.contains(next)
            ) {
              setIsFocused(false);
            }
          }}
          sx={[
            (theme) => toneCssVariables(theme),
            { position: 'relative', width: '100%' },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        >
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                data-cy={dataCy}
                className="text-inline-input"
                {...{ [DATA_DASHBOARD_EDITABLE]: 'true' }}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ContentSyncPlugin
            content={content}
            onChange={onChange}
            editable={editable}
            autoFocus={autoFocus}
            profile={profile}
          />
          <HistoryPlugin />
          <LinkPlugin />
          {tokens && <TokenBehaviourPlugin />}
          {tokens && <TokenPickerPlugin {...tokens.picker} />}
          {wrapper && (
            <FloatingLinkEditorPlugin
              anchorElem={wrapper}
              isLinkEditMode={isLinkEditMode}
              setIsLinkEditMode={setIsLinkEditMode}
            />
          )}
          <ThemeProvider theme={customTheme}>
            {/* portalled to the page, so no widget or canvas node clips it;
                below the text by default, clear of the dashboard editor's
                selection header */}
            <Popper
              open={editable && isFocused && Boolean(wrapper)}
              anchorEl={wrapper}
              placement={toolbarPlacement}
              modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
              sx={{ zIndex: 1500 }}
            >
              <Paper
                ref={toolbarRef}
                elevation={4}
                data-cy="text-inline-toolbar"
              >
                <ToolbarPlugin
                  setIsLinkEditMode={setIsLinkEditMode}
                  profile={profile}
                />
              </Paper>
            </Popper>
          </ThemeProvider>
        </Box>
      </LexicalComposer>
    </TokenInputsContext.Provider>
  );
}
