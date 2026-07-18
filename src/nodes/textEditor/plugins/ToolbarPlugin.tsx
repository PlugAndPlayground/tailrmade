import * as React from 'react';
import {
  Dispatch,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  $createCodeNode,
  $isCodeNode,
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
} from '@lexical/code';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
} from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isDecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingTagType,
} from '@lexical/rich-text';
import {
  $isParentElementRTL,
  $setBlocksType,
  $isAtNodeEnd,
} from '@lexical/selection';
import { $isTableNode, $isTableSelection } from '@lexical/table';
import {
  $findMatchingParent,
  $getNearestBlockElementAncestorOrThrow,
  $getNearestNodeOfType,
  mergeRegister,
} from '@lexical/utils';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_NORMAL,
  ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_MODIFIER_COMMAND,
  NodeKey,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  ElementNode,
  RangeSelection,
  TextNode,
} from 'lexical';
import { useBeautifulMentions } from 'lexical-beautiful-mentions';
import {
  Box,
  ButtonGroup,
  Divider,
  IconButton,
  IconButtonProps,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  ToggleButtonProps,
  styled,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import CodeIcon from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import SuperscriptIcon from '@mui/icons-material/Superscript';
import SubscriptIcon from '@mui/icons-material/Subscript';
import FormatClearIcon from '@mui/icons-material/FormatClear';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import TitleIcon from '@mui/icons-material/Title';
import { controlOrMetaKey, isMac, useStateRef } from '../../../utils/utils';
import { sanitizeUrl } from './url';
import { TRgba } from '../../../utils/color';
import { BlockFormatDropDown } from './BlockFormatDropDown';
import { TextEditor2 } from '../textEditor2';

interface BlockTypeEntry {
  name: string;
  icon: any;
  action: any;
  shortcut: any;
}

export interface BlockTypeMap {
  [key: string]: BlockTypeEntry;
}

export const rootTypeToRootName = {
  root: 'Root',
  table: 'Table',
};

function getSelectedNode(selection: RangeSelection): TextNode | ElementNode {
  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  if (anchorNode === focusNode) {
    return anchorNode;
  }
  const isBackward = selection.isBackward();
  if (isBackward) {
    return $isAtNodeEnd(focus) ? anchorNode : focusNode;
  } else {
    return $isAtNodeEnd(anchor) ? anchorNode : focusNode;
  }
}

function getCodeLanguageOptions(): [string, string][] {
  const options: [string, string][] = [];

  for (const [lang, friendlyName] of Object.entries(
    CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  )) {
    options.push([lang, friendlyName]);
  }

  return options;
}

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions();

const StyledToggleButton = styled(({ ...other }: ToggleButtonProps) => (
  <ToggleButton size="small" {...other} />
))({
  color: 'inherit',
  '&.Mui-selected': {
    color: 'inherit',
  },
  '& .MuiSvgIcon-root': {
    margin: '4px',
  },
  padding: 0,
  border: 'none',
  borderRadius: 0,
});

const StyledIconButton = styled(({ ...other }: IconButtonProps) => (
  <IconButton size="small" {...other} />
))({
  color: 'inherit',
  '&.Mui-selected': {
    color: 'inherit',
  },
  padding: 0,
  border: 'none',
  borderRadius: 0,
});

function ToolbarPlugin({
  setIsLinkEditMode,
  node,
}: {
  setIsLinkEditMode: Dispatch<boolean>;
  node: TextEditor2;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef(null);
  const [activeEditor, setActiveEditor] = useState(editor);
  const [blockType, setBlockType, blockTypeRef] = useStateRef('paragraph');
  const [rootType, setRootType] =
    useState<keyof typeof rootTypeToRootName>('root');
  const [selectedElementKey, setSelectedElementKey] = useState<NodeKey | null>(
    null,
  );
  const [elementFormat, setElementFormat] = useState<ElementFormatType>('left');
  const [isLink, setIsLink] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isSubscript, setIsSubscript] = useState(false);
  const [isSuperscript, setIsSuperscript] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isRTL, setIsRTL] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState<string>('');
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const [showBlockTypeDropDown, setShowBlockTypeDropDown] = useState(false);

  const { openMentionMenu } = useBeautifulMentions();

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      const elementKey = element.getKey();
      const elementDOM = activeEditor.getElementByKey(elementKey);

      // Update text format
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsSubscript(selection.hasFormat('subscript'));
      setIsSuperscript(selection.hasFormat('superscript'));
      setIsCode(selection.hasFormat('code'));
      setIsRTL($isParentElementRTL(selection));

      // Update links
      const node = getSelectedNode(selection);
      const parent = node.getParent();
      if ($isLinkNode(parent) || $isLinkNode(node)) {
        setIsLink(true);
      } else {
        setIsLink(false);
      }

      const tableNode = $findMatchingParent(node, $isTableNode);
      if ($isTableNode(tableNode)) {
        setRootType('table');
      } else {
        setRootType('root');
      }

      if (elementDOM !== null) {
        setSelectedElementKey(elementKey);
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode,
          );
          const type = parentList
            ? parentList.getListType()
            : element.getListType();
          setBlockType(type);
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType();
          if (type in blockTypeToBlockName) {
            setBlockType(type as keyof typeof blockTypeToBlockName);
          }
          if ($isCodeNode(element)) {
            const language =
              element.getLanguage() as keyof typeof CODE_LANGUAGE_MAP;
            setCodeLanguage(
              language ? CODE_LANGUAGE_MAP[language] || language : '',
            );
            return;
          }
        }
      }

      let matchingParent;
      if ($isLinkNode(parent)) {
        // If node is a link, we need to fetch the parent paragraph node to set format
        matchingParent = $findMatchingParent(
          node,
          (parentNode) => $isElementNode(parentNode) && !parentNode.isInline(),
        );
      }

      // If matchingParent is a valid node, pass it's format type
      setElementFormat(
        $isElementNode(matchingParent)
          ? matchingParent.getFormatType()
          : $isElementNode(node)
            ? node.getFormatType()
            : parent?.getFormatType() || 'left',
      );
    }
  }, [activeEditor]);

  const formatParagraph = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
    setShowBlockTypeDropDown(false);
  }, [activeEditor]);

  const formatHeading = useCallback(
    (headingSize: HeadingTagType) => {
      if (blockTypeRef.current !== headingSize) {
        editor.update(() => {
          const selection = $getSelection();
          $setBlocksType(selection, () => $createHeadingNode(headingSize));
        });
      } else {
        formatParagraph();
      }
      setShowBlockTypeDropDown(false);
    },
    [activeEditor],
  );

  const formatBulletList = useCallback(() => {
    if (blockTypeRef.current !== 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
    setShowBlockTypeDropDown(false);
  }, [activeEditor]);

  const formatNumberedList = useCallback(() => {
    if (blockTypeRef.current !== 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
    setShowBlockTypeDropDown(false);
  }, [activeEditor]);

  const formatQuote = useCallback(() => {
    if (blockTypeRef.current !== 'quote') {
      editor.update(() => {
        const selection = $getSelection();
        $setBlocksType(selection, () => $createQuoteNode());
      });
    }
    setShowBlockTypeDropDown(false);
  }, [activeEditor]);

  const formatCode = useCallback(() => {
    if (blockTypeRef.current !== 'code') {
      editor.update(() => {
        let selection = $getSelection();

        if (selection !== null) {
          if (selection.isCollapsed()) {
            $setBlocksType(selection, () => $createCodeNode());
          } else {
            const textContent = selection.getTextContent();
            const codeNode = $createCodeNode();
            selection.insertNodes([codeNode]);
            selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertRawText(textContent);
            }
          }
        }
      });
    }
    setShowBlockTypeDropDown(false);
  }, [activeEditor]);

  const blockTypeToBlockName: BlockTypeMap = useMemo(
    () => ({
      paragraph: {
        name: 'Normal',
        icon: FormatAlignLeftIcon,
        action: formatParagraph,
        shortcut: `${controlOrMetaKey()}+Alt+0`,
      },
      h1: {
        name: 'Heading 1',
        icon: TitleIcon,
        action: () => formatHeading('h1'),
        shortcut: `${controlOrMetaKey()}+Alt+1`,
      },
      h3: {
        name: 'Heading 3',
        icon: TitleIcon,
        action: () => formatHeading('h3'),
        shortcut: `${controlOrMetaKey()}+Alt+3`,
      },
      h5: {
        name: 'Heading 5',
        icon: TitleIcon,
        action: () => formatHeading('h5'),
        shortcut: `${controlOrMetaKey()}+Alt+5`,
      },
      bullet: {
        name: 'Bullet List',
        icon: FormatListBulletedIcon,
        action: formatBulletList,
        shortcut: `${controlOrMetaKey()}+Shift+8`,
      },
      number: {
        name: 'Numbered List',
        icon: FormatListNumberedIcon,
        action: formatNumberedList,
        shortcut: `${controlOrMetaKey()}+Shift+7`,
      },
      quote: {
        name: 'Quote',
        icon: FormatQuoteIcon,
        action: formatQuote,
        shortcut: '>',
      },
      code: {
        name: 'Code Block',
        icon: CodeIcon,
        action: formatCode,
        shortcut: '```',
      },
    }),
    [],
  );

  useEffect(() => {
    const keyBindings = {
      'Mod-Alt-Digit0': () => {
        formatParagraph();
        return true;
      },
      'Mod-Alt-Digit1': () => {
        formatHeading('h1');
        return true;
      },
      'Mod-Alt-Digit2': () => {
        formatHeading('h2');
        return true;
      },
      'Mod-Alt-Digit3': () => {
        formatHeading('h3');
        return true;
      },
      'Mod-Alt-Digit4': () => {
        formatHeading('h4');
        return true;
      },
      'Mod-Alt-Digit5': () => {
        formatHeading('h5');
        return true;
      },
      'Mod-Alt-Digit6': () => {
        formatHeading('h6');
        return true;
      },
      'Mod-Shift-Digit7': () => {
        formatNumberedList();
        return true;
      },
      'Mod-Shift-Digit8': () => {
        formatBulletList();
        return true;
      },
    };

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const { code, metaKey, ctrlKey, altKey, shiftKey } = event;
        const ctrlOrMeta = isMac() ? metaKey : ctrlKey;
        const commandKey = `${ctrlOrMeta ? 'Mod-' : ''}${altKey ? 'Alt-' : ''}${shiftKey ? 'Shift-' : ''}${code}`;
        if (commandKey in keyBindings) {
          event.preventDefault();
          return keyBindings[commandKey]();
        }
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [activeEditor]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        $updateToolbar();
        setActiveEditor(newEditor);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
      activeEditor.registerUpdateListener(() => {
        activeEditor.read(() => {
          $updateToolbar();
        });
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [$updateToolbar, activeEditor, editor]);

  useEffect(() => {
    return activeEditor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (payload) => {
        const event: KeyboardEvent = payload;
        const { code, ctrlKey, metaKey } = event;

        if (code === 'KeyK' && (ctrlKey || metaKey)) {
          event.preventDefault();
          let url: string | null;
          if (!isLink) {
            setIsLinkEditMode(true);
            url = sanitizeUrl('https://');
          } else {
            setIsLinkEditMode(false);
            url = null;
          }
          return activeEditor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [activeEditor, isLink, setIsLinkEditMode]);

  const clearFormatting = useCallback(() => {
    activeEditor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) || $isTableSelection(selection)) {
        const anchor = selection.anchor;
        const focus = selection.focus;
        const nodes = selection.getNodes();
        const extractedNodes = selection.extract();

        if (anchor.key === focus.key && anchor.offset === focus.offset) {
          return;
        }

        nodes.forEach((node, idx) => {
          // We split the first and last node by the selection
          // So that we don't format unselected text inside those nodes
          if ($isTextNode(node)) {
            // Use a separate variable to ensure TS does not lose the refinement
            let textNode = node;
            if (idx === 0 && anchor.offset !== 0) {
              textNode = textNode.splitText(anchor.offset)[1] || textNode;
            }
            if (idx === nodes.length - 1) {
              textNode = textNode.splitText(focus.offset)[0] || textNode;
            }
            /**
             * If the selected text has one format applied
             * selecting a portion of the text, could
             * clear the format to the wrong portion of the text.
             *
             * The cleared text is based on the length of the selected text.
             */
            // We need this in case the selected text only has one format
            const extractedTextNode = extractedNodes[0];
            if (nodes.length === 1 && $isTextNode(extractedTextNode)) {
              textNode = extractedTextNode;
            }

            if (textNode.__style !== '') {
              textNode.setStyle('');
            }
            if (textNode.__format !== 0) {
              textNode.setFormat(0);
              $getNearestBlockElementAncestorOrThrow(textNode).setFormat('');
            }
            node = textNode;
          } else if ($isHeadingNode(node) || $isQuoteNode(node)) {
            node.replace($createParagraphNode(), true);
          } else if ($isDecoratorBlockNode(node)) {
            node.setFormat('');
          }
        });
      }
    });
  }, [activeEditor]);

  const onCodeLanguageSelect = useCallback(
    (e) => {
      activeEditor.update(() => {
        if (selectedElementKey !== null) {
          const node = $getNodeByKey(selectedElementKey);
          if ($isCodeNode(node)) {
            node.setLanguage(e.target.value);
          }
        }
      });
    },
    [activeEditor, selectedElementKey],
  );

  const insertLink = useCallback(() => {
    if (!isLink) {
      setIsLinkEditMode(true);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl('https://'));
    } else {
      setIsLinkEditMode(false);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    }
  }, [editor, isLink, setIsLinkEditMode]);

  const handleToolbarMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest('button,[role="button"],[role="combobox"]')) {
        event.preventDefault();
      }
    },
    [],
  );

  return (
    <Box
      ref={toolbarRef}
      onMouseDownCapture={handleToolbarMouseDown}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        bgcolor: 'background.paper',
        color: `${TRgba.white()}`,
        '& svg': {
          m: 1,
        },
        '& hr': {
          mx: 0.5,
        },
      }}
    >
      <ButtonGroup variant="outlined" size="small">
        <StyledIconButton
          disabled={!canUndo || !isEditable}
          onClick={() => {
            editor.dispatchCommand(UNDO_COMMAND, undefined);
            void node.executeOptimizedChain();
          }}
          title={`Undo (${controlOrMetaKey()}+Z)`}
          data-cy="undo-button"
        >
          <UndoIcon />
        </StyledIconButton>
        <StyledIconButton
          disabled={!canRedo}
          onClick={() => {
            editor.dispatchCommand(REDO_COMMAND, undefined);
            void node.executeOptimizedChain();
          }}
          title={`Redo (${controlOrMetaKey()}+Y)`}
          data-cy="redo-button"
        >
          <RedoIcon />
        </StyledIconButton>
      </ButtonGroup>
      <Divider orientation="vertical" flexItem />
      {blockType in blockTypeToBlockName && activeEditor === editor && (
        <BlockFormatDropDown
          blockType={blockType}
          toolbarRef={toolbarRef}
          blockTypeToBlockName={blockTypeToBlockName}
          showBlockTypeDropDown={showBlockTypeDropDown}
          setShowBlockTypeDropDown={setShowBlockTypeDropDown}
        />
      )}
      {blockType === 'code' ? (
        <Select
          onChange={onCodeLanguageSelect}
          value={codeLanguage}
          size="small"
          sx={{
            textTransform: 'capitalize',
            minWidth: '100px',
            '& .MuiOutlinedInput-input': {
              p: 1,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
            '& .MuiSvgIcon-root': {
              m: 0,
            },
          }}
        >
          {CODE_LANGUAGE_OPTIONS.map(([value, name]) => {
            return (
              <MenuItem key={value} value={value}>
                <span className="text">{name}</span>
              </MenuItem>
            );
          })}
        </Select>
      ) : (
        <>
          <Divider orientation="vertical" flexItem />
          {/* <FontSize
            selectionFontSize={fontSize.slice(0, -2)}
            editor={editor}
            disabled={!isEditable}
          />
          <Divider orientation="vertical" flexItem /> */}
          <StyledToggleButton
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            }}
            value="bold"
            selected={isBold}
            title={`Bold (${controlOrMetaKey()}+B)`}
            data-cy="bold-button"
          >
            <FormatBoldIcon fontSize="small" />
          </StyledToggleButton>
          <StyledToggleButton
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
            }}
            value="italic"
            selected={isItalic}
            title={`Italic (${controlOrMetaKey()}+I)`}
            data-cy="italic-button"
          >
            <FormatItalicIcon fontSize="small" />
          </StyledToggleButton>
          <StyledToggleButton
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(
                FORMAT_TEXT_COMMAND,
                'strikethrough',
              );
            }}
            value="strikethrough"
            selected={isStrikethrough}
            title="Strikethrough"
            data-cy="strikethrough-button"
          >
            <FormatStrikethroughIcon fontSize="small" />
          </StyledToggleButton>
          <StyledToggleButton
            disabled={!isEditable}
            onClick={() => {
              activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
            }}
            value="code"
            selected={isCode}
            title="Code"
            data-cy="code-button"
          >
            <CodeIcon fontSize="small" />
          </StyledToggleButton>
          <StyledToggleButton
            disabled={!isEditable}
            onClick={insertLink}
            value="link"
            selected={isLink}
            title="Link"
            data-cy="link-button"
          >
            <LinkIcon fontSize="small" />
          </StyledToggleButton>
          <StyledIconButton onClick={clearFormatting} title="Clear formatting">
            <FormatClearIcon fontSize="small" />
          </StyledIconButton>
          <Divider orientation="vertical" flexItem />
          <ToggleButtonGroup>
            <StyledToggleButton
              onClick={() => {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
              }}
              value="leftAlign"
              selected={elementFormat === 'left'}
              title="Left Align"
            >
              <FormatAlignLeftIcon fontSize="small" />
            </StyledToggleButton>
            <StyledToggleButton
              onClick={() => {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
              }}
              value="centerAlign"
              selected={elementFormat === 'center'}
              title="Center Align"
            >
              <FormatAlignCenterIcon fontSize="small" />
            </StyledToggleButton>
            <StyledToggleButton
              onClick={() => {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
              }}
              value="rightAlign"
              selected={elementFormat === 'right'}
              title="Right Align"
            >
              <FormatAlignRightIcon fontSize="small" />
            </StyledToggleButton>
            <StyledToggleButton
              onClick={() => {
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify');
              }}
              value="justifyAlign"
              selected={elementFormat === 'justify'}
              title="Justify Align"
            >
              <FormatAlignJustifyIcon fontSize="small" />
            </StyledToggleButton>
            <Divider orientation="vertical" flexItem />
            <StyledIconButton
              onClick={() => {
                editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
              }}
              title="Outdent"
            >
              {isRTL ? (
                <FormatIndentIncreaseIcon fontSize="small" />
              ) : (
                <FormatIndentDecreaseIcon fontSize="small" />
              )}
            </StyledIconButton>
            <StyledIconButton
              onClick={() => {
                editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
              }}
              title="Indent"
            >
              {!isRTL ? (
                <FormatIndentIncreaseIcon fontSize="small" />
              ) : (
                <FormatIndentDecreaseIcon fontSize="small" />
              )}
            </StyledIconButton>
            <Divider orientation="vertical" flexItem />
            <StyledIconButton
              onClick={() => openMentionMenu({ trigger: '@' })}
              title="Insert input"
            >
              <AlternateEmailIcon fontSize="small" />
            </StyledIconButton>
          </ToggleButtonGroup>
        </>
      )}
    </Box>
  );
}

export default React.memo(ToolbarPlugin);
