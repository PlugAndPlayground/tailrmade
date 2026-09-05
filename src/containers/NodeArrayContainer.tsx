import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import throttle from 'lodash/throttle';
import PPGraph from './../classes/GraphClass';
import PPNode from './../classes/NodeClass';
import InterfaceController, { ListenEvent } from './../InterfaceController';
import { ensureVisible, zoomToFitNodes } from './../pixi/utils-pixi';
import {
  getDrawerBackground,
  MAIN_COLOR,
  ONCLICK_DOUBLECLICK,
  STATUS_SEVERITY,
} from './../utils/constants';
import { TRgba } from './../utils/color';
import { StatusDetail } from '../components/StatusDetail';
import { TagChip } from '../components/TagChip';

const TAG_FILTER_PREFIX = 'tag:';

const buildTagFilter = (tag: string): string =>
  `${TAG_FILTER_PREFIX}${tag}`;

type ParsedFilter = { tags: string[]; text: string };

const parseFilterText = (filterText: string): ParsedFilter => {
  let rest = filterText ?? '';
  const tags: string[] = [];
  let token = /^\s*tag:(\S+)(\s|$)/i.exec(rest);
  while (token) {
    tags.push(token[1]);
    rest = rest.slice(token[0].length);
    token = /^\s*tag:(\S+)(\s|$)/i.exec(rest);
  }
  return { tags, text: rest };
};

export const buildFilterText = (tags: string[], text: string): string =>
  tags.map((tag) => `${buildTagFilter(tag)} `).join('') + text;

const ROW_SEVERITY_TINT = 0.08;
const ROW_BACKGROUND = TRgba.fromString(MAIN_COLOR).darken(0.6);
const STATUS_TAG = {
  ERROR: 'Error',
  WARNING: 'Warning',
} as const;

type StatusTag = { label: string; color?: string };

const getStatusTags = (node: PPNode): StatusTag[] => {
  const statuses = node.getWarningsAndErrors();
  const tags: StatusTag[] = [];
  // fatal counts as an error - it is the same "this is broken" bucket
  const error = statuses.find(
    (status) => status.getSeverity() >= STATUS_SEVERITY.ERROR,
  );
  const warning = statuses.find(
    (status) => status.getSeverity() === STATUS_SEVERITY.WARNING,
  );
  if (error) {
    tags.push({ label: STATUS_TAG.ERROR, color: error.getColor().hex() });
  }
  if (warning) {
    tags.push({ label: STATUS_TAG.WARNING, color: warning.getColor().hex() });
  }
  return tags;
};

const getAllTagLabels = (node: PPNode): string[] =>
  getStatusTags(node)
    .map((tag) => tag.label)
    .concat(node.getTags());

const getAvailableTags = (nodes: PPNode[]): StatusTag[] => {
  const statusTags = new Map<string, StatusTag>();
  const nodeTags = new Set<string>();
  nodes.forEach((node) => {
    getStatusTags(node).forEach((tag) => {
      if (!statusTags.has(tag.label)) {
        statusTags.set(tag.label, tag);
      }
    });
    node.getTags().forEach((tag) => nodeTags.add(tag));
  });
  const severityTags = [STATUS_TAG.ERROR, STATUS_TAG.WARNING]
    .map((label) => statusTags.get(label))
    .filter((tag): tag is StatusTag => tag !== undefined);
  return [
    ...severityTags,
    ...[...nodeTags].sort().map((label) => ({ label, color: undefined })),
  ];
};

