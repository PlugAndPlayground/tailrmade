import React, { memo, useMemo, useRef, useCallback } from 'react';
import { TRgba } from '../utils/color';
import { v4 as uuid } from 'uuid';
import {
  Box,
  IconButton,
  Stack,
  TextField,
  Paper,
  Chip,
  Autocomplete,
  AutocompleteChangeReason,
  AutocompleteRenderOptionState,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { matchSorter } from 'match-sorter';
import parse from 'autosuggest-highlight/parse';
import match from 'autosuggest-highlight/match';
import PPGraph from '../classes/GraphClass';
import * as styles from '../utils/style.module.css';
import { getAllNodeTypes, getAllTagNames } from '../nodes/allNodes';
import { INodeSearch } from '../utils/interfaces';
import { getLoadNodeExampleURL } from '../utils/utils';
import { MAIN_COLOR } from '../utils/constants';
import {
  executeMacroPrefix,
  getNodeGroup,
  mapExecuteMacroPrefix,
} from './nodeSearchConstants';
export {
  executeMacroPrefix,
  mapExecuteMacroPrefix,
} from './nodeSearchConstants';

export enum NodeListOptionType {
  NODE,
  FILTER_TAG,
  CUSTOM_NODE,
  // placeholder when nothing matches: with freeSolo, MUI unmounts the whole
  // popper (including the tag filter row) on an empty option list, so an
  // empty result must still yield one (disabled) option
  NO_RESULTS,
}

export interface INodeSearchExtended extends INodeSearch {
  optionType: NodeListOptionType;
  tags: string[];
}

export const NodeSearchInput = ({ ...restOfProps }) => {
  const { slotProps = {}, ...textFieldProps } = restOfProps;
  const backgroundColor = TRgba.fromString(MAIN_COLOR).setAlpha(0.9).hexa();
  return (
    <TextField
      {...textFieldProps}
      hiddenLabel
      inputRef={restOfProps.inputRef}
      variant="filled"
      placeholder="Search nodes"
      slotProps={{
        ...slotProps,
        input: {
          ...slotProps.input,
          disableUnderline: true,
        },
      }}
      sx={{
        margin: 0,
        borderRadius: '16px',
        fontSize: '16px',
        lineHeight: '40px',
        backgroundColor: `${backgroundColor}`,
        zIndex: 10,
        '&&& .MuiInputBase-root': {
          backgroundColor: 'transparent',
          minHeight: '48px',
          height: 'auto',
        },
        '&&&& input': {
          paddingBottom: '8px',
          paddingTop: '8px',
          color: `${TRgba.fromString(MAIN_COLOR).getContrastTextColor()}`,
        },
        '& .MuiInputBase-root.MuiInputBase-adornedStart': {
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          paddingTop: '4px',
        },
      }}
    />
  );
};

const getMacroNodes = (): INodeSearchExtended[] => {
  const macroNodes = PPGraph.currentGraph.macros;

  return macroNodes
    .map((macro) => {
      return [executeMacroPrefix, mapExecuteMacroPrefix].map((prefix) => {
        const combinedName = prefix + macro.name;
        return {
          title: combinedName,
          key: combinedName,
          name: combinedName,
          description: combinedName,
          hasInputs: macro.hasInputSockets(),
          group: 'Macro',
          optionType: NodeListOptionType.NODE,
          tags: ['Macro'],
        };
      });
    })
    .flat();
};

const findAndResetGroup = (
  suggestedNames: string[],
  arrayToFindIn: INodeSearch[],
  groupName: string,
): INodeSearch[] => {
  const suggestedNodes: INodeSearch[] = [];
  suggestedNames.forEach((nodeName) => {
    const foundNode = arrayToFindIn.find((node) => node.key === nodeName);
    if (foundNode) {
      foundNode.group = groupName;
      suggestedNodes.push(foundNode);
    }
  });
  return suggestedNodes;
};

let nodesCached: INodeSearchExtended[] | undefined = undefined;

export const getNodes = (latest: INodeSearch[]): INodeSearch[] => {
  const sourceSocket = PPGraph.currentGraph.selectedSocket;
  if (!nodesCached) {
    nodesCached = Object.entries(getAllNodeTypes())
      .filter(([_, obj]) => obj.showInNodeSearch)
      .map(([title, obj]) => {
        return {
          title,
          name: obj.name,
          key: title,
          description: obj.description,
          hasInputs: obj.hasInputs,
          tags: obj.tags,
          hasExample: obj.hasExample,
          group: getNodeGroup(obj.tags),
          optionType: NodeListOptionType.NODE,
        };
      })
      .sort((a, b) => {
        // First sort by group, then by name within each group
        const groupComparison = a.group.localeCompare(b.group, 'en', {
          sensitivity: 'base',
        });
        if (groupComparison !== 0) {
          return groupComparison;
        }
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      });
  }

  // attach entries for all macro nodes in current graph
  const allNodesInList = nodesCached.concat(getMacroNodes());

  const arrayWithGroupReset: INodeSearchExtended[] = allNodesInList.map(
    (node) => ({
      ...node,
      group: getNodeGroup(node.tags),
    }),
  );

  const inOrOutputList =
    (sourceSocket?.isInput()
      ? sourceSocket?.dataType.recommendedInputNodeWidgets()
      : sourceSocket?.dataType.recommendedOutputNodeWidgets()) || [];

  const suggestedByType = findAndResetGroup(
    inOrOutputList,
    arrayWithGroupReset,
    'Suggested by socket type',
  );

  const preferredNodesList =
    sourceSocket?.getNode().getPreferredNodesPerSocket(sourceSocket) || [];

  const suggestedByNode = findAndResetGroup(
    preferredNodesList,
    arrayWithGroupReset,
    'Suggested by node',
  );

  const combinedArray = latest.concat(
    suggestedByNode,
    suggestedByType,
    arrayWithGroupReset.filter(
      (node) => !sourceSocket || node.hasInputs,
    ) as INodeSearchExtended[],
  );

  const included = {};
  const uniqueArray = combinedArray.filter((node) => {
    if (included[node.key]) {
      return false;
    } else {
      included[node.key] = true;
      return true;
    }
  });

  return uniqueArray;
};

const fuzzySearchMultipleWords = (
  options: INodeSearchExtended[],
  keys: (keyof INodeSearchExtended)[],
  filterValue: string,
) => {
  if (!filterValue || !filterValue.length) {
    return options;
  }

  // Try to match the whole string first
  const wholeStringResults = matchSorter(options, filterValue, {
    keys,
    threshold: matchSorter.rankings.CONTAINS,
  });

  // If we have good matches from whole string, return those
  if (wholeStringResults.length > 0) {
    return wholeStringResults;
  }

  // Fall back to the word-by-word approach
  const terms = filterValue.split(' ').filter((term) => term.length > 0);
  if (terms.length === 0) {
    return options;
  }

  const wordByWordResults = terms.reduceRight(
    (results, term) =>
      matchSorter(results, term, {
        keys,
        threshold: matchSorter.rankings.CONTAINS,
      }),
    options,
  );

  // Helper function to calculate search relevance score
  const calcSearchScore = (entry, filterValue, terms) => {
    const NUM_CHECKS = 4; // Total number of checks we perform
    let totalScore = 0;

    const nameLower = entry.name.toLowerCase();
    const filterLower = filterValue.toLowerCase();

    // Exact match has highest priority (2^4 = 16 points)
    if (nameLower === filterLower) {
      totalScore += Math.pow(2, NUM_CHECKS);
    }

    // Contains full search string (2^3 = 8 points)
    if (nameLower.includes(filterLower)) {
      totalScore += Math.pow(2, NUM_CHECKS - 1);
    }

    // Sequential term matches (2^2 = 4 points per match)
    let lastIndex = -1;
    let sequentialMatches = 0;

    for (const term of terms) {
      const termLower = term.toLowerCase();
      const index = nameLower.indexOf(termLower, lastIndex + 1);

      if (index > lastIndex) {
        sequentialMatches++;
        lastIndex = index;
        totalScore += Math.pow(2, NUM_CHECKS - 2);
      }
    }

    // Shorter names get slight priority (up to 1 point)
    const lengthScore = 1 - nameLower.length / 100; // Normalize to 0-1 range
    totalScore += lengthScore;

    return totalScore;
  };

  // Apply custom sorting for all search results
  if (terms.length > 1) {
    return wordByWordResults.sort(
      (a, b) =>
        calcSearchScore(b, filterValue, terms) -
        calcSearchScore(a, filterValue, terms),
    );
  }
  return wordByWordResults;
};

export const filterOptionsNode = (
  options: INodeSearch[] | string[],
  { inputValue },
) => {
  // First get all node options (string tags will be added only on search)
  let nodeOptions = options.filter(
    (option) => typeof option !== 'string',
  ) as INodeSearchExtended[];

  // Important: Mark ALL node options with their type, regardless of search input
  nodeOptions.forEach((node) => {
    if (!node.optionType) {
      node.optionType = NodeListOptionType.NODE;
    }
  });

  if (inputValue !== '') {
    // Apply fuzzy search to node options
    nodeOptions = fuzzySearchMultipleWords(
      nodeOptions,
      ['name', 'description'],
      inputValue,
    );

    // Make sure fuzzy search results all have optionType set
    nodeOptions.forEach((node) => {
      if (!node.optionType) {
        node.optionType = NodeListOptionType.NODE;
      }
    });

    // Find only tags that start with the input
    const tagSet = new Set(
      getAllTagNames().filter((tag) =>
        tag.toLowerCase().startsWith(inputValue.toLowerCase()),
      ),
    );

    // Convert to array and sort
    const matchingTags = Array.from(tagSet)
      .sort()
      .map(
        (tag) =>
          ({
            title: tag,
            key: `tag:${tag}`, // Using prefix to ensure uniqueness
            name: tag,
            description: 'Filter by tag',
            hasInputs: true,
            optionType: NodeListOptionType.FILTER_TAG,
            tags: [],
            group: 'Tags',
          }) as INodeSearchExtended,
      );

    // Check if there's an exact match with any node name
    const exactMatch = nodeOptions.some(
      (node) => node.name.toLowerCase() === inputValue.toLowerCase(),
    );

    // Create the custom node option
    const customNodeOption: INodeSearchExtended = {
      title: inputValue,
      key: `custom_${inputValue}`,
      name: `Create custom node: ${inputValue}`,
      description: 'Creates a CustomFunction node with this name',
      hasInputs: true,
      isNew: true,
      group: '',
      tags: [],
      optionType: NodeListOptionType.CUSTOM_NODE, // Explicitly set the type
    };

    // Only add the "create new node" option if no exact match exists
    if (!exactMatch) {
      nodeOptions.push(customNodeOption);
    }

    // Return matching tags followed by nodes
    return [...matchingTags, ...nodeOptions];
  }

  // Return only nodes when no input (no tags)
  return nodeOptions;
};

export const renderGroupItem = (props) => {
  const isSearching = props.children?.[0].props.issearching; // don't render group header while searching
  if (isSearching) {
    return (
      <li key={props.key}>
        <ul style={{ padding: 0 }}>{props.children}</ul>
      </li>
    );
  }
  return (
    <li key={props.key}>
      <Box
        sx={{
          position: 'sticky',
          top: '-0px',
          padding: '2px 8px',
          color: 'primary.contrastText',
          bgcolor: 'background.medium',
          zIndex: 2,
          fontSize: '10px',
        }}
      >
        {props.group}
      </Box>
      <ul style={{ padding: 0 }}>{props.children}</ul>
    </li>
  );
};

export const renderNodeItem = (props, option, { inputValue, selected }) => {
  const { key: itemKey, onTagClick, ...otherProps } = props;

  const matchesOfName = match(option.name, inputValue, {
    insideWords: true,
    findAllOccurrences: true,
  });
  const partsOfName = parse(option.name, matchesOfName);
  const matchesOfDescription = match(option.description, inputValue, {
    insideWords: true,
  });
  const partsOfDescription = parse(option.description, matchesOfDescription);

  return (
    <li
      {...otherProps}
      key={itemKey || uuid()}
      issearching={inputValue.length > 0 ? 1 : undefined}
      style={{
        paddingRight: '8px',
      }}
    >
      <Stack
        sx={{
          width: '100%',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box
            title={option.description}
            sx={{
              flexGrow: 1,
            }}
          >
            <Box>
              {partsOfName.map((part, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'inline',
                    opacity: part.highlight ? 1 : 0.75,
                    fontWeight: part.highlight ? 600 : 400,
                  }}
                >
                  {part.text}
                </Box>
              ))}
            </Box>
          </Box>
          {option.hasExample && (
            <IconButton
              sx={{
                borderRadius: 0,
                right: '0px',
                fontSize: '16px',
                padding: 0,
                height: '24px',
                display: 'none',
                '.Mui-focused &': {
                  display: 'inherit',
                },
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                window.open(getLoadNodeExampleURL(option.title), '_blank');
              }}
              title="Open node example"
              className={styles.menuItemButton}
            >
              <Box
                sx={{
                  color: 'text.secondary',
                  fontSize: '10px',
                  px: 0.5,
                }}
              >
                Open example
              </Box>
              <OpenInNewIcon sx={{ fontSize: '16px' }} />
            </IconButton>
          )}
          <Box>
            {option.tags?.map((part, index) => (
              <Chip
                key={index}
                label={part}
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  if (typeof part === 'string') {
                    console.log('Tag clicked:', part);
                    onTagClick(event, part);
                  }
                }}
                sx={{
                  fontSize: '10px',
                  cursor: 'pointer',
                  paddingBottom: '2px',
                  marginRight: '2px',
                }}
              />
            ))}
          </Box>
        </Box>
        <Box
          sx={{
            fontSize: '12px',
            opacity: '0.75',
            textOverflow: 'ellipsis',
          }}
        >
          <Box>
            {partsOfDescription.map((part, index) => (
              <Box
                key={index}
                sx={{
                  display: 'inline',
                  opacity: part.highlight ? 1 : 0.75,
                  fontWeight: part.highlight ? 600 : 400,
                }}
              >
                {part.text}
              </Box>
            ))}
          </Box>
        </Box>
      </Stack>
    </li>
  );
};

