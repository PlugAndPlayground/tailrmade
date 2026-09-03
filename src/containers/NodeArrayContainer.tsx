import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import ClearIcon from '@mui/icons-material/Clear';
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

// A tag filter is carried inside the search text as "tag:<name>" rather than
// as its own piece of state. It costs nothing to thread through the drawer, it
// survives the remount when a node is selected and deselected (the search text
// is lifted for exactly that reason), it is visible to the user, and the
// search field's existing clear button already turns it off.
export const TAG_FILTER_PREFIX = 'tag:';

export const buildTagFilter = (tag: string): string =>
  `${TAG_FILTER_PREFIX}${tag}`;

// The tag being filtered on, or undefined when the text is an ordinary search.
export const getActiveTag = (filterText: string): string | undefined => {
  const trimmed = (filterText ?? '').trim();
  if (!trimmed.toLowerCase().startsWith(TAG_FILTER_PREFIX)) {
    return undefined;
  }
  const tag = trimmed.slice(TAG_FILTER_PREFIX.length).trim();
  return tag || undefined;
};

// How far the row's background is pulled toward the severity colour. Enough to
// pick a row out while scanning the list, not enough to fight the node colour
// on the left edge or hurt the contrast of the text sitting on it.
const ROW_SEVERITY_TINT = 0.08;

const ROW_BACKGROUND = TRgba.fromString(MAIN_COLOR).darken(0.6);

// Severity is expressed as a tag rather than as its own filter row, so
// "show me the broken ones" goes through exactly the same mechanism as any
// other tag - which is what let the All/Errors/Warnings toggle group go away.
export const STATUS_TAG = {
  ERROR: 'Error',
  WARNING: 'Warning',
} as const;

type StatusTag = { label: string; color: string };

// Whether the problem sits on the node or on one of its sockets is not in the
// tag: the border and badge already say a node needs attention, and the split
// only matters once you are reading the message, where each status names its
// own origin ("Socket Parsing Warning" against "Node Execution Error").
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
  // both, when a node carries one of each: filtering by Warning should still
  // find a node that also has an error
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

const EmptyNodeState: React.FC<{ filterText: string }> = ({ filterText }) => (
  <Box
    sx={{
      p: 2,
      textAlign: 'center',
      color: 'text.secondary',
    }}
  >
    {getActiveTag(filterText) ? (
      <Typography variant="body2">
        No nodes tagged &quot;{getActiveTag(filterText)}&quot;
      </Typography>
    ) : filterText ? (
      <Typography variant="body2">
        No nodes found for &quot;{filterText}&quot;
      </Typography>
    ) : (
      <Typography variant="body2">This graph has no nodes yet</Typography>
    )}
  </Box>
);

// Every tag in the row is one of these - severity tags and the node's own tags
// alike - so they look and behave the same and a single click filters by any
// of them.
const TagChip = (props: {
  label: string;
  color?: string;
  isActive: boolean;
  onClick: (label: string) => void;
}) => {
  const background = props.color ?? 'rgba(255,255,255,0.2)';
  return (
    <Box
      component="button"
      type="button"
      title={
        props.isActive
          ? `Stop filtering by "${props.label}"`
          : `Show only nodes tagged "${props.label}"`
      }
      data-cy={`node-tag-${props.label}`}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        // the row itself jumps the canvas to the node
        event.stopPropagation();
        props.onClick(props.label);
      }}
      sx={{
        font: 'inherit',
        fontSize: '12px',
        fontWeight: 400,
        color: props.color
          ? TRgba.fromString(props.color).getContrastTextColor().hex()
          : 'inherit',
        border: 'none',
        // was `cornerRadius`, which is not a css property and so never
        // rounded anything
        borderRadius: '4px',
        background,
        px: 0.5,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        '.Mui-focused &': {
          display: 'none',
        },
        // a severity chip is the point of the row, so it stays at full
        // strength; a plain tag is quieter until you hover or select it
        opacity: props.color || props.isActive ? 1 : 0.5,
        outline: props.isActive ? '1px solid rgba(255,255,255,0.9)' : 'none',
        '&:hover': {
          opacity: 1,
        },
      }}
    >
      {props.label}
    </Box>
  );
};

type NodeItemProps = {
  property: PPNode;
  // bumped whenever any node's status changes, so the memo below lets a row
  // through - this replaced a 100ms poll running in every single row
  statusVersion: number;
  expanded: boolean;
  onToggleExpanded: (nodeId: string) => void;
  activeTag: string | undefined;
  onTagClick: (tag: string) => void;
};

