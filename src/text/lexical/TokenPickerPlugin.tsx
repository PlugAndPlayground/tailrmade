import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, MenuItem, MenuList, Paper } from '@mui/material';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { formatToken, tokenPathToString, validateInputName } from '../tokens';
import { $createTokenNode } from './TokenNode';

export type TokenInputKind = 'scalar' | 'object';

export type TokenPickerInput = {
  name: string;
  preview: string;
  isObject: boolean;
};

export type TokenPickerProps = {
  inputs: TokenPickerInput[];
  // every socket name on the node, bindable or not - new names must be unique
  takenNames: string[];
  onCreateInput: (name: string, kind: TokenInputKind) => void;
};

// '.', '_' and '-' belong to input names and paths, so they must not end the
// query the way they do by default
const QUERY_PUNCTUATION =
  '\\,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\[\\]\\\\/!%\'"~=<>:;';

class PickerOption extends MenuOption {
  label: string;
  detail: string;
  path?: string[];
  create?: { name: string; kind: TokenInputKind };
  disabledReason?: string;

  constructor(
    key: string,
    fields: Omit<
      PickerOption,
      'key' | 'ref' | 'icon' | 'title' | 'setRefElement'
    >,
  ) {
    super(key);
    this.label = fields.label;
    this.detail = fields.detail;
    this.path = fields.path;
    this.create = fields.create;
    this.disabledReason = fields.disabledReason;
  }
}

function buildOptions(
  query: string,
  { inputs, takenNames }: Omit<TokenPickerProps, 'onCreateInput'>,
): PickerOption[] {
  const [root, ...rest] = query.split('.');
  if (rest.length > 0) {
    const input = inputs.find((candidate) => candidate.name === root);
    const path = [root, ...rest];
    return input && rest.every(Boolean)
      ? [
          new PickerOption(`path:${query}`, {
            label: tokenPathToString(path),
            detail: 'path',
            path,
          }),
        ]
      : [];
  }

  const options = inputs
    .filter((input) => input.name.toLowerCase().includes(query.toLowerCase()))
    .map(
      (input) =>
        new PickerOption(`input:${input.name}`, {
          label: input.name,
          detail: input.preview,
          path: [input.name],
        }),
    );

  if (query !== '' && !inputs.some((input) => input.name === query)) {
    const disabledReason = validateInputName(query, takenNames);
    (['scalar', 'object'] as const).forEach((kind) =>
      options.push(
        new PickerOption(`create:${kind}`, {
          label:
            kind === 'scalar'
              ? `＋ new input "${query}"`
              : `＋ new object input "${query}"`,
          detail: disabledReason ?? '',
          create: { name: query, kind },
          disabledReason,
        }),
      ),
    );
  }
  return options;
}

/** Typing `@` lists the owning node's inputs and inserts one as a token. */
export default function TokenPickerPlugin(
  props: TokenPickerProps,
): React.ReactElement {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const triggerFn = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0,
    punctuation: QUERY_PUNCTUATION,
  });

  const options = useMemo(
    () => buildOptions(query ?? '', props),
    [query, props.inputs, props.takenNames],
  );

  return (
    <LexicalTypeaheadMenuPlugin<PickerOption>
      options={options}
      triggerFn={triggerFn}
      onQueryChange={setQuery}
      onSelectOption={(option, textNodeContainingQuery, closeMenu) => {
        if (option.disabledReason) {
          return;
        }
        if (option.create) {
          props.onCreateInput(option.create.name, option.create.kind);
        }
        const path = option.path ?? [option.create!.name];
        editor.update(() => {
          const token = $createTokenNode(formatToken({ path }));
          if (textNodeContainingQuery) {
            textNodeContainingQuery.replace(token);
          }
          token.selectNext();
        });
        closeMenu();
      }}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && options.length > 0
          ? createPortal(
              <Paper
                data-cy="text-token-picker"
                elevation={8}
                sx={{
                  position: 'relative',
                  zIndex: 1500,
                  minWidth: 220,
                  maxHeight: 280,
                  overflow: 'auto',
                }}
              >
                <MenuList dense>
                  {options.map((option, index) => (
                    <MenuItem
                      key={option.key}
                      ref={option.setRefElement}
                      data-cy="text-token-picker-option"
                      selected={index === selectedIndex}
                      disabled={Boolean(option.disabledReason)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      // select on press: by the time a click would land,
                      // leaving the editor has already closed the menu
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectOptionAndCleanUp(option);
                      }}
                      sx={{ gap: 2, justifyContent: 'space-between' }}
                    >
                      <Box component="span">{option.label}</Box>
                      <Box
                        component="span"
                        sx={{
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'text.secondary',
                          fontSize: '0.8em',
                        }}
                      >
                        {option.detail}
                      </Box>
                    </MenuItem>
                  ))}
                </MenuList>
              </Paper>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
