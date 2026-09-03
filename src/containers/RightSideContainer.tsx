import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Stack,
  ThemeProvider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PolylineIcon from '@mui/icons-material/Polyline';
import SquareIcon from '@mui/icons-material/Square';
import NodeInspectorContainer from './NodeInspectorContainer';
import { InfoContent, SourceContent } from '../components/SourceContent';
import { DashboardInspectorWrapper } from '../components/dashboard/DashboardInspectorWrapper';
import PPGraph from '../classes/GraphClass';
import { NodeArrayContainer } from './NodeArrayContainer';
import { customTheme, RightDrawerView } from '../utils/constants';
import { ThemeSettings } from '../components/dashboard/ThemePanel';

type RightSideContainerProps = {
  rightDrawerView: RightDrawerView;
  setRightDrawerView: (view: RightDrawerView) => void;
  selectedNodes: any[];
  nodeFilter: string | null;
  setNodeFilter: (filter: string | null) => void;
  graphFilterText: string;
  setGraphFilterText: (text: string) => void;
};

const RightSideContainerInner: React.FC<RightSideContainerProps> = ({
  rightDrawerView,
  setRightDrawerView,
  selectedNodes,
  nodeFilter,
  setNodeFilter,
  graphFilterText,
  setGraphFilterText,
}) => {
  const handleTabChange = (_, newValue) => {
    setRightDrawerView(newValue);
  };

  const interfaceInspectorComponent = useMemo(
    () => <DashboardInspectorWrapper />,
    [],
  );

  const graphInspectorComponent = useMemo(() => {
    if (!PPGraph.currentGraph) {
      return (
        <Box sx={{ p: 2, color: 'text.secondary' }}>
          <Typography>No graph is currently loaded.</Typography>
        </Box>
      );
    }

    if (selectedNodes.length > 0) {
      return (
        <NodeInspectorContainer
          selectedNodes={selectedNodes}
          filter={nodeFilter}
          setFilter={setNodeFilter}
        />
      );
    }

    return (
      <NodeArrayContainer
        graphId={PPGraph.currentGraph?.id}
        selectedNodes={selectedNodes}
        filterText={graphFilterText}
        setFilterText={setGraphFilterText}
      />
    );
  }, [
    selectedNodes,
    nodeFilter,
    setNodeFilter,
    graphFilterText,
    setGraphFilterText,
  ]);

  const appInspectorComponent = useMemo(() => {
    return (
      <Stack spacing={2}>
        <InfoContent graph={PPGraph.currentGraph} />
        {/* the theme belongs to the app, not to a surface, so it lives beside
            the other app-wide settings rather than in the dashboard's own
            chrome - and it stays reachable outside edit mode, where widgets
            render in their disabled state and cannot be judged */}
        <ThemeSettings />
        <SourceContent
          header="App Configuration"
          editable={true}
          source={PPGraph.currentGraph}
        />
      </Stack>
    );
  }, [PPGraph.currentGraph]);

  return (
    <ThemeProvider theme={customTheme}>
      <Stack
        id="inspector-container-right"
        spacing={0}
        sx={{
          height: '100vh',
        }}
      >
        <Tabs
          value={rightDrawerView}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={<PolylineIcon fontSize="small" />}
            label="Graph (3)"
            value={RightDrawerView.GRAPH}
            data-cy="graph-inspector-tab"
          />
          <Tab
            icon={<DashboardIcon fontSize="small" />}
            label="User interface (4)"
            value={RightDrawerView.INTERFACE}
            data-cy="interface-settings-tab"
          />
          <Tab
            icon={<SquareIcon fontSize="small" />}
            label="App (5)"
            value={RightDrawerView.APP}
            data-cy="app-info-tab"
          />
        </Tabs>
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {rightDrawerView === RightDrawerView.INTERFACE ? (
            interfaceInspectorComponent
          ) : rightDrawerView === RightDrawerView.GRAPH ? (
            graphInspectorComponent
          ) : rightDrawerView === RightDrawerView.APP ? (
            appInspectorComponent
          ) : (
            <Box sx={{ p: 2, color: 'text.secondary' }}>
              <Typography>
                No nodes selected. Select a node to inspect its properties.
              </Typography>
            </Box>
          )}
        </Box>
      </Stack>
    </ThemeProvider>
  );
};

// Custom comparison function for memoization
const areEqual = (
  prevProps: RightSideContainerProps,
  nextProps: RightSideContainerProps,
) => {
  return (
    prevProps.rightDrawerView === nextProps.rightDrawerView &&
    prevProps.nodeFilter === nextProps.nodeFilter &&
    prevProps.graphFilterText === nextProps.graphFilterText &&
    prevProps.selectedNodes.length === nextProps.selectedNodes.length &&
    prevProps.selectedNodes.every(
      (node, index) => node === nextProps.selectedNodes[index],
    )
  );
};

export const RightSideContainer = React.memo(RightSideContainerInner, areEqual);
