import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, MenuItem, MenuList, Paper } from '@mui/material';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_TAB_COMMAND,
} from 'lexical';
import {
  formatToken,
  resolveTokenPath,
  tokenPathToString,
  tokenValueToText,
  validateInputName,
} from '../tokens';
import { $createTokenNode } from './TokenNode';

export type TokenPickerInput = {
  name: string;
  preview: string;
  // the current value, whose fields `@name.` offers
  value: unknown;
};

export type TokenPickerProps = {
  inputs: TokenPickerInput[];
  // every socket name on the node, bindable or not - new names must be unique
  takenNames: string[];
  onCreateInput: (name: string) => void;
};

// '.', '_' and '-' belong to input names and paths, so they must not end the
// query the way they do by default
const QUERY_PUNCTUATION =
  '\\,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\[\\]\\\\/!%\'"~=<>:;';
const QUERY_TEXT = new RegExp(`^[^${QUERY_PUNCTUATION}\\s]+$`);

class PickerOption extends MenuOption {
  label: string;
  detail: string;
  path?: string[];
  // what Tab writes after the `@`
  completion?: string;
  createName?: string;
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
    this.completion = fields.completion;
    this.createName = fields.createName;
    this.disabledReason = fields.disabledReason;
  }
}

// a name with a space or punctuation cannot be typed into the query
const completionFor = (path: string[]): string | undefined => {
  const text = path.join('.');
  return QUERY_TEXT.test(text) ? text : undefined;
};

function buildOptions(
  query: string,
  { inputs, takenNames }: Omit<TokenPickerProps, 'onCreateInput'>,
): PickerOption[] {
  const [root, ...rest] = query.split('.');
  if (rest.length > 0) {
    const input = inputs.find((candidate) => candidate.name === root);
    if (!input) {
      return [];
    }
    // `@d.` lists the fields d holds right now; typing narrows them down
    const values = { [root]: input.value };
    const parentPath = [root, ...rest.slice(0, -1)];
    const prefix = rest[rest.length - 1];
    const parent = resolveTokenPath(parentPath, values);
    const fields =
      parent.resolved && typeof parent.value === 'object'
        ? Object.keys(parent.value as object).filter((key) =>
            key.toLowerCase().startsWith(prefix.toLowerCase()),
          )
        : [];
    const options = fields.map((key) => {
      const path = [...parentPath, key];
      return new PickerOption(`field:${path.join('.')}`, {
        label: tokenPathToString(path),
        detail: tokenValueToText(resolveTokenPath(path, values)),
        path,
        completion: completionFor(path),
      });
    });
    // a field the value does not hold yet can still be typed out in full
    if (rest.every(Boolean) && !fields.includes(prefix)) {
      const path = [root, ...rest];
      options.push(
        new PickerOption(`path:${query}`, {
          label: tokenPathToString(path),
          detail: 'path',
          path,
        }),
      );
    }
    return options;
  }

  const options = inputs
    .filter((input) => input.name.toLowerCase().includes(query.toLowerCase()))
    .map(
      (input) =>
        new PickerOption(`input:${input.name}`, {
          label: input.name,
          detail: input.preview,
          path: [input.name],
          completion: completionFor([input.name]),
        }),
    );

  if (query === '') {
    // the menu opens on `@` alone, even while there is nothing to list yet
    return options.length > 0
      ? options
      : [
          new PickerOption('hint', {
            label: 'Type a name to add an input',
            detail: '',
            disabledReason: 'no inputs yet',
          }),
        ];
  }
  if (!inputs.some((input) => input.name === query)) {
    const disabledReason = validateInputName(query, takenNames);
    options.push(
      new PickerOption('create', {
        label: `＋ new input "${query}"`,
        detail: disabledReason ?? '',
        createName: query,
        disabledReason,
      }),
    );
  }
  return options;
}

const MENU_GAP = 4;

/**
 * Places the menu at the `@`, below it unless the window has no room. Runs on
 * every render, before the browser paints: Lexical's own anchor is measured a
 * frame or two late after each keystroke, which made the menu jump to the
 * caret and back while typing.
 */
function placeMenu(
  menu: HTMLElement,
  query: string,
  rootElement: HTMLElement | null,
): void {
  const selection = window.getSelection();
  const node = selection?.focusNode;
  if (!selection || !node) {
    return;
  }
  const range = document.createRange();
  const leadOffset = selection.focusOffset - query.length - 1;
  if (node.nodeType === Node.TEXT_NODE && leadOffset >= 0) {
    range.setStart(node, leadOffset);
    range.setEnd(node, leadOffset + 1);
  } else {
    range.setStart(node, selection.focusOffset);
  }
  const rect = range.getBoundingClientRect();
  const anchor =
    rect.height > 0 || !rootElement ? rect : rootElement.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const fitsBelow = anchor.bottom + MENU_GAP + height <= window.innerHeight;
  menu.style.top = `${
    fitsBelow || anchor.top < height + MENU_GAP
      ? anchor.bottom + MENU_GAP
      : anchor.top - MENU_GAP - height
  }px`;
  menu.style.left = `${Math.max(
    0,
    Math.min(anchor.left, window.innerWidth - width),
  )}px`;
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

  const latest = useRef({ query, props });
  latest.current = { query, props };
  // the text typed before tabbing, and how far Tab has cycled through it
  const cycle = useRef<
    { stem: string; index: number; completion: string } | undefined
  >(undefined);

  // Tab completes the query to the next input or field that starts with what
  // was typed and cycles on with every press, the way a shell completes a
  // path; Shift+Tab cycles back
  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const { query: current, props: currentProps } = latest.current;
          if (current === null) {
            return false;
          }
          const continuing = cycle.current?.completion === current;
          const stem = continuing ? cycle.current!.stem : current;
          const matches = buildOptions(stem, currentProps).flatMap(
            ({ completion }) =>
              completion?.toLowerCase().startsWith(stem.toLowerCase())
                ? [completion]
                : [],
          );
          if (matches.length === 0) {
            return false;
          }
          event.preventDefault();
          const step = event.shiftKey ? -1 : 1;
          const index = continuing
            ? (cycle.current!.index + step + matches.length) % matches.length
            : step > 0
              ? 0
              : matches.length - 1;
          const completion = matches[index];
          cycle.current = { stem, index, completion };
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
              return;
            }
            const node = selection.anchor.getNode();
            if ($isTextNode(node)) {
              const { offset } = selection.anchor;
              node.spliceText(
                offset - current.length,
                current.length,
                completion,
                true,
              );
            }
          });
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    [editor],
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
        if (option.createName) {
          props.onCreateInput(option.createName);
        }
        const path = option.path ?? [option.createName!];
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
                ref={(menu: HTMLDivElement | null) => {
                  if (menu) {
                    placeMenu(menu, query ?? '', editor.getRootElement());
                  }
                }}
                data-cy="text-token-picker"
                elevation={8}
                sx={{
                  position: 'fixed',
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
              document.body,
            )
          : null
      }
    />
  );
}