interface ResultsWithHeaderProps {
  children: React.ReactNode;
  nodeSearchCount: number;
  onTagClick: (event, tag: string) => void;
  selectedTags: string[];
  [key: string]: any; // For other props
}

export const ResultsWithHeader = memo<ResultsWithHeaderProps>(
  ({ children, nodeSearchCount, onTagClick, selectedTags = [], ...other }) => {
    // Get unique tags from all nodes
    const allTags = useMemo(() => {
      return getAllTagNames();
    }, []);

    const searchableNodeCount = useMemo(
      () =>
        Object.values(getAllNodeTypes()).filter((node) => node.showInNodeSearch)
          .length,
      [],
    );

    return (
      <Paper
        {...other}
        sx={{
          '.MuiAutocomplete-listbox': {
            padding: '0 0 8px',
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            pt: 0.5,
            pb: 0.25,
            fontSize: '10px',
            opacity: '0.5',
          }}
        >
          {`${nodeSearchCount} of ${searchableNodeCount}`}
        </Box>
        {/* Tag filter section */}
        <Box
          sx={{
            px: 2,
            py: 0.5,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
          }}
        >
          {allTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onClick={(e) => onTagClick(e, tag)}
              onMouseDown={(e) => e.preventDefault()} // Critical for preventing blur
              color={selectedTags.includes(tag) ? 'primary' : 'default'}
              sx={{ fontSize: '10px', cursor: 'pointer', paddingBottom: '2px' }}
            />
          ))}
        </Box>
        {children}
      </Paper>
    );
  },
);