const NodeItem = memo(
  (props: NodeItemProps) => {
    const node = props.property;
    const statuses = node.getWarningsAndErrors();
    const statusTags = getStatusTags(node);
    // getWarningsAndErrors is sorted worst first, so an error wins over a
    // warning on a node carrying both - the same colour the badge and the
    // canvas border are already using for it
    const rowBackground = statuses.length
      ? ROW_BACKGROUND.mix(statuses[0].getColor(), ROW_SEVERITY_TINT)
      : ROW_BACKGROUND;
    const isActive = (label: string) =>
      props.activeTag?.toLowerCase() === label.toLowerCase();

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
              {/* every tag sits here on the right, against the expand
                  button, rather than trailing the node name. Three groups
                  rather than one flat row: the node's own tags, then the
                  severity tags set apart from them, then the chevron pulled
                  in tight against whatever it will expand. */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
              >
                <Box sx={{ display: 'flex', gap: '2px' }}>
                  {node.getTags().map((part, index) => (
                    <TagChip
                      key={`${part}-${index}`}
                      label={part}
                      isActive={isActive(part)}
                      onClick={props.onTagClick}
                    />
                  ))}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    gap: '2px',
                    // set apart from the node's own tags: these two read as a
                    // different kind of thing and should not run together
                    ml: statusTags.length && node.getTags().length ? '10px' : 0,
                  }}
                >
                  {statusTags.map((tag) => (
                    <TagChip
                      key={tag.label}
                      label={tag.label}
                      color={tag.color}
                      isActive={isActive(tag.label)}
                      onClick={props.onTagClick}
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
                      // MUI's own small size pads 5px all round, and the round
                      // hover target reads as distance from the chip beside it
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
      prevProps.activeTag === nextProps.activeTag
    );
  },
);

type NodesContentProps = {
  nodes: PPNode[];
  filterText: string;
  statusVersion: number;
  expandedIds: Set<string>;
  onToggleExpanded: (nodeId: string) => void;
  activeTag: string | undefined;
  onTagClick: (tag: string) => void;
};

const NodesContent: React.FC<NodesContentProps> = (props) => {
  if (!props.nodes.length) {
    return <EmptyNodeState filterText={props.filterText} />;
  }
  return (
    <List
      sx={{
        width: '100%',
        bgcolor: 'background.paper',
        marginTop: 0,
        padding: 0
      }}
    >
      {props.nodes.map((property) => (
        <NodeItem
          key={property.id}
          property={property}
          statusVersion={props.statusVersion}
          expanded={props.expandedIds.has(property.id)}
          onToggleExpanded={props.onToggleExpanded}
          activeTag={props.activeTag}
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

  const handleFilterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.setFilterText(event.target.value);
  };

  const activeTag = getActiveTag(props.filterText);

  const onTagClick = useCallback(
    (tag: string) => {
      props.setFilterText((current) =>
        getActiveTag(current)?.toLowerCase() === tag.toLowerCase()
          ? ''
          : buildTagFilter(tag),
      );
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

  // Searches the status messages as well as the node's identity, so a node can
  // be found by the error it is reporting - "CORS", "404" - which is usually
  // all one remembers of it.
  const customFilter = (item: PPNode, filterText: string) => {
    const tag = getActiveTag(filterText);
    if (tag) {
      // an exact match, unlike the free text search below: clicking a tag
      // should mean that tag, not every tag containing those letters
      return getAllTagLabels(item).some(
        (candidate) => candidate.toLowerCase() === tag.toLowerCase(),
      );
    }
    const filter = filterText.toLowerCase();
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

  // statusVersion is a real dependency: severity drives both the filter and
  // the sort, so the list has to be rebuilt when a status changes
  const filteredNodes = useMemo(() => {
    return nodesInGraph
      .filter((node) => customFilter(node, props.filterText))
      .sort(customSort);
  }, [nodesInGraph, props.filterText, statusVersion]);

  useEffect(() => {
    // One listener for the whole list rather than a timer per row. Throttled
    // because a node that re-executes on a tick pushes a status every time.
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
          // the search used to scroll away with the list, so filtering a long
          // graph meant scrolling back up to change the term
          position: 'sticky',
          top: 0,
          zIndex: 2,
          // the drawer's own colour, or the rows show through behind it
          bgcolor: `${getDrawerBackground()}`,
          pb: 0.25,
        }}
      >
        <TextField
          hiddenLabel
          placeholder={`Search nodes and messages`}
          data-cy="inspector-node-search-input"
          variant="filled"
          fullWidth
          value={props.filterText}
          onChange={handleFilterChange}
          slotProps={{
            input: {
              disableUnderline: true,
              endAdornment: props.filterText ? (
                <IconButton
                  size="small"
                  onClick={() => props.setFilterText('')}
                >
                  <ClearIcon />
                </IconButton>
              ) : undefined,
            },
          }}
          sx={{
            fontSize: '16px',
            opacity: 0.8,
            bgcolor: 'background.paper',
            '&&&& input': {
              paddingBottom: '8px',
              paddingTop: '9px',
              color: TRgba.fromString(MAIN_COLOR).getContrastTextColor().hex(),
            },
          }}
        />
      </Box>
      <NodesContent
        nodes={filteredNodes}
        filterText={props.filterText}
        statusVersion={statusVersion}
        expandedIds={expandedIds}
        onToggleExpanded={onToggleExpanded}
        activeTag={activeTag}
        onTagClick={onTagClick}
      />
    </Stack>
  );
};
