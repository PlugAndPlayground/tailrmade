import React, { memo, useCallback, useEffect, useState } from 'react';
import useInterval from 'use-interval';
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import PPGraph from './../classes/GraphClass';
import PPNode from './../classes/NodeClass';
import { PNPStatus } from './../classes/ErrorClass';
import InterfaceController, { ListenEvent } from './../InterfaceController';
import { ensureVisible, zoomToFitNodes } from './../pixi/utils-pixi';
import { ONCLICK_DOUBLECLICK, STATUS_SEVERITY } from './../utils/constants';
import { TRgba } from './../utils/color';
import { MAIN_COLOR } from '../utils/constants';

const EmptyNodeState: React.FC<{ filterText: string }> = ({ filterText }) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      textAlign: 'center',
      userSelect: 'none',
      px: 2,
      lineHeight: 1.5,
      bgcolor: 'background.paper',
    }}
  >
    {filterText ? (
      <>
        <Typography variant="body1" color="text.secondary">
          No matching nodes found
        </Typography>
      </>
    ) : (
      <>
        <Typography variant="body1" color="text.secondary">
          Double click on canvas to add nodes
        </Typography>
      </>
    )}
  </Box>
);

const NodesContent = memo(
  (props: any) => {
    return (
      <>
        {props.nodes.length > 0 ? (
          <List>
            {props.nodes.map((property) => {
              return (
                <NodeItem
                  key={property.id}
                  property={property}
                  index={property.id}
                  sx={{
                    listStyleType: 'none',
                  }}
                />
              );
            })}
          </List>
        ) : (
          <EmptyNodeState filterText={props.filterText} />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.nodes.length === nextProps.nodes.length;
  },
);

const NodeItem = memo(
  (props: any) => {
    const [nodeStatus, setNodeStatus] = useState(
      props.property.status.node as PNPStatus,
    );
    const [socketStatus, setSocketStatus] = useState(
      props.property.status.socket as PNPStatus,
    );

    useInterval(() => {
      const newNodeStatus = props.property.status.node as PNPStatus;
      const newSocketStatus = props.property.status.node as PNPStatus;
      if (socketStatus !== newSocketStatus || nodeStatus !== newNodeStatus) {
        setNodeStatus(props.property.status.node as PNPStatus);
        setSocketStatus(props.property.status.socket as PNPStatus);
      }
    }, 100);

    return (
      <ListItem
        key={props.property.id}
        sx={{
          p: 0,
          '&:hover + .MuiListItemSecondaryAction-root': {
            visibility: 'visible',
          },
          bgcolor: `${TRgba.fromString(MAIN_COLOR).darken(0.6)}`,
          margin: '2px 0',
          borderLeft: `16px solid ${props.property.getColor()}`,
        }}
        title={
          props.property.type === 'Macro'
            ? `${props.property.id}
${props.property
  .getInsideNodes()
  .map((item) => item.name)
  .join()}`
            : props.property.id
        }
        onPointerEnter={(event: React.MouseEvent<HTMLLIElement>) => {
          event.stopPropagation();
          const nodeToJumpTo = PPGraph.currentGraph.nodes[props.property.id];
          if (nodeToJumpTo) {
            PPGraph.currentGraph.selection.drawSingleFocus(nodeToJumpTo);
          }
        }}
        onClick={(event: React.MouseEvent<HTMLLIElement>) => {
          event.stopPropagation();
          const nodeToJumpTo = PPGraph.currentGraph.nodes[props.property.id];
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
                }}
              >
                <Box
                  sx={{
                    display: 'inline',
                  }}
                >
                  {props.property.name}
                </Box>
                {nodeStatus.getSeverity() >= STATUS_SEVERITY.WARNING && (
                  <StatusTag name="Node" status={nodeStatus} />
                )}
                {socketStatus.getSeverity() >= STATUS_SEVERITY.WARNING && (
                  <StatusTag name="Socket" status={socketStatus} />
                )}
              </Box>
              <Box>
                {props.property.getTags().map((part, index) => (
                  <Box
                    key={index}
                    sx={{
                      fontSize: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      cornerRadius: '4px',
                      marginLeft: '2px',
                      px: 0.5,
                      display: 'inline',
                      '.Mui-focused &': {
                        display: 'none',
                      },
                      opacity: 0.5,
                      fontWeight: 400,
                    }}
                  >
                    {part}
                  </Box>
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
              <Box
                sx={{
                  display: 'inline',
                }}
              >
                {props.property.name === props.property.getName()
                  ? ''
                  : props.property.getName()}
              </Box>
            </Box>
          </Stack>
        </ListItemButton>
      </ListItem>
    );
  },
  (prevProps, nextProps) => {
    const sameNodeStatus =
      prevProps.property.status.node === nextProps.property.status.node;
    const sameSocketStatus =
      prevProps.property.status.socket === nextProps.property.status.socket;
    return sameNodeStatus && sameSocketStatus;
  },
);

const StatusTag = (props) => {
  return (
    <Box
      title={`${props.status.getName()}
${props.status.message}`}
      sx={{
        fontSize: '12px',
        background: props.status.getColor().hex(),
        marginLeft: '8px',
        px: 0.5,
        py: '2px',
        display: 'inline',
        fontWeight: 400,
      }}
    >
      {props.name}
    </Box>
  );
};

type NodeArrayContainerProps = {
  graphId: string;
  selectedNodes: PPNode[];
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  filterText: string;
  setFilterText: React.Dispatch<React.SetStateAction<string>>;
};

export const NodeArrayContainer: React.FunctionComponent<
  NodeArrayContainerProps
> = (props) => {
  const [nodesInGraph, setNodesInGraph] = useState<PPNode[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<PPNode[]>([]);
  const showNodes = props.filter === 'nodes' || props.filter == null;
  const showGraphInfo = props.filter === 'graph-info' || props.filter == null;

  const handleFilterChange = (event) => {
    props.setFilterText(event.target.value);
  };

  const handleFilter = (
    event: React.MouseEvent<HTMLElement>,
    newFilter: string | null,
  ) => {
    props.setFilter(newFilter);
  };

  const updateNodes = (currentGraph: PPGraph) => {
    if (currentGraph) {
      const nodes = Object.values(currentGraph.nodes);
      if (nodes) {
        nodes.sort(customSort);
        setNodesInGraph(nodes);
        setFilteredNodes(nodes);
      }
    }
  };

  const filterNodes = (nodes: PPNode[]) => {
    const filteredItems = nodes.filter((node) =>
      customFilter(node, props.filterText),
    );
    filteredItems.sort(customSort);
    setFilteredNodes(filteredItems);
  };

  // Custom filter function searching specified fields
  const customFilter = (item, filterText) => {
    const filter = filterText.toLowerCase();
    const fields = ['name', 'type', 'id'];
    return fields.some((field) => item[field].toLowerCase().includes(filter));
  };

  const customSort = (a: PPNode, b: PPNode) => {
    const order =
      (b.status.node.getSeverity() - a.status.node.getSeverity()) * 1000 +
        (b.status.socket.getSeverity() - a.status.socket.getSeverity()) * 100 +
        (+(b.type === 'Macro') - +(a.type === 'Macro')) * 10 ||
      a.name.localeCompare(b.name);
    return order;
  };

  const updateNodesAndInfo = useCallback(() => {
    const currentGraph = PPGraph.currentGraph;
    if (currentGraph) {
      updateNodes(currentGraph);
      filterNodes(nodesInGraph);
    }
  }, [PPGraph.currentGraph]);

  useEffect(() => {
    // data has id and name
    const ids = [];
    ids.push(
      InterfaceController.addListener(ListenEvent.GraphChanged, () => {
        updateNodesAndInfo();
      }),
    );

    updateNodesAndInfo();

    return () => {
      InterfaceController.removeListeners(ids);
    };
  }, []);

  useEffect(() => {
    updateNodesAndInfo();
  }, [
    PPGraph.currentGraph?.nodes,
    PPGraph.currentGraph?.nodes !== undefined &&
      Object.keys(PPGraph.currentGraph?.nodes).length,
  ]);

  useEffect(() => {
    filterNodes(nodesInGraph);
  }, [props.filterText, nodesInGraph]);

  return (
    <Stack spacing={0.25}>
      <TextField
        hiddenLabel
        placeholder={`Search nodes`}
        data-cy="inspector-node-search-input"
        variant="filled"
        fullWidth
        value={props.filterText}
        onChange={handleFilterChange}
        slotProps={{
          input: {
            disableUnderline: true,
            endAdornment: props.filterText ? (
              <IconButton size="small" onClick={() => props.setFilterText('')}>
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
      <NodesContent nodes={filteredNodes} filterText={props.filterText} />
    </Stack>
  );
};