export interface NodeSearchProps {
  isVisible: boolean;
  position: number[];
  setIsNodeSearchVisible: (visible: boolean) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  nodeSearchInput: React.RefObject<HTMLInputElement>;
  nodeSearchCountRef: React.MutableRefObject<number>;
  nodeSearchActiveItem: INodeSearch[];
  theme: any;
}

export const NodeSearch: React.FC<NodeSearchProps> = ({
  isVisible,
  position,
  setIsNodeSearchVisible,
  selectedTags,
  setSelectedTags,
  nodeSearchInput,
  nodeSearchCountRef,
  nodeSearchActiveItem,
  theme,
}) => {
  const handleTagClick = useCallback(
    (event: any, tag: string) => {
      console.log('handleTagClick', tag);

      // Toggle tag selection
      if (selectedTags.includes(tag)) {
        // Remove the tag if it's already selected
        setSelectedTags(selectedTags.filter((t) => t !== tag));
      } else {
        // Add the tag if it's not yet selected
        setSelectedTags([...selectedTags, tag]);
      }
    },
    [selectedTags, setSelectedTags],
  );

  const handleOptionSelection = useCallback(
    (event: React.SyntheticEvent, option: INodeSearchExtended) => {
      console.log('handleOptionSelection:', option);
      if (!option) {
        console.warn('No option selected');
        return;
      }

      // Handle the option based on its type
      switch (option.optionType) {
        case NodeListOptionType.NODE:
          // Regular node - add to canvas and close search
          void PPGraph.currentGraph.addOrReplaceNode(event, option);
          setIsNodeSearchVisible(false);
          break;

        case NodeListOptionType.FILTER_TAG:
          // Filter tag - toggle selection and keep dropdown open
          handleTagClick(event, option.title);
          event.preventDefault();
          event.stopPropagation();
          // Important: Don't close the dropdown
          // Ensure input keeps focus
          if (nodeSearchInput.current) {
            nodeSearchInput.current.focus();
          }
          break;

        case NodeListOptionType.NO_RESULTS:
          // informational placeholder - not selectable, keep the search open
          event.preventDefault();
          event.stopPropagation();
          break;

        case NodeListOptionType.CUSTOM_NODE:
          // Custom node creation
          const nodeName = option.title.trim();
          // Create a custom function node
          const customNode: INodeSearchExtended = {
            title: nodeName,
            key: `CustomFunction_${nodeName}`,
            name: nodeName,
            description: 'Custom function node',
            hasInputs: true,
            isNew: true,
            tags: ['Custom'],
            optionType: NodeListOptionType.CUSTOM_NODE,
            group: '',
          };

          void PPGraph.currentGraph.addOrReplaceNode(event, customNode);
          setIsNodeSearchVisible(false);
          break;

        default:
          // Unknown option type - just close the search
          setIsNodeSearchVisible(false);
      }
    },
    [handleTagClick, nodeSearchInput, setIsNodeSearchVisible],
  );

  const getSortedOptions = useCallback(() => {
    return getNodes(nodeSearchActiveItem);
  }, [nodeSearchActiveItem]);

  const filterOptions = useCallback(
    (options: INodeSearch[] | string[], state: { inputValue: string }) => {
      const inputValue = state.inputValue;

      // Filter by input text (this will now add matching tags)
      let filteredOptions = filterOptionsNode(options, {
        ...state,
        inputValue,
      }) as INodeSearchExtended[];

      // Additionally filter by selected tags if any
      if (selectedTags.length > 0) {
        filteredOptions = filteredOptions.filter((option) =>
          option.optionType === NodeListOptionType.FILTER_TAG
            ? !selectedTags.includes(option.title as string) // Don't show already selected tags
            : selectedTags.every((tag) => option.tags?.includes(tag)),
        );
      }

      // Count only nodes, not tags or custom node option
      nodeSearchCountRef.current = filteredOptions.filter(
        (option) => option.optionType === NodeListOptionType.NODE,
      ).length;

      // never return an empty list (see NodeListOptionType.NO_RESULTS)
      if (filteredOptions.length === 0) {
        filteredOptions = [
          {
            title: 'No matching nodes',
            key: 'no-results',
            name: 'No matching nodes',
            description:
              'Adjust the search text or unselect tags to see more nodes',
            hasInputs: false,
            group: '',
            tags: [],
            optionType: NodeListOptionType.NO_RESULTS,
          } as INodeSearchExtended,
        ];
      }

      return filteredOptions;
    },
    [selectedTags, nodeSearchCountRef],
  );

  const handleChange = useCallback(
    (
      event: React.SyntheticEvent,
      newValue: Array<string | INodeSearchExtended>,
      reason: AutocompleteChangeReason,
      details,
    ) => {
      if (reason === 'removeOption') {
        event.preventDefault();
        event.stopPropagation();
        setSelectedTags(
          newValue.filter((value) => typeof value === 'string') as string[],
        );
      } else if (reason === 'createOption') {
        const inputValue =
          typeof details?.option === 'string' ? details.option : '';
        const firstOption = filterOptions(getSortedOptions(), {
          inputValue,
        })[0];
        if (firstOption) {
          handleOptionSelection(event, firstOption);
        } else {
          setIsNodeSearchVisible(false);
        }
      } else {
        handleOptionSelection(event, details?.option as INodeSearchExtended);
      }
    },
    [
      handleOptionSelection,
      setSelectedTags,
      filterOptions,
      getSortedOptions,
      setIsNodeSearchVisible,
    ],
  );

  const handleEnterCapture = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }
      const input = event.target as HTMLInputElement;
      if (input.value) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const activeId = input.getAttribute('aria-activedescendant');
      const highlightedEl = activeId
        ? (document.getElementById(activeId) as HTMLElement | null)
        : null;
      if (highlightedEl) {
        highlightedEl.click();
        return;
      }
      const firstOption = filterOptions(getSortedOptions(), {
        inputValue: '',
      })[0] as INodeSearchExtended | undefined;
      if (firstOption) {
        handleOptionSelection(event, firstOption);
      }
    },
    [filterOptions, getSortedOptions, handleOptionSelection],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Handle Escape key to close the search
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsNodeSearchVisible(false);
        return;
      }

      if (event.key === 'ArrowLeft') {
        const input = event.target;
        // Only prevent if cursor is at the beginning
        if (input.selectionStart === 0) {
          console.log('ArrowLeft pressed', input);
          event.preventDefault();
          event.stopPropagation();
        }
      }
    },
    [selectedTags, setIsNodeSearchVisible],
  );

  const renderOptionHandler = useCallback(
    (
      props: React.HTMLAttributes<HTMLLIElement>,
      option: INodeSearchExtended | string,
      state: AutocompleteRenderOptionState,
    ) => {
      // Extract key from props to handle separately
      const { key: itemKey, ...otherProps } = props;

      // Handle based on option type
      if (
        typeof option !== 'string' &&
        option.optionType === NodeListOptionType.NO_RESULTS
      ) {
        return (
          <li key={`no-results-${itemKey}`} {...otherProps}>
            <Box
              sx={{
                px: 1,
                py: 0.5,
                fontSize: '12px',
                color: 'text.secondary',
              }}
            >
              {option.title}
              <Box sx={{ fontSize: '10px', opacity: 0.75 }}>
                {option.description}
              </Box>
            </Box>
          </li>
        );
      }
      if (
        typeof option !== 'string' &&
        option.optionType === NodeListOptionType.FILTER_TAG
      ) {
        return (
          <li key={`filter-${itemKey}`} {...otherProps}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box
                component="span"
                sx={{
                  fontSize: '12px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  px: 1,
                  py: 0.5,
                }}
              >
                {option.title}
              </Box>
              <Box
                component="span"
                sx={{ ml: 1, fontSize: '12px', opacity: 0.7 }}
              >
                Filter by tag
              </Box>
            </Box>
          </li>
        );
      }

      // For nodes and custom node option
      const enhancedProps = {
        ...otherProps,
        key: itemKey,
        onClick: (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          handleOptionSelection(event, option as INodeSearchExtended);
          return false;
        },
        onTagClick: handleTagClick,
      };
      return renderNodeItem(enhancedProps, option as INodeSearch, state);
    },
    [handleOptionSelection, handleTagClick],
  );

  return (
    <div
      style={{
        visibility: isVisible ? undefined : 'hidden',
        position: 'relative',
        left: `${position[0]}px`,
        top: `${position[1]}px`,
      }}
    >
      <Autocomplete
        id="node-search"
        open={isVisible}
        slotProps={{
          listbox: { style: { maxHeight: '50dvh' } },
        }}
        slots={{
          paper: (props) => (
            <ResultsWithHeader
              nodeSearchCount={nodeSearchCountRef.current}
              selectedTags={selectedTags}
              onTagClick={handleTagClick}
              {...props}
            >
              {props.children}
            </ResultsWithHeader>
          ),
        }}
        sx={{
          maxWidth: '50vw',
          width: '480px',
          minWidth: '200px',
          [theme.breakpoints.down('sm')]: {
            maxWidth: '90vw',
            width: '90vw',
          },
          '& .MuiAutocomplete-tag': {
            marginTop: '4px',
            marginLeft: 0,
          },
        }}
        freeSolo
        multiple
        limitTags={3}
        openOnFocus
        selectOnFocus
        autoHighlight
        clearOnBlur
        autoComplete
        disablePortal
        defaultValue={[]}
        value={selectedTags}
        onChange={handleChange}
        onKeyDownCapture={handleEnterCapture}
        onKeyDown={handleKeyDown}
        isOptionEqualToValue={(option, value) => {
          if (typeof value === 'string') {
            return typeof option === 'string'
              ? option === value
              : option.optionType === NodeListOptionType.FILTER_TAG &&
                  option.title === value;
          }
          return option.key === value.key;
        }}
        getOptionDisabled={(option) =>
          typeof option !== 'string' &&
          (option as INodeSearchExtended).optionType ===
            NodeListOptionType.NO_RESULTS
        }
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.name
        }
        groupBy={(option) =>
          typeof option === 'string' ? 'Tags' : option.group
        }
        options={getSortedOptions()}
        renderOption={renderOptionHandler}
        renderInput={(params) => (
          <NodeSearchInput {...params} inputRef={nodeSearchInput} />
        )}
        filterOptions={filterOptions}
        renderGroup={renderGroupItem}
      />
    </div>
  );
};
