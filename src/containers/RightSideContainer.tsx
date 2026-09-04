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
import { useBottomSheetPanels } from '../components/LeftRightDrawer';

type RightSideContainerProps = {
  rightDrawerView: RightDrawerView;
  setRightDrawerView: (view: RightDrawerView) => void;
  selectedNodes: any[];
  nodeFilter: string | null;
  setNodeFilter: (filter: string | null) => void;
  graphFilter: string;
  setGraphFilter: (filter: string) => void;
  graphFilterText: string;
  setGraphFilterText: (text: string) => void;
};

const RightSideContainerInner: React.FC<RightSideContainerProps> = ({
  rightDrawerView,
  setRightDrawerView,
  selectedNodes,
  nodeFilter,
  setNodeFilter,
  graphFilter,
  setGraphFilter,
  graphFilterText,
  setGraphFilterText,
}) => {
  const handleTabChange = (_, newValue) => {
    setRightDrawerView(newValue);
  };

  // Stacked icon-over-label tabs are 72px tall. In a sheet that is 72px of the
  // little height there is, spent twice over on the same three words, so the
  // icon moves beside the label and the row comes back to a normal 48.
  const inSheet = useBottomSheetPanels();
  const tabProps = inSheet
    ? ({ iconPosition: 'start' } as const)
    : ({} as const);

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
        filter={graphFilter}
        setFilter={setGraphFilter}
        filterText={graphFilterText}
        setFilterText={setGraphFilterText}
      />
    );
  }, [
    selectedNodes,
    nodeFilter,
    setNodeFilter,
    graphFilter,
    setGraphFilter,
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
          // fills whatever the panel gives it rather than naming the window's
          // height, which it is only entitled to as a docked column. Flexbox
          // was already shrinking the 100vh this replaced, so this changes no
          // layout - it just stops the next reader believing the panel owns
          // the viewport.
          height: '100%',
          minHeight: 0,
        }}
      >
        <Tabs
          value={rightDrawerView}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            flexShrink: 0,
            borderBottom: 1,
            borderColor: 'divider',
            ...(inSheet && {
              minHeight: 48,
              '& .MuiTab-root': { minHeight: 48, py: 0, px: 1, gap: 0.5 },
            }),
          }}
        >
          <Tab
            {...tabProps}
            icon={<PolylineIcon fontSize="small" />}
            label={inSheet ? 'Graph' : 'Graph (3)'}
            value={RightDrawerView.GRAPH}
            data-cy="graph-inspector-tab"
          />
          <Tab
            {...tabProps}
            icon={<DashboardIcon fontSize="small" />}
            label={inSheet ? 'Interface' : 'User interface (4)'}
            value={RightDrawerView.INTERFACE}
            data-cy="interface-settings-tab"
          />
          <Tab
            {...tabProps}
            icon={<SquareIcon fontSize="small" />}
            label={inSheet ? 'App' : 'App (5)'}
            value={RightDrawerView.APP}
            data-cy="app-info-tab"
          />
        </Tabs>
        <Box
          data-cy="inspector-content"
          sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}
        >
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
    prevProps.graphFilter === nextProps.graphFilter &&
    prevProps.graphFilterText === nextProps.graphFilterText &&
    prevProps.selectedNodes.length === nextProps.selectedNodes.length &&
    prevProps.selectedNodes.every(
      (node, index) => node === nextProps.selectedNodes[index],
    )
  );
};

export const RightSideContainer = React.memo(RightSideContainerInner, areEqual);
