import React from 'react';
import { useEditor, useNode } from '@craftjs/core';
import { Box, Button } from '@mui/material';
import InterfaceController from '../../InterfaceController';
import { convertStaticTextToDynamic } from '../../text/conversion';
import { InlineTextEditor } from '../../text/lexical/InlineTextEditor';
import { STATIC_TEXT_PROFILE } from '../../text/lexical/editorConfig';
import {
  normalizeTextProps,
  resolveTextElementStyle,
  textDefaultProps,
  TextProps,
} from '../../text/model';
import { TextStyleSettings } from '../../text/TextStyleSettings';
import { TextView } from '../../text/TextView';

// consecutive keystrokes merge into one craft history entry
const CONTENT_THROTTLE_MS = 500;

/** Static text: tokens are off, so `{{name}}` is just text. */
export const Text = (props: Partial<TextProps>) => {
  const { isEditMode } = useEditor((state) => ({
    isEditMode: state.options.enabled,
  }));
  const {
    connectors: { connect, drag },
    actions: { setProp },
  } = useNode();
  const textProps = normalizeTextProps(props);

  return (
    <div
      ref={(ref) => {
        if (ref) connect(drag(ref));
      }}
      style={{ width: '100%' }}
      data-cy="static-text"
    >
      {isEditMode ? (
        <InlineTextEditor
          profile={STATIC_TEXT_PROFILE}
          content={textProps.content}
          onChange={(content) =>
            setProp((draft: TextProps) => {
              draft.content = content;
            }, CONTENT_THROTTLE_MS)
          }
          editable
          dataCy="static-text-editor"
          sx={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            ...resolveTextElementStyle(textProps),
          }}
        />
      ) : (
        <TextView {...textProps} />
      )}
    </div>
  );
};

const TextSettings = () => {
  const {
    id,
    actions: { setProp },
    props,
  } = useNode((node) => ({ props: node.data.props }));
  const { query } = useEditor();

  return (
    <TextStyleSettings
      props={normalizeTextProps(props)}
      update={(mutate) => setProp(mutate)}
    >
      <Box sx={{ bgcolor: 'background.default', p: 0.5 }}>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          data-cy="convert-to-dynamic-text"
          onClick={() =>
            // the editor's own tree: its latest edits may not be saved yet
            void convertStaticTextToDynamic(
              InterfaceController.displayedSurfaceNodeId!,
              id,
              query.serialize(),
            )
          }
        >
          Convert to text node
        </Button>
      </Box>
    </TextStyleSettings>
  );
};

Text.craft = {
  displayName: 'Text',
  props: { ...textDefaultProps },
  related: {
    settings: TextSettings,
  },
};
