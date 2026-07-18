import React, { forwardRef } from 'react';
import { Box, MenuList, MenuItem } from '@mui/material';
import { ElementTransformer, TextMatchTransformer } from '@lexical/markdown';
import {
  BeautifulMentionComponentProps,
  BeautifulMentionNode,
  BeautifulMentionsMenuProps,
  BeautifulMentionsMenuItemProps,
  BeautifulMentionsTheme,
  createBeautifulMentionNode,
  $createBeautifulMentionNode,
} from 'lexical-beautiful-mentions';
import { TRgba } from '../../../utils/color';
import { MAIN_COLOR } from '../../../utils/constants';

export const beautifulMentionsTheme: BeautifulMentionsTheme = {
  '@': 'px-1',
  '@Focused': 'inline-code-span-focus',
};

// Custom mention transformer
// Transforms Lexical mention nodes triggered by @ to markdown syntax: @[value](socket:socketname)
// and then also back to Lexical mention nodes
const MENTION_REGEX = /@\[(.*?)\]\(socket:(.*?)\)/;
export const MENTION_TRANSFORMERS: Array<
  ElementTransformer | TextMatchTransformer
> = [
  {
    dependencies: [BeautifulMentionNode],
    export: (node) => {
      try {
        if (
          node.getType() === 'beautiful-mention' ||
          node.getType() === CustomBeautifulMentionNodes[0].getType()
        ) {
          // Get data safely
          let data;
          try {
            data = node.getData();
          } catch (e) {
            data = node.__data;
          }

          // Ensure we have the required properties
          if (!data || !data.socketname) {
            return null;
          }

          // Get current value from data, fall back to the node's value if not available
          const value = data.value || node.getValue();
          const socketname = data.socketname;

          return `@[${value}](socket:${socketname})`;
        }
        return null;
      } catch (error) {
        console.error('Error exporting mention node:', error);
        return null;
      }
    },
    importRegExp: new RegExp(MENTION_REGEX),
    regExp: new RegExp(MENTION_REGEX),
    replace: (textNode, match) => {
      try {
        const [, value, socketname] = match;

        if (!value || !socketname) {
          return;
        }

        const mentionNode = $createBeautifulMentionNode('@', value, {
          id: 0, // Will be updated later with correct ID
          socketname,
          value,
        });

        textNode.replace(mentionNode);
      } catch (error) {
        console.error('Error creating mention node:', error);
      }
    },
    trigger: '@',
    type: 'text-match',
  },
];

const CustomMentionComponent = forwardRef<
  HTMLSpanElement,
  BeautifulMentionComponentProps<{
    id: string;
    value: string;
    socketname: string;
    inDashboard: boolean;
  }>
>(({ value, data }, ref) => {
  return (
    <Box ref={ref} component="span">
      {!data.inDashboard && (
        <Box
          component="span"
          sx={{
            fontSize: '0.5em',
            pr: 0.25,
            background: `${TRgba.fromString(MAIN_COLOR).setAlpha(0.2)}`,
            px: 0.25,
            py: 0.1,
            mr: 0.25,
            borderRadius: '0.3em',
            fontFamily: 'monospace',
            cursor: 'pointer',
            '&.inline-code-span-focus': {
              outline: `2px solid ${TRgba.fromString(MAIN_COLOR).darken(0.5)}`,
              outlineOffset: '1px',
            },
          }}
        >
          {data.id}
        </Box>
      )}
      <Box
        component="span"
        sx={{
          background: `${TRgba.fromString(MAIN_COLOR).setAlpha(0.1)}`,
          px: 0.5,
          py: 0.2,
          fontFamily: 'monospace',
          cursor: 'pointer',
          '&.inline-code-span-focus': {
            outline: `2px solid ${TRgba.fromString(MAIN_COLOR).darken(0.5)}`,
            outlineOffset: '1px',
          },
        }}
      >
        {value}
      </Box>
    </Box>
  );
});

export const CustomBeautifulMentionNodes = createBeautifulMentionNode(
  CustomMentionComponent,
);

export function InputParameterMenu({
  open,
  loading,
  ...props
}: BeautifulMentionsMenuProps): JSX.Element {
  return (
    <MenuList
      data-cy="text-editor-mention-menu"
      sx={{
        zIndex: 1000,
        bgcolor: 'background.paper',
        width: 'fit-content',
        maxHeight: '280px',
        overflow: 'auto',
      }}
      {...props}
    />
  );
}

export const InputParameterMenuItem = forwardRef<
  HTMLLIElement,
  BeautifulMentionsMenuItemProps
>(
  (
    {
      selected,
      item: {
        data: { id, socketname },
      },
      ...props
    },
    ref,
  ) => {
    return (
      <MenuItem
        data-cy="text-editor-mention-option"
        selected={selected}
        {...props}
        ref={ref}
      >
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            fontSize: '0.75em',
            opacity: 0.4,
            pr: 1,
          }}
        >
          {id}
        </Box>
        <Box
          component="span"
          sx={{
            width: '160px',
            maxWidth: '320px',
            display: 'inline-block',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {socketname}
        </Box>
      </MenuItem>
    );
  },
);