const EmptyNodeState: React.FC<{ filter: ParsedFilter }> = ({ filter }) => {
  const tagged = filter.tags.length
    ? `tagged ${filter.tags.map((tag) => `"${tag}"`).join(' + ')}`
    : '';
  const searched = filter.text.trim() ? `matching "${filter.text.trim()}"` : '';
  return (
    <Box
      sx={{
        p: 2,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <Typography variant="body2">
        {tagged || searched
          ? `No nodes ${[tagged, searched].filter(Boolean).join(' and ')}`
          : 'This graph has no nodes yet'}
      </Typography>
    </Box>
  );
};

const tagTitle = (label: string, selected: boolean) =>
  selected
    ? `Stop filtering by "${label}"`
    : `Show only nodes tagged "${label}"`;

type NodeItemProps = {
  property: PPNode;
  statusVersion: number;
  expanded: boolean;
  onToggleExpanded: (nodeId: string) => void;
  selectedTags: string[];
  onTagClick: (event: React.SyntheticEvent, tag: string) => void;
};

const NodeItem = memo(
  (props: NodeItemProps) => {
    const node = props.property;
    const statuses = node.getWarningsAndErrors();
    const statusTags = getStatusTags(node);
    const rowBackground = statuses.length
      ? ROW_BACKGROUND.mix(statuses[0].getColor(), ROW_SEVERITY_TINT)
      : ROW_BACKGROUND;
    const isSelected = (label: string) =>
      props.selectedTags.some(
        (tag) => tag.toLowerCase() === label.toLowerCase(),
      );

    return (
      <ListItem
        key={node.id}
        sx={{
          p: 0,
          flexDirection: 'column',
          alignItems: 'stretch',
          '&:hover + .MuiListItemSecondaryAction-root': {
            visibility: 'visible',
          },
          bgcolor: `${rowBackground}`,
          margin: '2px 0',
          borderLeft: `16px solid ${node.getColor()}`,
        }}
        title={
          node.type === 'Macro'
            ? `${node.id}
${(node as any)
  .getInsideNodes()
  .map((item: PPNode) => item.name)
  .join()}`
            : node.id
        }
        onPointerEnter={(event: React.MouseEvent<HTMLLIElement>) => {
          event.stopPropagation();
          const nodeToJumpTo = PPGraph.currentGraph.nodes[node.id];
          if (nodeToJumpTo) {
            PPGraph.currentGraph.selection.drawSingleFocus(nodeToJumpTo);
          }
        }}
        onClick={(event: React.MouseEvent<HTMLLIElement>) => {
          event.stopPropagation();
          const nodeToJumpTo = PPGraph.currentGraph.nodes[node.id];
          if (nodeToJumpTo) {
            void ensureVisible([nodeToJumpTo]);
            setTimeout(() => {
              PPGraph.currentGraph.selection.drawSingleFocus(nodeToJumpTo);
            }, 800);
            if (event.detail === ONCLICK_DOUBLECLICK) {
              zoomToFitNodes([nodeToJumpTo], -0.8);
              nodeToJumpTo.renderOutlineThrottled();
              setTimeout(() => {
                PPGraph.currentGraph.selection.selectNodes(
                  [nodeToJumpTo],
                  false,
                );
              }, 300);
            }
          }
        }}
      >
        <ListItemButton
          sx={{
            p: 1,
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
                sx={{
                  flexGrow: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {node.name}
              </Box>
              <Box
                sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <Box sx={{ display: 'flex', gap: '2px' }}>
                  {node.getTags().map((part, index) => (
                    <TagChip
                      key={`${part}-${index}`}
                      label={part}
                      selected={isSelected(part)}
                      onClick={props.onTagClick}
                      title={tagTitle(part, isSelected(part))}
                      data-cy={`node-tag-${part}`}
                    />
                  ))}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    gap: '2px',
                    ml: statusTags.length && node.getTags().length ? '10px' : 0,
                  }}
                >
                  {statusTags.map((tag) => (
                    <TagChip
                      key={tag.label}
                      label={tag.label}
                      color={tag.color}
                      selected={isSelected(tag.label)}
                      onClick={props.onTagClick}
                      title={tagTitle(tag.label, isSelected(tag.label))}
                      data-cy={`node-tag-${tag.label}`}
                    />
                  ))}
                </Box>
                {statuses.length > 0 && (
                  <IconButton
                    data-cy="expand-node-status"
                    aria-label={
                      props.expanded ? 'Hide message' : 'Show message'
                    }
                    onClick={(event) => {
                      // the row itself jumps the canvas to the node
                      event.stopPropagation();
                      props.onToggleExpanded(node.id);
                    }}
                    sx={{
                      p: '2px',
                      ml: '1px',
                      fontSize: '18px',
                      transform: props.expanded
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                    }}
                  >
                    <ExpandMoreIcon fontSize="inherit" />
                  </IconButton>
                )}
              </Box>
            </Box>
            <Box
              sx={{
                fontSize: '12px',
                opacity: '0.75',
                textOverflow: 'ellipsis',
              }}
            >
              <Box
                sx={{
                  display: 'inline',
                }}
              >
                {node.name === node.getName() ? '' : node.getName()}
              </Box>
            </Box>
          </Stack>
        </ListItemButton>
        {statuses.length > 0 && (
          <Collapse in={props.expanded} unmountOnExit>
            <Box
              sx={{
                px: 1,
                pb: 1,
                bgcolor: 'rgba(0,0,0,0.25)',
              }}
            >
              {statuses.map((status, index) => (
                <StatusDetail key={`${status.id}-${index}`} status={status} />
              ))}
            </Box>
          </Collapse>
        )}
      </ListItem>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.property === nextProps.property &&
      prevProps.statusVersion === nextProps.statusVersion &&
      prevProps.expanded === nextProps.expanded &&
      prevProps.selectedTags === nextProps.selectedTags
    );
  },
);

type NodesContentProps = {
  nodes: PPNode[];
  filter: ParsedFilter;
  statusVersion: number;
  expandedIds: Set<string>;
  onToggleExpanded: (nodeId: string) => void;
  selectedTags: string[];
  onTagClick: (event: React.SyntheticEvent, tag: string) => void;
};

const NodesContent: React.FC<NodesContentProps> = (props) => {
  if (!props.nodes.length) {
    return <EmptyNodeState filter={props.filter} />;
  }
  return (
    <List
      sx={{
        width: '100%',
        bgcolor: 'background.paper',
        marginTop: 0,
        padding: 0,
      }}
    >
      {props.nodes.map((property) => (
        <NodeItem
          key={property.id}
          property={property}
          statusVersion={props.statusVersion}
          expanded={props.expandedIds.has(property.id)}
          onToggleExpanded={props.onToggleExpanded}
          selectedTags={props.selectedTags}
          onTagClick={props.onTagClick}
        />
      ))}
    </List>
  );
};

type NodeArrayContainerProps = {
  graphId: string;
  selectedNodes: PPNode[];
  filterText: string;
  setFilterText: React.Dispatch<React.SetStateAction<string>>;
};

export const NodeArrayContainer: React.FunctionComponent<
  NodeArrayContainerProps
> = (props) => {
  const [nodesInGraph, setNodesInGraph] = useState<PPNode[]>([]);
  const [statusVersion, setStatusVersion] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isTagListOpen, setIsTagListOpen] = useState(false);

  const filter = useMemo(
    () => parseFilterText(props.filterText),
    [props.filterText],
  );

  const setFilter = useCallback(
    (tags: string[], text: string) => {
      props.setFilterText(buildFilterText(tags, text));
    },
    [props.setFilterText],
  );

  const onTagClick = useCallback(
    (event: React.SyntheticEvent, tag: string) => {
      props.setFilterText((current) => {
        const parsed = parseFilterText(current);
        const isSelected = parsed.tags.some(
          (selected) => selected.toLowerCase() === tag.toLowerCase(),
        );
        return buildFilterText(
          isSelected
            ? parsed.tags.filter(
                (selected) => selected.toLowerCase() !== tag.toLowerCase(),
              )
            : [...parsed.tags, tag],
          parsed.text,
        );
      });
    },
    [props.setFilterText],
  );

  const onToggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(nodeId)) {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const updateNodes = useCallback(() => {
    const currentGraph = PPGraph.currentGraph;
    if (currentGraph) {
      setNodesInGraph(Object.values(currentGraph.nodes));
    }
  }, []);

  const customFilter = (item: PPNode, parsed: ParsedFilter) => {
    if (parsed.tags.length) {
      const labels = getAllTagLabels(item).map((label) => label.toLowerCase());
      const matchesTags = parsed.tags.every((tag) =>
        labels.includes(tag.toLowerCase()),
      );
      if (!matchesTags) {
        return false;
      }
    }
    const filter = parsed.text.trim().toLowerCase();
    if (!filter) {
      return true;
    }
    const fields: Array<'name' | 'type' | 'id'> = ['name', 'type', 'id'];
    return (
      fields.some((field) =>
        String(item[field] ?? '')
          .toLowerCase()
          .includes(filter),
      ) ||
      item
        .getWarningsAndErrors()
        .some((status) => status.message?.toLowerCase().includes(filter))
    );
  };

  const customSort = (a: PPNode, b: PPNode) => {
    const order =
      (b.status.node.getSeverity() - a.status.node.getSeverity()) * 1000 +
        (b.status.socket.getSeverity() - a.status.socket.getSeverity()) * 100 +
        (+(b.type === 'Macro') - +(a.type === 'Macro')) * 10 ||
      a.name.localeCompare(b.name);
    return order;
  };

  const filteredNodes = useMemo(() => {
    return nodesInGraph
      .filter((node) => customFilter(node, filter))
      .sort(customSort);
  }, [nodesInGraph, filter, statusVersion]);

  const availableTags = useMemo(
    () => getAvailableTags(nodesInGraph),
    [nodesInGraph, statusVersion],
  );

  const tagColors = useMemo(
    () =>
      Object.fromEntries(availableTags.map((tag) => [tag.label, tag.color])),
    [availableTags],
  );

  const tagOptions = useMemo(
    () => [
      ...availableTags.map((tag) => tag.label),
      ...filter.tags.filter(
        (tag) =>
          !availableTags.some(
            (available) => available.label.toLowerCase() === tag.toLowerCase(),
          ),
      ),
    ],
    [availableTags, filter.tags],
  );

  const matchingTagOptions = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    if (!text) {
      return [];
    }
    return tagOptions.filter(
      (label) =>
        label.toLowerCase().startsWith(text) &&
        !filter.tags.some(
          (selected) => selected.toLowerCase() === label.toLowerCase(),
        ),
    );
  }, [tagOptions, filter]);

  useEffect(() => {
    const bumpVersion = throttle(() => setStatusVersion((v) => v + 1), 200, {
      leading: true,
      trailing: true,
    });

    const ids = [
      InterfaceController.addListener(ListenEvent.GraphChanged, () => {
        updateNodes();
      }),
      InterfaceController.addListener(
        ListenEvent.NodeStatusChanged,
        bumpVersion,
      ),
    ];

    updateNodes();

    return () => {
      bumpVersion.cancel();
      InterfaceController.removeListeners(ids);
    };
  }, [updateNodes]);

  useEffect(() => {
    updateNodes();
  }, [
    updateNodes,
    PPGraph.currentGraph?.nodes,
    PPGraph.currentGraph?.nodes !== undefined &&
      Object.keys(PPGraph.currentGraph?.nodes).length,
  ]);

  return (
    <Stack spacing={0.25}>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: `${getDrawerBackground()}`,
          pt: 2,
          pb: 0.25,
        }}
      >
        <Autocomplete
          multiple
          fullWidth
          options={tagOptions}
          value={filter.tags}
          inputValue={filter.text}
          filterOptions={() => matchingTagOptions}
          clearOnBlur={false}
          forcePopupIcon={false}
          open={isTagListOpen && matchingTagOptions.length > 0}
          onOpen={() => setIsTagListOpen(true)}
          onClose={() => setIsTagListOpen(false)}
          onChange={(event, tags, reason) => {
            if (reason === 'clear') {
              props.setFilterText('');
            } else if (reason === 'selectOption') {
              setFilter(tags as string[], '');
            } else {
              setFilter(tags as string[], filter.text);
            }
          }}
          onInputChange={(event, value, reason) => {
            if (reason === 'input') {
              setFilter(filter.tags, value);
            } else if (reason === 'clear') {
              props.setFilterText('');
            }
          }}
          isOptionEqualToValue={(option, value) =>
            option.toLowerCase() === value.toLowerCase()
          }
          renderValue={(tags, getItemProps) =>
            tags.map((tag, index) => {
              const { key, ...itemProps } = getItemProps({ index });
              return (
                <TagChip
                  {...itemProps}
                  key={key}
                  label={tag}
                  color={tagColors[tag]}
                  data-cy={`node-filter-tag-${tag}`}
                />
              );
            })
          }
          renderOption={(optionProps, option) => {
            const { key, ...restOfProps } = optionProps;
            return (
              <li key={key} {...restOfProps}>
                <TagChip label={option} color={tagColors[option]} />
              </li>
            );
          }}
          renderInput={({ slotProps = {} as any, ...params }) => (
            <TextField
              {...params}
              hiddenLabel
              placeholder={
                filter.tags.length ? '' : `Search nodes and messages`
              }
              data-cy="inspector-node-search-input"
              variant="filled"
              slotProps={{
                ...slotProps,
                input: {
                  ...slotProps.input,
                  disableUnderline: true,
                },
              }}
              sx={{
                fontSize: '16px',
                bgcolor: 'background.paper',
                '&&&& input': {
                  paddingBottom: '8px',
                  paddingTop: '9px',
                  color: TRgba.fromString(MAIN_COLOR)
                    .getContrastTextColor()
                    .hex(),
                },
                '&& .MuiInputBase-root': {
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  rowGap: '4px',
                },
              }}
            />
          )}
          sx={{
            '& .MuiAutocomplete-tag': {
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: '4px',
            },
          }}
        />
      </Box>
      <NodesContent
        nodes={filteredNodes}
        filter={filter}
        statusVersion={statusVersion}
        expandedIds={expandedIds}
        onToggleExpanded={onToggleExpanded}
        selectedTags={filter.tags}
        onTagClick={onTagClick}
      />
    </Stack>
  );
};
