import React, { useEffect, useState } from 'react';
import useInterval from 'use-interval';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import * as styles from '../utils/style.module.css';
import { getLoadNodeExampleURL } from '../utils/utils';
import PPGraph from '../classes/GraphClass';
import PPNode from '../classes/NodeClass';
import Socket from '../classes/SocketClass';
import { SourceContent } from '../components/SourceContent';
import { NumberInput } from '../components/NumberInput';
import { SocketContainer, CommonSocket } from './SocketContainer';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { Interaction } from '../classes/selection/SelectionClass';
import FlowLogic from '../classes/FlowLogic';
import { SOCKET_TYPE } from '../utils/constants';
import { TSocketType } from '../utils/interfaces';

// Constants for socket section configuration
const SOCKET_SECTIONS = {
  trigger: { text: 'Triggers', value: 'trigger' },
  in: { text: 'Inputs', value: 'in' },
  out: { text: 'Outputs', value: 'out' },
} as const;

type FilterContentProps = {
  handleFilter: (
    event: React.MouseEvent<HTMLElement>,
    newFilter: string | null,
  ) => void;
  filter: string;
  selectedNode: PPNode;
  selectedNodes: PPNode[];
  hasCommonInputs?: boolean;
  hasCommonOutputs?: boolean;
  hasCommonTriggers?: boolean;
};

function FilterContainer(props: FilterContentProps) {
  const isSingleNode = props.selectedNodes.length === 1;

  return (
    <ToggleButtonGroup
      value={props.filter}
      exclusive
      fullWidth
      onChange={props.handleFilter}
      aria-label="socket filter"
      size="small"
      sx={{ bgcolor: 'background.paper', borderRadius: '0px' }}
    >
      <ToggleButton
        id="inspector-filter-common"
        value="common"
        aria-label="common"
      >
        Common
      </ToggleButton>
      {(isSingleNode
        ? props.selectedNode.nodeTriggerSocketArray.length > 0
        : props.hasCommonTriggers) && (
        <ToggleButton
          id="inspector-filter-trigger"
          value="trigger"
          aria-label="trigger"
          disabled={
            isSingleNode
              ? props.selectedNode.nodeTriggerSocketArray.length <= 0
              : !props.hasCommonTriggers
          }
        >
          Trigger
        </ToggleButton>
      )}
      {(isSingleNode || props.hasCommonInputs) && (
        <ToggleButton
          id="inspector-filter-in"
          value="in"
          aria-label="in"
          disabled={
            isSingleNode
              ? props.selectedNode.inputSocketArray.length <= 0
              : !props.hasCommonInputs
          }
        >
          In
        </ToggleButton>
      )}
      {(isSingleNode || props.hasCommonOutputs) && (
        <ToggleButton
          id="inspector-filter-out"
          value="out"
          aria-label="out"
          disabled={
            isSingleNode
              ? props.selectedNode.outputSocketArray.length <= 0
              : !props.hasCommonOutputs
          }
        >
          Out
        </ToggleButton>
      )}
      {isSingleNode && (
        <ToggleButton id="inspector-filter-info" value="info" aria-label="info">
          Info
        </ToggleButton>
      )}
    </ToggleButtonGroup>
  );
}

type CommonContentProps = {
  hasTriggerSocket: boolean;
  load: boolean;
  update: boolean;
  interval: boolean;
  intervalFrequency: number;
  onCheckboxChange: (event: any) => void;
  onFrequencyChange: (value: number | null) => void;
  onUpdateNow: (event: any) => void;
};

