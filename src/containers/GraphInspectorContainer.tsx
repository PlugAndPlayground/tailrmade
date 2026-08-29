import React from 'react';
import {
  Box,
  IconButton,
  Stack,
  ThemeProvider,
  Typography,
} from '@mui/material';
import PPGraph from './../classes/GraphClass';
import PPNode from './../classes/NodeClass';
import { NodeArrayContainer } from './NodeArrayContainer';
import { customTheme } from './../utils/constants';
import { TRgba } from './../utils/color';
import * as styles from '../utils/style.module.css';
import { useIsSmallScreen } from '../utils/utils';

type GraphInspectorContainerProps = {
  selectedNodes: PPNode[];
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  filterText: string;
  setFilterText: React.Dispatch<React.SetStateAction<string>>;
};

const GraphInspectorContainer: React.FunctionComponent<
  GraphInspectorContainerProps
> = (props) => {
  return (
    <ThemeProvider theme={customTheme}>
      <Stack
        id="inspector-container-graph"
        spacing={1}
        className={`${styles.inspectorContainer}`}
        sx={{
          fontFamily: "'Roboto', 'Helvetica', 'Arial', 'sans-serif'",
          height: '100%',
          paddingRight: 0,
          paddingLeft: useIsSmallScreen() ? '48px' : '8px',
        }}
      >
        <NodeArrayContainer
          graphId={PPGraph.currentGraph?.id}
          selectedNodes={props.selectedNodes}
          filter={props.filter}
          setFilter={props.setFilter}
          filterText={props.filterText}
          setFilterText={props.setFilterText}
        />
      </Stack>
    </ThemeProvider>
  );
};

export default GraphInspectorContainer;