function CommonContent(props: CommonContentProps) {
  return (
    <Box id="inspector-common-content" sx={{ bgcolor: 'background.paper' }}>
      <Box sx={{ py: 0.5, color: 'text.primary' }}>Update</Box>
      <Box
        sx={{
          p: 1,
          bgcolor: 'background.default',
          display: 'grid',
          gap: 1,
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
      >
        {/* Update Button */}
        <Box sx={{ gridColumn: '1/-1' }}>
          <Button
            fullWidth
            variant="contained"
            onClick={props.onUpdateNow}
            data-cy="update-now-button"
            size="small"
          >
            Update now
          </Button>
        </Box>

        {/* Checkbox Options */}
        <Box
          sx={{
            display: 'grid',
            gap: 0.5,
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                name="load"
                checked={props.load}
                indeterminate={props.load === null}
                onChange={props.onCheckboxChange}
              />
            }
            label="on load"
            sx={{ m: 0 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                name="update"
                checked={props.update}
                indeterminate={props.update === null}
                onChange={props.onCheckboxChange}
              />
            }
            label="on change"
            sx={{ m: 0 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                name="interval"
                checked={props.interval}
                indeterminate={props.interval === null}
                onChange={props.onCheckboxChange}
              />
            }
            label="on interval"
            sx={{ m: 0 }}
          />
          {props.hasTriggerSocket && (
            <FormControlLabel
              disabled
              control={
                <Checkbox
                  size="small"
                  name="trigger"
                  checked={true}
                  onChange={props.onCheckboxChange}
                />
              }
              label="on trigger"
              sx={{ m: 0 }}
            />
          )}
        </Box>

        {/* Interval Input */}
        {props.interval && (
          <Box sx={{ gridColumn: '1/-1' }}>
            <NumberInput
              sx={{ width: '100%' }}
              size="small"
              min={0}
              endAdornment="ms"
              disabled={!props.interval}
              onChange={props.onFrequencyChange}
              value={props.intervalFrequency}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default CommonContent;

// Component for displaying common sockets across selected nodes
interface CommonSocketsArrayProps {
  commonSockets: CommonSocket[];
  randomMainColor: string;
  selectedNodes: PPNode[];
  filter?: string;
  value?: string;
  text?: string;
}

const CommonSocketsArrayComponent: React.FC<CommonSocketsArrayProps> = ({
  commonSockets,
  randomMainColor,
  selectedNodes,
  filter,
  value,
  text,
}) => {
  // Show when: no filter (null), filter matches value, or filter is "common"
  if (
    (filter !== value && filter != null && filter !== 'common') ||
    commonSockets.length === 0
  ) {
    return <></>;
  }

  return (
    <Box sx={{ bgcolor: 'background.paper' }}>
      {filter == null && (
        <Box sx={{ py: 0.5, color: 'text.primary' }}>{text}</Box>
      )}
      <Stack spacing={1}>
        {commonSockets.map((commonSocket, index) => (
          <SocketContainer
            key={`common-${commonSocket.name}-${commonSocket.socketType}`}
            index={index}
            dataType={commonSocket.referenceSocket.dataType}
            data={commonSocket.referenceSocket.data}
            randomMainColor={randomMainColor}
            selectedNode={selectedNodes[0]}
            socketsToUpdate={commonSocket.sockets}
          />
        ))}
      </Stack>
    </Box>
  );
};

type NodeInfoContentProps = {
  selectedNode: PPNode;
};

function NodeInfoContent(props: NodeInfoContentProps) {
  return (
    <Stack spacing={1}>
      <Box id="inspector-info-content" sx={{ bgcolor: 'background.paper' }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 0.5,
          }}
        >
          <Box sx={{ color: 'text.primary' }}>Description</Box>
          {props.selectedNode.hasExample() && (
            <IconButton
              sx={{
                borderRadius: 0,
                right: '0px',
                fontSize: '16px',
                padding: 0,
                height: '24px',
                lineHeight: '150%',
              }}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                window.open(
                  getLoadNodeExampleURL(props.selectedNode.type),
                  '_blank',
                );
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
        </Box>
        <Box
          sx={{
            p: 2,
            bgcolor: 'background.default',
          }}
        >
          {props.selectedNode.getDescription()}
          <Box
            sx={{
              lineHeight: '150%',
            }}
            dangerouslySetInnerHTML={{
              __html: props.selectedNode.getAdditionalDescription(),
            }}
          />
        </Box>
        <Box
          sx={{
            px: 2,
            pb: 2,
            bgcolor: 'background.default',
            textAlign: 'right',
          }}
        >
          {props.selectedNode.getTags()?.map((part, index) => (
            <Box
              key={index}
              sx={{
                fontSize: '12px',
                background: 'rgba(255,255,255,0.2)',
                cornerRadius: '4px',
                px: 0.5,
                display: 'inline',
              }}
            >
              {part}
            </Box>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}

type PropertyArrayContainerProps = {
  randomMainColor: string;
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
};

function getVisibleIDs(socketArray: Socket[]): string[] {
  return socketArray
    .filter((socket) => socket.visibilityCondition())
    .map((socket) => socket.name);
}

function getSocketsCurrentlyRendered(node: PPNode | undefined): string[] {
  if (node == undefined) {
    return [];
  }
  const inputs = getVisibleIDs(node.inputSocketArray);
  const outputs = getVisibleIDs(node.outputSocketArray);
  const triggers = getVisibleIDs(node.nodeTriggerSocketArray);
  return inputs.concat(outputs).concat(triggers);
}

// Find sockets that are common across all selected nodes
// Sockets are considered common if they have the same name, socket type, and data type
// For a single node, all its sockets are returned
function getCommonSockets(
  selectedNodes: PPNode[],
  socketType: TSocketType,
): CommonSocket[] {
  if (selectedNodes.length === 0) {
    return [];
  }

  // Get the socket array based on type
  const getSocketArray = (node: PPNode): Socket[] => {
    if (socketType === SOCKET_TYPE.IN) {
      return node.inputSocketArray;
    } else if (socketType === SOCKET_TYPE.OUT) {
      return node.outputSocketArray;
    } else {
      return node.nodeTriggerSocketArray;
    }
  };

  // Get sockets from the first node as the base
  const firstNodeSockets = getSocketArray(selectedNodes[0]).filter((socket) =>
    socket.visibilityCondition(),
  );

  // For a single node, return all its sockets as "common"
  if (selectedNodes.length === 1) {
    return firstNodeSockets.map((socket) => ({
      name: socket.name,
      socketType: socketType,
      dataTypeSignature: socket.dataType.getUISignature(),
      sockets: [socket],
      referenceSocket: socket,
    }));
  }

  const commonSockets: CommonSocket[] = [];

  for (const socket of firstNodeSockets) {
    const socketName = socket.name;
    const dataTypeSignature = socket.dataType.getUISignature();

    // Check if this socket exists in all other nodes with the same properties
    const matchingSockets: Socket[] = [socket];
    let isCommon = true;

    for (let i = 1; i < selectedNodes.length; i++) {
      const nodeSocketArray = getSocketArray(selectedNodes[i]);
      const matchingSocket = nodeSocketArray.find(
        (s) =>
          s.name === socketName &&
          s.dataType.getUISignature() === dataTypeSignature &&
          s.visibilityCondition(),
      );

      if (matchingSocket) {
        matchingSockets.push(matchingSocket);
      } else {
        isCommon = false;
        break;
      }
    }

    if (isCommon) {
      commonSockets.push({
        name: socketName,
        socketType: socketType,
        dataTypeSignature: dataTypeSignature,
        sockets: matchingSockets,
        referenceSocket: socket,
      });
    }
  }

  return commonSockets;
}

// returns null for a specific property,
// if its value is not the same throughout the array
// else it returns the value
const getUpdateBehaviourStateForArray = (selectedNodes: PPNode[]) => {
  if (selectedNodes.length === 0) {
    return {
      load: null,
      update: null,
      interval: null,
      intervalFrequency: null,
    };
  }
  const isPropertyUniform = (property) => {
    return selectedNodes.every(
      (node) =>
        node.updateBehaviour[property] ===
        selectedNodes[0].updateBehaviour[property],
    );
  };

  const areAllLoadsTheSame = isPropertyUniform('load');
  const areAllUpdatesTheSame = isPropertyUniform('update');
  const areAllIntervalsTheSame = isPropertyUniform('interval');
  const areAllFrequenciesTheSame = isPropertyUniform('intervalFrequency');

  const firstNodeUpdateBehaviour = selectedNodes[0].updateBehaviour;
  const updateBehaviourObject = {
    load: areAllLoadsTheSame ? firstNodeUpdateBehaviour.load : null,
    update: areAllUpdatesTheSame ? firstNodeUpdateBehaviour.update : null,
    interval: areAllIntervalsTheSame ? firstNodeUpdateBehaviour.interval : null,
    intervalFrequency: areAllFrequenciesTheSame
      ? firstNodeUpdateBehaviour.intervalFrequency
      : null,
  };

  return updateBehaviourObject;
};

const onCheckboxChange = (
  event,
  selectedNodes: PPNode[],
  setUpdatebehaviour,
) => {
  const checked = (event.target as HTMLInputElement).checked;
  const name = (event.target as HTMLInputElement).name;
  selectedNodes.forEach((selectedNode) => {
    selectedNode.updateBehaviour[event.target.name] = checked;
  });
  setUpdatebehaviour((prevState) => ({
    ...prevState,
    [name]: checked,
  }));
};

const onFrequencyChange = (
  value: number | null,
  selectedNodes: PPNode[],
  setUpdatebehaviour,
) => {
  const frequency = value ?? 0;
  selectedNodes.forEach((selectedNode) => {
    selectedNode.updateBehaviour.intervalFrequency = frequency;
  });
  setUpdatebehaviour((prevState) => ({
    ...prevState,
    intervalFrequency: frequency,
  }));
};

export const PropertyArrayContainer: React.FunctionComponent<
  PropertyArrayContainerProps
> = (props) => {
  const [dragging, setIsDragging] = useState(
    PPGraph.currentGraph.selection.interaction == Interaction.Dragging ||
      PPGraph.currentGraph.selection.interaction == Interaction.Drawing,
  );

  const [selectedNodes, setSelectedNodes] = useState(
    PPGraph.currentGraph.selection.selectedNodes,
  );

  useEffect(() => {
    const id1 = InterfaceController.addListener(
      ListenEvent.SelectionDraggingOrDrawing,
      setIsDragging,
    );
    const id2 = InterfaceController.addListener(
      ListenEvent.SelectionChanged,
      setSelectedNodes,
    );
    return () => {
      InterfaceController.removeListener(id1);
      InterfaceController.removeListener(id2);
    };
  }, []);

  const selectedNode = selectedNodes.length > 0 ? selectedNodes[0] : undefined;
  useEffect(() => {
    setUpdatebehaviour(getUpdateBehaviourStateForArray(selectedNodes));
  }, [selectedNode?.id]);

  const handleFilter = (
    event: React.MouseEvent<HTMLElement>,
    newFilter: string | null,
  ) => {
    props.setFilter(newFilter);
  };

  const [updateBehaviour, setUpdatebehaviour] = useState(
    getUpdateBehaviourStateForArray(selectedNodes),
  );

  const onUpdateNow = () => {
    selectedNodes.forEach((selectedNode) => {
      FlowLogic.addPendingExecution(selectedNode.id);
    });
  };

  const [socketsCurrentlyRendered, setSocketsCurrentlyRendered] = useState(
    getSocketsCurrentlyRendered(selectedNode),
  );

  useInterval(() => {
    const newVal = getSocketsCurrentlyRendered(selectedNode);
    if (newVal.toString() != socketsCurrentlyRendered.toString()) {
      setSocketsCurrentlyRendered(newVal);
    }
  }, 100);

  // Calculate common sockets for selection
  const commonInputSockets = getCommonSockets(selectedNodes, SOCKET_TYPE.IN);
  const commonOutputSockets = getCommonSockets(selectedNodes, SOCKET_TYPE.OUT);
  const commonTriggerSockets = getCommonSockets(
    selectedNodes,
    SOCKET_TYPE.TRIGGER,
  );

  if (selectedNode == null) {
    return <></>;
  }

  return (
    !dragging && (
      <Box
        sx={{
          p: 1,
          bgcolor: 'background.paper',
        }}
      >
        <FilterContainer
          handleFilter={handleFilter}
          filter={props.filter}
          selectedNode={selectedNode}
          selectedNodes={selectedNodes}
          hasCommonInputs={commonInputSockets.length > 0}
          hasCommonOutputs={commonOutputSockets.length > 0}
          hasCommonTriggers={commonTriggerSockets.length > 0}
        />
        <Stack
          spacing={1}
          sx={{
            mt: 1,
            overflow: 'auto',
          }}
        >
          {(selectedNodes.length !== 1 ||
            props.filter === 'common' ||
            props.filter == null) && (
            <CommonContent
              hasTriggerSocket={selectedNode.nodeTriggerSocketArray.length > 0}
              load={updateBehaviour.load}
              update={updateBehaviour.update}
              interval={updateBehaviour.interval}
              intervalFrequency={updateBehaviour.intervalFrequency}
              onCheckboxChange={(event) =>
                onCheckboxChange(event, selectedNodes, setUpdatebehaviour)
              }
              onFrequencyChange={(value) =>
                onFrequencyChange(value, selectedNodes, setUpdatebehaviour)
              }
              onUpdateNow={onUpdateNow}
            />
          )}
          <CommonSocketsArrayComponent
            commonSockets={commonTriggerSockets}
            randomMainColor={props.randomMainColor}
            selectedNodes={selectedNodes}
            text={SOCKET_SECTIONS.trigger.text}
            filter={props.filter}
            value={SOCKET_SECTIONS.trigger.value}
          />
          <CommonSocketsArrayComponent
            commonSockets={commonInputSockets}
            randomMainColor={props.randomMainColor}
            selectedNodes={selectedNodes}
            text={SOCKET_SECTIONS.in.text}
            filter={props.filter}
            value={SOCKET_SECTIONS.in.value}
          />
          <CommonSocketsArrayComponent
            commonSockets={commonOutputSockets}
            randomMainColor={props.randomMainColor}
            selectedNodes={selectedNodes}
            text={SOCKET_SECTIONS.out.text}
            filter={props.filter}
            value={SOCKET_SECTIONS.out.value}
          />
          {/* Single node only: show info section */}
          {selectedNodes.length === 1 && (
            <>
              {(props.filter === 'info' || props.filter == null) && (
                <Stack spacing={1}>
                  <NodeInfoContent selectedNode={selectedNode} />
                  <SourceContent
                    header="Config"
                    editable={true}
                    source={selectedNode}
                    randomMainColor={props.randomMainColor}
                  />
                </Stack>
              )}
              <Box sx={{ m: 1 }} />
            </>
          )}
        </Stack>
      </Box>
    )
  );
};
